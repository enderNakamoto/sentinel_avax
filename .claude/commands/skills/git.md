---
description: Git commit convention reference. Trigger when preparing a commit message, categorising changes before a commit, reviewing what has changed across staged/unstaged files, or about to run git commit.
---

# Skill: Git Commit Conventions

## Layer 1 — Format and types (always read this)

### Commit message format

```
type[, type, ...]: short imperative description (≤50 chars)

- bullet: what changed and why
- bullet: one per logical group of changes

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

- Subject line: imperative mood, lowercase after colon, no period, ≤50 chars
- Body: bullet points, focus on **what and why**, not how
- Multi-type: list all that apply, ordered by significance

### Commit types

| Type | Use when |
|---|---|
| `feat` | New contract, new function, new feature |
| `fix` | Bug fix, incorrect logic corrected |
| `refactor` | Code restructured without behaviour change |
| `test` | Tests added or updated |
| `docs` | Spec files, architecture docs, README, phase files |
| `workflow` | Commands, skills, progress.md, phase tracking, workflow docs |
| `chore` | Config, deps, tooling, .gitignore, foundry.toml setup |
| `deploy` | Deployment scripts, network config, broadcast files |

### Single-type examples

```
feat: add RiskVault deposit and share issuance logic

- implements deposit() with 1:1 shares on first deposit, proportional thereafter
- totalManagedAssets counter updated on deposit, not balanceOf
```

```
fix: floor decreaseLocked at zero instead of reverting

- prevents underflow if settlement called twice on same pool
- matches architecture spec behaviour
```

```
test: add withdrawal queue FIFO ordering tests

- covers queue drain order across 5 concurrent underwriters
- verifies queueHead never regresses after 20 settlement cycles
```

### Multi-type examples

```
feat, test: add OracleAggregator with swap-and-pop deregistration

- feat: status transitions Unknown→OnTime/Delayed/Cancelled, append-only
- feat: getActiveFlights() for CRE workflow to read each tick
- test: 37 tests covering status lifecycle, access control, deregistration
```

```
feat, test, docs: complete phase 3 — GovernanceModule

- feat: route approval, disable, term updates, admin whitelist
- test: 33 tests covering access control, route lifecycle, validation
- docs: phase-03 marked complete, progress.md updated to phase 4
```

```
docs, workflow: add phase tracking system and workflow documentation

- workflow: progress.md dashboard, per-phase files, /plan-phase /start-phase /complete-phase commands
- docs: workflow.md explaining full development loop
```

### Rules

- **One commit per logical unit of work** — a phase completion, a contract, a bug fix. Not one commit per file.
- **Never commit secrets, .env files, or private keys.**
- **Never commit with --no-verify** unless explicitly instructed.
- **Always show the draft to the user before committing.** The user approves.
- If changes span many files, group bullets by type not by file.

---

## Layer 2 — Commit scope for this project

> Reference when deciding what belongs in one commit vs multiple.

- **Per-phase commits:** one commit when a phase is complete (`/complete-phase` triggers this naturally)
- **Mid-phase commits:** commit when a logical sub-group is done (e.g. contract written, then tests written separately)
- **Workflow changes:** always `workflow` type — commands, skills, progress files
- **Spec-only changes:** always `docs` type
- **Never mix** unrelated concerns in one commit (e.g. don't commit a bug fix and a new feature together)
