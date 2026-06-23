# Mneme

Mneme is a local-first study app for turning technical book chapters into AI-assisted guided lessons, checkpoints, and reviewable study telemetry.

The name comes from Mneme, the Greek personification of memory and, in one tradition, one of the original Muses alongside Melete and Aoide. That lore fits the product: memory as the foundation for study, recall, and learning.

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

## CI

GitHub Actions runs on pushes to `main` and pull requests. Initial CI is docs/security aware and will run Bun-based project commands once the app is scaffolded.

Dependabot and deeper dependency security checks should be enabled after `package.json` exists.
