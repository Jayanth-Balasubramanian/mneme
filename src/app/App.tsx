import { useEffect, useState } from "react";

type HealthState = "checking" | "online" | "offline";

const workflowItems = [
  { label: "Import", status: "No excerpt" },
  { label: "Generate", status: "Waiting" },
  { label: "Review", status: "Waiting" },
  { label: "Study", status: "Waiting" },
] as const;

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

export function App() {
  const healthState = useHealthState();

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
            <h2 id="workspace-heading">No excerpt imported</h2>
          </div>
          <button type="button" disabled>
            Import Markdown
          </button>
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
    </main>
  );
}
