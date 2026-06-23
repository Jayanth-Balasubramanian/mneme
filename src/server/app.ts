import { Hono } from "hono";

import { registerHealthRoutes } from "./api/health";

export function createServerApp(): Hono {
  const app = new Hono();

  registerHealthRoutes(app);

  app.notFound((context) =>
    context.json(
      {
        error: "not_found",
      },
      404,
    ),
  );

  return app;
}
