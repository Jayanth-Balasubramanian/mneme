import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const chromeBinary = resolveChromeBinary();
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

function resolveChromeBinary(): string {
  const candidates = [
    Bun.env.CHROME_BIN,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  const found = candidates.find(
    (candidate): candidate is string =>
      typeof candidate === "string" && candidate.length > 0 && existsSync(candidate),
  );

  if (!found) {
    throw new Error(
      "Unable to find Chrome or Chromium for e2e. Set CHROME_BIN to a local browser binary.",
    );
  }

  return found;
}

async function findAvailablePortForTest(): Promise<number> {
  const server = createServer();

  const listening = await new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(typeof address === "object" && address !== null ? address.port : 0);
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  return listening;
}

async function getAvailablePorts(count: number): Promise<number[]> {
  const ports: number[] = [];
  while (ports.length < count) ports.push(await findAvailablePortForTest());
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

function syntheticPdf(): Uint8Array {
  const encoder = new TextEncoder();
  const pageStreams = [
    "BT /F1 18 Tf 72 720 Td (Synthetic Reader page one.) Tj 0 -36 Td (A bounded passage for local browser tests.) Tj ET",
    "BT /F1 18 Tf 72 720 Td (Synthetic Reader page two.) Tj 0 -36 Td (A second page proves resume state.) Tj ET",
  ];
  const bodies = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${encoder.encode(pageStreams[0]!).byteLength} >>\nstream\n${pageStreams[0]}\nendstream`,
    `<< /Length ${encoder.encode(pageStreams[1]!).byteLength} >>\nstream\n${pageStreams[1]}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  bodies.forEach((body, index) => {
    offsets.push(encoder.encode(pdf).byteLength);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = encoder.encode(pdf).byteLength;
  pdf += `xref\n0 ${bodies.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return encoder.encode(pdf);
}

async function setFileInput(session: CdpSession, filePath: string): Promise<void> {
  await session.send("DOM.enable");
  const document = await session.send("DOM.getDocument") as { root: { nodeId: number } };
  const result = await session.send("DOM.querySelector", { nodeId: document.root.nodeId, selector: "input[type=file]" }) as { nodeId: number };
  if (!result.nodeId) throw new Error("Reader import file input was not found.");
  await session.send("DOM.setFileInputFiles", { nodeId: result.nodeId, files: [filePath] });
}

async function runReaderFlow(session: CdpSession, webUrl: string, pdfPath: string): Promise<void> {
  await session.send("Page.navigate", { url: webUrl });
  await waitForPageCondition(
    session,
    "document.readyState === 'complete' && Boolean(document.querySelector('[data-testid=\"import-pdf\"]'))",
    "app shell",
  );
  await setFileInput(session, pdfPath);
  await waitForPageCondition(session, "document.body.textContent.includes('Synthetic Reader') || Boolean(document.querySelector('[data-testid=\"confirm-import\"]'))", "local PDF selection");
  await waitForPageCondition(session, "Boolean(document.querySelector('[data-testid=\"confirm-import\"]'))", "import metadata sheet");
  await session.evaluate(click("[data-testid='confirm-import']"));
  await waitForPageCondition(session, "Boolean(document.querySelector('[data-testid=\"pdf-viewer\"] canvas')) && document.body.textContent.includes('synthetic-reader')", "rendered local PDF");
  await waitForPageCondition(session, "Boolean(document.querySelector('.textLayer span'))", "selectable PDF text layer");

  await session.evaluate(browserAction(`
    const span = Array.from(document.querySelectorAll('.textLayer span')).find((entry) => entry.textContent?.includes('Synthetic')) ?? document.querySelector('.textLayer span');
    if (!span) throw new Error('No PDF text span was rendered.');
    const range = document.createRange();
    range.selectNodeContents(span);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.querySelector('.pdf-page-surface')?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  `));
  await waitForPageCondition(session, "Boolean(document.querySelector('.selection-card'))", "text selection preview");
  await session.evaluate(setValue("[aria-label='Companion provider']", "demo"));
  await session.evaluate(setValue("[aria-label='Companion question']", "Explain this passage"));
  await session.evaluate(click("[data-testid='ask-companion']"));
  await waitForPageCondition(session, "Boolean(document.querySelector('.conversation-card')) && document.body.textContent.includes('Demo context')", "demo companion answer");
  await session.evaluate(click(".conversation-citations button"));
  await waitForPageCondition(session, "document.querySelector('[aria-label=\"Current page\"]')?.value === '1'", "citation navigation");

  await session.evaluate(setValue("[aria-label='Spoiler boundary page']", "2"));
  await session.evaluate(setValue("[aria-label='Stopping note']", "Remember the bounded passage."));
  await session.evaluate(browserAction("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));"));
  await waitForPageCondition(session, "document.querySelector('[aria-label=\"Current page\"]')?.value === '2' && document.querySelector('.pdf-viewer canvas') !== null", "second page navigation");
  await sleep(900);
  await session.send("Page.reload", { ignoreCache: true });
  await waitForPageCondition(session, "document.readyState === 'complete' && Boolean(document.querySelector('[data-testid=\"pdf-viewer\"] canvas'))", "reader reload");
  await waitForPageCondition(session, "document.querySelector('[aria-label=\"Current page\"]')?.value === '2' && document.querySelector('[aria-label=\"Stopping note\"]')?.value === 'Remember the bounded passage.'", "saved reading position and stopping note");
  await waitForPageCondition(
    session,
    "document.body.textContent.includes('synthetic-reader') && document.body.textContent.includes('Stored on this device')",
    "reader resume shell",
  );
}

const [apiPort, webPort, chromePort] = await getAvailablePorts(3);
const tempDir = await mkdtemp(join(tmpdir(), "mneme-e2e-"));
const dbPath = join(tempDir, "mneme-e2e.sqlite");
const pdfPath = join(tempDir, "synthetic-reader.pdf");
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
  await writeFile(pdfPath, syntheticPdf());
  await waitForHttp(`http://127.0.0.1:${apiPort}/api/health`, "Mneme API");
  await waitForHttp(webUrl, "Mneme web app");
  session = await createChromeSession(chromePort, webUrl);
  await runReaderFlow(session, webUrl, pdfPath);
  console.log("E2E reader flow passed.");
} finally {
  session?.close();
  appProcess.kill();
  chromeProcess.kill();
  await appProcess.exited;
  await chromeProcess.exited;
  await rm(tempDir, { recursive: true, force: true });
}
