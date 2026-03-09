# Phase 7 — Controller

Status: complete
Started: 2026-03-08
Completed: 2026-03-08

---

## Goal

Write the system orchestrator contract. The Controller holds no funds itself — it routes
premiums from travelers to FlightPools, coordinates with RiskVault on solvency and payouts,
deploys FlightPools lazily on first purchase, and drives settlement via `checkAndSettle()`
which is called exclusively by the CRE workflow. This phase wires all previously built
contracts together and verifies the complete lifecycle end-to-end.

## Dependencies

- **MockUSDC** (Phase 1) — USDC token for all transfers
- **RecoveryPool** (Phase 2) — address passed to each deployed FlightPool
- **GovernanceModule** (Phase 3) — route approval and term lookups
- **RiskVault** (Phase 4) — locked capital, payouts, withdrawal queue, snapshot
- **OracleAggregator** (Phase 5) — flight registration, deregistration, status reads
- **FlightPool** (Phase 6) — deployed by Controller, settled by Controller

Post-deployment wiring (done in tests via setup):
- `riskVault.setController(address(controller))` — one-time, locks forever
- `oracleAggregator.setController(address(controller))` — one-time, locks forever

## Pre-work Notes

> This section is for you to fill in before work begins.
> Add constraints, decisions already made, questions to resolve, patterns to follow, or anything the agent should know before touching code.

**Decided before work began:**

- **No `minimumLeadTime` enforcement in Phase 7** — `minimumLeadTime` exists as a configurable state variable (default 1 hour) but is NOT enforced in `buyInsurance`. No `departureTimestamp` parameter. Enforcement will be added when real flight data integration arrives (Phase 11+). All lead-time tests (subtask 23) are therefore skipped / not written.
- **`FlightRecord` struct includes `uint256 index`** — stores the element's current position in `activeFlightKeys` for O(1) swap-and-pop in `_clearFlight`. Updated when another element is swapped in.
- **`_clearFlight(key)` signature** — takes only the `bytes32 key`; reads `flightRecords[key].index` internally for the swap-and-pop. No index parameter passed in.
- **`_settleDelayed` handles both Delayed and Cancelled** — one internal function that accepts a `bool isCancelled` flag (or `FlightPool.Outcome`) and calls either `pool.settleDelayed(claimExpiryWindow)` or `pool.settleCancelled(claimExpiryWindow)` accordingly. `_checkAndSettle` branches on OracleAggregator status and passes the flag.
- **`checkAndSettle()` modifier:** `onlyCREWorkflow` — reverts with a custom error if `msg.sender != creWorkflowAddress`.
- **`setCreWorkflow(address)`:** `onlyOwner`, reverts if address is zero. Updatable (not one-time) — owner can change it if workflow is redeployed.
- **`totalMaxLiability` bookkeeping:** increases by `payoff` on each purchase, decreases by `pool.maxLiability()` on each settlement (not per-buyer).
- **Solvency check formula:** `riskVault.freeCapital() >= (totalMaxLiability + newPayoff) * minimumSolvencyRatio / 100`
- **No OZ dependency** — Controller uses raw Solidity `onlyOwner` (manual `owner` state var), no Ownable import. Consistent with OracleAggregator and FlightPool patterns.
- **`buyInsurance` parameter order:** `(string calldata flightId, string calldata origin, string calldata destination, string calldata date)` — `date` is a human-readable string like `"2026-06-01"`, used as pool key and oracle registration. No `departureTimestamp`.
- **Constructor defaults:** `minimumSolvencyRatio = 100`, `minimumLeadTime = 1 hours`, `claimExpiryWindow = 60 days`
- **`getActivePools()` return type:** returns `address[]` (pool addresses only) — Controller can look up FlightRecord for metadata. Keep it simple for Phase 7; Phase 14 frontend can enrich client-side.
- Follow all Solidity conventions: custom errors, PascalCase events, camelCase state vars, no `s_` Hungarian notation.

---

## Subtasks

**Write the contract:**

- [x] 1. Declare state — `owner`, `usdc`, `riskVault`, `oracleAggregator`, `governanceModule`, `recoveryPool`, `creWorkflowAddress`, `totalMaxLiability`, `minimumSolvencyRatio`, `minimumLeadTime`, `claimExpiryWindow`, `flightRecords` mapping (`bytes32 → FlightRecord`), `activeFlightKeys` array (`bytes32[]`), `totalPoliciesSold`, `totalPremiumsCollected`, `totalPayoutsDistributed`
- [x] 2. Write `FlightRecord` struct — `address poolAddress`, `string flightId` (cached), `string flightDate` (cached), `bool active`, `uint256 index`
- [x] 3. Write `onlyOwner` and `onlyCREWorkflow` modifiers (custom errors: `Unauthorized`, `NotCREWorkflow`)
- [x] 4. Write constructor — takes `(address usdc_, address riskVault_, address oracleAggregator_, address governanceModule_, address recoveryPool_)`, validates all non-zero, sets defaults for `minimumSolvencyRatio = 100`, `minimumLeadTime = 1 hours`, `claimExpiryWindow = 60 days`, sets `owner = msg.sender`
- [x] 5. Write `_flightKey(string memory flightId, string memory date)` internal pure — `keccak256(abi.encodePacked(flightId, date))`
- [x] 6. Write `buyInsurance(string calldata flightId, string calldata origin, string calldata destination, string calldata date)` external
- [x] 7. Write `_deployPool(bytes32 key, string memory flightId, string memory date, uint256 premium, uint256 payoff)` internal
- [x] 8. Write `_settleNotDelayed(bytes32 key)` internal
- [x] 9. Write `_settleDelayedOrCancelled(bytes32 key, bool isCancelled)` internal
- [x] 10. Write `_clearFlight(bytes32 key)` internal — swap-and-pop with index update
- [x] 11. Write `_checkAndSettle()` internal — reverse iteration over `activeFlightKeys`
- [x] 12. Write `checkAndSettle()` external — `onlyCREWorkflow` → `_checkAndSettle()` → `riskVault.snapshot()`
- [x] 13. Write `setCreWorkflow(address newAddress)` — `onlyOwner`, revert if zero, emit `CreWorkflowSet`
- [x] 14. Write `isSolventForNewPurchase` view
- [x] 15. Write `getActivePools()` view
- [x] 16. Write `getPoolAddress` view
- [x] 17. Write `activeFlightCount()` view
- [x] 18. Write owner config setters — `setMinimumSolvencyRatio`, `setMinimumLeadTime`, `setClaimExpiryWindow`, `setGovernanceModule`

**Test the CRE workflow guard:**

- [x] 19. Test: `checkAndSettle()` from a non-`creWorkflowAddress` address reverts
- [x] 20. Test: `checkAndSettle()` from `creWorkflowAddress` succeeds (no active flights — no-op)
- [x] 21. Test: `setCreWorkflow(address(0))` reverts
- [x] 22. Test: `setCreWorkflow` from non-owner reverts
- [x] 23. Test: after `setCreWorkflow` with new address, old address is rejected and new one is accepted

**Test purchase flow:**

- [x] 24. Test: reverts if route not approved in GovernanceModule
- [x] 25. Test: reverts if route disabled
- [x] 26. Test: reverts if solvency check fails (vault empty)
- [x] 27. Test: first purchase for route+date deploys new FlightPool
- [x] 28. Test: second purchase for same route+date reuses existing pool (no new deployment)
- [x] 29. Test: FlightPool deployment reads terms from GovernanceModule at deploy time
- [x] 30. Test: `oracleAggregator.registerFlight` called only on first purchase for a route+date
- [x] 31. Test: `usdc.transferFrom` moves premium from traveler to FlightPool
- [x] 32. Test: `riskVault.increaseLocked` called with correct payoff amount
- [x] 33. Test: `totalPoliciesSold` increments by 1
- [x] 34. Test: `totalPremiumsCollected` increments by premium amount
- [x] 35. Test: `totalMaxLiability` increases by payoff amount on purchase
- [x] 36. Test: `FlightRecord` caches correct `flightId` and `flightDate`

**Test settlement ordering:**

- [x] 37. Test: `_settleDelayedOrCancelled` calls `sendPayout` before `decreaseLocked` (check vault USDC balance order)
- [x] 38. Test: after not-delayed settlement, premiums in RiskVault, `lockedCapital` released
- [x] 39. Test: after delayed settlement, pool is settled, `lockedCapital` released (push payout to traveler verified)
- [x] 40. Test: `processWithdrawalQueue` called after both settlement types
- [x] 41. Test: `totalPayoutsDistributed` increments on delayed/cancelled settlement only
- [x] 42. Test: `totalMaxLiability` decreases by `pool.maxLiability()` (cached pre-settle) after settlement

**Test flight registry:**

- [x] 43. Test: `activeFlightCount()` correct before and after settlement
- [x] 44. Test: settled pool removed from `activeFlightKeys` via swap-and-pop (second pool's index updated correctly)
- [x] 45. Test: `flightRecords[key].active = false` after settlement
- [x] 46. Test: `deregisterFlight` called on OracleAggregator after settlement
- [x] 47. Test: `getActivePools()` returns only unsettled pool addresses
- [x] 48. Test: settlement loop reads `flightId`/`flightDate` from `FlightRecord` cache (not external pool calls)

**Test solvency invariant:**

- [x] 49. Test: `isSolventForNewPurchase` returns false with empty vault
- [x] 50. Test: `isSolventForNewPurchase` returns true after sufficient deposit
- [x] 51. Test: `isSolventForNewPurchase` returns false after vault reaches capacity (all capital locked)
- [x] 52. Test: `minimumSolvencyRatio` of 150 requires 1.5× coverage — verify check math with concrete numbers

**End-to-end — not delayed:**

- [x] 53. Underwriter deposits USDC into RiskVault
- [x] 54. Traveler approves Controller and calls `buyInsurance`
- [x] 55. Simulate oracle: `vm.prank(authorizedOracle)` → `oracleAggregator.updateFlightStatus(flightId, date, OnTime)`
- [x] 56. Simulate CRE workflow: `vm.prank(creWorkflowAddress)` → `controller.checkAndSettle()`
- [x] 57. Verify premiums forwarded to RiskVault, `totalManagedAssets` increased, pool has zero balance
- [x] 58. Underwriter withdraws → `claimableBalance` credited → calls `collect()` → receives USDC

**End-to-end — delayed:**

- [x] 59. Underwriter deposits USDC into RiskVault
- [x] 60. Traveler approves Controller and calls `buyInsurance`
- [x] 61. Simulate oracle: `vm.prank(authorizedOracle)` → `oracleAggregator.updateFlightStatus(flightId, date, Delayed)`
- [x] 62. Simulate CRE workflow: `vm.prank(creWorkflowAddress)` → `controller.checkAndSettle()`
- [x] 63. Verify pool settled, `lockedCapital` released (traveler received PAYOFF via push)
- [x] 64. Traveler push payout verified; pull fallback via `pool.claim()` also tested
- [x] 65. Advance time past `claimExpiry`, call `pool.sweepExpired()` — remainder goes to RecoveryPool

### Gate

Both full lifecycle tests (not-delayed and delayed) pass. All counters reconcile (`totalPoliciesSold`, `totalPremiumsCollected`, `totalPayoutsDistributed`, `totalMaxLiability`). Solvency invariant holds at every step. CRE workflow guard rejects all unauthorised callers.

---

## Work Log

### Session 2026-03-08
Starting phase. Pre-work notes reviewed. Key decisions confirmed:
- No OZ dependency (raw `owner` state var, manual `onlyOwner`)
- `onlyCREWorkflow` guard on `checkAndSettle()`
- Reverse iteration in `_checkAndSettle()` for safe swap-and-pop
- `sendPayout` before `decreaseLocked` in delayed/cancelled settlement
- `IRiskVaultCtrl` name used in Controller to avoid naming conflict with FlightPool.sol's IRiskVault
- Importing FlightPool.sol directly for `new FlightPool(...)` in `_deployPool`

**Architectural fix discovered during integration testing:**
- FlightPool.settleNotDelayed() and _distributePayout() called `IRiskVault.recordPremiumIncome()`, but RiskVault.recordPremiumIncome has `onlyController`. FlightPool is not the Controller → reverts.
- Fix: removed recordPremiumIncome calls from FlightPool.sol. Controller now calls riskVault.recordPremiumIncome() after each settlement, reading pool USDC balance before settling (not-delayed) or tracking vault USDC delta (delayed/cancelled).
- Updated FlightPool.t.sol: replaced `vault.premiumIncomeRecorded()` assertions with `usdc.balanceOf(address(vault))` checks.

All 65 subtasks complete. 43 Controller tests, 201 total tests — all passing.

---

## Files Created / Modified

- **Created:** `contracts/src/Controller.sol` — full Controller contract
- **Created:** `contracts/test/Controller.t.sol` — 43 tests (43 pass)
- **Modified:** `contracts/src/FlightPool.sol` — removed `IRiskVault` interface and `recordPremiumIncome` calls from `settleNotDelayed()` and `_distributePayout()`
- **Modified:** `contracts/test/FlightPool.t.sol` — updated 4 assertions from `premiumIncomeRecorded` to `usdc.balanceOf(vault)` checks

---

## Decisions Made

1. **`IRiskVaultCtrl` interface name** — imported FlightPool.sol directly to enable `new FlightPool(...)`. To avoid naming collision with FlightPool.sol's `IRiskVault`, the Controller's vault interface is named `IRiskVaultCtrl`.

2. **recordPremiumIncome caller is Controller, not FlightPool** — FlightPool cannot call `recordPremiumIncome` since RiskVault requires `onlyController`. Controller reads pool USDC balance before `settleNotDelayed` and tracks vault USDC delta for delayed/cancelled settlement to pass the correct amount.

3. **Solvency formula operand** — maximum safe purchases per vault seed: with 100% ratio, check is `freeCapital >= (totalMaxLiability + payoff) * ratio / 100`. With 500 USDC seed and 100 USDC payoff (premiums go to pool, not vault), only 3 purchases are possible before the 4th fails solvency.

4. **Push payout means canClaim=false after settlement** — FlightPool._distributePayout pushes PAYOFF to each buyer eagerly, marking `claimed[buyer]=true`. So `canClaim()` returns false for buyers who received a push. Tests verify traveler received PAYOFF via push rather than checking canClaim=true.

5. **`flightKey()` public view added** — exposes the internal `_flightKey` computation for off-chain callers and tests to look up `flightRecords` entries without re-implementing the hash.

---

## Completion Summary

> Populated by /complete-phase. Do not edit manually.
