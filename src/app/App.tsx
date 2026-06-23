import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

import type {
  ChapterSourceResponse,
  CreateChapterSourceRequest,
  ValidationIssue,
} from "../shared/source";

type HealthState = "checking" | "online" | "offline";
type ImportState = "idle" | "submitting" | "succeeded" | "failed";

type ImportFormState = {
  bookTitle: string;
  authorsText: string;
  publisher: string;
  year: string;
  chapterTitle: string;
  chapterNumber: string;
  sourceUrl: string;
  citationText: string;
  emphasisNotes: string;
  markdown: string;
};

const deepLearningDefaults: ImportFormState = {
  bookTitle: "Deep Learning",
  authorsText: "Ian Goodfellow, Yoshua Bengio, Aaron Courville",
  publisher: "MIT Press",
  year: "2016",
  chapterTitle: "Monte Carlo Methods",
  chapterNumber: "17",
  sourceUrl: "https://www.deeplearningbook.org/contents/monte_carlo.html",
  citationText:
    "Ian Goodfellow, Yoshua Bengio, and Aaron Courville, Deep Learning, MIT Press, 2016. http://www.deeplearningbook.org",
  emphasisNotes:
    "Pair formal definitions with intuition for a CS undergrad working in applied ML.",
  markdown: "",
};

function buildWorkflowItems(source: ChapterSourceResponse | null) {
  return [
    { label: "Import", status: source ? "Imported" : "No excerpt" },
    { label: "Generate", status: "Waiting" },
    { label: "Review", status: "Waiting" },
    { label: "Study", status: "Waiting" },
  ] as const;
}

function useHealthState(): HealthState {
  const [healthState, setHealthState] = useState<HealthState>("checking");

  useEffect(() => {
    let isMounted = true;

    async function checkHealth(): Promise<void> {
      try {
        const response = await fetch("/api/health");

        if (!isMounted) {
          return;
        }

        setHealthState(response.ok ? "online" : "offline");
      } catch {
        if (isMounted) {
          setHealthState("offline");
        }
      }
    }

    void checkHealth();

    return () => {
      isMounted = false;
    };
  }, []);

  return healthState;
}

function formatAuthors(authors: string[]): string {
  return new Intl.ListFormat("en", {
    style: "long",
    type: "conjunction",
  }).format(authors);
}

function buildImportPayload(
  formState: ImportFormState,
): CreateChapterSourceRequest {
  const authors = formState.authorsText
    .split(",")
    .map((author) => author.trim())
    .filter((author) => author.length > 0);
  const year = Number.parseInt(formState.year, 10);

  return {
    bookTitle: formState.bookTitle,
    authors,
    publisher: formState.publisher || undefined,
    year: Number.isNaN(year) ? undefined : year,
    chapterTitle: formState.chapterTitle,
    chapterNumber: formState.chapterNumber || undefined,
    sourceUrl: formState.sourceUrl,
    citationText: formState.citationText,
    markdown: formState.markdown,
    emphasisNotes: formState.emphasisNotes || undefined,
  };
}

function formatImportError(body: unknown): string {
  if (typeof body !== "object" || body === null || !("issues" in body)) {
    return "Import failed. Check the source metadata and excerpt.";
  }

  const issues = (body as { issues?: unknown }).issues;

  if (!Array.isArray(issues)) {
    return "Import failed. Check the source metadata and excerpt.";
  }

  const message = issues
    .filter((issue): issue is ValidationIssue => {
      return (
        typeof issue === "object" &&
        issue !== null &&
        "field" in issue &&
        "message" in issue &&
        typeof issue.field === "string" &&
        typeof issue.message === "string"
      );
    })
    .map((issue) => `${issue.field}: ${issue.message}`)
    .join(" ");

  return message.length > 0
    ? message
    : "Import failed. Check the source metadata and excerpt.";
}

export function App() {
  const healthState = useHealthState();
  const [formState, setFormState] =
    useState<ImportFormState>(deepLearningDefaults);
  const [importState, setImportState] = useState<ImportState>("idle");
  const [importError, setImportError] = useState<string | null>(null);
  const [chapterSource, setChapterSource] =
    useState<ChapterSourceResponse | null>(null);
  const workflowItems = buildWorkflowItems(chapterSource);

  function updateField(field: keyof ImportFormState, value: string): void {
    setFormState((current) => ({ ...current, [field]: value }));
  }

  async function handleFileChange(
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const file = event.currentTarget.files?.[0];

    if (!file) {
      return;
    }

    updateField("markdown", await file.text());
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setImportState("submitting");
    setImportError(null);

    try {
      const response = await fetch("/api/chapter-sources", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildImportPayload(formState)),
      });
      const body: unknown = await response.json();

      if (!response.ok) {
        setImportState("failed");
        setImportError(formatImportError(body));
        return;
      }

      setChapterSource(body as ChapterSourceResponse);
      setImportState("succeeded");
    } catch {
      setImportState("failed");
      setImportError("Import failed because the local API is unreachable.");
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Local study workspace</p>
          <h1>Mneme</h1>
        </div>
        <span className={`status-pill status-pill--${healthState}`}>
          API {healthState}
        </span>
      </header>

      <section className="source-panel" aria-labelledby="source-heading">
        <div>
          <p className="eyebrow">Proof of concept source</p>
          <h2 id="source-heading">Deep Learning, Chapter 17</h2>
          <p>
            Monte Carlo Methods by Ian Goodfellow, Yoshua Bengio, and Aaron
            Courville.
          </p>
        </div>
        <a
          href="https://www.deeplearningbook.org/contents/monte_carlo.html"
          rel="noreferrer"
          target="_blank"
        >
          Source
        </a>
      </section>

      <section className="workspace" aria-labelledby="workspace-heading">
        <div className="workspace__header">
          <div>
            <p className="eyebrow">Current chapter</p>
            <h2 id="workspace-heading">
              {chapterSource
                ? `${chapterSource.bookTitle}, Chapter ${chapterSource.chapterNumber}`
                : "No excerpt imported"}
            </h2>
          </div>
        </div>

        <ol className="workflow-list" aria-label="Study workflow state">
          {workflowItems.map((item) => (
            <li key={item.label}>
              <span>{item.label}</span>
              <strong>{item.status}</strong>
            </li>
          ))}
        </ol>
      </section>

      <section className="import-panel" aria-labelledby="import-heading">
        <div className="section-heading">
          <p className="eyebrow">Import Markdown</p>
          <h2 id="import-heading">Chapter excerpt</h2>
        </div>

        <form className="import-form" onSubmit={handleSubmit}>
          <label>
            <span>Book title</span>
            <input
              required
              value={formState.bookTitle}
              onChange={(event) => updateField("bookTitle", event.target.value)}
            />
          </label>

          <label>
            <span>Authors</span>
            <input
              required
              value={formState.authorsText}
              onChange={(event) =>
                updateField("authorsText", event.target.value)
              }
            />
          </label>

          <div className="form-row">
            <label>
              <span>Publisher</span>
              <input
                value={formState.publisher}
                onChange={(event) =>
                  updateField("publisher", event.target.value)
                }
              />
            </label>

            <label>
              <span>Year</span>
              <input
                inputMode="numeric"
                value={formState.year}
                onChange={(event) => updateField("year", event.target.value)}
              />
            </label>
          </div>

          <div className="form-row">
            <label>
              <span>Chapter title</span>
              <input
                required
                value={formState.chapterTitle}
                onChange={(event) =>
                  updateField("chapterTitle", event.target.value)
                }
              />
            </label>

            <label>
              <span>Chapter number</span>
              <input
                value={formState.chapterNumber}
                onChange={(event) =>
                  updateField("chapterNumber", event.target.value)
                }
              />
            </label>
          </div>

          <label>
            <span>Source URL</span>
            <input
              required
              type="url"
              value={formState.sourceUrl}
              onChange={(event) => updateField("sourceUrl", event.target.value)}
            />
          </label>

          <label>
            <span>Citation</span>
            <textarea
              required
              rows={3}
              value={formState.citationText}
              onChange={(event) =>
                updateField("citationText", event.target.value)
              }
            />
          </label>

          <label>
            <span>Study emphasis</span>
            <textarea
              rows={3}
              value={formState.emphasisNotes}
              onChange={(event) =>
                updateField("emphasisNotes", event.target.value)
              }
            />
          </label>

          <label>
            <span>Markdown file</span>
            <input
              accept=".md,.markdown,text/markdown,text/plain"
              type="file"
              onChange={handleFileChange}
            />
          </label>

          <label>
            <span>Markdown excerpt</span>
            <textarea
              required
              rows={12}
              value={formState.markdown}
              onChange={(event) => updateField("markdown", event.target.value)}
              placeholder="Paste a short Chapter 17 excerpt here. Do not commit full copyrighted chapter text to the repository."
            />
          </label>

          <div className="form-actions">
            <button type="submit" disabled={importState === "submitting"}>
              {importState === "submitting" ? "Importing" : "Import excerpt"}
            </button>
            {importError ? <p role="alert">{importError}</p> : null}
          </div>
        </form>
      </section>

      {chapterSource ? (
        <section
          className="import-result"
          aria-labelledby="import-result-heading"
        >
          <div className="section-heading">
            <p className="eyebrow">Saved source</p>
            <h2 id="import-result-heading">Import result</h2>
          </div>

          <dl>
            <div>
              <dt>Source credit</dt>
              <dd>
                {chapterSource.bookTitle}, Chapter{" "}
                {chapterSource.chapterNumber ?? "?"}:{" "}
                {chapterSource.chapterTitle}, by{" "}
                {formatAuthors(chapterSource.authors)}.{" "}
                {chapterSource.publisher ? `${chapterSource.publisher}. ` : ""}
                {chapterSource.year ? `${chapterSource.year}. ` : ""}
                <a
                  href={chapterSource.sourceUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Chapter source
                </a>
              </dd>
            </div>
            <div>
              <dt>Content hash</dt>
              <dd>
                <code>{chapterSource.contentHash}</code>
              </dd>
            </div>
            <div>
              <dt>Source anchors</dt>
              <dd>{chapterSource.anchors.length} paragraph anchors stored</dd>
            </div>
            <div>
              <dt>Citation</dt>
              <dd>{chapterSource.citationText}</dd>
            </div>
          </dl>
        </section>
      ) : null}
    </main>
  );
}
