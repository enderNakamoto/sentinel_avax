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

---

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
- Records daily share price snapshots via a `priceHistory` array. The CRE workflow calls
  `snapshot()` at the end of every tick — a snapshot is written at most once per 24 hours.
- A `previewRedeemFree(shares)` view returns the redemption value against free capital only,
  giving underwriters a realistic picture of what they can withdraw immediately.
- Only the Controller can call state-changing functions: `increaseLocked`, `decreaseLocked`,
  `sendPayout`, `processWithdrawalQueue`, `recordPremiumIncome`.
- `snapshot()` is callable by anyone — in practice the CRE workflow calls it every tick.

---

### FlightPool

One contract deployed per flight+date. Holds traveler premiums for that specific flight.

- **Created lazily** — a pool for a given `(flightId, date)` is deployed automatically
  on the first `buyInsurance()` call for that combination, not upfront by the owner.
- The `premium` and `payoff` used at deployment are read from the GovernanceModule at
  the moment of first purchase. Subsequent `updateRouteTerms()` calls do not affect
  an already-deployed pool.
- Immutable after deployment — `premium` and `payoff` are fixed at construction.
- On settlement, one of two outcomes:
  - **Not delayed:** all collected premiums are transferred to RiskVault as yield via
    `riskVault.recordPremiumIncome(amount)`.
  - **Delayed:** receives `payoff × buyerCount` USDC from RiskVault and marks the pool
    as claimable. Funds sit in the pool until each buyer pulls them out.
- **Payouts are pull-based.** After a delayed settlement, each buyer calls `claim()` on
  the FlightPool to collect their `payoff`. A `claimed` mapping per buyer prevents double claims.
- **Claim expiry.** Unclaimed payouts expire after a configurable window (default 60 days,
  set by the Controller at settlement time). After expiry, unclaimed funds are swept to
  the RecoveryPool by calling `sweepExpired()`. Buyers cannot claim after the expiry timestamp.
- Per-buyer transfer failures in `settleDelayed` emit a `PayoutFailed(address buyer, uint256 amount)`
  event and are skipped non-revertingly, so one bad address cannot block payouts to others.
- Only the Controller can call `buyInsurance`, `closePool`, `settleNotDelayed`, `settleDelayed`.

---

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
6. **Run the settlement loop** via `checkAndSettle()` — query OracleAggregator for each
   active flight's current status and settle mature FlightPools. Unknown flights are skipped;
   the CRE workflow has already written all final statuses before calling this function.
7. **Trigger withdrawal queue processing** and share price snapshot after each settlement.
8. **Clean up** settled flights from both the internal registry and the OracleAggregator.
9. Caches `flightId` and `flightDate` in the `FlightRecord` struct to avoid external
   contract calls during the settlement loop.
10. Maintains lifetime aggregate counters — `totalPoliciesSold`, `totalPremiumsCollected`,
    and `totalPayoutsDistributed` — for frontend dashboards and analytics.
11. Exposes `getActivePools()` for the frontend — returns all live pool addresses with metadata.

**CRE access guard:**

```solidity
address public creWorkflowAddress; // set post-workflow-deployment via setCreWorkflow()

modifier onlyCREWorkflow() {
    require(msg.sender == creWorkflowAddress, "Controller: not CRE workflow");
    _;
}

function checkAndSettle() external onlyCREWorkflow { ... }
```

There is no `AutomationCompatibleInterface`, no `checkUpkeep`, no `performUpkeep`, no
`lastUpkeepTimestamp`, and no `s_forwarder`. The CRE cron trigger replaces all of that.

`creWorkflowAddress` is set post-workflow-deployment via `setCreWorkflow(address)` (owner only).
After deploying and activating the CRE workflow, read its forwarder/signer address from
the CRE platform and call `controller.setCreWorkflow(workflowAddress)`.

---

### OracleAggregator

An on-chain registry of flight statuses. The single source of truth for settlement decisions.

- Stores the status of every currently-tracked flight: `Unknown → OnTime | Delayed | Cancelled`
- Status is **append-only toward finality** — once a final status is recorded it cannot
  be reversed or reset to `Unknown`.
- The `authorizedOracle` is set to the CRE workflow's forwarder/signer address. Only the
  CRE workflow can push status updates — no intermediate contract is involved.
- Only the Controller can register and deregister flights.
- `getFlightStatus()` never reverts — returns `Unknown` as a safe fallback for any
  unregistered flight, so a missing entry never breaks the settlement loop.
- Exposes `getActiveFlights()` — returns the full array of currently registered flights.
  The CRE workflow reads this at the start of each tick to know which flights to check.

---

### RecoveryPool

A simple custody contract for expired, unclaimed traveler payouts.

- When a FlightPool's claim window expires, anyone can call `FlightPool.sweepExpired()`
  which transfers all remaining unclaimed USDC to the RecoveryPool.
- The RecoveryPool records which FlightPool each deposit came from.
- The **owner can withdraw** funds from the RecoveryPool at any time — intended for manual
  resolution of legitimate late claims or other recovery scenarios.
- The claim expiry window is a configurable parameter on the Controller (default 60 days),
  passed to each FlightPool at settlement time.

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

### CRE Workflow Tick (every 10 minutes)

```
CRE Cron Trigger fires
    │
    └─► workflow callback: onCronTick(runtime, trigger)
              │
              ├─► evmClient.read(OracleAggregator.getActiveFlights())
              │       └─► returns array of { flightId, flightDate } for all registered flights
              │
              ├─► for each flight with status Unknown:
              │       httpClient.get(AeroAPI, { headers: { x-apikey: secrets.AEROAPI_KEY } })
              │           └─► response parsed:
              │                 Landed + delay > 45 min → Delayed
              │                 Landed + delay ≤ 45 min → OnTime
              │                 Cancelled               → Cancelled
              │                 Scheduled / En Route    → Unknown (skip, retry next tick)
              │                 HTTP error / empty      → Unknown (skip, retry next tick)
              │
              ├─► for each flight that reached a final status:
              │       evmClient.write(OracleAggregator.updateFlightStatus(flightId, date, status))
              │           └─► append-only — status cannot regress once written
              │
              ├─► evmClient.write(Controller.checkAndSettle())
              │       └─► for each active FlightPool:
              │                 OracleAggregator.getFlightStatus(flightId, date)
              │                 │
              │                 ├─ Unknown   → skip (not yet final)
              │                 │
              │                 ├─ OnTime    → pool.closePool()
              │                 │             pool.settleNotDelayed()
              │                 │                 └─► all premiums → RiskVault (yield)
              │                 │             riskVault.decreaseLocked(liability)
              │                 │             riskVault.processWithdrawalQueue()
              │                 │             OracleAggregator.deregisterFlight(...)
              │                 │
              │                 └─ Delayed / Cancelled
              │                               → riskVault.sendPayout(pool, totalPayout)
              │                                 riskVault.decreaseLocked(liability)
              │                                 pool.closePool()
              │                                 pool.settleDelayed(claimExpiryWindow)
              │                                     └─► pool marked claimable
              │                                         claimExpiry = now + claimExpiryWindow
              │                                 riskVault.processWithdrawalQueue()
              │                                 OracleAggregator.deregisterFlight(...)
              │                                 totalPayoutsDistributed += totalPayout
              │
              └─► evmClient.write(RiskVault.snapshot())
                      └─► no-op if already snapshotted within 24 hours
```

Each capability call (HTTP, EVM read, EVM write) runs independently on every node in the
Workflow DON and is aggregated via BFT consensus. A failed HTTP call leaves the flight as
`Unknown` and it is retried automatically on the next tick.

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
                          Controller ◄─── CRE Workflow (onlyCREWorkflow)
                          │    │    │
              ┌───────────┘    │    └───────────┐
              ▼                ▼                ▼
         RiskVault       FlightPool(s)   OracleAggregator ◄─── CRE Workflow
                               │                               (authorizedOracle)
                               ▼
                          RecoveryPool

CRE Workflow DON ──────────────────────────────► AeroAPI
     (HTTP capability)
```

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
        → Controller address set via one-time setter post-deployment
        → CRE workflow address set as authorizedOracle via one-time setter post-deployment

4. RiskVault
        needs: USDC address, Controller address
        → deploy with a zero address placeholder for Controller
        → wire real Controller address via one-time setter post-deployment

5. Controller
        needs: GovernanceModule, RiskVault, OracleAggregator, RecoveryPool, USDC addresses
               minimumSolvencyRatio, minimumLeadTime, claimExpiryWindow
        Note: creWorkflowAddress is NOT required at construction —
              set post-workflow-deployment via setCreWorkflow()

6. Post-deployment wiring (Solidity contracts)
        OracleAggregator.setController(controller)      ← one-time, locks forever
        RiskVault.setController(controller)             ← one-time, locks forever

7. CRE workflow deployment
        Build TypeScript workflow with CRE SDK
        Simulate locally: cre workflow simulate
        Deploy to DON: cre workflow deploy ./dist/workflow.wasm
        Activate: cre workflow activate <workflow-id>
        Read the workflow's forwarder/signer address: cre workflow info <workflow-id>

8. Wire CRE workflow address into Solidity contracts
        OracleAggregator.setOracle(creWorkflowAddress)  ← one-time, locks forever
        Controller.setCreWorkflow(creWorkflowAddress)    ← owner only, updatable
```

**RiskVault / Controller circular dependency:** RiskVault needs the Controller address to
enforce `onlyController`, and the Controller needs the RiskVault address. Deploy RiskVault
first with a zero address placeholder, deploy the Controller, then call
`RiskVault.setController(controller)` as a one-time post-deployment setter.

---

## Access Control

| Modifier | Enforced On | Meaning |
|---|---|---|
| `onlyOwner` | GovernanceModule | Manage admin whitelist |
| `onlyOwnerOrAdmin` | GovernanceModule | `approveRoute`, `disableRoute`, `updateRouteTerms` |
| `onlyOwner` | Controller | Update config values, `setCreWorkflow`, `setGovernanceModule` |
| `onlyCREWorkflow` | Controller | `checkAndSettle()` — only callable by the registered CRE workflow address |
| `onlyController` | RiskVault, FlightPool | All capital-moving and state-changing functions |
| `onlyOwner` | RecoveryPool | Withdraw recovered funds |
| `authorizedOracle` (CRE workflow) | OracleAggregator | `updateFlightStatus` |
| `authorizedController` | OracleAggregator | `registerFlight`, `deregisterFlight` |

The `authorizedController` and `authorizedOracle` addresses in OracleAggregator are set
once after deployment and can never be changed.

`creWorkflowAddress` on the Controller is owner-updatable to allow recovery if the
workflow is redeployed with a new address. Use a multisig for the owner role in production.

---

## Frontend Query Reference

| What | Where | Function |
|---|---|---|
| All approved routes with premium and payoff | GovernanceModule | `getApprovedRoutes()` |
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
| Claim expiry timestamp | FlightPool | `claimExpiry()` |
| Total vault TVL | RiskVault | `totalManagedAssets()` |
| Locked vs free capital | RiskVault | `lockedCapital()`, `freeCapital()` |
| Current share price | RiskVault | `totalManagedAssets() / totalShares()` |
| Share price history (for APY) | RiskVault | `getPriceSnapshot(index)`, `priceHistoryLength()` |
| Underwriter's uncollected balance | RiskVault | `claimableBalance(address)` |
| Immediate vs locked redemption value | RiskVault | `previewRedeem(shares)`, `previewRedeemFree(shares)` |

There is no `lastUpkeepTimestamp` on the Controller. The CRE platform's own execution logs
are the source of truth for when the last settlement tick ran.

---

## Withdrawal Queue

When a RiskVault withdrawal would breach `lockedCapital`, the request is queued:

```
Underwriter calls riskVault.withdraw(shares)
    │
    ├─ free capital sufficient  → shares burned immediately
    │                             claimableBalance[underwriter] += usdcAmount
    │                             underwriter calls collect() to receive USDC
    │
    └─ free capital insufficient → request appended to queue (address, shares, timestamp)
                                   shares marked as reserved (cannot be double-queued)
                                   emits WithdrawQueued(address, shares, queueIndex)

After each flight settlement:
    Controller → riskVault.processWithdrawalQueue()
        └─► starts from queueHead (never re-scans from index 0)
            drains FIFO until capital is exhausted or queue is empty
            for each fulfilled entry:
                shares burned, claimableBalance[underwriter] += usdcAmount
                queueHead advances
            underwriter then calls collect() to receive their USDC
```

Underwriters can cancel a pending queued request at any time with `cancelWithdrawal(queueIndex)`.
Only one pending request per address is allowed at a time. Credited `claimableBalance` is
fixed USDC — it does not earn further yield while sitting uncollected.

---

## Key Design Principles

**Separation of custody and orchestration.** The Controller orchestrates but holds no funds.
USDC sits only in RiskVault (underwriter capital) or FlightPool (traveler premiums).

**Governance is modular.** The GovernanceModule is a standalone contract with a clean
interface. The Controller depends on it via two view calls only. It can be replaced with
a multisig, DAO, or any other mechanism by updating a single address.

**Terms are set by the route, not the traveler.** Premium and payoff are defined once
at route approval time. The traveler simply buys — they do not negotiate or pass in values.

**Term updates are forward-only.** Updating a route's terms via `updateRouteTerms()` only
affects pools deployed after the update. All existing pools retain the terms they were
deployed with, protecting travelers who have already bought in.

**Pools are created on demand.** FlightPools are deployed lazily on first purchase for a
route+date. No per-date admin action is required — approving a route opens it to all future dates.

**Route disabling is non-destructive.** Disabling a route only blocks new purchases.
Existing pools for that route continue to operate and settle normally.

**Capital is fungible across flights.** All underwriters share one RiskVault, so capital
backs multiple flights simultaneously. `lockedCapital` tracks aggregate exposure.

**Everything is pull-based.** Travelers call `claim()`. Underwriters call `collect()`.
This eliminates reentrancy risk from push transfers and gives users control over when
they receive funds.

**Expired claims go to recovery, not back to the vault.** Unclaimed payouts after expiry
are swept to the RecoveryPool rather than returned to underwriters, keeping the protocol's
obligations visible and auditable.

**Self-healing withdrawal queue.** Queue processing is triggered by settlement, not by a
separate cron job. Capital release and queue crediting are atomic within the same transaction.

**CRE workflow is the sole oracle writer.** The workflow's forwarder address is the only
address authorised to push status updates to OracleAggregator. Enforced at contract level.

---

## Implementation Notes

### `onlyCREWorkflow` — Controller

The Controller has a single `creWorkflowAddress` state variable and an `onlyCREWorkflow`
modifier that gates `checkAndSettle()`. This is the entirety of the Chainlink-facing
interface in Solidity — no upkeep registration, no forwarder wiring, no callback contract.

`_checkAndSettle()` does not request oracle data for `Unknown` flights — it simply skips
them. The CRE workflow is responsible for writing statuses before calling the Controller.
The Controller only ever acts on flights that have reached a final status.

### `authorizedOracle` Is the CRE Workflow Address

No code change is required in OracleAggregator. The address stored in `authorizedOracle`
is set to the CRE workflow's forwarder/signer address via the existing one-time `setOracle()`
setter. The append-only status guard and all access control remain unchanged.

### `sendPayout` Before `decreaseLocked` — Controller

In `_settleDelayed`, `sendPayout` is called before `decreaseLocked`. This ensures the
vault balance decreases before the locked counter is reduced, keeping `freeCapital`
conservative at every point in execution. Reversing the order would create a window where
`freeCapital` appears artificially high.

### `queueHead` Pointer — RiskVault

The withdrawal queue is a plain append-only array. `queueHead` tracks the index of the
first entry not yet processed. The processor starts from `queueHead` on every call and
advances it past fulfilled or cancelled entries. This bounds cost to entries processed in
that call rather than the full lifetime length of the queue.

### `totalManagedAssets` — Share Price Integrity

All share price calculations use an internal `totalManagedAssets` counter rather than
`balanceOf(address(this))`. This prevents share price inflation via direct USDC transfers
(the classic ERC4626 inflation attack). `totalManagedAssets` moves at exactly four points:

| Event | Change |
|---|---|
| `deposit()` | `+= amount` |
| `recordPremiumIncome()` — premiums forwarded from on-time FlightPool | `+= amount` |
| `sendPayout()` — USDC sent to a delayed FlightPool | `-= amount` |
| `collect()` — underwriter collects credited balance | `-= amount` |

`balanceSanityCheck()` returns `usdc.balanceOf(address(this)) - totalManagedAssets` —
should always be zero in normal operation.

### FlightRecord Caching — Controller

`flightId` and `flightDate` are cached in the `FlightRecord` struct in the Controller's
own storage when the pool is first created. The settlement loop reads from local storage
instead of making external calls to each FlightPool, saving gas per tick.

### `PayoutFailed` Event — FlightPool

Per-buyer transfers in `settleDelayed` are intentionally non-reverting. A
`PayoutFailed(address indexed buyer, uint256 amount)` event is emitted when a transfer
fails, giving operators full visibility into which buyers need manual recovery.

### Share Price Snapshots — RiskVault

A `priceHistory` array stores daily snapshots (`timestamp`, `pricePerShare` scaled to 6
decimals). A snapshot is written at most once per 24 hours via `_maybeSnapshot()`. The CRE
workflow calls `RiskVault.snapshot()` at the end of every tick, ensuring snapshots are
captured even on days with no flight settlements.

The frontend reads `priceHistoryLength()` and `getPriceSnapshot(index)`, binary searches
for the snapshot nearest to 7 or 30 days ago, and computes the annualised return. Storage
growth is bounded at ~365 entries per year.

---

## Known Limitations

| Issue | Detail |
|---|---|
| **CRE Early Access** | CRE workflow deployment is in Early Access. The platform is live and in institutional use, but the developer SDK and deployment process may change. Monitor CRE release notes before deploying to mainnet. |
| **Single oracle trust** | The system trusts the CRE workflow as the sole oracle writer. CRE runs on a decentralised DON with BFT consensus across nodes, but the workflow source code itself is controlled by the deployer. |
| **AeroAPI availability** | If AeroAPI is unreachable for an extended period, flights stay `Unknown` and do not settle. No manual intervention needed — the workflow retries every tick automatically. |
| **Uncollected underwriter balances** | Credited `claimableBalance` sits in the RiskVault indefinitely. There is no expiry, unlike traveler claims. Consider a similar expiry for production. |
| **Correlated event risk** | If many insured flights are delayed simultaneously, the vault bears the full correlated loss. `minimumSolvencyRatio` at 100% ensures solvency but underwriters absorb that risk. |
| **No per-underwriter attribution** | Locked capital is a pool-level aggregate. All underwriters share risk and yield proportionally through share price. |
| **Direct USDC transfers** | Mitigated by `totalManagedAssets`. Drift from any out-of-band transfer is observable via `balanceSanityCheck()` but does not affect accounting. |
| **Snapshot gaps** | If the CRE workflow is paused for over 24 hours, that day's snapshot is missed. Resume the workflow to resume snapshots. |
| **`creWorkflowAddress` mutability** | `setCreWorkflow()` is owner-updatable to allow recovery on workflow redeploy. A compromised owner key could redirect the oracle writer. Use a multisig for the owner role in production. |