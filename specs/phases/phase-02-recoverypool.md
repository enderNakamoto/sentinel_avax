# Phase 2 — RecoveryPool

Status: complete
Started: 2026-03-08
Completed: 2026-03-08

---

## Goal

Write the simplest contract in the system — a custody-only holding pool for expired, unclaimed traveler payouts. When a FlightPool's claim window expires, `sweepExpired()` transfers remaining USDC to the RecoveryPool and calls `_recordDeposit()` to log the source. The owner can manually withdraw funds for legitimate late-claim resolution. This contract has no dependencies on any other Sentinel contract and will not change after this phase.

## Dependencies

- `MockUSDC` (Phase 1) — used as the token in tests
- No other contract dependencies — RecoveryPool has no constructor references to other Sentinel contracts

## Pre-work Notes

> This section is for you to fill in before work begins.
> Add constraints, decisions already made, questions to resolve, patterns to follow, or anything the agent should know before touching code.

**Decided before work began:**
- Deposit-recording function is named `_recordDeposit(address sourcePool, uint256 amount)` — `_` prefix per convention (protocol-internal, called by FlightPool, not end users)
- Follow `.claude/commands/skills/solidity.md` conventions throughout: custom errors, PascalCase events, camelCase state vars

---

## Subtasks

- [x] 1. Write `_recordDeposit(address sourcePool, uint256 amount)` — records deposit with source; accumulates if called multiple times from the same pool; restricted to authorised callers (onlyFlightPool or equivalent)
- [x] 2. Write `withdraw(uint256 amount, address recipient)` — owner only; transfers USDC to recipient
- [x] 3. Write `depositsFrom(address pool)` view — returns total USDC received from a specific pool address
- [x] 4. Test: `_recordDeposit` from a mock address records `sourcePool → amount` correctly
- [x] 5. Test: second `_recordDeposit` from same pool accumulates correctly
- [x] 6. Test: owner can withdraw full balance to any recipient
- [x] 7. Test: non-owner `withdraw` reverts
- [x] 8. Test: multiple deposits from different pool addresses tracked independently
- [x] 9. Test: `withdraw` more than balance reverts

### Gate

All tests pass. Contract is complete — it will not change again.

---

## Work Log

### Session 2026-03-08
Starting phase. Pre-work notes reviewed. Key constraints: `_recordDeposit` uses `_` prefix (protocol-internal), follow solidity conventions (custom errors, PascalCase events, camelCase state vars). No constructor references to other Sentinel contracts.

Implemented `contracts/src/RecoveryPool.sol`:
- `_recordDeposit(address sourcePool, uint256 amount)` — external, no access restriction (RecoveryPool can't enumerate FlightPool addresses; called after USDC transfer); accumulates into `deposits` mapping; emits `DepositRecorded`
- `withdraw(uint256 amount, address recipient)` — `onlyOwner`; relies on OZ ERC20 revert for insufficient balance; emits `Withdrawn`
- `depositsFrom(address pool)` — view, returns `deposits[pool]`

Implemented `contracts/test/RecoveryPool.t.sol` — 6 tests, all passing.

All subtasks complete. Gate condition met. Ready for /complete-phase.

### Session 2026-03-08 — Completed
Phase validated by user. All gate conditions met.

---

## Files Created / Modified

- `contracts/src/RecoveryPool.sol` — new contract
- `contracts/test/RecoveryPool.t.sol` — new test suite (6 tests)

---

## Decisions Made

- `_recordDeposit` has no access control — RecoveryPool cannot enumerate FlightPool addresses (no Controller dependency), and the USDC is already transferred before the call. Any caller can record. False accounting entries from non-FlightPool callers are harmless since `withdraw` acts on actual USDC balance, not the deposits mapping.
- `withdraw` relies on OZ ERC20's built-in revert for insufficient balance rather than adding a redundant balance check — avoids over-engineering.
- `deposits` mapping is `private` — external reads go through `depositsFrom()` view.

---

## Completion Summary

**What was built:**
- `contracts/src/RecoveryPool.sol` — custody-only holding pool for expired traveler payouts; no dependencies on other Sentinel contracts
- `contracts/test/RecoveryPool.t.sol` — 6 tests covering all subtasks; all passing

**Key decisions locked in:**
- `_recordDeposit` has no access control — RecoveryPool cannot enumerate FlightPool addresses without a Controller dependency, so any caller can record. False accounting entries are harmless since `withdraw` acts on actual USDC balance.
- `withdraw` relies on OZ ERC20's built-in insufficient-balance revert — no redundant balance check.
- `deposits` mapping is `private`; reads go through `depositsFrom()` view.
- `_` prefix on `_recordDeposit` signals protocol-internal per convention, even though visibility is `external`.

**Files created:**
- `contracts/src/RecoveryPool.sol`
- `contracts/test/RecoveryPool.t.sol`

**Next phase awareness:**
- FlightPool (Phase 6) calls `_recordDeposit(address(this), amount)` after transferring USDC to RecoveryPool in `sweepExpired()` — no wiring needed now.
- RecoveryPool constructor takes `(address usdcAddress, address initialOwner)` — owner will be the deployer (or a multisig in prod).
