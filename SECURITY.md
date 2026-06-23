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

GitHub Actions includes:

- Public-repo policy checks for token-like strings, tracked env files, and committed full chapter text.
- Repository policy checks for tracked env files and obvious token formats.
- Project checks through Bun once `package.json` exists.

Future deployment secrets must live in GitHub Secrets or Cloudflare secrets. Do not commit production secrets or print them in CI logs.
