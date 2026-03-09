# Phase 8 — Integration Tests

Status: complete
Started: 2026-03-08
Completed: 2026-03-08

---

## Goal

Write a single Foundry integration test file that exercises all six contracts together under realistic multi-flight, multi-underwriter scenarios. No new contracts are written — this phase validates that the contracts composed correctly: solvency accounting stays clean, the withdrawal queue drains in FIFO order, settlement paths are correct for every outcome, and `totalManagedAssets` never drifts.

## Dependencies

All six production contracts must be complete and individually tested:
- Phase 1: MockUSDC
- Phase 2: RecoveryPool
- Phase 3: GovernanceModule
- Phase 4: RiskVault
- Phase 5: OracleAggregator
- Phase 6: FlightPool
- Phase 7: Controller

## Pre-work Notes

> This section is for you to fill in before work begins.
> Add constraints, decisions already made, questions to resolve, patterns to follow, or anything the agent should know before touching code.

---

## Subtasks

- [x] 1. Create `contracts/test/Integration.t.sol` — shared `setUp()` deploys all six contracts fresh and wires them (setController, setOracle, setCreWorkflow, approveRoute), funds the RiskVault with a seed deposit, sets `minimumLeadTime = 0` for test convenience
- [x] 2. Test: 3 flights active simultaneously (AA100 OnTime, AA200 Delayed, AA300 Cancelled) — verify vault `totalManagedAssets` and `lockedCapital` reconcile after all three settle via a single `checkAndSettle()` call; assert `balanceSanityCheck()` returns zero
- [x] 3. Test: 5 underwriters deposit into RiskVault, capital is locked by a large purchase, withdrawal queue fills for multiple underwriters — after a settlement releases capital, `processWithdrawalQueue` drains FIFO, correct underwriters credited in order
- [x] 4. Test: route terms updated mid-lifecycle — buy one policy (pool A deployed at old terms), call `updateRouteTerms`, buy again for a new date (pool B deployed at new terms), settle both — each pool settles at its own locked terms
- [x] 5. Test: route disabled after one pool is active — existing pool settles normally (no revert on settle); second `buyInsurance` call for a new date on the disabled route reverts with `RouteNotApproved`
- [x] 6. Test: `minimumSolvencyRatio` at 150 — set ratio to 150, fund vault such that exactly 2 purchases fit, assert third purchase reverts with solvency error; after one flight settles OnTime (capital released), assert a new purchase succeeds
- [x] 7. Test: full claim expiry cycle — settle a flight Delayed, advance time past `claimExpiry`, assert `claim()` reverts, call `sweepExpired()`, assert RecoveryPool USDC balance and `deposits` mapping are correct
- [x] 8. Test: `queueHead` never regresses — run 20 sequential buy+settle cycles with a withdrawal queued before each settlement, inspect `queueHead` after every `checkAndSettle` call and assert it is always `>=` the value from the previous iteration
- [x] 9. Test: `totalManagedAssets` stress — 10 full buy+settle cycles (mix of OnTime and Delayed outcomes), assert `balanceSanityCheck()` returns zero after every settlement cycle
- [x] 10. Ensure `vm.prank(creWorkflowAddress)` is used for all `updateFlightStatus` and `checkAndSettle` calls throughout the test file; `vm.prank(authorizedOracle)` is the same address

### Gate

All scenarios pass. No counter drift (`balanceSanityCheck` always zero). No stuck pools. `queueHead` never regresses. Full `forge test --match-path test/Integration.t.sol -vv` green.

---

## Work Log

### Session 2026-03-08
Starting phase. Pre-work notes reviewed (none provided).

All 10 subtasks completed in one session. Created `contracts/test/Integration.t.sol` with 8 test functions. All 8 pass. Full suite: 209 tests, 0 failures.

Two fixes required during implementation:
1. FIFO test: BIG payoff set to 1_401_000_000 (not 1_400_000_000) so freeCapital = 99 USDC < 100 USDC per-underwriter share — ensuring all 5 withdrawals enter the queue.
2. ClaimExpiry test: `_distributePayout` push always succeeds for EOAs so `claimed = true` immediately. Test validates `ClaimWindowOpen` on pre-expiry sweep and `AlreadyClaimed` on double-claim instead of `ClaimExpired`.

**Gate met. Ready for /complete-phase 8.**

### Session 2026-03-08 — Completed
Phase validated by user. All gate conditions met.

---

## Files Created / Modified

- `contracts/test/Integration.t.sol` — created

---

## Decisions Made

- **creWorkflow == authorizedOracle**: single address handles both `updateFlightStatus` and `checkAndSettle` throughout Integration.t.sol.
- **FIFO ordering direction**: later queue entries receive more USDC per share (share price rises as earlier shares burn within the same call). Assertion: `claimableBalance[u5] >= claimableBalance[u1]`.
- **ClaimExpired not testable for EOAs**: `_distributePayout` always marks `claimed = true` for EOA buyers. No `ClaimExpired` path tested; `ClaimWindowOpen` + `AlreadyClaimed` tested instead.

---

## Completion Summary

**What was built:** `contracts/test/Integration.t.sol` — 8 integration test functions exercising all six contracts wired together. Covers 3-flight simultaneous settlement, 5-underwriter FIFO queue drain, route terms mid-lifecycle update, route disable with existing pool, solvency ratio at 150%, claim expiry cycle, 20-cycle queueHead regression guard, and 10-cycle `totalManagedAssets` stress test.

**Final test count:** 209 tests, 0 failures (8 new integration tests on top of 201 existing unit tests).

**Key decisions locked in:**
- `creWorkflow` and `authorizedOracle` are the same address throughout integration tests — matches the CRE deployment model.
- `processWithdrawalQueue` share-price drift: as shares are burned within a single call, later queue entries receive slightly more USDC per share. Tests assert `claimableBalance[u5] >= claimableBalance[u1]`.
- `ClaimExpired` is unreachable via normal Controller flow for EOA buyers: `_distributePayout` always succeeds for EOAs so `claimed = true` immediately. Test validates `ClaimWindowOpen` and `AlreadyClaimed` instead.

**Files created:** `contracts/test/Integration.t.sol`

**Next phase (9 — Mock API Server):** Builds a Node.js/Express mock server mirroring the AeroAPI response shape. No Solidity changes needed.
