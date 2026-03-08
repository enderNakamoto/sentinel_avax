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

- Read the overview.md in specs folder
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

### 5. Understand Current State

Check recent activity:
!`git log -10 --oneline`

Check current branch and status:
!`git status`

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
- Active branch
- Recent changes or development focus
- Any immediate observations or concerns

**Make this summary easy to scan - use bullet points and clear headers.**