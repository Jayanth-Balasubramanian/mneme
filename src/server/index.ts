import { createServerApp } from "./app";

const port = Number(Bun.env.API_PORT ?? Bun.env.PORT ?? "8787");
const hostname = Bun.env.HOST ?? "127.0.0.1";
const app = createServerApp();

Bun.serve({
  hostname,
  port,
  fetch: app.fetch,
});

console.log(`Mneme API listening on http://${hostname}:${port}`);
