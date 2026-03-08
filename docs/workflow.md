# Development Workflow

This document describes how we manage the build process for this project — how phases are planned, executed, resumed, and closed. Update this file as the workflow evolves.

---

## Overview

Development is broken into 14 phases (see `specs/development_list.md`). Each phase has its own lifecycle: it is planned before work starts, worked through incrementally, and explicitly closed by the user after validation.

The agent uses these files to resume work seamlessly across sessions without losing context.

---

## Files

| File | Purpose |
|---|---|
| `specs/progress.md` | High-level dashboard — one row per phase, shows status at a glance |
| `specs/phases/phase-{NN}-{slug}.md` | Per-phase living document — subtask checklist, pre-work notes, work log, decisions |
| `docs/workflow.md` | This file — explains the workflow itself |
| `~/.claude/projects/.../memory/MEMORY.md` | Agent's persistent memory — loaded at start of every session |

## Claude Commands Structure

```
.claude/commands/
  skills/                   ← auto-triggered by the agent based on task context
    aero-api.md             ← loads when working with FlightAware AeroAPI
    avalanche.md            ← loads when deploying/interacting with Avalanche C-Chain
    chainlink-cre.md        ← loads when writing CRE workflow TypeScript
    git.md                  ← loads when preparing a commit message
  prime.md                  ← /prime            — load project context at session start
  plan-phase.md             ← /plan-phase N     — generate phase plan file
  start-phase.md            ← /start-phase N    — begin implementation
  complete-phase.md         ← /complete-phase N — close a finished phase
  commit.md                 ← /commit           — draft, review, and execute a git commit
```

**Skills** live in `skills/` and are auto-triggered — the agent loads them when the task context matches their description. They use progressive disclosure: Layer 1 is always read, deeper layers are only consulted when the specific sub-task requires it.

**Commands** live in the root and are explicitly invoked by the user with `/command-name`.

---

## Phase Lifecycle

```
planned → in_progress → paused → complete
               ↑_______________|
```

- **planned** — phase file exists, user has reviewed and edited pre-work notes, work has not started
- **in_progress** — agent is actively working, subtasks being checked off, work log being written
- **paused** — session ended mid-phase, work log records where we stopped
- **complete** — user has validated and called /complete-phase, phase file is now read-only history

---

## Commands

### `/plan-phase N`

**When:** Before you're ready to start a phase.

**What it does:** Generates `specs/phases/phase-{NN}-{slug}.md` pre-populated with the goal, all subtasks from `development_list.md`, and empty sections for you to fill in.

**What you do next:** Open the file. Read the subtasks. Fill in the **Pre-work Notes** section — add constraints, decisions already made, questions to resolve, patterns to follow, anything the agent should know before touching code. When you're satisfied, run `/start-phase N`.

---

### `/start-phase N`

**When:** You've reviewed the phase file and are ready for the agent to begin implementation.

**What it does:**
1. Reads your pre-work notes and treats them as hard requirements
2. Marks the phase `in_progress` in `progress.md`
3. Begins working through subtasks in order
4. Checks off subtasks in real time and writes to the Work Log as it goes

**The work log** is the key to resuming. The agent writes it continuously — what was done, what decisions were made, what files were changed, and where to resume if interrupted. Do not edit the Work Log manually.

---

### `/prime`

**When:** Start of any session.

**What it does:**
1. Reads project architecture and documentation
2. Reads `specs/progress.md` to find the current phase
3. If a phase is `in_progress` or `paused`, reads the phase file — all checked subtasks and the full Work Log
4. Agent knows exactly where work stopped and resumes from there

You just say "keep going" and work continues from the last completed subtask. No need to re-explain context.

---

### `/complete-phase N`

**When:** You've reviewed the agent's work and are satisfied the phase is done.

**What it does:**
1. Marks the phase `complete` with a timestamp
2. Writes a Completion Summary to the phase file (what was built, key decisions, files)
3. Updates `progress.md` — advances the current phase pointer
4. Updates `MEMORY.md` with stable learnings from this phase

**This is always triggered by you.** The agent never auto-completes a phase. You validate, then close it.

---

## Standard Session Flow

### Starting a new phase

```
1. /plan-phase N       → agent generates phase file
2. You edit the file   → fill in Pre-work Notes
3. /start-phase N      → agent begins work
4. Agent works         → checks off subtasks, writes work log
5. You review          → inspect output, run tests, give feedback
6. /complete-phase N   → phase closed, memory updated
```

### Resuming a paused phase

```
1. /prime              → agent reads progress + phase file + work log
2. "keep going"        → agent resumes from last completed subtask
3. Agent works         → continues checking subtasks, appends to work log
4. You review          → validate when done
5. /complete-phase N   → phase closed
```

### Session ends mid-phase

No action required. The Work Log records where we stopped. Next session just run `/prime`.

---

## Per-Phase File Structure

```markdown
# Phase {N} — {Name}

Status: planned | in_progress | paused | complete
Started: {date or —}
Completed: {date or —}

## Goal
One paragraph: what this phase builds and why it matters.

## Dependencies
What must exist before this phase starts.

## Pre-work Notes         ← YOU FILL THIS IN before /start-phase
Constraints, decisions already made, questions, patterns to follow.

## Subtasks               ← Agent checks these off during work
- [x] 1. Done subtask
- [ ] 2. Pending subtask
...

### Gate
The condition that must be met for this phase to be complete.

## Work Log               ← Agent writes this during work, do not edit
### Session {date}
...

## Files Created / Modified   ← Agent maintains this
## Decisions Made             ← Agent maintains this
## Completion Summary         ← Written by /complete-phase
```

---

## Rules

- **You fill in Pre-work Notes. The agent fills in everything else** in the phase file during work.
- **The agent never auto-completes a phase.** You validate, then call `/complete-phase`.
- **The Work Log is append-only.** The agent adds to it; neither you nor the agent edits past entries.
- **Completed phase files are read-only history.** After `/complete-phase`, nothing in the file changes.
- **MEMORY.md captures stable facts only.** Not session details, not in-progress state — only things that will still be true in future sessions.

---

---

## Git Workflow

### Commit format

```
type[, type, ...]: short imperative description (≤50 chars)

- bullet: what changed and why
- bullet: one per logical group
```

### Types

| Type | When |
|---|---|
| `feat` | New contract, function, or feature |
| `fix` | Bug fix |
| `refactor` | Restructure without behaviour change |
| `test` | Tests added or updated |
| `docs` | Spec files, architecture docs, phase files |
| `workflow` | Commands, skills, progress tracking |
| `chore` | Config, deps, tooling |
| `deploy` | Deployment scripts, network config |

### When to commit

- After completing a logical unit of work (a contract, a test suite, a phase)
- After any workflow/tooling changes (commands, skills, progress files)
- Before pushing to GitHub — run `/commit` to generate and review the message

### `/commit` flow

```
/commit         → agent reads all changes, drafts message, shows you for approval
                  you say "yes" / edit it / "cancel"
                  agent commits only after explicit approval
```

**The agent never auto-commits.** You always see and approve the message first.

---

## Workflow Changelog

> Record significant changes to the workflow itself here.

| Date | Change |
|---|---|
| 2026-03-08 | Initial workflow established — progress.md, per-phase files, /plan-phase, /start-phase, /complete-phase commands created |
| 2026-03-08 | Added skills (aero-api, avalanche, chainlink-cre) with progressive disclosure. Moved to `.claude/commands/skills/` subfolder to separate auto-triggered skills from explicit commands |
| 2026-03-08 | Added git commit conventions (skills/git.md) and /commit command — types: feat, fix, refactor, test, docs, workflow, chore, deploy. Multi-type commits supported. Always requires user approval before committing. |
| 2026-03-08 | Updated /prime to actively read and interpret git log — last 30 commits, files added per commit, cross-validation against progress.md. Git history is now treated as ground truth for build progress. |
| 2026-03-08 | Added Phase 0 (Foundry init) and Phase 13 (Frontend init). Renumbered old Phase 13→14 (Frontend) and Phase 14→15 (Mainnet). Now 16 phases total (0–15). Added Reown AppKit skill (skills/reown.md). |
