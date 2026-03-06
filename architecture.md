# Flight Delay Insurance Protocol — Detailed Architecture

---

## Contracts

### GovernanceModule

The route authority. Owns the canonical list of approved flight routes and the fixed
premium and payoff for each. The Controller reads terms from this contract before every
insurance purchase and before deploying any new FlightPool.

- A **route** is defined by `(flightId, origin, destination)` — e.g. `("AA123", "DEN", "SEA")`.
- Each approved route has a single fixed `premium` and `payoff`. These are the values
  every traveler on that route will pay and receive — the traveler does not choose them.
- Routes can be **approved** or **disabled**. Disabling a route blocks new purchases but
  does not affect already-active pools for that route — those settle normally.
- **Terms can be updated** by the owner or an admin at any time. Updates only apply to
  FlightPools deployed after the update — existing pools have their terms locked in at
  construction and are never retroactively affected.
- The owner manages the admin whitelist. Admins can approve, disable, and update routes.
  Designed so this contract can be replaced with a multisig, DAO, or other mechanism
  without touching the Controller — the Controller only makes two view calls into it.
- Exposes `getApprovedRoutes()` for frontend consumption — returns the full list of
  active routes each with their current `premium` and `payoff`.

Key functions:
```
approveRoute(flightId, origin, destination, premium, payoff)
disableRoute(flightId, origin, destination)
updateRouteTerms(flightId, origin, destination, newPremium, newPayoff)
addAdmin(address)
removeAdmin(address)
getApprovedRoutes() → Route[]
isRouteApproved(flightId, origin, destination) → bool
getRouteTerms(flightId, origin, destination) → (premium, payoff)
```

### RiskVault

The capital backing layer. All underwriter USDC sits here.

- Underwriters call `deposit(amount)` and receive **shares** proportional to their contribution.
- Share price is expressed as `totalManagedAssets / totalShares`. As non-delayed flight
  premiums flow in, `totalManagedAssets` grows while `totalShares` stays constant — share
  price rises.
- A `lockedCapital` counter tracks USDC committed as collateral for active policies.
  Underwriters cannot withdraw locked capital.
- Share price is calculated using an internal `totalManagedAssets` counter rather than
  raw `balanceOf`. This prevents share price manipulation via direct USDC transfers to the
  vault address. A `balanceSanityCheck()` view exposes any drift between the two for monitoring.
- Withdrawals that would breach `lockedCapital` enter a **FIFO queue**. After each flight
  settlement, the Controller calls `processWithdrawalQueue()` which credits each fulfilled
  underwriter's `claimableBalance` in FIFO order. A `queueHead` pointer tracks the first
  unprocessed entry so the processor never re-scans already-fulfilled or cancelled entries.
- **Withdrawals are pull-based.** Once an underwriter's queued request is processed and
  credited, they call `collect()` to transfer their USDC. Credited balances are fixed USDC
  — they do not earn further yield while sitting uncollected.
- Records daily share price snapshots via a `priceHistory` array. A snapshot is written at
  most once per day, triggered by settlement activity. A standalone `snapshot()` function
  callable by the Chainlink Automation keeper ensures snapshots are recorded even during
  periods with no flight settlements.
- A `previewRedeemFree(shares)` view returns the redemption value against free capital only,
  giving underwriters a realistic picture of what they can withdraw immediately, as distinct
  from `previewRedeem` which includes locked capital in the calculation.
- Only the Controller can call state-changing functions: `increaseLocked`, `decreaseLocked`,
  `sendPayout`, `processWithdrawalQueue`.

### FlightPool

One contract deployed per flight+date. Holds traveler premiums for that specific flight.

- **Created lazily** — a pool for a given `(flightId, date)` is deployed automatically
  on the first `buyInsurance()` call for that combination, not upfront by the owner.
- The `premium` and `payoff` used at deployment are read from the GovernanceModule at
  the moment of first purchase. Subsequent `updateRouteTerms()` calls do not affect
  an already-deployed pool.
- Immutable after deployment — `premium` and `payoff` are fixed at construction and
  cannot change after travelers have bought in.
- On settlement, one of two outcomes:
  - **Not delayed:** all collected premiums are transferred to RiskVault as yield.
  - **Delayed:** receives `payoff × buyerCount` USDC from RiskVault and marks the pool
    as claimable. Funds sit in the pool until each buyer pulls them out.
- **Payouts are pull-based.** After a delayed settlement, each buyer calls `claim()` on
  the FlightPool to collect their `payoff`. The pool tracks a `claimed` mapping per buyer
  to prevent double claims.
- **Claim expiry.** Unclaimed payouts expire after a configurable window (default 60 days,
  updatable by the owner). After expiry, unclaimed funds are swept to the RecoveryPool
  by calling `sweepExpired()`. Buyers cannot claim after the expiry timestamp.
- Failed per-buyer transfers during `settleDelayed` emit a `PayoutFailed(address buyer, uint256 amount)`
  event so operators can identify and manually recover any stranded funds.
- Only the Controller can call `buyInsurance`, `closePool`, `settleNotDelayed`, `settleDelayed`.

### Controller

The system orchestrator. Holds no funds itself — routes premiums directly from the traveler's
wallet to the FlightPool via `transferFrom`.

Responsibilities:

1. **Validate routes** against the GovernanceModule before every purchase.
2. **Read terms** (premium and payoff) from the GovernanceModule for the route.
3. **Lazily deploy FlightPools** on first purchase for a route+date, if one does not yet exist,
   using the terms read from the GovernanceModule at that moment.
4. **Gate insurance purchases** behind a solvency check before every sale, and enforce a
   configurable `minimumLeadTime` before departure (default 1 hour).
5. **Pull USDC premiums** from travelers and route them to the correct FlightPool.
6. **Run the settlement loop** via `performUpkeep()` — query OracleAggregator, trigger
   Chainlink Functions requests for Unknown flights, settle mature FlightPools, trigger
   withdrawal queue processing after each settlement.
7. **Clean up** settled flights from both the internal registry and the OracleAggregator.
8. Caches `flightId` and `flightDate` in the `FlightRecord` struct to avoid external
   contract calls during the settlement loop.
9. Maintains lifetime aggregate counters — `totalPoliciesSold`, `totalPremiumsCollected`,
   and `totalPayoutsDistributed` — for frontend dashboards and analytics.
10. Implements `AutomationCompatibleInterface` for Chainlink Automation compatibility.
11. Exposes `getActivePools()` for the frontend — returns all live pool addresses with metadata.

### OracleAggregator

An on-chain registry of flight statuses. The single source of truth for settlement decisions.

- Stores the status of every currently-tracked flight: `Unknown → OnTime | Delayed | Cancelled`
- Status is **append-only toward finality** — once a final status is recorded it cannot
  be reversed or reset.
- The `authorizedOracle` is set to the FunctionsConsumer contract address — not an EOA.
  Only the FunctionsConsumer can push status updates.
- Only the Controller can register and deregister flights.
- `getFlightStatus()` never reverts — returns `Unknown` as a safe fallback for any
  unregistered flight, so a missing entry never breaks the settlement loop.

### FunctionsConsumer

The Chainlink Functions client. Bridges the settlement loop to real-world flight APIs
without a persistent off-chain service.

- Inherits from Chainlink's `FunctionsClient`.
- Holds the JavaScript source code that fetches flight status from external APIs.
- `requestFlightStatus(flightId, date)` sends a Chainlink Functions request and records
  the `requestId → (flightId, date)` mapping.
- `fulfillRequest(requestId, response, err)` is the on-chain callback invoked by Chainlink
  nodes after executing the JS source. It parses the response and calls
  `OracleAggregator.updateFlightStatus()`.
- Funded with LINK to pay for Chainlink Functions request costs.
- Only the Controller can call `requestFlightStatus()`.

### RecoveryPool

A simple custody contract for expired, unclaimed traveler payouts.

- When a FlightPool's claim window expires (60 days after delayed settlement by default),
  anyone can call `FlightPool.sweepExpired()` which transfers all remaining unclaimed
  USDC to the RecoveryPool.
- The RecoveryPool holds funds on behalf of travelers who missed the claim window.
  It maintains a record of which FlightPool the funds came from.
- The **owner can withdraw** funds from the RecoveryPool at any time — intended for
  manual resolution of legitimate late claims or other recovery scenarios.
- The claim expiry window is a configurable parameter on the Controller, defaulting
  to 60 days. The owner can update it and it applies to all future pool deployments.

---

## Data Flow

### Approving a Route

```
Owner or Admin → GovernanceModule.approveRoute(flightId, origin, destination, premium, payoff)
    └─► route stored as approved with fixed premium and payoff
        route now visible in getApprovedRoutes()
        any future buyInsurance() call for any date on this route is now valid
```

### Updating Route Terms

```
Owner or Admin → GovernanceModule.updateRouteTerms(flightId, origin, destination, newPremium, newPayoff)
    └─► new terms stored in GovernanceModule
        existing active FlightPools for this route are unaffected (terms locked at deployment)
        next lazy pool deployment for this route will use the new terms
```

### Buying Insurance (with lazy pool deployment)

```
Traveler → USDC.approve(controller, premium)
         → Controller.buyInsurance(flightId, origin, destination, date)
                │
                ├─► GovernanceModule.isRouteApproved(flightId, origin, destination)
                │       └─► revert if route not approved or disabled
                │
                ├─► GovernanceModule.getRouteTerms(flightId, origin, destination)
                │       └─► read current premium and payoff for this route
                │
                ├─► enforce minimumLeadTime (revert if departure too soon)
                │
                ├─► pool exists for (flightId, date)?
                │       ├─ YES → use existing pool (terms already locked at its deployment)
                │       └─ NO  → deploy new FlightPool(flightId, date, premium, payoff, ...)
                │                 OracleAggregator.registerFlight(flightId, date)
                │
                ├─► solvency check (revert if undercollateralised)
                ├─► usdc.transferFrom(traveler, flightPool, premium)
                ├─► riskVault.increaseLocked(payoff)
                ├─► flightPool.buyInsurance(traveler)
                └─► totalPoliciesSold++, totalPremiumsCollected += premium
```

### Disabling a Route

```
Owner or Admin → GovernanceModule.disableRoute(flightId, origin, destination)
    └─► route marked as disabled
        existing active pools for this route are unaffected — they settle normally
        new buyInsurance() calls for this route will revert at the approval check
```

### Settlement Loop (via Chainlink Automation)

```
Chainlink Automation → Controller.performUpkeep()
    └─► Controller.checkAndSettle()
              └─► for each active FlightPool:
                        OracleAggregator.getFlightStatus(flightId, date)
                        │
                        ├─ Unknown   → FunctionsConsumer.requestFlightStatus(flightId, date)
                        │                  └─► Chainlink nodes execute JS source
                        │                      fetch flight API → fulfillRequest callback
                        │                      OracleAggregator.updateFlightStatus(...)
                        │                  status will be available on next tick
                        │
                        ├─ OnTime    → flightPool.settleNotDelayed()
                        │                  └─► premiums → RiskVault (yield)
                        │             riskVault.sendPayout() not called
                        │             riskVault.decreaseLocked(liability)
                        │             riskVault.processWithdrawalQueue()
                        │             OracleAggregator.deregisterFlight(...)
                        │
                        └─ Delayed / Cancelled
                                      → riskVault.sendPayout(pool, amount)
                                        riskVault.decreaseLocked(liability)
                                        flightPool.settleDelayed()
                                            └─► pool marked claimable
                                                claimExpiry set (now + 60 days)
                                        riskVault.processWithdrawalQueue()
                                            └─► credits claimableBalance per underwriter
                                        OracleAggregator.deregisterFlight(...)
                                        totalPayoutsDistributed += totalPayout
              │
              └─► riskVault.snapshot()  ← daily price snapshot if interval elapsed
```

### Traveler Claiming a Payout

```
Traveler → FlightPool.claim()
    │
    ├─► revert if pool not settled as delayed
    ├─► revert if caller has no policy in this pool
    ├─► revert if caller already claimed
    ├─► revert if block.timestamp > claimExpiry
    ├─► mark claimed[caller] = true
    └─► usdc.transfer(caller, payoff)
```

### Sweeping Expired Claims to RecoveryPool

```
Anyone → FlightPool.sweepExpired()
    │
    ├─► revert if block.timestamp <= claimExpiry
    ├─► calculate remaining unclaimed USDC
    └─► usdc.transfer(recoveryPool, remainder)
            └─► RecoveryPool records source FlightPool and amount
```

### Underwriter Collecting a Fulfilled Withdrawal

```
Underwriter → RiskVault.collect()
    │
    ├─► read claimableBalance[caller]
    ├─► revert if zero
    ├─► set claimableBalance[caller] = 0
    ├─► totalManagedAssets -= amount
    └─► usdc.transfer(caller, amount)
```

---

## Solvency Invariant

Before every insurance purchase, the Controller enforces:

```
riskVault.freeCapital() >= (totalMaxLiability + newPayoff) × minimumSolvencyRatio / 100
```

- `freeCapital` = `totalManagedAssets` − `lockedCapital`
- `totalMaxLiability` is a running total of worst-case payouts across all active pools.
  It increases by `payoff` on each purchase and decreases by `pool.maxLiability()` on
  each settlement (regardless of outcome).
- `minimumSolvencyRatio` defaults to 100 — the vault is always fully collateralised.
  Every active policy has its payoff amount locked in the vault.

If the check fails, the purchase reverts. There is no partial fulfilment.

---

## Contract Relationships

```
                         Owner / Admins
                               │
                               ▼
                      GovernanceModule
                               │
                               ▼
                          Controller
                          │    │    │
              ┌───────────┘    │    └───────────┐
              ▼                ▼                ▼
         RiskVault       FlightPool(s)   OracleAggregator
                               │                ▲
                               ▼                │
                          RecoveryPool    FunctionsConsumer
                                                ▲
                                                │
                                      Chainlink Functions Nodes
                                                ▲
                                                │
                                           Flight APIs
```

**Participants**

```
  Underwriters ──────► RiskVault
  Travelers ─────────► Controller ──► FlightPool
                                           │
                       Travelers ◄─────────┘
                       (claim)
```

---

## Deployment Order

```
1. GovernanceModule
        no dependencies

2. RecoveryPool
        no dependencies

3. OracleAggregator
        no dependencies at deploy time
        → Controller and FunctionsConsumer addresses set via one-time setters post-deployment

4. FunctionsConsumer
        needs: OracleAggregator address, Chainlink Functions router address, DON ID
        → fund with LINK after deployment

5. RiskVault
        needs: Controller address
        → deploy with placeholder, set controller via one-time setter post-deployment

6. Controller
        needs: GovernanceModule, RiskVault, OracleAggregator, FunctionsConsumer,
               RecoveryPool addresses, Chainlink Automation registry address

7. Post-deployment wiring
        OracleAggregator.setController(controller)
        OracleAggregator.setOracle(functionsConsumer)
        RiskVault.setController(controller)
        Register Controller upkeep in Chainlink Automation registry → fund with LINK
```

**Note on the RiskVault / Controller circular dependency:**
RiskVault needs the Controller address to enforce `onlyController`, and the Controller
needs the RiskVault address. Deploy RiskVault first with a zero address placeholder,
deploy the Controller, then call `RiskVault.setController(controller)` as a one-time
post-deployment setter — mirroring the same pattern used by OracleAggregator.

---

## Access Control

| Modifier | Enforced On | Meaning |
|---|---|---|
| `onlyOwner` | GovernanceModule | Manage admins |
| `onlyOwnerOrAdmin` | GovernanceModule | `approveRoute`, `disableRoute`, `updateRouteTerms` |
| `onlyOwner` | Controller | Start/stop keeper loop, update `claimExpiryWindow`, `minimumLeadTime`, `minimumSolvencyRatio` |
| `onlyAutomationRegistry` | Controller | `performUpkeep` — only callable by Chainlink Automation registry |
| `onlyController` | RiskVault, FlightPool | All capital-moving and state-changing functions |
| `onlyController` | FunctionsConsumer | `requestFlightStatus` |
| `onlyOwner` | RecoveryPool | Withdraw recovered funds |
| `authorizedOracle` (FunctionsConsumer) | OracleAggregator | `updateFlightStatus` |
| `authorizedController` | OracleAggregator | `registerFlight`, `deregisterFlight` |

The GovernanceModule address is set on the Controller at deployment and can be updated
by the owner to swap in a more complex governance mechanism later without redeploying
the Controller.

The `authorizedController` and `authorizedOracle` addresses in OracleAggregator are
set once after deployment and can never be changed.

---

## Frontend Query Reference

| What | Where | Function |
|---|---|---|
| All approved routes with current premium and payoff | GovernanceModule | `getApprovedRoutes()` |
| Current terms for a specific route | GovernanceModule | `getRouteTerms(flightId, origin, destination)` |
| All currently active pools | Controller | `getActivePools()` |
| Active pool for a specific flight+date | Controller | `getPoolAddress(flightId, date)` |
| Whether a purchase would pass solvency | Controller | `isSolventForNewPurchase(flightId, date)` |
| Number of currently active flights | Controller | `activeFlightCount()` |
| Lifetime policies sold | Controller | `totalPoliciesSold()` |
| Lifetime premiums collected | Controller | `totalPremiumsCollected()` |
| Lifetime payouts distributed | Controller | `totalPayoutsDistributed()` |
| Current flight status | OracleAggregator | `getFlightStatus(flightId, date)` |
| Whether a traveler has an unclaimed payout | FlightPool | `canClaim(address)` |
| Claim expiry timestamp for a pool | FlightPool | `claimExpiry()` |
| Total vault TVL | RiskVault | `totalManagedAssets()` |
| Locked vs free capital | RiskVault | `lockedCapital()`, `freeCapital()` |
| Current share price | RiskVault | `totalManagedAssets() / totalShares()` |
| Share price at a point in time (for APY) | RiskVault | `getPriceSnapshot(index)`, `priceHistoryLength()` |
| Underwriter's uncollected withdrawal balance | RiskVault | `claimableBalance(address)` |
| Immediate vs locked redemption value | RiskVault | `previewRedeem(shares)`, `previewRedeemFree(shares)` |

---

## Withdrawal Queue

When a RiskVault withdrawal would breach `lockedCapital`, the request is queued:

```
Underwriter calls riskVault.withdraw(shares)
    │
    ├─ free capital sufficient  → shares burned
    │                             claimableBalance[underwriter] += usdcAmount
    │                             underwriter calls collect() to receive USDC
    │
    └─ free capital insufficient → request appended to queue (address, shares, timestamp)
                                   shares marked as reserved (cannot be double-queued)
                                   emits WithdrawQueued(address, shares, queueIndex)

After each flight settlement:
    Controller → riskVault.processWithdrawalQueue()
        └─► starts from queueHead (not index 0)
            drains FIFO until capital is exhausted or queue is empty
            for each fulfilled or cancelled entry:
                shares burned (if fulfilled)
                claimableBalance[underwriter] += usdcAmount (if fulfilled)
                queueHead advances past this entry
            underwriter then calls collect() to receive their USDC
```

An underwriter can cancel a pending queued request at any time with `cancelWithdrawal(queueIndex)`.
Only one pending request per address is allowed at a time.
Credited `claimableBalance` is fixed USDC — it does not earn further yield while uncollected.

---

## Key Design Principles

**Separation of custody and orchestration.** The Controller orchestrates but holds no funds.
USDC sits only in RiskVault (underwriter capital) or FlightPool (traveler premiums).

**Governance is modular.** The GovernanceModule is a standalone contract with a clean
interface. The Controller depends on it via two view calls only. It can be replaced with
a multisig, DAO, or any other mechanism by updating a single address on the Controller.

**Terms are set by the route, not the traveler.** Premium and payoff are defined once
at route approval time. The traveler simply buys — they do not negotiate or pass in values.

**Term updates are forward-only.** Updating a route's premium or payoff via `updateRouteTerms()`
only affects pools deployed after the update. All existing pools retain the terms they
were deployed with, protecting travelers who have already bought in.

**Pools are created on demand.** FlightPools are deployed lazily on first purchase for a
route+date. No upfront admin action is required per-date — approving a route is sufficient
to open it to all future dates.

**Route disabling is non-destructive.** Disabling a route only blocks new purchases.
Existing pools for that route continue to operate and settle normally.

**Capital is fungible across flights.** All underwriters share one RiskVault, so capital
backs multiple flights simultaneously. `lockedCapital` tracks aggregate exposure rather
than per-flight allocations.

**Everything is pull-based.** Neither travelers nor underwriters receive funds automatically.
Travelers call `claim()` on the FlightPool. Underwriters call `collect()` on the RiskVault.
This eliminates reentrancy risk from push transfers and gives users full control over when
they receive funds.

**Expired claims go to recovery, not back to the vault.** Unclaimed payouts after the expiry
window are swept to a dedicated RecoveryPool rather than returned to underwriters. This keeps
the protocol's obligations visible and auditable, and allows the owner to manually resolve
legitimate late claims.

**Minimal aggregator state.** The aggregator holds data only for unsettled flights with
active insurance. Deregistration on settlement prevents stale entry accumulation.

**Self-healing withdrawal queue.** Queue processing is triggered by settlement, not by
a separate cron job. Capital release and queue crediting are atomic within the same transaction.

**No centralised operator.** Automation and oracle data are provided by Chainlink. There is
no server, cron job, or private key the protocol depends on in production.

---

## Implementation Notes

### queueHead Pointer — RiskVault

**Problem:** The withdrawal queue is a plain append-only array. Without a pointer,
`processWithdrawalQueue()` would start from index 0 on every call and loop through every
entry, skipping fulfilled and cancelled ones via a condition check:

```
[✓][✓][✓][✓][✓][✓][pending][pending]
 0   1   2   3   4   5      6        7
 ↑ always starts here — wastes gas on already-processed entries
```

Entries behind the current active window are never going to yield work — they are done. But
the loop still has to visit every one of them on each call. Since `processWithdrawalQueue()`
is called after every single flight settlement, this dead-scanning window grows continuously
over the lifetime of the protocol. In a long-running system with thousands of historical queue
entries, this eventually makes `processWithdrawalQueue()` so gas-expensive that the entire
`checkAndSettle()` transaction could hit the block gas limit and revert — freezing the
settlement loop entirely.

**Fix:** `queueHead` is a single `uint256` stored in the RiskVault that tracks the index of
the first entry not yet processed. As entries are fulfilled or skipped as cancelled,
`queueHead` advances. The next call starts directly from `queueHead`:

```
[✓][✓][✓][✓][✓][✓][pending][pending]
 0   1   2   3   4   5      6        7
                        ↑ queueHead — dead entries never touched again
```

The cost is one extra storage slot. The benefit is that gas cost stays proportional to the
number of entries processed in that call, not the total historical length of the queue.

**Contract:** RiskVault — `uint256 public queueHead`

---

### settleDelayed Ordering — Controller

**Problem:** In `_settleDelayed`, the original ordering called `decreaseLocked` before
`sendPayout`. This meant `freeCapital` looked artificially high for a brief moment during
execution — the liability was released before the USDC had actually left the vault.
While harmless in a single transaction (nothing can interleave), it violated the solvency
invariant mid-execution and would cause confusion if reentrancy paths were ever added.

**Fix:** Reordered to `sendPayout` first, then `decreaseLocked`. The vault balance
decreases before the locked counter is reduced, keeping `freeCapital` conservative
at every point in execution.

**Contract:** Controller — `_settleDelayed()`

---

### FlightRecord Caching — Controller

**Problem:** `_processAllFlights` calls `pool.flightId()` and `pool.flightDate()` via
external calls on every FlightPool on every 10-minute settlement tick. With 50+ active
flights, this is a meaningful gas cost — each external call reads from a separate
contract's storage.

**Fix:** `flightId` and `flightDate` are cached directly in the `FlightRecord` struct
inside the Controller's own storage when the pool is first created. The settlement loop
reads from local storage instead of making external calls.

**Contract:** Controller — `FlightRecord` struct

---

### PayoutFailed Event — FlightPool

**Problem:** In `settleDelayed`, per-buyer transfers are intentionally non-reverting to
prevent one bad address from blocking all payouts. However the original design emitted no
event on failure — a skipped transfer was completely silent. This makes it impossible to
detect stranded funds without manually reconciling `buyers.length × payoff` against actual
transfers.

**Fix:** A `PayoutFailed(address indexed buyer, uint256 amount)` event is emitted when a
transfer fails. This gives operators and indexers full visibility into which buyers need
manual recovery.

**Contract:** FlightPool — `settleDelayed()`

---

### previewRedeem Includes Locked Capital — RiskVault

**Behaviour:** `previewRedeem` calculates redemption value using the vault's full
`totalManagedAssets`, which includes `lockedCapital`. This means the value shown to an
underwriter reflects capital they cannot currently withdraw if most of it is locked.

This is not a bug — the locked capital is still the underwriter's, it is simply
temporarily unavailable. However it can be misleading UX.

**Mitigation:** A separate `previewRedeemFree(shares)` view calculates redemption value
against free capital only. The existing `previewRedeem` is unchanged.

**Contract:** RiskVault — new `previewRedeemFree(uint256 shares)` view function

---

### totalManagedAssets — RiskVault Share Price Integrity

**Problem:** Relying on `balanceOf(address(this))` for share price means anyone can
send USDC directly to the vault outside of `deposit()`, inflating share price for
existing shareholders — the classic ERC4626 inflation attack.

**Fix:** Replace all share price calculations with an internal `totalManagedAssets`
counter. This variable is the only source of truth for share price and solvency.

`totalManagedAssets` moves at exactly these points:

| Event | Change |
|---|---|
| `deposit()` | `+= amount` |
| Premium forwarded from FlightPool on not-delayed settlement | `+= premiums received` |
| `sendPayout()` — USDC sent to a FlightPool | `-= amount` |
| `collect()` — underwriter collects credited balance | `-= amount` |

`totalManagedAssets` decrements at `collect()` time, not at queue crediting time.
Decrementing at crediting time would cause the vault to report less capital than it
physically holds during the window between crediting and collection, which could
incorrectly block legitimate insurance purchases via the solvency check.

`totalAssets()` returns `totalManagedAssets`. `freeCapital()` becomes
`totalManagedAssets - lockedCapital`. Both `previewRedeem` and `previewRedeemFree` use
`totalManagedAssets`. A `balanceSanityCheck()` view returns
`usdc.balanceOf(address(this)) - totalManagedAssets` — should always be zero in normal
operation.

**Contract:** RiskVault — `uint256 public totalManagedAssets`

---

### Flight Registration Lead Time — Controller

**Problem:** The original check `flightDate > block.timestamp` allowed a flight departing
in the same block to be registered, creating edge cases where insurance is bought moments
before departure.

**Fix:** A configurable `minimumLeadTime` parameter (default 1 hour) is added to the
Controller. The check becomes `flightDate >= block.timestamp + minimumLeadTime`. The
owner can update this value.

**Contract:** Controller — `uint256 public minimumLeadTime`

---

### Lifetime Aggregate Counters — Controller

**Purpose:** Once a flight settles and is cleared, its pool is deregistered and no longer
queryable. Without counters captured at write time, there is no historical record.

| Counter | Increments on | Amount |
|---|---|---|
| `totalPoliciesSold` | every `buyInsurance()` | +1 |
| `totalPremiumsCollected` | every `buyInsurance()` | +premium |
| `totalPayoutsDistributed` | every `_settleDelayed()` | +totalPayout |

One additional `SSTORE` each on code paths that already execute a write.

**Contract:** Controller — three `uint256 public` state variables

---

### Share Price Snapshots — RiskVault

**Purpose:** Without historical snapshots, the frontend cannot compute 7-day or 30-day APY.

A `priceHistory` array stores daily snapshots (`timestamp`, `pricePerShare` scaled to 6
decimals). A snapshot is written at most once per 24 hours via `_maybeSnapshot()`, called
inside `processWithdrawalQueue()`. A standalone `snapshot()` callable by the Chainlink
Automation keeper ensures snapshots are captured even on days with no settlements.

The frontend reads `priceHistoryLength()` and `getPriceSnapshot(index)`, does a binary
search for the snapshot nearest to 7 or 30 days ago, and computes the annualised return
from the price difference. Storage growth is bounded at ~365 entries per year.

**Contract:** RiskVault
- `PriceSnapshot[] public priceHistory`
- `uint256 public lastSnapshotTimestamp`
- `function priceHistoryLength() external view returns (uint256)`
- `function getPriceSnapshot(uint256 index) external view returns (uint256 timestamp, uint256 pricePerShare)`
- `function snapshot() external` — no-op if already snapshotted today

---

## Known Limitations

| Issue | Detail |
|---|---|
| **Single oracle trust** | The system depends on Chainlink Functions nodes executing the correct JS source. Chainlink's decentralised DON mitigates single-node risk, but the JS source itself is controlled by the deployer. |
| **Uncollected underwriter balances** | Credited `claimableBalance` sits in the RiskVault indefinitely. There is no expiry — unlike traveler claims. Consider a similar expiry mechanism for production. |
| **Correlated event risk** | If many insured flights are delayed simultaneously (e.g. a major weather event), the vault bears the full correlated loss. `minimumSolvencyRatio` at 100% ensures solvency but underwriters absorb that risk. |
| **No per-underwriter attribution** | Locked capital is a pool-level aggregate. All underwriters share risk and yield proportionally through share price. |
| **Direct USDC transfers inflate share price** | Mitigated via `totalManagedAssets` internal accounting. Any USDC arriving outside tracked paths is ignored. Drift is observable via `balanceSanityCheck()`. |
| **Snapshot gaps** | If neither a settlement nor a keeper tick occurs for over 24 hours, a daily snapshot will be missed. The keeper `snapshot()` call guards against this in normal operation. |