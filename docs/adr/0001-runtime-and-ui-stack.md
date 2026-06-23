# Runtime and UI stack

We will use a single Bun package with a Vite React SPA, Hono/Web Fetch API, Drizzle over local SQLite with a D1-compatible schema direction, and shadcn/ui plus Tailwind CSS for selectively copied interface components. Core domain, shared schemas, provider contracts, and server API contracts must stay portable to Cloudflare Workers; local-only Bun or Node choices are allowed only behind adapters so the PoC can move quickly without baking local runtime assumptions into the product workflow.
