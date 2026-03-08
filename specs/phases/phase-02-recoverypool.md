# Phase 2 — RecoveryPool

Status: planned
Started: —
Completed: —

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

- [ ] 1. Write `_recordDeposit(address sourcePool, uint256 amount)` — records deposit with source; accumulates if called multiple times from the same pool; restricted to authorised callers (onlyFlightPool or equivalent)
- [ ] 2. Write `withdraw(uint256 amount, address recipient)` — owner only; transfers USDC to recipient
- [ ] 3. Write `depositsFrom(address pool)` view — returns total USDC received from a specific pool address
- [ ] 4. Test: `_recordDeposit` from a mock address records `sourcePool → amount` correctly
- [ ] 5. Test: second `_recordDeposit` from same pool accumulates correctly
- [ ] 6. Test: owner can withdraw full balance to any recipient
- [ ] 7. Test: non-owner `withdraw` reverts
- [ ] 8. Test: multiple deposits from different pool addresses tracked independently
- [ ] 9. Test: `withdraw` more than balance reverts

### Gate

All tests pass. Contract is complete — it will not change again.

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
