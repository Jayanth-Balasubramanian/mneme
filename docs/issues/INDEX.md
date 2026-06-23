# Local Issue Queue

GitHub sync status: `needs-human`

Reason: local repository is initialized, but the GitHub CLI (`gh`) is not installed in this environment, so issues and repository creation cannot be synced to GitHub yet.

State vocabulary:

- `needs-human`
- `needs-spec`
- `ready-for-agent`
- `in-progress`
- `ready-for-review`
- `changes-requested`
- `lgtm`
- `ready-to-merge`
- `merged`

## DAG

| Issue | State | Title | Blocked by | Parallel notes |
|---|---|---|---|---|
| [001](001-scaffold-local-app.md) | `ready-for-agent` | Scaffold local Bun/Vite/Hono app | None | Sequential foundation |
| [002](002-source-import-and-attribution.md) | `ready-for-agent` | Import chapter excerpt with source attribution | 001 | Owns source import path |
| [003](003-mocked-generation-contract.md) | `ready-for-agent` | Generate validated lesson drafts with a mocked provider | 001 | Can run after shared contracts exist |
| [004](004-review-and-unit-regeneration.md) | `ready-for-agent` | Review lesson units and regenerate a single unit | 002, 003 | Depends on source and draft data |
| [005](005-study-telemetry.md) | `ready-for-agent` | Study approved units and record telemetry | 004 | Depends on approved units |
| [006](006-github-sync.md) | `needs-human` | Create GitHub repo and sync issue DAG | None | Blocked on GitHub owner/visibility/tooling |

Parallelism limit: at most 2 coding agents. Do not run issues in parallel when they touch the same schema, shared contract, generated files, or API route.
