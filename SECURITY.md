# Security

## Public Repository Posture

This repository is intentionally public to use GitHub Actions CI credits. Assume all committed source, tests, fixtures, screenshots, logs, and artifacts are public.

## Agent Audit Rules

Before opening or approving a pull request, agents must check for:

- Secrets, API keys, tokens, credentials, and `.env` files.
- Full copyrighted book/chapter text.
- Sensitive data hidden in tests, fixtures, snapshots, generated examples, logs, or documentation.
- LLM output used without schema validation.
- Markdown or HTML rendering paths that execute user-controlled code.
- New dependencies that materially increase attack surface.

## CI Security Gates

GitHub Actions runs `bun run security:check` on pull requests and pushes to
`main`. The command requires no Cloudflare credentials, deployment target, or
production secrets.

The app-specific security command checks:

- Markdown/rendering policy: app code and package manifests must not introduce
  executable HTML/MDX rendering paths for user-controlled Markdown or generated
  lesson content.
- LLM output validation coverage: required schema, provenance, invalid-output,
  invalid-anchor, and provider-failure test markers must remain present.
- Source-text leakage policy: known *Deep Learning* Chapter 17 body markers must
  not appear in committed text files.
- Secret leakage policy: tracked `.env`/private-key paths and common token-like
  values are rejected.
- Detector self-test: a synthetic secret-like dry-run fixture is generated in
  memory and must trigger the detector before repository files are scanned.

Run `bun run security:check --self-test` to execute only the detector self-test
without scanning repository files.

CI also keeps the project checks for lint, typecheck, Bun tests, database
migration, and build.

Future deployment secrets must live in GitHub Secrets or Cloudflare secrets. Do not commit production secrets or print them in CI logs.
