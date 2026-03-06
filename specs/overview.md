# Flight Delay Insurance Protocol — Overview

---

## What It Is

A fully on-chain, parametric flight delay insurance protocol. Travelers pay a fixed USDC
premium to insure a specific flight. If the flight is delayed or cancelled, they receive
a fixed USDC payout — automatically, with no claim forms, no manual review, and no adjuster.

Capital to back payouts is provided by underwriters who deposit USDC into a shared vault
and earn yield from premiums on flights that land on time.

The entire system — settlement, payout eligibility, capital management — runs autonomously
once deployed. Scheduling, flight data fetching, and all on-chain writes are orchestrated
by a single Chainlink Runtime Environment (CRE) workflow running on a decentralised oracle
network. There is no centralised server, no cron job, and no private key required in
production.

> **CRE deployment note:** CRE workflow deployment is currently in Early Access. The
> platform is live and in production use by major institutions, but the developer-facing
> SDK and deployment tooling are still evolving. Monitor CRE release notes and plan for a
> testnet validation period before deploying with real capital.

---

## Participants

| Participant | Role |
|---|---|
| **Traveler** | Buys insurance for a specific flight by paying a fixed USDC premium. Calls `claim()` on the FlightPool to receive their payoff if the flight is delayed or cancelled. |
| **Underwriter** | Deposits USDC into the RiskVault to back insurance policies. Earns yield as premiums from on-time flights accumulate. Withdraws by redeeming shares. |
| **Owner / Admin** | Approves and manages insurable flight routes via the GovernanceModule. Sets fixed premium and payoff terms per route. Has no access to user funds. |
| **CRE Workflow** | A TypeScript workflow deployed to a Chainlink DON. Fires every 10 minutes via a native cron trigger. Reads active flights from OracleAggregator, fetches live status from AeroAPI, writes final statuses on-chain, calls `Controller.checkAndSettle()`, and calls `RiskVault.snapshot()`. Replaces both Chainlink Automation and Chainlink Functions in a single file. |

---

## How It Works

**Underwriters** approve the RiskVault for USDC and call `deposit(amount)`. The vault
issues shares proportional to their contribution. Share price rises as premiums from
on-time flights accumulate. Capital is locked as collateral for active policies and
released when flights settle. Withdrawals that exceed free capital are queued FIFO and
fulfilled automatically as flights settle.

**Travelers** check that their route is approved and the vault is solvent, approve the
Controller for their premium, then call `buyInsurance()`. The Controller validates the
route, reads terms from GovernanceModule, deploys a FlightPool lazily on the first purchase
for that flight+date, locks the payoff as collateral, and records the purchase. One
transaction — nothing else is required from the traveler.

**The CRE workflow** fires every 10 minutes. Each execution:

1. Reads the active flight list from OracleAggregator via the EVM read capability.
2. For each flight still showing `Unknown` status, fetches the current state from AeroAPI
   via the HTTP capability. The API key is a CRE native secret — never stored on-chain.
3. For flights that have reached a final state (OnTime, Delayed, or Cancelled), writes
   that status to OracleAggregator via the EVM write capability.
4. Calls `Controller.checkAndSettle()`. The Controller reads the now-updated statuses
   and settles any mature FlightPools.
5. Calls `RiskVault.snapshot()` to record a daily share price entry if due.

Every step — HTTP fetch, EVM read, and every EVM write — is independently executed by
each node in the Workflow DON and verified by BFT consensus before the result is used.

**Travelers** collect payouts by calling `claim()` on the FlightPool. Unclaimed payouts
expire after a configurable window (default 60 days) and are swept to a RecoveryPool for
manual resolution. **Underwriters** collect fulfilled withdrawals by calling `collect()`
on the RiskVault. Both flows are fully pull-based.

---

## Contracts

| Contract | Purpose |
|---|---|
| **GovernanceModule** | Approves and manages insurable routes. Sets fixed premium and payoff per route. Manages an admin whitelist. |
| **RiskVault** | Holds all underwriter USDC. Issues and redeems shares. Manages locked capital, a FIFO withdrawal queue, and share price history. |
| **FlightPool** | One per flight+date. Holds traveler premiums. Deployed lazily on first purchase. Settles on-time (forwards premiums to vault) or delayed (holds payoff for traveler claims). |
| **Controller** | System orchestrator. Validates routes, deploys pools, enforces solvency, runs the settlement loop. Calls are gated by `onlyCREWorkflow`. Never holds funds. |
| **OracleAggregator** | On-chain registry of flight statuses. Receives status updates from the CRE workflow. Read by Controller during settlement. |
| **RecoveryPool** | Holds expired unclaimed traveler payouts for manual resolution by the owner. |

There is no `FunctionsConsumer` contract. The CRE workflow writes status updates directly
to OracleAggregator — no intermediate on-chain oracle contract is needed.

---

## How CRE Is Used

The CRE workflow is written in TypeScript using the CRE SDK, compiled to WebAssembly, and
deployed to a Workflow DON via the CRE CLI. Four capabilities compose in a single file to
replace everything that previously required two separate Chainlink products.

**Cron trigger** fires the workflow every 10 minutes. The DON's native scheduler manages
timing. The Controller has no `AutomationCompatibleInterface`, no `checkUpkeep`, no
`performUpkeep`, no `lastUpkeepTimestamp`, and no forwarder registration.

**EVM read capability** reads `getActiveFlights()` from OracleAggregator at the start of
each tick to retrieve the list of flights that need status checks.

**HTTP capability** fetches flight status from AeroAPI for each `Unknown` flight. The API
key is a CRE native secret — no upload script, no slot ID, no expiry rotation. Each DON
node fetches independently; results are aggregated by BFT consensus before any write proceeds.

**EVM write capability** calls `OracleAggregator.updateFlightStatus()` for each flight
that has reached a final state, then calls `Controller.checkAndSettle()`, then calls
`RiskVault.snapshot()`. The workflow's registered DON address is set as `authorizedOracle`
on OracleAggregator and as `creWorkflowAddress` on the Controller.

---

## Key Properties

- **Fully collateralised.** The vault always holds enough USDC to cover 100% of simultaneous
  worst-case payouts. New purchases are blocked if this invariant would be breached.
- **Pull-based payments.** No funds are pushed automatically. Travelers call `claim()`.
  Underwriters call `collect()`.
- **Immutable pool terms.** Premium and payoff are fixed at FlightPool deployment. Route
  term updates only affect future pools — existing buyers are never retroactively affected.
- **Modular governance.** GovernanceModule can be replaced with a multisig or DAO without
  touching any other contract.
- **No centralised operator.** Scheduling, data fetching, and on-chain writes are handled
  entirely by the CRE workflow on a decentralised oracle network.
- **Single workflow, no boilerplate.** One TypeScript file replaces `FunctionsConsumer.sol`,
  Automation upkeep registration, forwarder wiring, the embedded JS source string, the
  Functions subscription, and the DON-hosted secrets upload script.
- **BFT consensus on every operation.** Every HTTP fetch and every EVM interaction inside
  the CRE workflow is independently executed by each DON node and verified before the
  result is used.