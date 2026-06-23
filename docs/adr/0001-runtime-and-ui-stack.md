# Runtime and UI stack

Status: Accepted, modified by ADR 0002 for the source-import persistence slice.

We will use a single Bun package with a Vite React SPA and Hono/Web Fetch API. Core domain, shared schemas, provider contracts, and server API contracts must stay portable to Cloudflare Workers; local-only Bun or Node choices are allowed only behind adapters so the PoC can move quickly without baking local runtime assumptions into the product workflow.

The original persistence direction was Drizzle over local SQLite with a D1-compatible schema. ADR 0002 modifies that choice for the PoC source-import slice: use repository interfaces over Bun SQLite with D1-shaped SQL migrations, and defer Drizzle until the schema/query surface earns the dependency.

The original UI direction allowed shadcn/ui plus Tailwind CSS for selectively copied interface components. The current scaffold uses mobile-first React and plain CSS; introduce Tailwind with the first shadcn component only if the component earns the dependency cost.
