# Flight Delay Insurance Protocol — Development Flow

This document describes the order in which contracts should be written, tested, and
deployed. Each phase has a clear gate — do not move on until the current phase's
validation passes. Contracts are introduced in dependency order so nothing is tested
against a stub that will later change.

---

## Phase 1 — MockUSDC

Every contract in the system touches USDC. Write this first so all subsequent testing
uses a realistic token rather than a bare ERC-20 stub.

1. Implement as a standard mintable ERC-20 with 6 decimals
2. `mint(address, amount)` callable by owner for seeding test wallets
3. Verify `transfer` works between two addresses
4. Verify `transferFrom` works with prior approval
5. Verify `approve` and `allowance` update correctly
6. Verify `balanceOf` returns correct values after transfers
7. Confirm 6-decimal arithmetic (1 USDC = 1_000_000, 0.5 USDC = 500_000)
8. Confirm minting to zero address reverts

**Gate:** Mint, transfer, approve all working with correct 6-decimal precision.

---

## Phase 2 — RecoveryPool

The simplest contract in the system. Custody only. No dependencies.

1. Write `receive(address sourcePool, uint256 amount)` — records deposit with source
2. Write `withdraw(uint256 amount, address recipient)` — owner only
3. Write `depositsFrom(address pool)` view — returns total received from a specific pool
4. Test: deposit from a mock address records `sourcePool → amount` correctly
5. Test: second deposit from same pool accumulates correctly
6. Test: owner can withdraw full balance to any recipient
7. Test: non-owner withdraw reverts
8. Test: multiple deposits from different pool addresses tracked independently
9. Test: withdraw more than balance reverts

**Gate:** All tests pass. Contract is complete — it will not change again.

---

## Phase 3 — GovernanceModule

The route authority. No dependency on any other protocol contract.

**Write the contract:**

1. Define `Route` struct — `(flightId, origin, destination, premium, payoff, active)`
2. Add `routes` mapping — `bytes32 key → Route`
3. Add `admins` mapping — `address → bool`
4. Write `_routeKey(flightId, origin, destination)` internal pure helper
5. Write `addAdmin(address)` — owner only
6. Write `removeAdmin(address)` — owner only
7. Write `onlyOwnerOrAdmin` modifier
8. Write `approveRoute(flightId, origin, destination, premium, payoff)` — validate premium > 0, payoff > premium, route not already active
9. Write `disableRoute(flightId, origin, destination)` — mark `active = false`
10. Write `updateRouteTerms(flightId, origin, destination, newPremium, newPayoff)` — validate terms, update in place, does not affect existing pools
11. Write `isRouteApproved(flightId, origin, destination)` view
12. Write `getRouteTerms(flightId, origin, destination)` view — returns `(premium, payoff)`
13. Write `getApprovedRoutes()` view — returns full array of active routes

**Test access control:**

14. Test: non-owner, non-admin cannot call `approveRoute`
15. Test: non-owner, non-admin cannot call `disableRoute`
16. Test: non-owner, non-admin cannot call `updateRouteTerms`
17. Test: non-owner cannot call `addAdmin`
18. Test: non-owner cannot call `removeAdmin`
19. Test: admin can call `approveRoute`, `disableRoute`, `updateRouteTerms`
20. Test: admin cannot call `addAdmin` or `removeAdmin`
21. Test: after `removeAdmin`, revoked address loses access immediately

**Test route lifecycle:**

22. Test: `approveRoute` → `isRouteApproved` returns true
23. Test: `disableRoute` → `isRouteApproved` returns false
24. Test: re-approving a disabled route works
25. Test: `getRouteTerms` returns correct premium and payoff after approval
26. Test: `getRouteTerms` returns updated values after `updateRouteTerms`
27. Test: `getApprovedRoutes` returns only active routes, not disabled ones
28. Test: `getApprovedRoutes` returns empty array when no routes approved

**Test validation:**

29. Test: `approveRoute` reverts if premium is zero
30. Test: `approveRoute` reverts if payoff <= premium
31. Test: `approveRoute` reverts if route already active
32. Test: `updateRouteTerms` reverts if route does not exist
33. Test: `updateRouteTerms` reverts if new payoff <= new premium

**Gate:** All access control, lifecycle, and validation tests pass.

---

## Phase 4 — RiskVault

Depends on: MockUSDC. Deploy with a placeholder controller address for now.

**Write the contract:**

1. Declare all state — `totalManagedAssets`, `lockedCapital`, `totalShares`, `shares` mapping, `queueHead`, `withdrawalQueue` array, `claimableBalance` mapping, `hasPendingWithdrawal`, `queuedShares`, `priceHistory` array, `lastSnapshotTimestamp`, `controller`
2. Write constructor — accept `usdc` and `controller` addresses
3. Write `deposit(amount)` — pull USDC via transferFrom, calculate shares 1:1 on first deposit, proportional thereafter, increment `totalManagedAssets`
4. Write `_sharesToUsdc(shares)` internal — `shares × totalManagedAssets / totalShares`
5. Write `withdraw(shares)` — free capital path (burn shares, credit `claimableBalance`) and queue path (reserve shares, append request)
6. Write `collect()` — read `claimableBalance`, zero it, decrement `totalManagedAssets`, transfer USDC
7. Write `cancelWithdrawal(queueIndex)` — mark cancelled, release `queuedShares`, clear `hasPendingWithdrawal`
8. Write `processWithdrawalQueue()` — loop from `queueHead`, skip cancelled and fulfilled, credit `claimableBalance`, advance `queueHead`
9. Write `increaseLocked(amount)` — `onlyController`
10. Write `decreaseLocked(amount)` — `onlyController`, floor at zero
11. Write `sendPayout(flightPool, amount)` — `onlyController`, transfer USDC, decrement `totalManagedAssets`
12. Write `recordPremiumIncome(amount)` — `onlyController`, increment `totalManagedAssets`
13. Write `_maybeSnapshot()` internal — write to `priceHistory` at most once per day if `totalShares > 0`
14. Write `snapshot()` external — calls `_maybeSnapshot()`, callable by anyone
15. Write `setController(address)` — one-time setter, reverts if already set
16. Write view functions — `freeCapital`, `totalAssets`, `previewRedeem`, `previewRedeemFree`, `balanceSanityCheck`, `priceHistoryLength`, `getPriceSnapshot`

**Test deposit and shares:**

17. Test: first deposit issues shares 1:1
18. Test: second deposit issues proportional shares based on current price
19. Test: `totalManagedAssets` equals deposited amount after deposit with no other activity
20. Test: share price rises after `recordPremiumIncome`
21. Test: depositing zero reverts

**Test immediate withdrawal:**

22. Test: `withdraw` when free capital sufficient → shares burned, `claimableBalance` credited
23. Test: `collect` transfers exact credited amount
24. Test: `totalManagedAssets` decrements at `collect` time, not at `withdraw` time
25. Test: `collect` with zero balance reverts
26. Test: cannot call `withdraw` again while `hasPendingWithdrawal` is true

**Test queued withdrawal:**

27. Test: `withdraw` when free capital insufficient → request appended to queue
28. Test: shares reserved in `queuedShares`, cannot be double-queued
29. Test: `cancelWithdrawal` releases shares, clears `hasPendingWithdrawal`
30. Test: cancelled entry does not block queue processing
31. Test: `processWithdrawalQueue` starts from `queueHead`, not index 0
32. Test: `queueHead` advances past fulfilled entries
33. Test: `queueHead` advances past cancelled entries without crediting
34. Test: queue processes FIFO — first requester credited before second
35. Test: queue stops when free capital exhausted, remaining requests stay pending
36. Test: share price at fulfillment time is used, not request time

**Test capital locking:**

37. Test: `increaseLocked` reduces `freeCapital` by exact amount
38. Test: `decreaseLocked` increases `freeCapital` by exact amount
39. Test: `decreaseLocked` beyond current value floors at zero, does not revert
40. Test: withdrawal that would breach `lockedCapital` goes to queue even if total balance is sufficient
41. Test: `sendPayout` transfers USDC and decrements `totalManagedAssets`
42. Test: `sendPayout` with insufficient balance reverts

**Test totalManagedAssets integrity:**

43. Test: direct USDC transfer to vault does NOT change `totalManagedAssets`
44. Test: `balanceSanityCheck` returns the difference after a direct transfer
45. Test: `balanceSanityCheck` returns zero in all normal operation scenarios
46. Test: after full cycle (deposit + premium income + payout + collect), `totalManagedAssets` reconciles

**Test price snapshots:**

47. Test: `_maybeSnapshot` writes entry when interval has elapsed
48. Test: second call within same 24-hour window is a no-op
49. Test: `getPriceSnapshot` returns correct timestamp and price per share
50. Test: `priceHistoryLength` increments after each snapshot
51. Test: `snapshot()` callable externally, respects same interval guard

**Gate:** Every test group passes. `totalManagedAssets` stays in sync throughout all scenarios.

---

## Phase 5 — OracleAggregator

No dependencies at deploy time. Controller and oracle addresses set via one-time setters.

**Write the contract:**

1. Declare state — `authorizedController`, `authorizedOracle`, `flightStatuses` mapping `(bytes32 → FlightStatus)`, `registeredFlights` array, `flightIndex` mapping for swap-and-pop
2. Define `FlightStatus` enum — `Unknown, OnTime, Delayed, Cancelled`
3. Write `setController(address)` — callable once, `ControllerAlreadySet` guard
4. Write `setOracle(address)` — callable once, `OracleAlreadySet` guard
5. Write `onlyController` and `onlyOracle` modifiers
6. Write `_flightKey(flightId, date)` internal pure
7. Write `registerFlight(flightId, date)` — `onlyController`, push to array, record index, set status `Unknown`
8. Write `deregisterFlight(flightId, date)` — `onlyController`, swap-and-pop, update `flightIndex` for swapped entry
9. Write `updateFlightStatus(flightId, date, status)` — `onlyOracle`, require flight registered, require new status > current status (append-only)
10. Write `getFlightStatus(flightId, date)` — public view, return `Unknown` if not registered, never reverts
11. Write `getActiveFlights()` — returns current `registeredFlights` array

Note: `getActiveFlights()` is read by the CRE workflow at the start of each tick to know
which flights to check against AeroAPI.

**Test one-time setters:**

12. Test: `setController` succeeds on first call
13. Test: `setController` reverts on second call with `ControllerAlreadySet`
14. Test: `setOracle` succeeds on first call
15. Test: `setOracle` reverts on second call with `OracleAlreadySet`
16. Test: `registerFlight` reverts before `setController` is called
17. Test: `updateFlightStatus` reverts before `setOracle` is called

**Test registration:**

18. Test: `registerFlight` adds flight to active list, status initialised to `Unknown`
19. Test: `registerFlight` by non-controller reverts
20. Test: `deregisterFlight` removes flight from active list
21. Test: `deregisterFlight` by non-controller reverts
22. Test: `getFlightStatus` for unregistered flight returns `Unknown` without reverting
23. Test: `getActiveFlights` returns correct set after each register/deregister

**Test status transitions:**

24. Test: `Unknown → OnTime` accepted
25. Test: `Unknown → Delayed` accepted
26. Test: `Unknown → Cancelled` accepted
27. Test: `OnTime → Unknown` reverts
28. Test: `OnTime → Delayed` reverts
29. Test: `Delayed → Unknown` reverts
30. Test: `Delayed → OnTime` reverts
31. Test: `Cancelled → anything` reverts
32. Test: non-oracle cannot call `updateFlightStatus`
33. Test: update for unregistered flight reverts

**Test swap-and-pop deregistration:**

34. Test: register 5 flights, deregister index 2 — remaining 4 have no gaps
35. Test: register 3 flights, deregister the last — no out-of-bounds error
36. Test: register 1 flight, deregister it — array is empty
37. Test: `flightIndex` for swapped entry updated correctly after deregistration

**Gate:** All status lifecycle, access control, and swap-and-pop tests pass.

---

## Phase 6 — FlightPool

Depends on: MockUSDC, RiskVault address, RecoveryPool address. Use a mock Controller address.

**Write the contract:**

1. Declare state — `flightId`, `flightDate`, `premium`, `payoff`, `controller`, `riskVault`, `recoveryPool`, `usdc`, `isOpen`, `isSettled`, `outcome`, `claimExpiry`, `buyers` array, `hasBought` mapping, `claimed` mapping
2. Write constructor — set all values, validate addresses and premium < payoff, `isOpen = true`, `outcome = Pending`
3. Write `onlyController` modifier
4. Write `buyInsurance(address buyer)` — `onlyController`, require open + not settled + not already bought
5. Write `closePool()` — `onlyController`
6. Write `settleNotDelayed()` — `onlyController`, transfer all USDC to RiskVault, call `riskVault.recordPremiumIncome(amount)`
7. Write `settleDelayed(uint256 claimExpiryWindow)` — `onlyController`, require balance >= `payoff × buyerCount`, set `claimExpiry`, non-reverting per-buyer loop with `PayoutFailed` event on failure, return remainder to RiskVault
8. Write `claim()` — require settled delayed + has policy + not claimed + within expiry, transfer payoff
9. Write `sweepExpired()` — require past expiry, transfer remainder to RecoveryPool
10. Write view functions — `buyerCount`, `maxLiability`, `canClaim(address)`, `totalPremiumsHeld`

**Test purchase:**

11. Test: `buyInsurance` records buyer in array and `hasBought` mapping
12. Test: `buyerCount` increments correctly
13. Test: same address cannot buy twice
14. Test: non-controller cannot call `buyInsurance`
15. Test: cannot buy after `closePool`
16. Test: cannot buy after settlement

**Test not-delayed settlement:**

17. Test: `settleNotDelayed` transfers all USDC balance to RiskVault
18. Test: `riskVault.recordPremiumIncome` called with correct amount
19. Test: pool `isSettled = true`, `isOpen = false`, `outcome = NotDelayed`
20. Test: `settleNotDelayed` on already-settled pool reverts
21. Test: pool with zero buyers settles cleanly (transfers zero)

**Test delayed settlement:**

22. Test: `settleDelayed` requires pre-funded balance >= `payoff × buyerCount`
23. Test: `claimExpiry` set to `block.timestamp + claimExpiryWindow` correctly
24. Test: pool `isSettled = true`, `outcome = Delayed`
25. Test: each buyer can claim exactly `payoff` USDC
26. Test: remainder returned to RiskVault after payout loop (from pre-funded surplus, e.g. premiums)
27. Test: `PayoutFailed` event emitted when transfer to a non-receiving address fails
28. Test: failed transfer does not revert — other buyers still receive payoff
29. Test: `settleDelayed` on already-settled pool reverts

**Test claim flow:**

30. Test: buyer calls `claim()` before expiry — receives payoff
31. Test: `claimed[buyer] = true` after successful claim
32. Test: second `claim()` by same buyer reverts
33. Test: non-buyer `claim()` reverts
34. Test: `claim()` after expiry timestamp reverts
35. Test: `claim()` on not-delayed pool reverts
36. Test: `canClaim(address)` returns correct value for each state combination

**Test sweep:**

37. Test: `sweepExpired` before expiry reverts
38. Test: `sweepExpired` after expiry transfers remaining USDC to RecoveryPool
39. Test: RecoveryPool records correct source and amount
40. Test: `claim()` after sweep reverts
41. Test: if all buyers claimed, sweep transfers zero

**Gate:** Both settlement paths, claim flow, and expiry sweep all pass.

---

## Phase 7 — Controller

Depends on all contracts above. This phase builds the complete Controller — including the
`onlyCREWorkflow` guard — and verifies it end-to-end using a test EOA as the workflow address.

The `creWorkflowAddress` state variable and `onlyCREWorkflow` modifier are written in their
final form from the start. For Phase 7 testing, a test EOA is set as `creWorkflowAddress`.
In Phase 10, the test EOA is replaced with the real CRE workflow address — this is a
single `setCreWorkflow()` call with no contract changes required.

**Write the contract:**

1. Declare state — `owner`, `usdc`, `riskVault`, `oracleAggregator`, `governanceModule`, `recoveryPool`, `creWorkflowAddress`, `totalMaxLiability`, `minimumSolvencyRatio`, `minimumLeadTime`, `claimExpiryWindow`, `flightRecords` mapping, `activeFlightKeys` array, `totalPoliciesSold`, `totalPremiumsCollected`, `totalPayoutsDistributed`
2. Write `FlightRecord` struct — `poolAddress`, `flightId` (cached), `flightDate` (cached), `active`
3. Write `onlyOwner` and `onlyCREWorkflow` modifiers
4. Write `_flightKey(flightId, date)` internal pure
5. Write `buyInsurance(flightId, origin, destination, date)` — route check → terms read → lead time check → lazy pool deploy + register if needed → solvency check → transferFrom → increaseLocked → pool.buyInsurance → counter increments
6. Write `_deployPool(flightId, date, premium, payoff)` internal — deploy FlightPool, populate FlightRecord with cached `flightId` and `flightDate`, push to `activeFlightKeys`
7. Write `_settleNotDelayed(key, pool)` internal — `pool.closePool` → `pool.settleNotDelayed` → `decreaseLocked` → `processWithdrawalQueue` → `_clearFlight`
8. Write `_settleDelayed(key, pool)` internal — `sendPayout` FIRST → `decreaseLocked` → `pool.closePool` → `pool.settleDelayed(claimExpiryWindow)` → `processWithdrawalQueue` → `_clearFlight` → `totalPayoutsDistributed` increment
9. Write `_clearFlight(key, index)` internal — set `active = false` → `deregisterFlight` → swap-and-pop `activeFlightKeys`
10. Write `_checkAndSettle()` internal — loop over `activeFlightKeys`, read status from OracleAggregator, branch Unknown (skip) / OnTime / Delayed / Cancelled
11. Write `checkAndSettle()` external — `onlyCREWorkflow`, calls `_checkAndSettle()` then `riskVault.snapshot()`
12. Write `setCreWorkflow(address)` — `onlyOwner`, validates non-zero address
13. Write `isSolventForNewPurchase(flightId, date)` view
14. Write `getActivePools()`, `getPoolAddress()`, `activeFlightCount()` views
15. Write owner setters — `setMinimumSolvencyRatio`, `setMinimumLeadTime`, `setClaimExpiryWindow`, `setGovernanceModule`

Note: `_checkAndSettle()` does NOT request oracle data for `Unknown` flights — it simply
skips them. The CRE workflow is responsible for writing all final statuses to OracleAggregator
before calling `checkAndSettle()`. This is the correct design from day one.

**Test the CRE workflow guard:**

16. Test: `checkAndSettle()` from an address that is not `creWorkflowAddress` reverts with `not CRE workflow`
17. Test: `checkAndSettle()` from `creWorkflowAddress` succeeds
18. Test: `setCreWorkflow(address(0))` reverts
19. Test: `setCreWorkflow` from non-owner reverts
20. Test: after `setCreWorkflow` with a new address, the old address is rejected and the new one is accepted

**Test purchase flow:**

21. Test: reverts if route not approved in GovernanceModule
22. Test: reverts if route disabled
23. Test: reverts if departure is within `minimumLeadTime`
24. Test: reverts if solvency check fails
25. Test: first purchase for route+date deploys new FlightPool
26. Test: second purchase for same route+date reuses existing pool
27. Test: FlightPool deployment reads terms from GovernanceModule at deploy time
28. Test: `oracleAggregator.registerFlight` called only on first purchase for a route+date
29. Test: `usdc.transferFrom` moves premium from traveler to FlightPool
30. Test: `riskVault.increaseLocked` called with correct payoff amount
31. Test: `totalPoliciesSold` increments by 1
32. Test: `totalPremiumsCollected` increments by premium amount
33. Test: `totalMaxLiability` increases by payoff amount
34. Test: FlightRecord caches correct `flightId` and `flightDate`

**Test settlement ordering:**

35. Test: `_settleDelayed` calls `sendPayout` before `decreaseLocked`
36. Test: after not-delayed settlement, premiums in RiskVault, `lockedCapital` released
37. Test: after delayed settlement, pool is claimable, `lockedCapital` released
38. Test: `processWithdrawalQueue` called after both settlement types
39. Test: `totalPayoutsDistributed` increments on delayed settlement only
40. Test: `totalMaxLiability` decreases by `pool.maxLiability()` after settlement

**Test flight registry:**

41. Test: `activeFlightCount` correct before and after settlement
42. Test: settled pool removed from `activeFlightKeys` via swap-and-pop
43. Test: `flightRecords[key].active = false` after settlement
44. Test: `deregisterFlight` called on OracleAggregator after settlement
45. Test: `getActivePools` returns only unsettled pools
46. Test: settlement loop reads from FlightRecord cache, not external pool calls

**Test solvency invariant:**

47. Test: `isSolventForNewPurchase` returns false with empty vault
48. Test: `isSolventForNewPurchase` returns true after sufficient deposit
49. Test: `isSolventForNewPurchase` returns false after vault reaches capacity
50. Test: `minimumSolvencyRatio` of 150 requires 1.5× coverage — verify check math

**End-to-end — not delayed:**

51. Underwriter deposits USDC
52. Traveler approves and buys insurance
53. Simulate CRE workflow: `vm.prank(creWorkflowAddress)` → set OracleAggregator status to OnTime
54. Simulate CRE workflow: `vm.prank(creWorkflowAddress)` → call `checkAndSettle()`
55. Verify premiums forwarded to RiskVault, share price increased
56. Underwriter withdraws → `claimableBalance` credited → calls `collect()` → receives USDC

**End-to-end — delayed:**

57. Underwriter deposits USDC
58. Traveler approves and buys insurance
59. Simulate CRE workflow: `vm.prank(creWorkflowAddress)` → set OracleAggregator status to Delayed
60. Simulate CRE workflow: `vm.prank(creWorkflowAddress)` → call `checkAndSettle()`
61. Verify pool is claimable, `claimExpiry` set
62. Traveler calls `claim()` — receives payoff
63. Advance time past `claimExpiry`
64. Call `sweepExpired()` — remainder goes to RecoveryPool

**Gate:** Both full lifecycle tests pass. All counters reconcile. Solvency invariant holds
at every step. CRE workflow guard rejects all unauthorised callers.

---

## Phase 8 — Integration Tests

No new contracts. Multi-flight scenarios under realistic conditions.

1. Deploy all contracts fresh for each scenario
2. Test: 3 flights active simultaneously, outcomes OnTime / Delayed / Cancelled — vault balance and `totalManagedAssets` reconcile after all three settle
3. Test: 5 underwriters deposit, queue fills — drains FIFO correctly as capital releases across settlements
4. Test: route terms updated mid-lifecycle — existing pool uses old terms, next purchase deploys new pool with new terms
5. Test: route disabled after one pool is active — existing pool settles normally, new purchase reverts
6. Test: `minimumSolvencyRatio` at 150 — verify purchases blocked correctly when near capacity
7. Test: full claim expiry cycle — fund delayed pool, advance time, `claim()` reverts, `sweepExpired()` works, RecoveryPool correct
8. Test: `queueHead` never regresses — run 20 settlement cycles, verify it only moves forward
9. Test: `totalManagedAssets` stress test — 10 full purchase + settlement cycles, `balanceSanityCheck` returns zero throughout
10. Test: `vm.prank(creWorkflowAddress)` used throughout for all `updateFlightStatus` and `checkAndSettle` calls

**Gate:** All scenarios pass. No counter drift. No stuck pools.

---

## Phase 9 — Mock Flight API Server

Build a local mock server mirroring the AeroAPI response shape before writing the
CRE workflow's HTTP logic.

1. Set up Node.js / Express server with endpoint `GET /flights/:ident?start=...&end=...`
2. Define response shape mirroring AeroAPI `/flights/{ident}`:
   ```json
   {
     "flights": [{
       "ident": "AA123",
       "scheduled_in": "2025-06-01T11:00:00Z",
       "actual_in":    "2025-06-01T11:52:00Z",
       "status":       "Landed"
     }]
   }
   ```
3. Add test control endpoint `POST /flights/:ident/set` accepting `{ status, delayMinutes }` to configure per-flight responses
4. Implement status derivation in mock — `Landed` within 45 min → OnTime, over 45 min → Delayed, `Cancelled` → Cancelled, `Scheduled` / `En Route` → Unknown
5. Test: configure OnTime → correct shape returned
6. Test: configure Delayed (60 min) → correct shape returned
7. Test: configure Cancelled → correct shape returned
8. Test: unknown ident → empty `flights` array
9. Test: simulate API error (5xx) → error body returned
10. Test: in-flight / scheduled → `actual_in` is null

**Gate:** Mock server covers all status cases. Derivation logic confirmed correct.

---

## Phase 10 — CRE Workflow (Mock API)

Write the CRE workflow pointed at the local mock API server. There is no
`FunctionsConsumer` contract to write — the entire off-chain integration lives in the
TypeScript workflow file. No changes to the Controller are needed at this phase; the
`onlyCREWorkflow` guard is already in place from Phase 7. The only step on the Solidity
side is calling `setCreWorkflow()` with the deployed workflow address to replace the
Phase 7 test EOA.

**Install CRE tooling:**

1. Create account at `cre.chain.link`
2. Install CRE CLI: follow `https://docs.chain.link/cre/getting-started/cli-installation`
3. Log in: `cre auth login`
4. Initialise workflow project: `cre workflow init flight-insurance-settlement`

**Write the workflow source (`src/workflow.ts`):**

5. Import `cron`, `evm`, `http` from `@chainlink/cre-sdk`
6. Register handler: `cre.Handler(cron.Trigger({ schedule: "0 */10 * * * *" }), onCronTick)`
7. In `onCronTick`: create `evmClient` and `httpClient` from runtime
8. Read active flights: `evmClient.read({ contract: ORACLE_AGGREGATOR_ADDRESS, method: "getActiveFlights", args: [] })`
9. For each flight: read current status via `evmClient.read` — skip if already final
10. For `Unknown` flights: call mock API via `httpClient.get({ url: "http://localhost:3000/flights/..." })`
11. Apply `deriveStatus()` — OnTime, Delayed, Cancelled, or Unknown (skip write)
12. For each final status: `evmClient.write({ contract: ORACLE_AGGREGATOR_ADDRESS, method: "updateFlightStatus", args: [...] })`
13. After all status writes: `evmClient.write({ contract: CONTROLLER_ADDRESS, method: "checkAndSettle", args: [] })`
14. Finally: `evmClient.write({ contract: RISK_VAULT_ADDRESS, method: "snapshot", args: [] })`
15. Wrap every HTTP fetch in try/catch — a failed fetch silently skips that flight, no revert

**Simulate against mock API:**

16. Set `ORACLE_AGGREGATOR_ADDRESS`, `CONTROLLER_ADDRESS`, `RISK_VAULT_ADDRESS` in workflow config pointing to a local Anvil fork with all contracts deployed
17. In the Anvil setup, call `controller.setCreWorkflow(simulatedWorkflowAddress)` so the guard passes during simulation
18. Run `cre workflow simulate` — confirm it reads active flights from Aggregator, calls mock API, writes status, calls Controller
19. Test: configure mock for OnTime flight → simulation writes `OnTime` to Aggregator, calls `checkAndSettle`, pool settles
20. Test: configure mock for Delayed → simulation writes `Delayed`, pool settles as delayed
21. Test: configure mock for Cancelled → simulation writes `Cancelled`, pool settles as delayed
22. Test: configure mock for En Route → simulation writes nothing, pool stays active
23. Test: mock API returns 500 error → simulation catches exception, no write, no revert, pool stays active
24. Test: no registered flights → `getActiveFlights` returns empty array, workflow completes without error
25. Test: `checkAndSettle` reverts in simulation if `creWorkflowAddress` is not set correctly → error is visible in simulation output

**Gate:** Simulation works for all four flight outcomes and all error paths.

---

## Phase 11 — Switch Workflow to AeroAPI

No contract changes. Only the workflow's HTTP target and secret change.

1. Obtain AeroAPI credentials at `flightaware.com/commercial/aeroapi`
2. Test the endpoint manually via curl:
   ```bash
   curl -H "x-apikey: YOUR_KEY" \
     "https://aeroapi.flightaware.com/aeroapi/flights/AA123?start=2025-06-01T00:00:00Z&end=2025-06-01T23:59:59Z"
   ```
3. Examine real response — confirm `scheduled_in`, `actual_in`, `status` field names match mock
4. Update workflow HTTP URL from mock to AeroAPI endpoint
5. Add secret: `cre secrets set AEROAPI_KEY --value "your-api-key"`
6. Update workflow to reference `secrets.AEROAPI_KEY` in request headers — remove hardcoded mock URL
7. Run `cre workflow simulate` with real AeroAPI credentials
8. Test: known on-time historical IDENT + date → simulation writes `OnTime`
9. Test: known delayed historical IDENT + date → simulation writes `Delayed`
10. Test: known cancelled historical IDENT + date → simulation writes `Cancelled`
11. Test: future flight not yet landed → simulation writes nothing (Unknown, no error)
12. Test: invalid IDENT → empty `flights` array → simulation writes nothing
13. Calculate max requests/day at 10-minute ticks for expected active flight count — confirm within AeroAPI tier limits
14. Build: `cre workflow build`

**Gate:** Real AeroAPI responses parse correctly for all four outcomes. Secrets confirmed. Rate limits acceptable.

---

## Phase 12 — Testnet Deployment

**Deploy Solidity contracts:**

1. Deploy `GovernanceModule` — no dependencies
2. Deploy `RecoveryPool` — no dependencies
3. Deploy `OracleAggregator` — no dependencies, do NOT call setters yet
4. Deploy `RiskVault` — pass USDC address and zero address as Controller placeholder
5. Deploy `Controller` — pass all contract addresses and initial config values
   (`minimumSolvencyRatio`, `minimumLeadTime`, `claimExpiryWindow`)
   Note: `creWorkflowAddress` is not required at construction — set via `setCreWorkflow()` after the workflow is deployed

**Wire Solidity contracts:**

6. Call `OracleAggregator.setController(controller)` — one-time, locks forever
7. Call `RiskVault.setController(controller)` — one-time, locks forever

**Deploy and activate the CRE workflow:**

8. Update workflow config with testnet contract addresses (`ORACLE_AGGREGATOR_ADDRESS`, `CONTROLLER_ADDRESS`, `RISK_VAULT_ADDRESS`)
9. Update RPC URL in workflow config to testnet RPC endpoint
10. Run `cre workflow simulate` one final time against testnet contracts
11. Deploy workflow: `cre workflow deploy ./dist/workflow.wasm`
12. Activate workflow: `cre workflow activate <workflow-id>`
13. Read the workflow's forwarder/signer address: `cre workflow info <workflow-id>`

**Wire CRE workflow address into Solidity contracts:**

14. Call `OracleAggregator.setOracle(workflowAddress)` — one-time, locks forever
15. Call `Controller.setCreWorkflow(workflowAddress)` — owner only

**Approve routes and fund vault:**

16. Call `GovernanceModule.approveRoute()` for at least two testnet routes
17. Mint testnet USDC to underwriter address
18. Approve RiskVault for USDC spend
19. Call `RiskVault.deposit()` as underwriter

**Verify system health:**

20. Confirm `aggregator.authorizedOracle()` equals CRE workflow address
21. Confirm `controller.creWorkflowAddress()` equals CRE workflow address
22. Call `isSolventForNewPurchase()` — confirm true after deposit
23. Call `getApprovedRoutes()` — confirm routes visible
24. Buy insurance as traveler — confirm pool deployed, premium transferred
25. Check `activeFlightCount()` — should be 1
26. Check `OracleAggregator.getFlightStatus()` — should be `Unknown`
27. Wait for first workflow tick — check `cre workflow logs <workflow-id>` for execution
28. Confirm `StatusUpdated` event emitted on OracleAggregator (if flight has a final status)
29. Wait for next tick — confirm `checkAndSettle()` called and settlement executes
30. If OnTime: confirm premiums in RiskVault, share price increased, `activeFlightCount` decremented
31. If Delayed: confirm pool claimable, call `claim()` as traveler, confirm payoff received
32. Confirm `totalPoliciesSold`, `totalPremiumsCollected`, `totalPayoutsDistributed` all correct

**Gate:** Full end-to-end cycle completes on testnet. CRE workflow verified live.

---

## Phase 13 — Frontend

Build and validate the frontend against testnet contracts before mainnet.

**Setup and wallet connection:**

1. Set up project with wallet connection library (wagmi / viem / ethers.js)
2. Add ABIs for all six contracts (GovernanceModule, RiskVault, FlightPool, Controller, OracleAggregator, RecoveryPool)
3. Add testnet contract addresses to environment config
4. Implement wallet connect and disconnect
5. Implement chain detection — prompt user to switch if on wrong network
6. Read and display connected wallet address and USDC balance
7. Build USDC approval helper — check current allowance, prompt `approve()` if insufficient

**Underwriter — deposit:**

8. Read and display current share price — `totalManagedAssets / totalShares`
9. Read and display vault TVL — `totalManagedAssets()`
10. Read and display locked vs free capital — `lockedCapital()`, `freeCapital()`
11. Read and display connected wallet's share balance — `shares[address]`
12. Build deposit amount input — validate > 0, show estimated shares to be received
13. On submit — check allowance, prompt approval if needed, call `RiskVault.deposit(amount)`
14. Show pending transaction state
15. Refresh share balance and TVL after confirmation

**Underwriter — withdrawal:**

16. Build share amount input — validate <= owned shares
17. Show `previewRedeem(shares)` — total redemption value
18. Show `previewRedeemFree(shares)` alongside — label difference as locked capital
19. On submit — call `RiskVault.withdraw(shares)`
20. Handle immediate path: show success, refresh `claimableBalance`
21. Handle queue path: show queue position from `WithdrawQueued` event, store `queueIndex`
22. Show cancel button if pending withdrawal exists — call `cancelWithdrawal(queueIndex)`
23. Read and display `claimableBalance(address)` — show as collectible balance
24. Show collect button when `claimableBalance > 0` — call `RiskVault.collect()`
25. Refresh balances after collect confirms

**Underwriter — APY:**

26. Read `priceHistoryLength()` to get snapshot count
27. Binary search for snapshot nearest to 7 days ago using `getPriceSnapshot(index)`
28. Compute 7-day APY: `((currentPrice / price7dAgo) - 1) × (365 / 7) × 100`
29. Repeat binary search for snapshot nearest to 30 days ago
30. Compute 30-day APY with same formula
31. Display both figures with clear label — realised historical yield, not guaranteed

**Route browsing:**

32. Read `getApprovedRoutes()` — display all active routes with premium and payoff
33. Build date picker for each route — traveler selects departure date
34. On date select — call `getPoolAddress(flightId, date)` — zero address means pool not yet deployed
35. Call `isSolventForNewPurchase(flightId, date)` — show capacity warning if false
36. If pool exists — read and display `buyerCount()` and pool address
37. Display premium cost and payoff prominently before purchase action

**Traveler — buy insurance:**

38. Show selected route, date, premium, payoff in confirmation summary
39. Check `hasBought[address]` on pool if it exists — show "already purchased" message
40. On confirm — check USDC allowance for Controller, prompt approval if needed
41. Call `Controller.buyInsurance(flightId, origin, destination, date)`
42. Show pending transaction state
43. On success — show policy summary with flight, date, payoff amount

**Traveler — claim:**

44. Query all FlightPools where connected address has `hasBought = true`
45. Filter for pools where `outcome = Delayed` and `claimed[address] = false`
46. Display claimable pools list with payoff amount and `claimExpiry` countdown
47. Show claim button for each eligible pool — call `FlightPool.claim()`
48. Show pending state, confirm payoff received on success
49. Mark as claimed after transaction confirms
50. After expiry, replace claim button with "claim window closed" message

**Flight status display:**

51. Read `OracleAggregator.getFlightStatus(flightId, date)` for each active pool
52. Map enum to labels — Unknown / On Time / Delayed / Cancelled
53. Show last status update timestamp from `StatusUpdated` event on OracleAggregator
54. For Unknown flights, display "awaiting oracle data" — next check is driven by CRE workflow;
    use CRE platform logs for operational visibility (no on-chain timestamp to query)
55. Show settlement status — Pending / Settled — from `isSettled` on FlightPool

**Protocol dashboard:**

56. Read and display `totalPoliciesSold()`
57. Read and display `totalPremiumsCollected()` — format as USDC
58. Read and display `totalPayoutsDistributed()` — format as USDC
59. Read and display `activeFlightCount()`
60. Build active flights table from `getActivePools()` — columns: flightId, date, buyers, status
61. Display workflow health note: "Settlement runs every 10 minutes via Chainlink CRE"
    (operational monitoring is via `cre workflow logs`, not an on-chain timestamp)

**Error and edge case handling:**

62. Wallet not connected — show connect prompt on any action button
63. Insufficient USDC balance — show message before approval step
64. `isSolventForNewPurchase = false` — disable buy button, show capacity message
65. Expired claim window — disable claim button, show "sweep available" if unclaimed balance remains
66. Transaction reverted — extract and display revert reason where possible
67. RPC error — retry logic with user-visible error state
68. Pool has zero buyers — confirm UI handles this gracefully

**Final frontend validation on testnet:**

69. Complete full underwriter deposit → collect cycle through the UI end to end
70. Complete full traveler buy → claim cycle through the UI end to end
71. Verify 7-day APY calculation matches manual calculation from snapshot data
72. Verify all oracle status updates appear in UI within two CRE workflow ticks
73. Test on mobile viewport
74. Test with at least two wallet types (e.g. MetaMask and WalletConnect)

**Gate:** All flows complete on testnet without errors. Both user cycles verified through the UI.

---

## Phase 14 — Mainnet

1. Confirm all access control modifiers active — none commented out for testing
2. Confirm AeroAPI production tier subscription active and within rate limits for expected volume
3. Re-run `cre workflow simulate` against mainnet contract addresses before deploy
4. Deploy all Solidity contracts in the exact order from Phase 12 steps 1–5
5. Wire Solidity contracts: `setController` on Aggregator and Vault (Phase 12 steps 6–7)
6. Update CRE workflow config with mainnet RPC and mainnet contract addresses
7. Build workflow: `cre workflow build`
8. Deploy workflow to mainnet DON: `cre workflow deploy ./dist/workflow.wasm`
9. Activate: `cre workflow activate <workflow-id>`
10. Read mainnet workflow forwarder address: `cre workflow info <workflow-id>`
11. Wire CRE address into Solidity contracts: `setOracle` and `setCreWorkflow` (Phase 12 steps 14–15)
12. Update frontend environment config to mainnet contract addresses
13. Approve initial production routes via GovernanceModule
14. Set `minimumSolvencyRatio`, `minimumLeadTime`, `claimExpiryWindow` to production values
15. Confirm first CRE workflow tick executes on mainnet via `cre workflow logs`
16. Monitor `balanceSanityCheck()` on RiskVault — alert if non-zero
17. Index `StatusUpdated` events on OracleAggregator — alert if a registered flight shows no update > 24 hours after departure date
18. Index `PayoutFailed` events on FlightPool — alert on any occurrence
19. Verify first live end-to-end cycle on mainnet before publicising
20. Publish disclosure to participants that CRE workflow deployment is in Early Access

---

## Summary

| Phase | Deliverable | Gate |
|---|---|---|
| 1 | MockUSDC | Mint + transfer + approve working |
| 2 | RecoveryPool | Deposit + withdraw + access control |
| 3 | GovernanceModule | Route lifecycle + admin management |
| 4 | RiskVault | Capital accounting + queue + snapshots |
| 5 | OracleAggregator | Status lifecycle + access control + `getActiveFlights` |
| 6 | FlightPool | Settlement + claim + expiry |
| 7 | Controller | Full end-to-end both outcomes, `onlyCREWorkflow` guard verified with test EOA |
| 8 | Integration tests | Multi-flight + queue + edge cases |
| 9 | Mock API server | Status derivation logic validated |
| 10 | CRE workflow (mock API) | Simulation works all outcomes; `setCreWorkflow` wired |
| 11 | Workflow → AeroAPI | Real API responses parse correctly for all outcomes |
| 12 | Testnet deployment | Live end-to-end cycle complete, CRE workflow active and writing on-chain |
| 13 | Frontend | All flows verified on testnet through UI |
| 14 | Mainnet | Production, Early Access disclosure made |