# Flight Delay Insurance Protocol — Development Flow

Each phase has a clear gate. Do not move on until the current phase's validation passes.
Contracts are introduced in dependency order so nothing is tested against a stub that
will later change.

---

## Phase 1 — MockUSDC

Every contract in the system touches USDC. Write this first so all subsequent testing
uses a realistic token rather than a bare ERC-20 stub.

1. Implement as a standard mintable ERC-20 with 6 decimals
2. Add `mint(address, amount)` callable by owner for seeding test wallets
3. Verify `transfer`, `transferFrom`, `approve`, `balanceOf` all behave correctly
4. Confirm 6-decimal arithmetic works as expected (1 USDC = 1_000_000)
5. Confirm `approve` + `transferFrom` pattern works correctly — this is the path the Controller uses

**Gate:** Can mint to arbitrary addresses, transfer between them, and approve a spender.

---

## Phase 2 — RecoveryPool

The simplest contract in the system. Custody and accounting only.

1. Receives USDC from expired FlightPools
2. Records `(sourcePool → amount)` for auditability
3. Owner can call `withdraw(amount, recipient)` for manual resolution
4. Test non-owner `withdraw` reverts
5. Test multiple deposits from different pools are tracked separately
6. Test owner can withdraw full accumulated balance

**Gate:** Deposit, tracking, and owner withdraw all work. Contract is complete — it will
not change again.

---

## Phase 3 — GovernanceModule

The route authority. No dependency on any other protocol contract.

**Write the contract in this order:**

1. Define `Route` struct — `(flightId, origin, destination, premium, payoff, active)`
2. Add approved routes mapping and admin whitelist mapping
3. Implement `approveRoute(flightId, origin, destination, premium, payoff)` — owner or admin only
4. Add validation to `approveRoute` — premium > 0, payoff > premium, route not already active
5. Implement `disableRoute(flightId, origin, destination)` — owner or admin only
6. Implement `updateRouteTerms(flightId, origin, destination, newPremium, newPayoff)` — owner or admin only, does not affect existing pools
7. Implement `addAdmin(address)` / `removeAdmin(address)` — owner only
8. Implement `isRouteApproved(flightId, origin, destination)` view
9. Implement `getRouteTerms(flightId, origin, destination)` view
10. Implement `getApprovedRoutes()` view — returns only active routes

**Tests — access control:**

11. Non-owner, non-admin cannot call `approveRoute`, `disableRoute`, `updateRouteTerms`
12. Non-owner cannot call `addAdmin` or `removeAdmin`
13. Admin can call route management functions
14. Admin cannot call `addAdmin` or `removeAdmin`
15. Revoked admin loses access immediately on next call

**Tests — route lifecycle:**

16. Approve a route → `isRouteApproved` returns true
17. Disable a route → `isRouteApproved` returns false
18. Re-approve a disabled route succeeds
19. `getRouteTerms` returns correct premium and payoff after approval
20. `getRouteTerms` returns updated values after `updateRouteTerms`
21. `getApprovedRoutes` returns only active routes, not disabled ones
22. `getApprovedRoutes` returns all active routes when multiple exist

**Tests — validation:**

23. `approveRoute` reverts if premium is zero
24. `approveRoute` reverts if payoff <= premium
25. `approveRoute` reverts if route already active
26. `updateRouteTerms` reverts if route does not exist
27. `disableRoute` reverts if route does not exist

**Gate:** All access control, route lifecycle, and validation tests pass.

---

## Phase 4 — RiskVault

Depends on: MockUSDC. Deploy with a placeholder controller address for now.

**Write the contract in this order:**

1. Define state variables — `totalManagedAssets`, `lockedCapital`, `totalShares`, `shares` mapping
2. Add withdrawal queue variables — `withdrawalQueue` array, `queueHead`, `claimableBalance` mapping, `hasPendingWithdrawal`, `queuedShares`
3. Add snapshot variables — `priceHistory` array, `lastSnapshotTimestamp`
4. Implement constructor — set USDC address, controller placeholder
5. Implement `deposit(amount)` — pull USDC, calculate shares (1:1 first, proportional thereafter), increment `totalManagedAssets`
6. Implement `_sharesToUsdc(shares)` internal — uses `totalManagedAssets`, not `balanceOf`
7. Implement immediate withdrawal path in `withdraw(shares)` — burn shares, credit `claimableBalance`
8. Implement queue path in `withdraw(shares)` — append to queue, reserve shares
9. Implement `collect()` — transfer credited USDC, decrement `totalManagedAssets`
10. Implement `cancelWithdrawal(queueIndex)`
11. Implement `processWithdrawalQueue()` — starts from `queueHead`, credits `claimableBalance`, advances `queueHead` past fulfilled and cancelled entries
12. Implement `increaseLocked(amount)` / `decreaseLocked(amount)` — `onlyController`
13. Implement `sendPayout(flightPool, amount)` — `onlyController`, decrements `totalManagedAssets`
14. Implement `recordPremiumIncome(amount)` — `onlyController`, increments `totalManagedAssets` when premiums arrive from settled pool
15. Implement `_maybeSnapshot()` internal — writes to `priceHistory` at most once per day
16. Implement `snapshot()` external — callable by keeper, calls `_maybeSnapshot()`
17. Implement `freeCapital()` view — `totalManagedAssets - lockedCapital`
18. Implement `totalAssets()` view — returns `totalManagedAssets`
19. Implement `previewRedeem(shares)` view — uses `totalManagedAssets`
20. Implement `previewRedeemFree(shares)` view — uses free capital only
21. Implement `balanceSanityCheck()` view — returns `balanceOf - totalManagedAssets`
22. Implement `priceHistoryLength()` and `getPriceSnapshot(index)` views

**Tests — deposit and shares:**

23. First deposit issues shares 1:1
24. Second deposit issues proportional shares based on current price
25. Share price rises correctly as `totalManagedAssets` grows via `recordPremiumIncome`
26. `totalManagedAssets` equals sum of all deposits with no other activity

**Tests — immediate withdrawal:**

27. `withdraw` when free capital sufficient → `claimableBalance` credited, shares burned
28. `collect` transfers exact credited amount and decrements `totalManagedAssets`
29. `collect` reverts if `claimableBalance` is zero

**Tests — withdrawal queue:**

30. `withdraw` when free capital insufficient → request queued, shares reserved
31. Second `withdraw` while pending reverts
32. `cancelWithdrawal` releases reserved shares and clears `hasPendingWithdrawal`
33. `processWithdrawalQueue` credits FIFO starting from `queueHead`, not from index 0
34. `queueHead` advances past fulfilled entries
35. `queueHead` advances past cancelled entries without crediting them
36. Share price used is price at fulfillment time, not request time
37. Queue stops when free capital exhausted — remaining requests stay pending
38. Subsequent `processWithdrawalQueue` call resumes from `queueHead`, not from 0

**Tests — capital locking:**

39. `increaseLocked` → `freeCapital` decreases
40. `decreaseLocked` → `freeCapital` increases
41. Withdrawal that would breach `lockedCapital` goes to queue even if total balance is sufficient
42. `sendPayout` decrements `totalManagedAssets` and actual USDC balance together

**Tests — totalManagedAssets integrity:**

43. Direct USDC transfer to vault does NOT change `totalManagedAssets` or share price
44. `balanceSanityCheck` returns exact difference after a direct transfer
45. After deposit + premium income + payout + collect, `totalManagedAssets` reconciles to zero drift

**Tests — price snapshots:**

46. `_maybeSnapshot` writes a snapshot when interval has elapsed
47. Second call within the same day is a no-op
48. `getPriceSnapshot` returns correct timestamp and price per share
49. `snapshot()` callable externally with same no-op behaviour within interval

**Gate:** All deposit, withdraw, queue, collect, locking, and snapshot paths pass.
`totalManagedAssets` stays in sync throughout every scenario.

---

## Phase 5 — OracleAggregator

No dependencies on other protocol contracts at deploy time. Controller and oracle
addresses are set via one-time setters after deployment.

**Write the contract in this order:**

1. Define state variables — `authorizedController`, `authorizedOracle`, `flightStatuses` mapping, `registeredFlights` array
2. Implement `setController(address)` — callable once, reverts on second call with `ControllerAlreadySet`
3. Implement `setOracle(address)` — callable once, reverts on second call with `OracleAlreadySet`
4. Implement `registerFlight(flightId, date)` — `onlyController`, add to tracking list, initialise status to `Unknown`
5. Implement `deregisterFlight(flightId, date)` — `onlyController`, remove via swap-and-pop
6. Implement `updateFlightStatus(flightId, date, status)` — `onlyOracle`, append-only enforcement, only for registered flights
7. Implement `getFlightStatus(flightId, date)` — public view, returns `Unknown` for unregistered flights, never reverts
8. Implement `getActiveFlights()` — returns current tracking list

**Tests — one-time setters:**

9. `setController` sets address correctly
10. `setController` reverts on second call regardless of caller
11. `setOracle` sets address correctly
12. `setOracle` reverts on second call
13. `onlyController` functions revert for any caller before `setController` is called
14. `onlyOracle` functions revert for any caller before `setOracle` is called

**Tests — registration:**

15. `registerFlight` adds to active list and initialises status to `Unknown`
16. `registerFlight` by non-controller reverts
17. `deregisterFlight` removes correct entry from active list
18. `deregisterFlight` by non-controller reverts
19. `getFlightStatus` for unregistered flight returns `Unknown` without reverting

**Tests — status updates:**

20. `updateFlightStatus` by non-oracle reverts
21. `updateFlightStatus` for unregistered flight reverts
22. `Unknown → OnTime` transition works
23. `Unknown → Delayed` transition works
24. `Unknown → Cancelled` transition works
25. `OnTime → Unknown` reverts
26. `Delayed → OnTime` reverts
27. `Cancelled → Delayed` reverts

**Tests — active list integrity:**

28. Register 5 flights, deregister the 3rd — list has 4 remaining with no gaps
29. Deregister the last entry in list — no out-of-bounds error
30. Deregister the only entry — list is empty, no error
31. `getActiveFlights` returns exactly the registered-but-not-deregistered set

**Gate:** All status lifecycle, access control, and swap-and-pop tests pass.

---

## Phase 6 — FlightPool

Depends on: MockUSDC, RiskVault address, RecoveryPool address. Use a mock Controller
address for testing.

**Write the contract in this order:**

1. Define state variables — `flightId`, `flightDate`, `premium`, `payoff`, `controller`, `riskVault`, `recoveryPool`, `usdc`, `claimExpiryWindow`
2. Add settlement state — `isOpen`, `isSettled`, `outcome` enum, `claimExpiry`
3. Add buyer state — `buyers` array, `hasBought` mapping, `claimed` mapping
4. Implement constructor — set all immutables, `isOpen = true`, `outcome = Pending`
5. Implement `buyInsurance(buyer)` — `onlyController`, require open and not settled and not already bought
6. Implement `closePool()` — `onlyController`
7. Implement `settleNotDelayed()` — `onlyController`, forward all premiums to RiskVault, call `riskVault.recordPremiumIncome(amount)`
8. Implement `settleDelayed()` — `onlyController`, require balance >= `payoff × buyerCount`, set `claimExpiry`, non-reverting transfer loop with `PayoutFailed` event, return remainder to RiskVault
9. Implement `claim()` — public, require settled delayed, has policy, not already claimed, within expiry
10. Implement `sweepExpired()` — public, require past expiry, transfer remainder to RecoveryPool
11. Implement views — `buyerCount`, `maxLiability`, `canClaim(address)`, `totalPremiumsHeld`

**Tests — purchase:**

12. `buyInsurance` records buyer and increments `buyerCount`
13. Same address cannot buy twice
14. Non-controller cannot call `buyInsurance`
15. Cannot buy after `closePool`
16. Cannot buy after settlement

**Tests — not delayed settlement:**

17. `settleNotDelayed` transfers all premiums to RiskVault
18. `riskVault.recordPremiumIncome` called with correct amount
19. Pool `isSettled` = true, `isOpen` = false, `outcome` = NotDelayed
20. Cannot call `settleNotDelayed` twice

**Tests — delayed settlement:**

21. Pre-fund pool with `payoff × buyerCount` USDC (simulating `sendPayout`)
22. `settleDelayed` sets `claimExpiry = block.timestamp + claimExpiryWindow`
23. Pool `isSettled` = true, `outcome` = Delayed after settlement
24. Remainder returned to RiskVault after payout loop
25. `PayoutFailed` emitted when transfer to bad address fails
26. Bad address failure does not block payouts to other buyers
27. `settleDelayed` reverts without sufficient pre-funded balance
28. Cannot call `settleDelayed` twice

**Tests — claim flow:**

29. Buyer calls `claim()` before expiry → receives exact `payoff`
30. `claimed[buyer]` = true → second `claim()` reverts
31. Non-buyer cannot claim
32. `claim()` after expiry reverts
33. `claim()` on not-delayed pool reverts
34. `canClaim(address)` returns correct value before and after claiming

**Tests — sweep:**

35. `sweepExpired` before expiry reverts
36. `sweepExpired` after expiry transfers remaining USDC to RecoveryPool
37. RecoveryPool records source pool and amount
38. After sweep, `claim()` reverts

**Gate:** Both settlement paths, claim flow, and expiry sweep all pass. `PayoutFailed`
emits correctly for bad addresses.

---

## Phase 7 — Controller (no Chainlink)

Depends on all contracts above. Use an EOA as keeper for this phase — no Chainlink yet.

**Write the contract in this order:**

1. Define state variables — `owner`, `usdc`, `riskVault`, `oracleAggregator`, `governanceModule`, `recoveryPool`, `keeper`
2. Add solvency config — `totalMaxLiability`, `minimumSolvencyRatio`, `minimumLeadTime`, `claimExpiryWindow`
3. Add lifetime counters — `totalPoliciesSold`, `totalPremiumsCollected`, `totalPayoutsDistributed`
4. Add flight registry — `FlightRecord` struct with cached `flightId` and `flightDate`, `flightRecords` mapping, `activeFlightKeys` array
5. Implement `onlyOwner` and `onlyKeeper` modifiers
6. Implement `buyInsurance(flightId, origin, destination, date)`:
   - Check route approved via GovernanceModule
   - Read terms from GovernanceModule
   - Enforce `minimumLeadTime`
   - Deploy new FlightPool if none exists for this route+date
   - Register flight with OracleAggregator on first deployment
   - Run solvency check
   - `transferFrom` traveler to FlightPool
   - `increaseLocked` on RiskVault
   - `flightPool.buyInsurance(traveler)`
   - Increment `totalPoliciesSold` and `totalPremiumsCollected`
7. Implement `_settleNotDelayed(key, pool)` — decreaseLocked, closePool, settleNotDelayed, processWithdrawalQueue, _clearFlight
8. Implement `_settleDelayed(key, pool)` — sendPayout FIRST, then decreaseLocked, closePool, settleDelayed, processWithdrawalQueue, _clearFlight, increment `totalPayoutsDistributed`
9. Implement `_clearFlight(key, index)` — mark inactive, deregisterFlight, swap-and-pop
10. Implement `checkAndSettle()` — `onlyKeeper`, loop active pools, read status, branch on outcome, call `riskVault.snapshot()`
11. Implement `isSolventForNewPurchase(flightId, date)` view
12. Implement `getActivePools()`, `getPoolAddress()`, `activeFlightCount()` views
13. Implement owner setters — `setMinimumSolvencyRatio`, `setMinimumLeadTime`, `setClaimExpiryWindow`, `setKeeper`, `setGovernanceModule`

**Tests — purchase flow:**

14. Reverts if route not approved in GovernanceModule
15. Reverts if route disabled in GovernanceModule
16. Reverts if `flightDate < block.timestamp + minimumLeadTime`
17. Deploys new FlightPool on first purchase for a route+date
18. Reuses existing pool on second purchase for same route+date
19. New pool gets terms from GovernanceModule at deployment time
20. Registers flight with OracleAggregator on first deployment only
21. Solvency check passes when vault has sufficient free capital
22. Solvency check reverts when vault is undercollateralised
23. `totalPoliciesSold` increments by 1 per purchase
24. `totalPremiumsCollected` increments by premium per purchase
25. `totalMaxLiability` increases by payoff per purchase

**Tests — settlement ordering:**

26. `_settleDelayed` calls `sendPayout` before `decreaseLocked`
27. After `_settleDelayed`, RiskVault `lockedCapital` reduced by pool's liability
28. After `_settleNotDelayed`, premiums in RiskVault and `lockedCapital` released
29. `processWithdrawalQueue` called after both settlement types
30. `totalPayoutsDistributed` increments on delayed settlement only

**Tests — flight registry:**

31. `activeFlightCount` correct before and after settlement
32. `activeFlightKeys` length correct after swap-and-pop removal
33. `flightRecords[key].active` = false after settlement
34. `deregisterFlight` called on OracleAggregator after settlement
35. `getActivePools` returns only unsettled pools
36. Cached `flightId` and `flightDate` in `FlightRecord` match deployed pool values

**Tests — end-to-end not delayed:**

37. Underwriter deposits → traveler buys → oracle set to OnTime → keeper calls `checkAndSettle` → premiums in vault → share price rises → underwriter withdraws → underwriter collects

**Tests — end-to-end delayed:**

38. Underwriter deposits → traveler buys → oracle set to Delayed → keeper calls `checkAndSettle` → traveler claims → advance time past expiry → `sweepExpired` moves remainder to RecoveryPool

**Gate:** Both full lifecycle tests pass. All counters reconcile. Solvency invariant
holds at every step.

---

## Phase 8 — Integration Tests

No new contracts. Run scenarios exercising the full system with multiple concurrent
flights and edge cases.

1. 3 flights active simultaneously — one on-time, one delayed, one cancelled — all settle correctly, vault balance and `totalManagedAssets` reconcile
2. 5 underwriters, staggered deposits, withdrawal queue with mixed FIFO ordering — queue drains correctly as capital frees across multiple settlements
3. Route terms updated mid-lifecycle — existing pool uses old terms, next purchase deploys new pool with new terms, both settle correctly
4. Route disabled mid-lifecycle — existing pool settles normally, new purchase reverts
5. `minimumSolvencyRatio` enforcement — fill vault near capacity, verify the next purchase correctly blocks and succeeds after more deposits
6. Claim expiry — fund, settle delayed, advance time past expiry, verify `claim` reverts, `sweepExpired` works
7. `totalManagedAssets` stress test — run 10 full purchase + settlement cycles, confirm counter stays in sync with `balanceOf` throughout
8. `queueHead` stress test — queue 20 withdrawals, process across 5 settlement cycles, confirm `queueHead` only advances, never resets

**Gate:** All scenarios pass. No counter drift. No stuck pools.

---

## Phase 9 — Mock Flight API

Before writing the real Chainlink Functions JS source, build a local mock API server
that mirrors the AeroAPI response shape. This lets you develop and test the JS source
without a live API key or real flight data.

1. Build a local HTTP server (Node.js / Express)
2. Implement `GET /flights/:ident` with query params `?start=...&end=...`
3. Response shape matches AeroAPI's `/flights/{ident}` schema — `ident`, `scheduled_in`, `actual_in`, `status` fields
4. Add a test control endpoint `POST /mock/set` to configure per-ident response — on-time, delayed, cancelled, or not yet landed
5. Implement status derivation logic:
   - `status == "Cancelled"` → Cancelled
   - `status == "Landed"` and `actual_in - scheduled_in > 45 min` → Delayed
   - `status == "Landed"` and within 45 min → OnTime
   - `status == "Scheduled"` or `"En Route"` → Unknown
6. Add `POST /mock/error` to make the next request for a given ident fail
7. Add a response returning an empty `flights` array — JS source should return Unknown
8. Write tests confirming each mock scenario returns the expected status value

**Gate:** Mock server returns correct status for all scenarios. Status derivation logic
is validated and ready to copy into the JS source.

---

## Phase 10 — FunctionsConsumer (mock API)

Write the `FunctionsConsumer` contract and the JS source pointed at the local mock API.
Test entirely locally before touching a real API key.

**Write the contract in this order:**

1. Inherit from `FunctionsClient`
2. Define state variables — `router`, `donId`, `subscriptionId`, `gasLimit`, `oracleAggregator`, `controller`, `pendingRequests` mapping `(requestId → FlightRequest)`, `jsSource` string
3. Implement constructor — set all addresses, call `FunctionsClient(router)`
4. Implement `requestFlightStatus(flightId, date)` — `onlyController`, build `FunctionsRequest`, call `_sendRequest`, store `requestId → (flightId, date)`, emit `RequestSent`
5. Implement `fulfillRequest(requestId, response, err)` — internal override, handle error (emit `RequestFailed`, return), parse response, call `OracleAggregator.updateFlightStatus`, emit `StatusUpdated`
6. Implement `setJsSource(string)` — owner only
7. Implement `setGasLimit(uint32)` — owner only
8. Define events — `RequestSent`, `RequestFailed`, `StatusUpdated`

**Write the JS source (mock API version):**

9. Read `args[0]` (flightId) and `args[1]` (Unix timestamp string)
10. Convert timestamp to date string for query bounds
11. Call `Functions.makeHttpRequest` to the mock server
12. Handle error and empty response — return `0` (Unknown)
13. Parse `status`, `scheduled_in`, `actual_in` from response
14. Apply 45-minute delay threshold
15. Return `Functions.encodeUint256(result)`

**Tests using Chainlink local mock (`@chainlink/local`):**

16. `requestFlightStatus` stores correct `requestId → (flightId, date)` mapping
17. `requestFlightStatus` reverts for non-controller caller
18. `fulfillRequest` with OnTime response → OracleAggregator updated to OnTime
19. `fulfillRequest` with Delayed response → OracleAggregator updated to Delayed
20. `fulfillRequest` with Cancelled response → OracleAggregator updated to Cancelled
21. `fulfillRequest` with error bytes → `RequestFailed` emitted, OracleAggregator unchanged
22. `fulfillRequest` with Unknown (0) response → OracleAggregator unchanged, status stays Unknown
23. `pendingRequests` entry cleared after `fulfillRequest`
24. Simulate full loop — Controller requests → mock DON fires callback → OracleAggregator updated → next Controller tick settles pool

**Gate:** Full local async loop works. All response types handled. OracleAggregator only
updated for final statuses.

---

## Phase 11 — Switch JS Source to AeroAPI (FlightAware)

Swap the mock server URL for AeroAPI. No contract changes — only the JS source changes,
deployable via `setJsSource()`.

1. Change endpoint to `https://aeroapi.flightaware.com/aeroapi/flights/${flightId}`
2. Add `x-apikey` header using `secrets.apiKey` — never hardcode the key in source
3. Add `start` and `end` date query params derived from the Unix timestamp arg
4. Use `flights[flights.length - 1]` for the most recent entry (handles codeshares and diversions)
5. Keep identical 45-minute delay threshold and status derivation from Phase 9
6. Upload API key as DON-encrypted secret via Chainlink `SecretsManager` — note slot and version
7. Update `subscriptionId` and `donId` in FunctionsConsumer to match target testnet

**Tests with real AeroAPI:**

8. Query a known past on-time flight (real IDENT and date) — verify returns `1`
9. Query a known past delayed flight — verify returns `2`
10. Query a known past cancelled flight — verify returns `3`
11. Query a future flight not yet departed — verify returns `0`
12. Query with invalid IDENT — verify error handled gracefully, returns `0`
13. Confirm API key is not visible in transaction calldata or emitted events

**AeroAPI rate limit note:** Personal tier is ~1,000 requests/month. The settlement loop
only requests Unknown flights, so volume is bounded. Monitor usage and upgrade tier
before mainnet.

**Gate:** Real API responses parse correctly. Secrets handling confirmed. Known historical
outcomes produce correct enum values.

---

## Phase 12 — Controller + Chainlink Automation

Update the Controller to implement `AutomationCompatibleInterface`. No other contracts change.

1. Add `automationRegistry` address state variable, set at construction
2. Replace `onlyKeeper` with `onlyAutomationRegistry` — checks `msg.sender == automationRegistry`
3. Implement `checkUpkeep(bytes calldata) external view returns (bool, bytes memory)` — returns `(true, "")` always
4. Implement `performUpkeep(bytes calldata)` — calls `checkAndSettle()` then `riskVault.snapshot()`
5. Remove `startLoop` and `stopLoop` — upkeep lifecycle managed via Chainlink registry
6. Add `setAutomationRegistry(address)` owner setter

**Tests:**

7. `checkUpkeep` always returns true
8. `performUpkeep` calls `checkAndSettle` and `riskVault.snapshot`
9. Direct call to `checkAndSettle()` from non-registry address reverts
10. `performUpkeep` from non-registry address reverts
11. Simulate full loop using Chainlink local Automation mock — mock registry calls `performUpkeep` → settlement executes → snapshot written

**Gate:** Automation interface implemented. Only registry can trigger settlement.

---

## Phase 13 — Testnet Deployment

All contracts validated locally. Deploy in this exact order.

**Deployment:**

1. Deploy `GovernanceModule`
2. Deploy `RecoveryPool`
3. Deploy `OracleAggregator` — do NOT call setters yet
4. Deploy `FunctionsConsumer` with OracleAggregator address, Chainlink Functions router address, DON ID for target testnet
5. Deploy `RiskVault` with USDC address and zero address as controller placeholder
6. Deploy `Controller` with all addresses — GovernanceModule, RiskVault, OracleAggregator, FunctionsConsumer, RecoveryPool, Chainlink Automation registry, and initial config values

**Post-deployment wiring:**

7. Call `OracleAggregator.setController(controller)` — one-time, locks forever
8. Call `OracleAggregator.setOracle(functionsConsumer)` — one-time, locks forever
9. Call `RiskVault.setController(controller)` — one-time, locks forever
10. Verify all three setters are now locked — second call reverts on each

**Chainlink setup:**

11. Create a Chainlink Functions subscription at functions.chain.link for the target testnet
12. Fund subscription with testnet LINK
13. Add FunctionsConsumer as authorised consumer on the subscription
14. Upload DON-encrypted API key secret via SecretsManager — note slot and version number
15. Call `FunctionsConsumer.setJsSource()` with the AeroAPI JS source
16. Register Controller upkeep in Chainlink Automation App — type: time-based, target: `performUpkeep`, interval: 600 seconds
17. Fund Automation upkeep with testnet LINK
18. Set upkeep gas limit to 2,000,000

**Route setup:**

19. Call `GovernanceModule.approveRoute(...)` for at least one testnet route

**Verification:**

20. Call `isSolventForNewPurchase` — confirm returns false with no capital
21. Deposit test USDC as underwriter via RiskVault
22. Call `isSolventForNewPurchase` — confirm returns true
23. Approve USDC and buy insurance as traveler via Controller
24. Confirm FlightPool deployed and registered in OracleAggregator
25. Wait for Automation tick — confirm `performUpkeep` fires in Automation dashboard logs
26. Confirm `RequestSent` event emitted on FunctionsConsumer for the Unknown flight
27. Wait for `fulfillRequest` callback — confirm `StatusUpdated` event emitted
28. Confirm OracleAggregator returns non-Unknown status for the flight
29. Wait for next Automation tick — confirm settlement executes
30. If OnTime: confirm premiums arrived in RiskVault and share price increased
31. If Delayed: confirm traveler can call `claim()` and receives payoff
32. Confirm `deregisterFlight` called — flight removed from OracleAggregator active list
33. Confirm `activeFlightCount` decreased by 1

**Gate:** Full end-to-end cycle completes on testnet. Both Chainlink products verified live.

---

## Phase 14 — Frontend

Build after testnet deployment. All contract addresses are known and the system is
verified live. Connect the frontend to the deployed testnet contracts throughout this phase.

**Setup:**

1. Initialise project — React / Next.js, TypeScript, Tailwind
2. Install `viem` + `wagmi` for contract interaction
3. Add wallet connection — MetaMask and WalletConnect at minimum
4. Generate TypeScript ABIs from deployed contract artifacts for all 7 contracts
5. Create a config file with all deployed contract addresses per network (testnet + future mainnet)
6. Create contract hook wrappers — `useRiskVault`, `useController`, `useGovernanceModule`, `useFlightPool`, `useOracleAggregator`
7. Add network detection — warn user if connected to the wrong network

**Route browsing page:**

8. Fetch all approved routes from `GovernanceModule.getApprovedRoutes()`
9. Display route list — flight ID, origin, destination, premium, payoff
10. For each route, call `isSolventForNewPurchase` and show availability state
11. Show "sold out" badge if solvency check fails
12. Add search and filter by origin, destination, or flight ID

**Buy insurance flow:**

13. Date picker for flight date — enforce minimum lead time (read `minimumLeadTime` from Controller)
14. Check if wallet has already bought for this flight+date — read `hasBought(address)` from pool if pool exists
15. Show premium and payoff clearly before any wallet interaction
16. Step 1: `USDC.approve(controller, premium)` — show pending state during tx
17. Step 2: `Controller.buyInsurance(...)` — show pending state during tx
18. On success show confirmation with pool address and claim expiry date
19. Handle and display revert reasons clearly — undercollateralised, already purchased, route disabled

**Traveler dashboard:**

20. Show all active policies for connected wallet — read `hasBought(address)` across known pools
21. For each policy show — flight ID, date, premium paid, payoff amount, settlement state
22. Fetch flight status from `OracleAggregator.getFlightStatus()` for each active pool
23. Show claim button if `canClaim(address)` returns true
24. Show claim expiry countdown for settled delayed pools
25. Execute `FlightPool.claim()` — show pending, success, and error states
26. After successful claim, update policy state to "Claimed"
27. Show "Expired — missed claim window" for policies past expiry

**Underwriter dashboard:**

28. Show current USDC balance and share balance for connected wallet
29. Show current share price — `totalManagedAssets() / totalShares()`
30. Show estimated current value of holdings — `previewRedeem(shares)`
31. Show immediately withdrawable value — `previewRedeemFree(shares)` with explanation if lower
32. Show TVL, locked capital, and free capital
33. Deposit flow — input amount, approve USDC, then `riskVault.deposit(amount)`
34. Withdraw flow — input share amount, call `riskVault.withdraw(shares)`
35. If withdrawal is immediate — show credited balance and prompt to `collect()`
36. If withdrawal is queued — show queue position
37. Show `claimableBalance` if non-zero with a `collect()` button
38. Cancel queued withdrawal — `cancelWithdrawal(queueIndex)` with confirmation

**APY chart:**

39. Fetch full price history — `priceHistoryLength()` then paginate `getPriceSnapshot(index)` calls
40. Plot share price over time as a line chart
41. Compute and display 7-day APY — find snapshot nearest to 7 days ago, annualise the difference
42. Compute and display 30-day APY — same approach for 30-day window
43. Handle sparse snapshot data gracefully — note gaps without crashing
44. Show "insufficient history" state if fewer than 7 days of snapshots exist

**Protocol stats page:**

45. Lifetime policies sold — `totalPoliciesSold()`
46. Lifetime premiums collected — `totalPremiumsCollected()`
47. Lifetime payouts distributed — `totalPayoutsDistributed()`
48. Total active flights — `activeFlightCount()`
49. Current TVL — `totalManagedAssets()`
50. Locked vs free capital as a visual ratio bar
51. Current share price with trend vs previous day snapshot

**Active flights panel:**

52. Fetch all active pools via `getActivePools()`
53. For each pool show — flight ID, date, buyer count, total premiums held, total liability, current oracle status
54. Show settlement state — Pending / Settled OnTime / Settled Delayed
55. Link to relevant FlightPool so travelers can navigate directly to claim

**Admin panel (owner / admin wallets only):**

56. Detect if connected wallet is owner or admin via GovernanceModule — hide panel for other wallets
57. Approve new route — form with flightId, origin, destination, premium, payoff
58. Validate premium < payoff client-side before submitting
59. Disable route — select from active routes list, confirm before submitting
60. Update route terms — select route, input new values, show warning that only future pools are affected
61. Add / remove admin — input address, confirm action
62. Show current `minimumSolvencyRatio`, `minimumLeadTime`, `claimExpiryWindow` with edit controls (owner only)

**Operational monitoring panel (owner only):**

63. Show last `performUpkeep` timestamp — alert if stale beyond 15 minutes
64. Show `balanceSanityCheck()` value — alert prominently if non-zero
65. Show list of recent `RequestFailed` events on FunctionsConsumer
66. Show list of recent `PayoutFailed` events on active FlightPools
67. Show RecoveryPool USDC balance with list of source pools and amounts
68. Show LINK balance note — direct owner to Chainlink dashboards for Automation and Functions

**Polish and edge cases:**

69. Loading states on all async reads
70. Optimistic UI updates on transactions — revert to previous state if transaction fails
71. Mobile responsive layout
72. All USDC values displayed with 6-decimal precision in human-readable format
73. Transaction history for connected wallet — deposits, withdrawals, purchases, claims
74. Deep links to specific pools — `?pool=0x...` loads pool state directly
75. Handle MetaMask rejection gracefully — no success state shown on user cancel
76. Empty states for all lists — "no active policies", "no active flights", etc.

**Gate:** All user flows completable end-to-end on testnet. Admin panel functional.
Monitoring panel shows live contract state.

---

## Phase 15 — Mainnet

Repeat Phase 13 on mainnet with the following additions:

1. Confirm all access control modifiers active — none commented out
2. Confirm AeroAPI production tier subscription active with sufficient monthly quota
3. Review and set final production values for `minimumSolvencyRatio`, `minimumLeadTime`, `claimExpiryWindow`
4. Review upkeep gas limit against observed testnet gas usage before registering
5. Set up alerts for Automation LINK balance falling below a safe threshold
6. Set up alerts for Functions subscription LINK balance falling below a safe threshold
7. Set up event indexing for `RequestFailed`, `PayoutFailed`, `SettledDelayed`, `SettledNotDelayed`
8. Update frontend config to point at mainnet contract addresses
9. Confirm `balanceSanityCheck()` returns zero before any user activity
10. Approve initial production routes via GovernanceModule

---

## Summary

| Phase | Deliverable | Gate |
|---|---|---|
| 1 | MockUSDC | Mint + transfer + approve working |
| 2 | RecoveryPool | Deposit + withdraw + access control |
| 3 | GovernanceModule | Route lifecycle + admin management |
| 4 | RiskVault | Capital accounting + queue + snapshots |
| 5 | OracleAggregator | Status lifecycle + access control |
| 6 | FlightPool | Settlement + claim + expiry |
| 7 | Controller (no Chainlink) | Full end-to-end lifecycle both outcomes |
| 8 | Integration tests | Multi-flight + queue + edge cases |
| 9 | Mock API server | Status derivation logic validated |
| 10 | FunctionsConsumer + JS (mock API) | Full local async loop works |
| 11 | JS source → AeroAPI | Real API responses parse correctly |
| 12 | Controller + Automation | Interface implemented, registry-only access |
| 13 | Testnet deployment | Live end-to-end cycle complete |
| 14 | Frontend | All user flows complete on testnet |
| 15 | Mainnet | Production |