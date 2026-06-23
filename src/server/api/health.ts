import type { Hono } from "hono";

import type { HealthResponse } from "../../shared/health";

export function registerHealthRoutes(app: Hono): void {
  app.get("/api/health", (context) => {
    const response: HealthResponse = {
      status: "ok",
      service: "mneme",
    };

    return context.json(response);
  });
}
