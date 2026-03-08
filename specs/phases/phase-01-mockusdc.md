# Phase 1 — MockUSDC

Status: in_progress
Started: 2026-03-08
Completed: —

---

## Goal

Write a minimal mintable ERC-20 token with 6 decimals to stand in for real USDC in all local tests. Every contract in the system touches USDC — RiskVault, FlightPool, Controller, and RecoveryPool all call `transferFrom`, `transfer`, `approve`, and `balanceOf`. Having a realistic in-test USDC available from Phase 1 onward means no subsequent phase needs to introduce a stub or re-wire token addresses. This contract is test infrastructure only and is never deployed to mainnet.

## Dependencies

None. This is the first contract written. Phase 0 (Foundry Init) is the only prerequisite — it provides the build environment and OpenZeppelin v5.6.1.

## Pre-work Notes

> This section is for you to fill in before work begins.
> Add constraints, decisions already made, questions to resolve, patterns to follow, or anything the agent should know before touching code.

---

## Subtasks

- [x] 1. Implement `MockUSDC` as a standard mintable ERC-20 with 6 decimals — extend `ERC20` from OpenZeppelin, override `decimals()` to return 6, set name/symbol in constructor
- [x] 2. Write `mint(address to, uint256 amount)` callable by owner only — use `Ownable` from OpenZeppelin, call `_mint(to, amount)` internally
- [x] 3. Test: `transfer` works between two addresses — mint to Alice, Alice transfers to Bob, both balances correct
- [x] 4. Test: `transferFrom` works with prior approval — Alice approves Controller, Controller calls `transferFrom(Alice, FlightPool, amount)`, balances update correctly
- [x] 5. Test: `approve` and `allowance` update correctly — set allowance, read it back, spend it, confirm it decreases
- [x] 6. Test: `balanceOf` returns correct values after transfers — check before and after each operation
- [x] 7. Test: 6-decimal arithmetic — 1 USDC = 1_000_000, 0.5 USDC = 500_000, confirm `decimals()` returns 6
- [x] 8. Test: minting to zero address reverts — confirm `_mint` OZ guard triggers

### Gate

Mint, transfer, and approve all work correctly with 6-decimal precision. `forge test` passes with zero failures.

---

## Work Log

### Session 2026-03-08
Starting phase. Pre-work notes reviewed (none provided).

Implemented `MockUSDC` extending OZ `ERC20` + `Ownable`, `decimals()` returns 6, `mint()` restricted to owner.

Wrote 8 tests covering all subtasks: transfer, transferFrom, approve/allowance, balanceOf, 6-decimal arithmetic, zero-address mint revert, non-owner mint revert.

`forge test` result: 8/8 passed, 0 failed.

All subtasks complete. Gate condition met. Ready for /complete-phase.

---

## Files Created / Modified

- `contracts/src/MockUSDC.sol` — created
- `contracts/test/MockUSDC.t.sol` — created

---

## Decisions Made

- `MockUSDC` lives in `contracts/src/` (not `test/`) so it can be imported by deploy scripts and future integration tests without path issues.
- Used OZ `Ownable(msg.sender)` constructor pattern (OZ v5 style) — no separate `transferOwnership` call needed.
- No `burn` function — not needed by any downstream contract.
- Added a bonus `test_mintOnlyOwner` test beyond the 8 subtasks to lock in access control behaviour.

---

## Completion Summary

> Populated by /complete-phase. Do not edit manually.
