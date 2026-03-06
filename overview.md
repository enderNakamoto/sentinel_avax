# Flight Delay Insurance Protocol — Overview

---

## What It Is

A fully on-chain, parametric flight delay insurance protocol. Travelers pay a fixed USDC
premium to insure a specific flight. If the flight is delayed or cancelled, they receive
a fixed USDC payout — automatically, with no claim forms, no manual review, and no adjuster.

Capital to back payouts is provided by underwriters who deposit USDC into a shared vault
and earn yield from premiums on flights that land on time.

The entire system — settlement, payout eligibility, capital management — runs autonomously
on-chain once deployed. Automation and oracle data are provided by Chainlink.

---

## Participants

| Participant | Role |
|---|---|
| **Traveler** | Buys insurance for a specific flight by paying a fixed USDC premium. Claims their payoff directly from the FlightPool if the flight is delayed or cancelled. |
| **Underwriter** | Deposits USDC into the RiskVault to back insurance policies. Earns yield as premiums from on-time flights accumulate. Withdraws by redeeming shares. |
| **Owner / Admin** | Approves and manages insurable flight routes via the GovernanceModule. Sets premium and payoff terms per route. No access to user funds. |
| **Chainlink Automation** | Calls `Controller.checkAndSettle()` every 10 minutes to process flight settlements. Replaces any manual keeper or cron job. |
| **Chainlink Functions** | Fetches real-world flight status from external APIs and delivers the result on-chain into the OracleAggregator. Replaces a centralised oracle service. |

---

## How It Works

**Underwriters** deposit USDC into the RiskVault and receive shares. Share price rises as
premiums from on-time flights accumulate. Capital is locked as collateral for active
policies and released when flights settle.

**Travelers** approve the Controller for their premium, then call `buyInsurance()`. The
Controller checks the route is approved, reads the terms from the GovernanceModule, deploys
a FlightPool if one does not yet exist for that flight+date, and locks the payoff as
collateral in the vault. One transaction. No other action needed from the traveler.

**Chainlink Automation** calls `checkAndSettle()` every 10 minutes. For each active flight,
the Controller reads the status from the OracleAggregator. If a final status has arrived,
the flight is settled — premiums forwarded to the vault if on time, payout funded from the
vault if delayed. The keeper also triggers share price snapshots for APY tracking.

**Chainlink Functions** is triggered during the settlement loop for any flight still showing
`Unknown` status. A JavaScript source fetches the flight status from an external API, and
the result is delivered back on-chain to the OracleAggregator via the FunctionsConsumer
callback. No persistent off-chain service or private key is required.

**Travelers** claim their payout by calling `claim()` on the FlightPool. Unclaimed payouts
expire after 60 days and are swept to a RecoveryPool. **Underwriters** collect fulfilled
withdrawals by calling `collect()` on the RiskVault. Both flows are fully pull-based.

---

## Contracts

| Contract | Purpose |
|---|---|
| **GovernanceModule** | Approves and manages insurable routes. Sets fixed premium and payoff per route. Manages admin whitelist. |
| **RiskVault** | Holds all underwriter USDC. Issues shares. Manages locked capital, withdrawal queue, and share price history. |
| **FlightPool** | One per flight+date. Holds traveler premiums. Settles on-time (forwards to vault) or delayed (holds for claims). Deployed lazily on first purchase. |
| **Controller** | System orchestrator. Validates routes, deploys pools, enforces solvency, runs settlement loop, maintains aggregate stats. Holds no funds. |
| **OracleAggregator** | On-chain registry of flight statuses. Receives updates from FunctionsConsumer. Read by Controller during settlement. |
| **FunctionsConsumer** | Chainlink Functions client. Requests flight data from external APIs, receives the callback, writes status to OracleAggregator. |
| **RecoveryPool** | Holds expired unclaimed traveler payouts for manual resolution by the owner. |

---

## How Chainlink Is Used

**Chainlink Automation** powers the settlement loop. The Controller implements
`AutomationCompatibleInterface`. Chainlink nodes call `checkUpkeep()` on each tick and
execute `performUpkeep()` (which calls `checkAndSettle()`) when upkeep is needed.
The upkeep is registered in the Chainlink Automation registry and funded with LINK.

**Chainlink Functions** powers the oracle. During the settlement loop, for any flight
with `Unknown` status, the Controller calls `FunctionsConsumer.requestFlightStatus()`.
Chainlink nodes execute a JavaScript source that fetches from flight APIs and deliver
the result back via `fulfillRequest()`, which writes the status to OracleAggregator.
The FunctionsConsumer contract is funded with LINK for request costs.

---

## Key Properties

- **Fully collateralised.** The vault always holds enough USDC to cover 100% of simultaneous
  worst-case payouts. New purchases are blocked if this invariant would be breached.
- **Pull-based payments.** No funds are pushed automatically. Travelers claim, underwriters collect.
- **Immutable pool terms.** Premium and payoff are locked at FlightPool deployment. Route term
  updates only affect future pools.
- **Modular governance.** The GovernanceModule can be replaced with a multisig or DAO without
  touching any other contract.
- **No centralised operator.** Automation and oracle data are provided by Chainlink — there is
  no server, cron job, or private key that the protocol depends on in production.