---
description: Generate a detailed phase plan file for a given phase number
---

# Plan Phase

## Objective

Generate a pre-work plan file for a specific phase so the user can review and edit it before work begins. Do not start any implementation — this command only produces the plan document.

## Arguments

The user provides a phase number as the argument (e.g. `/plan-phase 4`).

## Process

### 1. Read context

- Read `specs/development_list.md` — extract all subtasks for the requested phase number
- Read `specs/progress.md` — check the phase's current status (must be `planned` to generate a plan)
- Read `specs/architecture.md` — understand what this phase's contracts/components depend on

### 2. Determine the phase file path

Phase file naming convention:
```
specs/phases/phase-{NN}-{slug}.md
```
where `{NN}` is zero-padded phase number and `{slug}` is a short kebab-case name.

Phase slugs:
- 1 → phase-01-mockusdc
- 2 → phase-02-recoverypool
- 3 → phase-03-governancemodule
- 4 → phase-04-riskvault
- 5 → phase-05-oracleaggregator
- 6 → phase-06-flightpool
- 7 → phase-07-controller
- 8 → phase-08-integration-tests
- 9 → phase-09-mock-api-server
- 10 → phase-10-cre-workflow-mock
- 11 → phase-11-cre-workflow-aeroapi
- 12 → phase-12-testnet
- 13 → phase-13-frontend
- 14 → phase-14-mainnet

### 3. Generate the phase file

Write the file at the path above with the following structure:

```markdown
# Phase {N} — {Name}

Status: planned
Started: —
Completed: —

---

## Goal

{One paragraph describing what this phase builds and why it matters to the system.}

## Dependencies

{List contracts/components that must exist before this phase can begin. Reference which prior phase produces each dependency.}

## Pre-work Notes

> This section is for you to fill in before work begins.
> Add constraints, decisions already made, questions to resolve, patterns to follow, or anything the agent should know before touching code.

---

## Subtasks

{All numbered subtasks from development_list.md for this phase, as unchecked boxes}

- [ ] 1. ...
- [ ] 2. ...
...

### Gate

{The gate condition from development_list.md — what must be true before this phase is considered done.}

---

## Work Log

> Populated by the agent during work. Do not edit manually.

---

## Files Created / Modified

> Populated by the agent during work.

---

## Decisions Made

> Key architectural or implementation decisions locked in during this phase. Populated during work.

---

## Completion Summary

> Populated by /complete-phase. Do not edit manually.
```

### 4. Update progress.md

In the Phase Files table, change the phase row's Status column from `not generated` to `planned`.

### 5. Tell the user what to do next

Output a short message:
- Confirm the file was created at its path
- Tell the user to open the file, read the subtasks, and fill in the Pre-work Notes section
- Tell them to run `/start-phase {N}` when they are ready for the agent to begin work
