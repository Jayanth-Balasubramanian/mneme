import { describe, expect, test } from "bun:test";

import { createServerApp } from "../../../src/server/app";

describe("GET /api/health", () => {
  test("returns a stable health response", async () => {
    const app = createServerApp();

    const response = await app.request("/api/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      service: "mneme",
    });
  });
});
