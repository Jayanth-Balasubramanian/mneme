# Issue 006: Create GitHub repo and sync issue DAG

State: `needs-human`

## What to build

Create the GitHub repository, push the local repo, create labels/states for the loop workflow, and sync the local issue DAG into GitHub issues.

## Acceptance criteria

- [ ] GitHub owner, repository name, and visibility are confirmed.
- [ ] GitHub tooling or credentials are available.
- [ ] Local `main` branch is pushed to GitHub.
- [ ] Issues 001-005 are created in GitHub with dependency links.
- [ ] Local issue ledger links to the GitHub issue URLs.

## Verification

- [ ] `git remote -v`
- [ ] `git status --short --branch`
- [ ] GitHub issue URLs exist for each issue.

## Blocked by

- GitHub owner/repo/visibility decision.
- GitHub CLI/API access.

## Likely ownership

- GitHub repository settings.
- `docs/issues/INDEX.md`
