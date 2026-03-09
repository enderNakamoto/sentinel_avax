# Sentinel Protocol

A fully on-chain, parametric flight delay insurance protocol on Avalanche C-Chain.

Travelers pay a fixed USDC premium to insure a specific flight. If the flight is delayed or cancelled, they receive a fixed USDC payout — automatically, with no claim forms and no manual review. Capital is provided by underwriters who deposit USDC into a shared vault and earn yield from premiums on flights that land on time.

The entire system runs autonomously via a single [Chainlink CRE](specs/integrations/chainlink_integration.md) workflow deployed to a decentralised oracle network. There is no centralised server, no cron job, and no private key required in production.

> **CRE Early Access:** CRE workflow deployment is currently in Early Access. The platform is live and in institutional use, but the developer-facing SDK and tooling are still evolving.

---
## Overview 

![alt text](image.png)


## Participants

| Participant | Role |
|---|---|
| **Traveler** | Pays a fixed USDC premium, calls `claim()` on FlightPool for a payout if delayed |
| **Underwriter** | Deposits USDC into RiskVault, earns yield from on-time flight premiums, redeems shares to withdraw |
| **Owner / Admin** | Approves insurable routes via GovernanceModule, sets premium and payoff terms per route |
| **CRE Workflow** | Fires every 10 min, fetches flight status from AeroAPI, writes OracleAggregator, calls `checkAndSettle()` |

---

## Contracts

| Contract | Purpose |
|---|---|
| **GovernanceModule** | Route approval, premium/payoff terms, admin whitelist |
| **RiskVault** | Underwriter USDC pool — shares, locked capital, FIFO withdrawal queue, share price history |
| **FlightPool** | One per flight+date, lazily deployed — holds traveler premiums, settles on-time or delayed |
| **Controller** | Orchestrator — validates routes, deploys pools, enforces solvency, runs settlement loop |
| **OracleAggregator** | On-chain flight status registry — written by CRE workflow, read by Controller |
| **RecoveryPool** | Holds expired unclaimed traveler payouts for manual resolution |

Full contract design, data flows, and access control: [specs/architecture.md](specs/architecture.md)

Chainlink CRE workflow design and deployment: [specs/integrations/chainlink_integration.md](specs/integrations/chainlink_integration.md)

---

## Key Properties

- **Fully collateralised** — vault always holds 100% of worst-case simultaneous payouts
- **Pull-based** — travelers call `claim()`, underwriters call `collect()`
- **Immutable pool terms** — existing buyers never retroactively affected by route term updates
- **No centralised operator** — CRE workflow on a decentralised DON handles all scheduling, fetching, and writes
- **Single workflow** — one TypeScript file replaces FunctionsConsumer, Automation upkeep, forwarder wiring, and DON secrets upload

---

## File Structure

```
sentinel_protocol_avax/
│
├── contracts/                    # Solidity — Foundry project root
│   ├── src/                      # Contract source files (phases 1–7)
│   ├── test/                     # Forge tests (phases 1–8)
│   ├── script/
│   │   └── Deploy.s.sol          # Deployment script (phase 12)
│   ├── lib/
│   │   ├── forge-std/
│   │   └── openzeppelin-contracts/
│   ├── foundry.toml              # Avalanche config, OZ remapping, Routescan verifier
│   └── .env.example              # Env var template
│
├── frontend/                     # Next.js frontend (phase 13–14)
│   └── README.md                 # Placeholder — scaffolded in phase 13
│
├── specs/
│   ├── architecture.md           # Detailed contract architecture and data flows
│   ├── development_list.md       # Phase-by-phase build checklist
│   ├── progress.md               # Current phase and status dashboard
│   ├── workflow.md               # Dev workflow reference (/plan-phase, /start-phase, etc.)
│   ├── integrations/
│   │   └── chainlink_integration.md  # CRE workflow design and deployment
│   └── phases/                   # Per-phase plan and work log files
│
└── docs/
    ├── aero_api.md               # AeroAPI (FlightAware) reference
    ├── avalanche.md              # Avalanche C-Chain deployment and verification reference
    └── chainlink-cre.md          # Chainlink CRE platform reference
```

---

## Tech Stack

| Layer | Tech |
|---|---|
| Smart contracts | Solidity 0.8.20, Foundry |
| Oracle / automation | Chainlink CRE (TypeScript → WASM, deployed to Workflow DON) |
| Flight data | FlightAware AeroAPI |
| Token | USDC (6 decimals) |
| Frontend | Next.js, wagmi, viem, Reown AppKit |
| Network | Avalanche C-Chain (Fuji testnet → mainnet) |

---

## Build Progress

See [specs/progress.md](specs/progress.md) for current phase and status.

| Phase | Name |
|---|---|
| 0 | Foundry Project Init |
| 1–7 | Contracts (MockUSDC → Controller) |
| 8 | Integration Tests |
| 9–11 | CRE Workflow (Mock → AeroAPI) |
| 12 | Testnet Deployment |
| 13–14 | Frontend |
| 15 | Mainnet |
