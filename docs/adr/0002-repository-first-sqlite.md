# ADR 0002: Repository-First SQLite For Source Import

## Status

Accepted

## Context

The source import slice needs one table, a small API boundary, shared serializable request/response types, and isolated integration tests. The project spec allowed Drizzle and Zod, but the user also asked for a clean modern stack with minimal dependencies and a small bundle.

## Decision

Use Bun's built-in SQLite adapter behind `src/server/db/` repositories for the PoC source import slice. Keep migrations SQL-shaped and D1-compatible, validate the import request with small shared TypeScript helpers, and defer Drizzle/Zod until the schema or validation surface is large enough to justify adding them.

## Consequences

- The source import path adds no runtime dependency beyond the scaffold.
- Direct database access remains isolated under `src/server/db/`.
- The local SQLite adapter is Bun-specific by design, so future Cloudflare D1 support should add a new repository adapter rather than leaking runtime details into domain or shared code.
- The SQL migration and TypeScript migration registry must stay aligned until a migration tool is introduced.
