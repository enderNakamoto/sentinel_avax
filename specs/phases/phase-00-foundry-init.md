# Phase 0 — Foundry Project Init

Status: in_progress
Started: 2026-03-08
Completed: —

---

## Goal

Set up the Solidity project foundation before any contract code is written. This phase establishes the Foundry project structure inside a dedicated `/contracts` subdirectory, installs OpenZeppelin dependencies, configures `foundry.toml` for Avalanche C-Chain, and scaffolds the deploy script. A top-level `/frontend` directory is also created as a placeholder for Phase 13. Contract code and frontend code are kept fully separate from each other and from specs/docs. Every subsequent contract phase (1–12) builds directly on this structure.

## Dependencies

None — this is the first phase. No prior contracts or components required.

## Pre-work Notes

> **Decided:** Foundry lives in `/contracts` (not project root). Frontend lives in `/frontend` (scaffolded in Phase 13). ABIs will be shared via wagmi CLI in Phase 14 — `wagmi.config.ts` will point at `../contracts/out/`. No need to redirect `foundry.toml` `out` directory.

---

## Subtasks

- [x] 1. Create a `/contracts` directory at the project root and run `forge init contracts/` (initialise Foundry inside it, not the project root)
- [x] 2. Confirm Foundry default structure exists inside `contracts/`: `src/`, `test/`, `script/`, `lib/`, `foundry.toml`
- [x] 3. Remove the default `Counter.sol` and `Counter.t.sol` stub files that `forge init` generates — keep the directory structure, just delete the stubs
- [x] 4. Install OpenZeppelin contracts: run `forge install OpenZeppelin/openzeppelin-contracts --no-commit` from inside `contracts/`
- [x] 5. Add OpenZeppelin remapping — in `contracts/foundry.toml` under `[profile.default]`:
  ```toml
  remappings = ["@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/"]
  ```
- [x] 6. Configure `contracts/foundry.toml` for Avalanche C-Chain:
  - `solc = "0.8.20"`
  - `evm_version = "london"`
  - `optimizer = true`, `optimizer_runs = 200`
  - `out = "out"` (explicit — build artifacts stay in `contracts/out/`, not redirected into frontend)
  - Add `[rpc_endpoints]` block with `avax_fuji` and `avax_mainnet` using env var references
  - Add `[etherscan]` block with Routescan verifier URLs for both networks
- [x] 7. Create `contracts/.env.example` with placeholder keys: `PRIVATE_KEY`, `SNOWTRACE_API_KEY`, `AVAX_FUJI_RPC`, `AVAX_MAINNET_RPC`
- [x] 8. Ensure `contracts/.env` is covered by the root `.gitignore` — add `contracts/.env` and `contracts/out/` entries if not already present; confirm neither is tracked
- [x] 9. Create `contracts/script/Deploy.s.sol` scaffold — empty shell with just the import and contract declaration, no logic yet
- [x] 10. Create a `/frontend` directory at the project root with a single `README.md` placeholder noting it will be scaffolded in Phase 13 and will use wagmi CLI to read ABIs from `../contracts/out/`
- [x] 11. Run `forge build` from `contracts/` — confirm zero errors
- [x] 12. Run `forge test` from `contracts/` — confirm zero tests, zero failures (empty suite passes)
- [ ] 13. Commit the initialized project structure

### Gate

`forge build` and `forge test` both pass with zero errors from inside `contracts/`. The `/contracts` and `/frontend` directories are committed at project root, cleanly separated from `specs/` and `docs/`. Ready for Phase 1 (MockUSDC).

---

## Work Log

### Session 2026-03-08
Starting phase. Pre-work notes reviewed.

- Tasks 1–2: `forge init contracts/` completed. Structure confirmed: `src/`, `test/`, `script/`, `lib/`, `foundry.toml`.
- Task 3: Removed `Counter.sol`, `Counter.t.sol`, `Counter.s.sol` (forge init stub files).
- Task 4: OpenZeppelin v5.6.1 installed via `forge install OpenZeppelin/openzeppelin-contracts`. Note: `--no-commit` flag no longer exists in this version of Foundry — install runs without it.
- Tasks 5–6: `foundry.toml` rewritten with full Avalanche config — solc 0.8.20, london EVM, optimizer, OZ remapping, `[rpc_endpoints]` and `[etherscan]` blocks using Routescan URLs from `docs/avalanche.md`.
- Task 7: `contracts/.env.example` created with all four placeholder keys.
- Task 8: Root `.gitignore` updated — added `contracts/.env`, `contracts/out/`, `contracts/cache/`, `contracts/broadcast/*/dry-run/`, and frontend entries.
- Task 9: `contracts/script/Deploy.s.sol` scaffold created — empty run() body, logic deferred to Phase 12.
- Task 10: `frontend/README.md` placeholder created explaining Phase 13 scaffolding and wagmi CLI ABI bridge.
- Tasks 11–12: `forge build` — zero errors (16 files compiled). `forge test` — zero tests, zero failures. Gate condition met.
- Task 13: Pending — commit to be made now.

---

## Files Created / Modified

- `contracts/` — new directory, Foundry project root
- `contracts/foundry.toml` — full Avalanche config with OZ remapping
- `contracts/src/` — empty (stubs removed)
- `contracts/test/` — empty (stubs removed)
- `contracts/script/Deploy.s.sol` — empty scaffold
- `contracts/lib/forge-std/` — installed by forge init
- `contracts/lib/openzeppelin-contracts/` — v5.6.1 installed
- `contracts/.env.example` — placeholder env keys
- `frontend/README.md` — placeholder for Phase 13
- `.gitignore` — updated with contracts and frontend entries

---

## Decisions Made

- **Foundry in `/contracts/`** — not project root. Clean separation from `specs/`, `docs/`, `frontend/`.
- **`contracts/out/` stays in `contracts/`** — not redirected into frontend. wagmi CLI will read it from `../contracts/out/` in Phase 14.
- **OpenZeppelin v5.6.1** — latest stable at time of install. All contracts will target this version.
- **`forge install` no longer accepts `--no-commit`** — the flag was removed from the current Foundry version. Install works without it.
- **`[profile.ci]` added** — fuzz runs = 1000, invariant runs = 256. Standard for production contracts.
- **`via_ir = false`** — disabled by default. Enable if stack-too-deep errors occur in complex contracts (RiskVault or Controller are most likely candidates).

---

## Completion Summary

> Populated by /complete-phase. Do not edit manually.
