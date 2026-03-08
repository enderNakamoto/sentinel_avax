---
description: Prime agent with codebase understanding
---

# Prime: Load Project Context

## Objective

Build comprehensive understanding of the codebase by analyzing structure, documentation, and key files.

## Process

### 1. Analyze Project Structure

List all tracked files:
!`git ls-files`

Show directory structure:
On Linux, run: `tree -L 3 -I 'node_modules|__pycache__|.git|dist|build'`

### 2. Read Core Documentation

- Read the README.md at the project root
- Read the architecture.md in specs folder or any archicture documentation
- Read the PRD.md or similar spec file
- Read CLAUDE.md or similar global rules file
- Read README files at project root and major directories
- Read any integration documentation in spec/integrations folder

### 3. Identify the smart contracts [if it is a web3 project]
- Identify the smart contracts 
- Identify how the contracts interact with each other
- Identify the dependencies between the contracts
- Identify how Frontend calls the contracts READ and WRITE operations

### 4. Identify Key Files

Based on the structure, identify and read:
- Main entry points (main.py, index.ts, app.py, etc.)
- Core configuration files (pyproject.toml, package.json, tsconfig.json)
- Key model/schema definitions
- Important service or controller files

### 5. Read Project Progress

- Read `specs/progress.md` — identify current phase and its status
- If a phase is `in_progress` or `paused`, read its phase file from `specs/phases/` — read all checked/unchecked subtasks and the full Work Log to understand exactly where work stopped
- Note any blockers or next steps recorded in the Work Log

### 6. Read Git History

Run in parallel:
- `git log --oneline -30` — last 30 commits
- `git log --oneline --diff-filter=A --name-only --format="%h %s"` — files added per commit (shows what was built when)
- `git status` — any uncommitted work in progress

**Extract from the log:**
- Which phases have completion commits (e.g. `feat, test, docs: complete phase 3`) — treat these as ground truth even if progress.md hasn't been updated
- What the most recent commit was — this tells you what happened last session
- Any commits since the last phase completion — these are mid-phase or workflow-only changes
- Cross-check against `progress.md`: if git shows phase N complete but progress.md shows it as in_progress, trust git and note the discrepancy

**The git log is the hardest evidence of what has actually been built.** Use it to validate and fill gaps in the progress files.

## Output Report

Provide a concise summary covering:

### Project Overview
- Purpose and type of application
- Primary technologies and frameworks
- Current version/state

### Architecture
- Overall structure and organization
- Key architectural patterns identified
- Important directories and their purposes

### Smart contracts
- List the Smart contracts
- List how the contracts are connected
- List what contract is responsible for what aspect of the project

### Tech Stack
- Languages and versions
- Frameworks and major libraries
- Build tools and package managers
- Testing frameworks

### Core Principles
- Code style and conventions observed
- Documentation standards
- Testing approach

### Current State
- Active branch and any uncommitted changes
- Most recent commit — what it was and when
- Any discrepancies between git history and progress.md

### Build Progress
- Current phase and its status (planned / in_progress / paused / complete)
- If in_progress or paused: which subtasks are done, which remain, and what the Work Log says to do next
- Phases confirmed complete by git history (list their completion commits)
- What was built in the last session based on the most recent commits
- Suggested next action ("ready to /plan-phase N", "resume phase N at subtask X", etc.)

### Workflow (quick reference)
```
/plan-phase N      → generates phase plan file, you fill in Pre-work Notes
/start-phase N     → agent reads your notes and begins implementation
                     session ends mid-phase? just /prime next time to resume
/commit            → draft + review commit message, you approve, then commits
/complete-phase N  → you validate work, phase closed, memory updated
```
Skills auto-load when relevant: `aero-api` · `avalanche` · `chainlink-cre` · `reown` · `git`
Full workflow docs: `specs/workflow.md`

**Make this summary easy to scan - use bullet points and clear headers.**