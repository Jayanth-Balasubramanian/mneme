import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

export type SecurityScanFile = {
  path: string;
  content?: string;
};

export type SecurityFinding = {
  check: string;
  file: string;
  line?: number;
  message: string;
};

type PatternRule = {
  label: string;
  pattern: RegExp;
};

type CoverageAssertion = {
  file: string;
  requiredText: string[];
};

const MAX_TEXT_FILE_BYTES = 1024 * 1024;

const BINARY_EXTENSIONS = new Set([
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".mov",
  ".mp4",
  ".pdf",
  ".png",
  ".webm",
  ".webp",
  ".zip",
]);

const GENERATED_ARTIFACT_PREFIXES = [
  "dist/",
  "build/",
  "coverage/",
  "playwright-report/",
  "test-results/",
];

const MARKDOWN_RENDERING_POLICY_PATHS = [
  "src/",
  "index.html",
  "package.json",
  "bun.lock",
  "vite.config.ts",
];

const MARKDOWN_RENDERING_BANNED_PATTERNS: PatternRule[] = [
  {
    label: "React dangerouslySetInnerHTML",
    pattern: /\bdangerouslySetInnerHTML\b/g,
  },
  {
    label: "direct innerHTML assignment",
    pattern: /\binnerHTML\s*=/g,
  },
  {
    label: "direct outerHTML assignment",
    pattern: /\bouterHTML\s*=/g,
  },
  {
    label: "MDX runtime or bundler",
    pattern: /\bMDXProvider\b|\buseMDXComponents\b|@mdx-js\/|next-mdx-remote|mdx-bundler|\bmdx-bundler\b|\.mdx\b/g,
  },
  {
    label: "unsafe raw Markdown HTML rendering",
    pattern: /\brehypeRaw\b|\brehype-raw\b|\ballowDangerousHtml\b|\bskipHtml\s*=\s*\{?\s*false/g,
  },
];

const SECRET_PATTERNS: PatternRule[] = [
  {
    label: "OpenAI-like API key",
    pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    label: "GitHub classic personal access token",
    pattern: /\bghp_[A-Za-z0-9]{30,}\b/g,
  },
  {
    label: "GitHub fine-grained personal access token",
    pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  },
  {
    label: "Slack token",
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g,
  },
  {
    label: "AWS access key",
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  },
  {
    label: "private key block",
    pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/g,
  },
];

const GENERIC_SECRET_ASSIGNMENT =
  /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|secret|token)\b\s*[:=]\s*["']?([A-Za-z0-9_./+=-]{24,})["']?/gi;

const LLM_VALIDATION_COVERAGE: CoverageAssertion[] = [
  {
    file: "src/server/api/generationRuns.ts",
    requiredText: [
      "parseLessonGenerationDraft(rawOutput)",
      "validateGeneratedAnchorsBelongToChapter(",
      "GENERATOR_FAILURE_REASON",
    ],
  },
  {
    file: "src/server/api/lessonUnits.ts",
    requiredText: [
      "parseLessonGenerationDraft(rawOutput)",
      "validateGeneratedAnchorsBelongToChapter(",
      "validatedDraft.value.units.length !== 1",
      "GENERATOR_FAILURE_REASON",
    ],
  },
  {
    file: "tests/unit/generationSchema.test.ts",
    requiredText: [
      "rejects generated output missing concept keys or anchors",
      "rejects mixed valid and invalid concept key entries",
      "rejects mixed valid and invalid headingPath entries",
    ],
  },
  {
    file: "tests/integration/generationRuns.test.ts",
    requiredText: [
      "marks the generation run as failed and does not persist units on invalid output",
      "rejects unsupported provider requests that are not implemented",
      "rejects foreign source anchors and does not persist generated units",
      "rejects impossible paragraph ranges and does not persist generated units",
      "returns generic failure details when provider throws",
    ],
  },
  {
    file: "tests/integration/lessonUnits.test.ts",
    requiredText: [
      "fails regeneration for invalid regenerated output and leaves the existing unit unchanged",
      "fails regeneration for invalid regenerated anchors and keeps unit unchanged",
      "fails regeneration for out-of-range regenerated anchors and keeps unit unchanged",
    ],
  },
];

function normalizePath(value: string): string {
  return value.split(path.sep).join("/");
}

function cloneRegex(rule: PatternRule): RegExp {
  return new RegExp(rule.pattern.source, rule.pattern.flags);
}

function lineNumberForIndex(content: string, index: number): number {
  let line = 1;

  for (let cursor = 0; cursor < index; cursor += 1) {
    if (content[cursor] === "\n") {
      line += 1;
    }
  }

  return line;
}

function finding(
  check: string,
  file: string,
  message: string,
  line?: number,
): SecurityFinding {
  return {
    check,
    file,
    message,
    ...(line === undefined ? {} : { line }),
  };
}

function findPatternMatches(
  check: string,
  file: SecurityScanFile,
  rules: PatternRule[],
  messageForRule: (rule: PatternRule) => string,
): SecurityFinding[] {
  if (file.content === undefined) {
    return [];
  }

  const findings: SecurityFinding[] = [];

  for (const rule of rules) {
    const pattern = cloneRegex(rule);
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(file.content)) !== null) {
      findings.push(
        finding(
          check,
          file.path,
          messageForRule(rule),
          lineNumberForIndex(file.content, match.index),
        ),
      );

      if (match[0].length === 0) {
        pattern.lastIndex += 1;
      }
    }
  }

  return findings;
}

function isTrackedEnvPath(filePath: string): boolean {
  const basename = path.posix.basename(filePath);

  return (
    basename === ".env" ||
    basename.startsWith(".env.") ||
    basename === ".dev.vars" ||
    basename.endsWith(".pem") ||
    basename.endsWith(".key")
  );
}

function shouldCheckMarkdownRenderingPath(filePath: string): boolean {
  return MARKDOWN_RENDERING_POLICY_PATHS.some((allowedPath) =>
    allowedPath.endsWith("/")
      ? filePath.startsWith(allowedPath)
      : filePath === allowedPath,
  );
}

function isPlaceholderSecretValue(value: string): boolean {
  const normalized = value.toLowerCase();
  const placeholderFragments = [
    "changeme",
    "dummy",
    "example",
    "fake",
    "placeholder",
    "redacted",
    "sample",
    "test",
    "todo",
    "your_",
    "your-",
  ];

  return placeholderFragments.some((fragment) => normalized.includes(fragment));
}

export function getChapter17BodyMarkers(): string[] {
  return [
    ["Randomized algorithms", "fall in to", "t w o rough categories"].join(" "),
  ];
}

export function checkRepositoryPathPolicy(
  files: SecurityScanFile[],
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  for (const file of files) {
    if (isTrackedEnvPath(file.path)) {
      findings.push(
        finding(
          "repository-path-policy",
          file.path,
          "Environment, private-key, and local secret files must not be tracked.",
        ),
      );
    }

    if (
      GENERATED_ARTIFACT_PREFIXES.some((prefix) => file.path.startsWith(prefix))
    ) {
      findings.push(
        finding(
          "repository-path-policy",
          file.path,
          "Generated build, coverage, and browser-test artifacts must not be tracked.",
        ),
      );
    }
  }

  return findings;
}

export function checkMarkdownRenderingPolicy(
  files: SecurityScanFile[],
): SecurityFinding[] {
  return files
    .filter((file) => shouldCheckMarkdownRenderingPath(file.path))
    .flatMap((file) =>
      findPatternMatches(
        "markdown-rendering-policy",
        file,
        MARKDOWN_RENDERING_BANNED_PATTERNS,
        (rule) =>
          `${rule.label} is not allowed for user-controlled Markdown or generated lesson content.`,
      ),
    );
}

export function checkLlmValidationCoverage(
  files: SecurityScanFile[],
): SecurityFinding[] {
  const filesByPath = new Map(
    files.map((file) => [file.path, file.content ?? ""]),
  );
  const findings: SecurityFinding[] = [];

  for (const assertion of LLM_VALIDATION_COVERAGE) {
    const content = filesByPath.get(assertion.file);

    if (content === undefined) {
      findings.push(
        finding(
          "llm-validation-coverage",
          assertion.file,
          "Required LLM validation/provenance coverage file is missing.",
        ),
      );
      continue;
    }

    for (const requiredText of assertion.requiredText) {
      if (!content.includes(requiredText)) {
        findings.push(
          finding(
            "llm-validation-coverage",
            assertion.file,
            `Missing required validation/provenance coverage marker: ${requiredText}`,
          ),
        );
      }
    }
  }

  return findings;
}

export function checkChapterSourceLeakage(
  files: SecurityScanFile[],
): SecurityFinding[] {
  const markers = getChapter17BodyMarkers();
  const findings: SecurityFinding[] = [];

  for (const file of files) {
    if (file.content === undefined) {
      continue;
    }

    for (const marker of markers) {
      const index = file.content.indexOf(marker);

      if (index !== -1) {
        findings.push(
          finding(
            "source-text-leakage",
            file.path,
            "Known Deep Learning Chapter 17 body text appears in a repository file.",
            lineNumberForIndex(file.content, index),
          ),
        );
      }
    }
  }

  return findings;
}

export function checkSecretLeakage(
  files: SecurityScanFile[],
): SecurityFinding[] {
  const findings = files.flatMap((file) =>
    findPatternMatches(
      "secret-leakage",
      file,
      SECRET_PATTERNS,
      (rule) => `${rule.label} detected. Store real secrets outside the repository.`,
    ),
  );

  for (const file of files) {
    if (file.content === undefined) {
      continue;
    }

    const pattern = new RegExp(
      GENERIC_SECRET_ASSIGNMENT.source,
      GENERIC_SECRET_ASSIGNMENT.flags,
    );
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(file.content)) !== null) {
      const value = match[1] ?? "";

      if (!isPlaceholderSecretValue(value)) {
        findings.push(
          finding(
            "secret-leakage",
            file.path,
            "High-entropy value assigned to a secret-like name. Use placeholders in committed files.",
            lineNumberForIndex(file.content, match.index),
          ),
        );
      }

      if (match[0].length === 0) {
        pattern.lastIndex += 1;
      }
    }
  }

  return findings;
}

export function runSecretDetectorSelfTest(): SecurityFinding[] {
  const syntheticToken = ["sk", "dryrun", "x".repeat(32)].join("-");
  const fixtureFiles: SecurityScanFile[] = [
    {
      path: "dry-run-secret-fixture.ts",
      content: `const syntheticValue = "${syntheticToken}";`,
    },
    {
      path: ".env.dry-run",
      content: `OPENAI_API_KEY=${syntheticToken}`,
    },
  ];
  const findings = [
    ...checkRepositoryPathPolicy(fixtureFiles),
    ...checkSecretLeakage(fixtureFiles),
  ];

  const caughtSyntheticToken = findings.some(
    (item) => item.check === "secret-leakage",
  );
  const caughtSyntheticEnvPath = findings.some(
    (item) => item.check === "repository-path-policy" && item.file === ".env.dry-run",
  );

  if (caughtSyntheticToken && caughtSyntheticEnvPath) {
    return [];
  }

  return [
    finding(
      "secret-detector-self-test",
      "dry-run-secret-fixture",
      "The in-memory secret-like dry-run fixture did not trigger the expected detector failures.",
    ),
  ];
}

export function runSecurityChecks(files: SecurityScanFile[]): SecurityFinding[] {
  return [
    ...checkRepositoryPathPolicy(files),
    ...checkMarkdownRenderingPolicy(files),
    ...checkLlmValidationCoverage(files),
    ...checkChapterSourceLeakage(files),
    ...checkSecretLeakage(files),
  ];
}

function listRepositoryFiles(root: string): string[] {
  const result = spawnSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    {
      cwd: root,
      encoding: "utf8",
    },
  );

  if (result.status !== 0) {
    throw new Error(result.stderr || "Unable to list repository files with git.");
  }

  return result.stdout
    .split("\0")
    .filter((filePath) => filePath.length > 0)
    .map(normalizePath)
    .sort();
}

function shouldReadTextFile(filePath: string, absolutePath: string): boolean {
  const extension = path.posix.extname(filePath).toLowerCase();

  if (BINARY_EXTENSIONS.has(extension)) {
    return false;
  }

  const stat = statSync(absolutePath);
  return stat.isFile() && stat.size <= MAX_TEXT_FILE_BYTES;
}

function loadRepositoryFiles(root: string): SecurityScanFile[] {
  return listRepositoryFiles(root).map((filePath) => {
    const absolutePath = path.join(root, filePath);

    if (!shouldReadTextFile(filePath, absolutePath)) {
      return { path: filePath };
    }

    const buffer = readFileSync(absolutePath);

    if (buffer.includes(0)) {
      return { path: filePath };
    }

    return {
      path: filePath,
      content: buffer.toString("utf8"),
    };
  });
}

function printFindings(findings: SecurityFinding[]): void {
  for (const item of findings) {
    const location = item.line === undefined
      ? item.file
      : `${item.file}:${item.line}`;

    console.error(`[${item.check}] ${location} ${item.message}`);
  }
}

function printUsage(): void {
  console.error("Usage: bun run security:check [--no-self-test | --self-test-only]");
}

function main(): void {
  const args = process.argv.slice(2);
  const validArgs = new Set(["--no-self-test", "--self-test-only"]);

  for (const arg of args) {
    if (!validArgs.has(arg)) {
      printUsage();
      process.exitCode = 2;
      return;
    }
  }

  const selfTestOnly = args.includes("--self-test-only");
  const shouldRunSelfTest = selfTestOnly || !args.includes("--no-self-test");
  const selfTestFindings = shouldRunSelfTest ? runSecretDetectorSelfTest() : [];

  if (selfTestFindings.length > 0) {
    printFindings(selfTestFindings);
    process.exitCode = 1;
    return;
  }

  if (shouldRunSelfTest) {
    console.log(
      "Dry-run secret detector self-test passed against an in-memory synthetic fixture.",
    );
  }

  if (selfTestOnly) {
    return;
  }

  const files = loadRepositoryFiles(process.cwd());
  const findings = runSecurityChecks(files);

  if (findings.length > 0) {
    printFindings(findings);
    process.exitCode = 1;
    return;
  }

  console.log(`Security checks passed for ${files.length} repository file(s).`);
}

if (import.meta.main) {
  main();
}
