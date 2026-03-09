# Sentinel Protocol

A fully on-chain, parametric flight delay insurance protocol on Avalanche C-Chain.

Travelers pay a fixed USDC premium to insure a specific flight. If the flight is delayed or cancelled, they receive a fixed USDC payout — automatically, with no claim forms and no manual review. Capital is provided by underwriters who deposit USDC into a shared vault and earn yield from premiums on flights that land on time.

The production design is fully autonomous via a single [Chainlink CRE](specs/integrations/chainlink_integration.md) workflow on a decentralised oracle network. For local development and hackathon demos you can also run a **centralized TypeScript cron** that mimics CRE and calls the same contracts.

> **CRE Early Access:** CRE workflow deployment is currently in Early Access. The platform is live and in institutional use, but the developer-facing SDK and tooling are still evolving.

---

## Quick links

- **Live demo (Vercel)**: https://your-vercel-deployment-url.vercel.app
- **Deploy contracts & CRE workflow**: [deploy.md](deploy.md)
- **Run tests & simulations**: [testing.md](testing.md)
- **Centralized cron (CRE simulation)**: [`centralized_cron/README.md`](centralized_cron/README.md)
- **Contract architecture & data flows**: [specs/architecture.md](specs/architecture.md)
- **Chainlink integration details**: [specs/integrations/chainlink_integration.md](specs/integrations/chainlink_integration.md)
- **Build phases & progress**: [specs/progress.md](specs/progress.md)

---

## Contracts on Avalanche Fuji (verified)

All six contracts are deployed and verified on Avalanche Fuji (43113) as of 2026-03-09:

| Contract | Address | Explorer |
|---|---|---|
| MockUSDC | `0x18975871ab7E57e0f26fdF429592238541051Fb0` | [view ↗](https://testnet.snowscan.xyz/address/0x18975871ab7e57e0f26fdf429592238541051fb0) |
| GovernanceModule | `0x30CCF5C0Ea4F871398136DD643A0544Aba39b26D` | [view ↗](https://testnet.snowscan.xyz/address/0x30ccf5c0ea4f871398136dd643a0544aba39b26d) |
| RecoveryPool | `0x981BeeCd15b05A35206cfc44af12373B45613E71` | [view ↗](https://testnet.snowscan.xyz/address/0x981beecd15b05a35206cfc44af12373b45613e71) |
| OracleAggregator | `0x14cF0CD23B5A444f1e57765d12f21ee7F1e8a2c3` | [view ↗](https://testnet.snowscan.xyz/address/0x14cf0cd23b5a444f1e57765d12f21ee7f1e8a2c3) |
| RiskVault | `0x3E65cABB59773a7D21132dAAa587E7Fc777d427C` | [view ↗](https://testnet.snowscan.xyz/address/0x3e65cabb59773a7d21132daaa587e7fc777d427c) |
| Controller | `0xd67c1b05Cdfa20aa23C295a2c24310763fED4888` | [view ↗](https://testnet.snowscan.xyz/address/0xd67c1b05cdfa20aa23c295a2c24310763fed4888) |

Deployment details and verification commands: [deploy.md](deploy.md).

---

## Participants

| Participant | Role |
|---|---|
| **Traveler** | Pays a fixed USDC premium, calls `claim()` on `FlightPool` for a payout if delayed |
| **Underwriter** | Deposits USDC into `RiskVault`, earns yield from on-time flight premiums, redeems shares to withdraw |
| **Owner / Admin** | Approves insurable routes via `GovernanceModule`, sets premium and payoff terms per route |
| **Settlement workflow** | Every 10 min, fetches flight status from AeroAPI, writes `OracleAggregator`, calls `Controller.checkAndSettle()` |

---

## Core contracts

| Contract | Purpose |
|---|---|
| **GovernanceModule** | Route approval, premium/payoff terms, admin whitelist |
| **RiskVault** | Underwriter USDC pool — shares, locked capital, FIFO withdrawal queue, share price history |
| **FlightPool** | One per flight+date, lazily deployed — holds traveler premiums, settles on-time or delayed/cancelled |
| **Controller** | Orchestrator — validates routes, deploys pools, enforces solvency, runs settlement loop |
| **OracleAggregator** | On-chain flight status registry — written by the workflow, read by `Controller` |
| **RecoveryPool** | Holds expired unclaimed traveler payouts for manual resolution |

Full contract design, data flows, and access control: [specs/architecture.md](specs/architecture.md).

---

## Chainlink integration

- **Primary path (production)**: a single [Chainlink CRE](specs/integrations/chainlink_integration.md) workflow:
  - Runs on a Workflow DON with a cron trigger (every 10 minutes).
  - Reads `OracleAggregator.getActiveFlights()`.
  - Calls FlightAware AeroAPI for flights with `Unknown` status.
  - Derives a final status (`OnTime`, `Delayed`, `Cancelled`) and calls `updateFlightStatus()` on `OracleAggregator`.
  - Calls `Controller.checkAndSettle()` followed by `RiskVault.snapshot()`.
- **Centralized simulation (development / hackathon)**:
  - `centralized_cron/` contains a small Node/TypeScript service that mirrors the CRE behavior:
    - Same contract calls: `getActiveFlights`, `updateFlightStatus`, `checkAndSettle`.
    - Uses a cron schedule and AeroAPI, but runs against a single EOA signer on Fuji.
  - See [`centralized_cron/README.md`](centralized_cron/README.md) for wiring and usage.

---

## Getting started

### 1. Run tests

Use [testing.md](testing.md) for full instructions:

- **Contracts**: Forge test suite (209 Solidity tests) from `contracts/`.
- **Workflow logic**: Jest tests for the AeroAPI parser in `cre/`.
- **Local CRE simulation**: Full end-to-end tick against an Anvil fork.

### 2. Deploy contracts to Fuji

Follow **Part 1 — Deploy Solidity Contracts** in [deploy.md](deploy.md):

- Configure `contracts/.env` with your Fuji RPC, deployer key, and Snowtrace API key.
- Run the Foundry deploy script to:
  - Deploy all six contracts.
  - Wire `OracleAggregator.setController(controller)` and `RiskVault.setController(controller)`.
- Update `.env` and `cre/src/config.ts` with deployed addresses.

### 3. Run the settlement workflow

You have two options that use the same on-chain interfaces:

- **Option A — Chainlink CRE (recommended for production)**  
  See **Part 2 — Deploy the CRE Workflow** and **Part 3 — Wire the CRE Workflow into the Contracts** in [deploy.md](deploy.md), plus [specs/integrations/chainlink_integration.md](specs/integrations/chainlink_integration.md) for design details.

- **Option B — Centralized cron (local / demo)**  
  Use [`centralized_cron/`](centralized_cron/README.md) to:
  - Configure a Fuji RPC, workflow EOA private key, AeroAPI key, and contract addresses.
  - Wire that EOA via `OracleAggregator.setOracle()` and `Controller.setCreWorkflow()`.
  - Run `npm run tick` for a single pass or `npm start` for a local cron that continuously settles flights.

### 4. Frontend

The `frontend/` directory contains a Next.js app (wagmi + RainbowKit) for wallet connection and, in later phases, dashboards for underwriters and travelers. See `frontend/README.md` and [specs/development_list.md](specs/development_list.md) for the planned UI flows.

---

## Tech stack

| Layer | Tech |
|---|---|
| Smart contracts | Solidity 0.8.20, Foundry |
| Oracle / automation | Chainlink CRE (TypeScript → WASM, Workflow DON) or centralized cron (dev only) |
| Flight data | FlightAware AeroAPI |
| Token | USDC (6 decimals) |
| Frontend | Next.js, wagmi, viem, Reown AppKit |
| Network | Avalanche C-Chain (Fuji testnet → mainnet) |

