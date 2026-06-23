import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const chromeBinary = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const syntheticMarkdown = [
  "# Sampling",
  "",
  "A short synthetic paragraph about estimating expectations by averaging random draws.",
  "",
  "## Variance",
  "",
  "A second synthetic paragraph about variance and confidence in Monte Carlo estimates.",
  "",
  "## Bias",
  "",
  "A third synthetic paragraph about estimator bias and approximation error.",
].join("\n");

type CdpResponse = {
  id?: number;
  result?: unknown;
  error?: { message: string };
};

type RuntimeEvaluationResult = {
  result?: {
    value?: unknown;
    description?: string;
  };
  exceptionDetails?: {
    text?: string;
    exception?: {
      description?: string;
    };
  };
};

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function findAvailablePortForTest(
  port: number,
): Promise<boolean> {
  const server = createServer();

  const listening = await new Promise<boolean>((resolve) => {
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => resolve(true));
  });

  if (!listening) {
    return false;
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  return true;
}

async function getAvailablePorts(count: number): Promise<number[]> {
  const startPort = 4_000;
  const maxPort = 49_000;
  const ports: number[] = [];

  for (let port = startPort; port <= maxPort && ports.length < count; port += 1) {
    const canUse = await findAvailablePortForTest(port);

    if (canUse) {
      ports.push(port);
    }
  }

  if (ports.length !== count) {
    throw new Error("Could not reserve enough available TCP ports.");
  }

  return ports;
}

async function waitForHttp(url: string, label: string): Promise<void> {
  const deadline = Date.now() + 20_000;
  let lastError = "";

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = `${response.status} ${response.statusText}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await sleep(250);
  }

  throw new Error(`Timed out waiting for ${label}: ${lastError}`);
}

async function openCdpSocket(webSocketUrl: string): Promise<WebSocket> {
  const socket = new WebSocket(webSocketUrl);

  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener(
      "error",
      () => reject(new Error("Failed to open Chrome DevTools socket.")),
      { once: true },
    );
  });

  return socket;
}

class CdpSession {
  private nextId = 1;
  private readonly pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
    }
  >();

  constructor(private readonly socket: WebSocket) {
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as CdpResponse;

      if (typeof message.id !== "number") {
        return;
      }

      const callback = this.pending.get(message.id);
      if (!callback) {
        return;
      }

      this.pending.delete(message.id);

      if (message.error) {
        callback.reject(new Error(message.error.message));
        return;
      }

      callback.resolve(message.result);
    });
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = this.nextId;
    this.nextId += 1;

    const response = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });

    this.socket.send(JSON.stringify({ id, method, params }));
    return response;
  }

  async evaluate(expression: string): Promise<unknown> {
    const response = (await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })) as RuntimeEvaluationResult;

    if (response.exceptionDetails) {
      throw new Error(
        response.exceptionDetails.exception?.description ??
          response.exceptionDetails.text ??
          "Browser evaluation failed.",
      );
    }

    return response.result?.value;
  }

  close(): void {
    this.socket.close();
  }
}

function browserAction(source: string): string {
  return `(() => { ${source} })()`;
}

function setValue(selector: string, value: string): string {
  return browserAction(`
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) throw new Error("Missing element: ${selector}");
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : element instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
    const valueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (!valueSetter) throw new Error("Missing value setter: ${selector}");
    valueSetter.call(element, ${JSON.stringify(value)});
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  `);
}

function click(selector: string): string {
  return browserAction(`
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) throw new Error("Missing element: ${selector}");
    element.click();
  `);
}

async function waitForPageCondition(
  session: CdpSession,
  expression: string,
  label: string,
): Promise<void> {
  const deadline = Date.now() + 20_000;
  let lastError = "";

  while (Date.now() < deadline) {
    try {
      if (await session.evaluate(expression)) {
        return;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await sleep(250);
  }

  const pageText = await session
    .evaluate("document.body.innerText")
    .then((value) => String(value).slice(0, 5_000))
    .catch(() => "Unable to read page text.");

  throw new Error(
    `Timed out waiting for ${label}: ${lastError}\nPage text:\n${pageText}`,
  );
}

async function createChromeSession(
  chromePort: number,
  webUrl: string,
): Promise<CdpSession> {
  await waitForHttp(`http://127.0.0.1:${chromePort}/json/version`, "Chrome CDP");

  const targetResponse = await fetch(
    `http://127.0.0.1:${chromePort}/json/new?${encodeURIComponent(webUrl)}`,
    { method: "PUT" },
  );

  if (!targetResponse.ok) {
    throw new Error(
      `Failed to create Chrome target: ${targetResponse.status} ${targetResponse.statusText}`,
    );
  }

  const target = (await targetResponse.json()) as {
    webSocketDebuggerUrl?: string;
  };

  if (!target.webSocketDebuggerUrl) {
    throw new Error("Chrome target did not expose a DevTools socket.");
  }

  const socket = await openCdpSocket(target.webSocketDebuggerUrl);
  const session = new CdpSession(socket);
  await session.send("Page.enable");
  await session.send("Runtime.enable");
  await session.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });

  return session;
}

async function runStudyFlow(session: CdpSession, webUrl: string): Promise<void> {
  await session.send("Page.navigate", { url: webUrl });
  await waitForPageCondition(
    session,
    "document.readyState === 'complete' && Boolean(document.querySelector('[data-testid=\"markdown-input\"]'))",
    "app shell",
  );

  await session.evaluate(setValue("[data-testid='markdown-input']", syntheticMarkdown));
  await session.evaluate(click("[data-testid='import-submit']"));
  await waitForPageCondition(
    session,
    "document.body.textContent.includes('Import result') && document.body.textContent.includes('paragraph anchors stored')",
    "import result",
  );

  await session.evaluate(click("[data-testid='generate-draft']"));
  await waitForPageCondition(
    session,
    "Boolean(document.querySelector('[data-testid=\"approve-unit\"]'))",
    "generated unit review",
  );

  await session.evaluate(click("[data-testid='approve-unit']"));
  await waitForPageCondition(
    session,
    "Boolean(document.querySelector('[data-testid=\"study-prompt\"]')) && Boolean(document.querySelector('[data-testid=\"study-option-0\"]'))",
    "approved study checkpoint",
  );

  await session.evaluate(click("[data-testid='study-option-0']"));
  await session.evaluate(click("[data-testid='reveal-answer']"));
  await session.evaluate(setValue("[data-testid='self-rating']", "wrong"));
  await session.evaluate(setValue("[data-testid='confidence']", "low"));
  await waitForPageCondition(
    session,
    "document.querySelector('[data-testid=\"submit-attempt\"]')?.disabled === false",
    "attempt form ready to submit",
  );
  await session.evaluate(click("[data-testid='submit-attempt']"));
  await waitForPageCondition(
    session,
    [
      "document.querySelector('[data-testid=\"local-attempt-signal\"]')?.textContent.includes('WRONG')",
      "(document.querySelector('[data-testid=\"weak-concepts\"]')?.textContent ?? '').includes('sampling-1')",
    ].join(" && "),
    "recorded attempt feedback",
  );
}

const [apiPort, webPort, chromePort] = await getAvailablePorts(3);
const tempDir = await mkdtemp(join(tmpdir(), "mneme-e2e-"));
const dbPath = join(tempDir, "mneme-e2e.sqlite");
const chromeProfile = join(tempDir, "chrome-profile");
const webUrl = `http://127.0.0.1:${webPort}`;

const appProcess = Bun.spawn(["bun", "run", "dev"], {
  stdout: "ignore",
  stderr: "ignore",
  env: {
    ...Bun.env,
    API_PORT: String(apiPort),
    WEB_PORT: String(webPort),
    MNEME_DB_PATH: dbPath,
  },
});

const chromeProcess = Bun.spawn(
  [
    chromeBinary,
    "--headless=new",
    "--disable-background-networking",
    "--disable-gpu",
    "--no-default-browser-check",
    "--no-first-run",
    `--remote-debugging-port=${chromePort}`,
    `--user-data-dir=${chromeProfile}`,
    "about:blank",
  ],
  {
    stdout: "ignore",
    stderr: "pipe",
  },
);

let session: CdpSession | null = null;

try {
  await waitForHttp(`http://127.0.0.1:${apiPort}/api/health`, "Mneme API");
  await waitForHttp(webUrl, "Mneme web app");
  session = await createChromeSession(chromePort, webUrl);
  await runStudyFlow(session, webUrl);
  console.log("E2E study flow passed.");
} finally {
  session?.close();
  appProcess.kill();
  chromeProcess.kill();
  await appProcess.exited;
  await chromeProcess.exited;
  await rm(tempDir, { recursive: true, force: true });
}
