# Mneme

Mneme is a local-first study app for turning technical book chapters into AI-assisted guided lessons, checkpoints, and reviewable study telemetry.

The name comes from Mneme, the Greek personification of memory and, in one tradition, one of the original Muses alongside Melete and Aoide. That lore fits the product: memory as the foundation for study, recall, and learning.

Repository: <https://github.com/Jayanth-Balasubramanian/mneme>

## Proof Of Concept

The PoC studies Chapter 17, "Monte Carlo Methods", from *Deep Learning* by Ian Goodfellow, Yoshua Bengio, and Aaron Courville.

Source credit:

- Book site: <https://www.deeplearningbook.org/>
- Chapter 17: <https://www.deeplearningbook.org/contents/monte_carlo.html>
- Citation details: `docs/SOURCES.md`

Do not commit the full chapter text unless reuse rights are explicitly confirmed. Use user-supplied Markdown excerpts in local app data and minimal/synthetic fixtures in tests.

## Public Repo Security Note

This repository is public to use GitHub Actions CI credits. Treat every committed file, test fixture, log, and artifact as public internet content.

Agents and reviewers must audit for:

- API keys, tokens, credentials, and `.env` files.
- Full copyrighted source text.
- Sensitive data embedded in tests, snapshots, logs, fixtures, or generated examples.
- LLM output rendered without validation or sanitization.

## Contracts

- `AGENTS.md`: agent operating contract.
- `CONTEXT.md`: domain glossary.
- `docs/SPEC.md`: product and architecture spec.
- `docs/API_CONTRACT.md`: API contract.
- `docs/TEST_CONTRACT.md`: testable behavior gates.
- `docs/SOURCES.md`: source credit.
- `docs/HANDOFF.md`: senior-engineer handoff.

## Local Development

Use Bun for all package and project commands.

```bash
bun install
bun run dev
bun test
bun run typecheck
bun run lint
bun run test:e2e
bun run db:migrate
bun run db:studio
bun run build
```

`bun run dev` starts the Hono API and Vite web app together. Override local ports with `API_PORT` and `WEB_PORT` when defaults are occupied.

The local SQLite path defaults to `mneme.sqlite`. Override it with `MNEME_DB_PATH`, especially for isolated migration checks.

Current runtime endpoints:

- `GET /api/health`
- `POST /api/chapter-sources`

`bun run db:migrate` applies the local SQLite schema. `test:e2e` and `db:studio` remain stable command placeholders until browser coverage and database inspection tooling land.

## CI

GitHub Actions runs on pushes to `main` and pull requests. CI runs the Bun project checks and a temp-path migration check when `package.json` exists, and keeps public-repo policy checks for secrets, `.env` files, generated build artifacts, and full chapter text.

Dependabot and deeper dependency security checks should be enabled after the dependency baseline settles.
