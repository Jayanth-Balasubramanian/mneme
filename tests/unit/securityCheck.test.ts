import { describe, expect, test } from "bun:test";

import {
  checkChapterSourceLeakage,
  checkLlmValidationCoverage,
  checkMarkdownRenderingPolicy,
  checkRepositoryPathPolicy,
  checkSecretLeakage,
  runSecretDetectorSelfTest,
  type SecurityScanFile,
} from "../../scripts/security-check";

describe("security check detectors", () => {
  test("detects common token-like secrets and proves the dry-run detector path", () => {
    const syntheticToken = ["sk", "mneme_security_check_".padEnd(32, "A")].join(
      "-",
    );

    const findings = checkSecretLeakage([
      {
        path: "src/server/example.ts",
        content: `const apiKey = "${syntheticToken}";`,
      },
    ]);

    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings.every((finding) => finding.check === "secret-leakage")).toBe(
      true,
    );
    expect(runSecretDetectorSelfTest()).toEqual([]);
  });

  test("rejects tracked env paths and allows obvious placeholder values", () => {
    const pathFindings = checkRepositoryPathPolicy([
      {
        path: ".env.local",
        content: "OPENAI_API_KEY=placeholder",
      },
    ]);

    expect(pathFindings).toEqual([
      expect.objectContaining({
        check: "repository-path-policy",
        file: ".env.local",
      }),
    ]);

    expect(
      checkSecretLeakage([
        {
          path: "docs/example.md",
          content: "OPENAI_API_KEY=your_placeholder_api_key",
        },
      ]),
    ).toEqual([]);
  });

  test("rejects executable Markdown rendering paths in app source", () => {
    const findings = checkMarkdownRenderingPolicy([
      {
        path: "src/app/UnsafeMarkdown.tsx",
        content:
          "export function UnsafeMarkdown({ html }: { html: string }) { return <div dangerouslySetInnerHTML={{ __html: html }} />; }",
      },
    ]);

    expect(findings).toEqual([
      expect.objectContaining({
        check: "markdown-rendering-policy",
        file: "src/app/UnsafeMarkdown.tsx",
      }),
    ]);
  });

  test("rejects committed full Chapter 17 body text signatures", () => {
    const chapterSignature = [
      "Randomized algorithms fall",
      " in to t w o rough categories",
    ].join("");

    const findings = checkChapterSourceLeakage([
      {
        path: "fixtures/chapter-17.md",
        content: `# Monte Carlo Methods\n\n${chapterSignature}`,
      },
    ]);

    expect(findings).toHaveLength(1);
  });

  test("requires named LLM validation coverage contracts", () => {
    const files: SecurityScanFile[] = [
      {
        path: "tests/integration/generationRuns.test.ts",
        content:
          "rejects unsupported provider requests that are not implemented",
      },
      {
        path: "tests/unit/generationSchema.test.ts",
        content: "rejects generated output missing concept keys or anchors",
      },
      {
        path: "tests/integration/lessonUnits.test.ts",
        content: "",
      },
    ];

    const findings = checkLlmValidationCoverage(files);

    expect(findings.map((finding) => finding.message)).toContain(
      "Missing required validation/provenance coverage marker: returns generic failure details when provider throws",
    );
    expect(findings.map((finding) => finding.message)).toContain(
      "Missing required validation/provenance coverage marker: fails regeneration for invalid regenerated output and leaves the existing unit unchanged",
    );
  });
});
