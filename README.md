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

### Deployed Contracts — Avalanche Fuji Testnet

All six contracts deployed and verified on 2026-03-09.

| Contract | Address | Explorer |
|---|---|---|
| MockUSDC | `0x18975871ab7E57e0f26fdF429592238541051Fb0` | [view ↗](https://testnet.snowscan.xyz/address/0x18975871ab7e57e0f26fdf429592238541051fb0) |
| GovernanceModule | `0x30CCF5C0Ea4F871398136DD643A0544Aba39b26D` | [view ↗](https://testnet.snowscan.xyz/address/0x30ccf5c0ea4f871398136dd643a0544aba39b26d) |
| RecoveryPool | `0x981BeeCd15b05A35206cfc44af12373B45613E71` | [view ↗](https://testnet.snowscan.xyz/address/0x981beecd15b05a35206cfc44af12373b45613e71) |
| OracleAggregator | `0x14cF0CD23B5A444f1e57765d12f21ee7F1e8a2c3` | [view ↗](https://testnet.snowscan.xyz/address/0x14cf0cd23b5a444f1e57765d12f21ee7f1e8a2c3) |
| RiskVault | `0x3E65cABB59773a7D21132dAAa587E7Fc777d427C` | [view ↗](https://testnet.snowscan.xyz/address/0x3e65cabb59773a7d21132daaa587e7fc777d427c) |
| Controller | `0xd67c1b05Cdfa20aa23C295a2c24310763fED4888` | [view ↗](https://testnet.snowscan.xyz/address/0xd67c1b05cdfa20aa23c295a2c24310763fed4888) |

---

## Key Properties

- **Fully collateralised** — vault always holds 100% of worst-case simultaneous payouts
- **Pull-based** — travelers call `claim()`, underwriters call `collect()`
- **Immutable pool terms** — existing buyers never retroactively affected by route term updates
- **No centralised operator** — CRE workflow on a decentralised DON handles all scheduling, fetching, and writes
- **Single workflow** — one TypeScript file replaces FunctionsConsumer, Automation upkeep, forwarder wiring, and DON secrets upload

---

## Testing

See [testing.md](testing.md) for:
- Forge test suite (209 Solidity tests)
- CRE workflow unit tests (Jest, 10 AeroAPI parser tests)
- Full local simulation against an Anvil fork

---

## Deployment & Installation

See [deploy.md](deploy.md) for step-by-step instructions covering:
- Deploying all 6 contracts to Fuji with verification
- Installing and authenticating the CRE CLI
- Building and deploying the workflow to the DON
- Wiring the CRE forwarder address into the contracts

---

## File Structure

```
sentinel_protocol_avax/
│
├── contracts/                    # Solidity — Foundry project root
│   ├── src/                      # Contract source files (phases 1–7)
│   ├── test/                     # Forge tests (phases 1–8)
│   ├── script/
│   │   ├── Deploy.s.sol          # Deploy all 6 contracts + Solidity wiring
│   │   └── WireCRE.s.sol         # Post-CRE wiring (setOracle + setCreWorkflow)
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
