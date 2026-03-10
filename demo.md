# Sentinel Protocol — Demo Playbook

Three stages: verify everything is green locally, run a real flight end-to-end through the centralized cron against Fuji testnet, then arm the system with the real Chainlink CRE workflow and watch a series of flights settle autonomously.

The frontend handles all user-facing actions (deposit, buy insurance, claim, collect). The only `cast` commands are one-time admin setup tasks that the UI doesn't expose (minting MockUSDC, approving routes, wiring the workflow address) — these mirror what a deployer would do before opening the app to users.

**Frontend (live on Vercel):** https://sentinel-avax-7e2l-cbgo86fxd-enders-projects.vercel.app/

---

## Environment setup

All `cast` commands in this playbook read from `contracts/.env`. Load it once at the start of each terminal session:

```bash
# From project root
set -a; source contracts/.env; set +a
```

`set -a` exports every variable so `cast` subprocesses can read them. Run this again if you open a new terminal tab.

### contracts/.env — current Fuji values

```
PRIVATE_KEY=0x...                    # deployer private key
AVAX_FUJI_RPC=https://api.avax-test.network/ext/bc/C/rpc

MOCK_USDC_ADDRESS=0x18975871ab7E57e0f26fdF429592238541051Fb0
GOVERNANCE_ADDRESS=0x30CCF5C0Ea4F871398136DD643A0544Aba39b26D
ORACLE_AGGREGATOR_ADDRESS=0x14cF0CD23B5A444f1e57765d12f21ee7F1e8a2c3
RISK_VAULT_ADDRESS=0x3E65cABB59773a7D21132dAAa587E7Fc777d427C
CONTROLLER_ADDRESS=0xd67c1b05Cdfa20aa23C295a2c24310763fED4888

WORKFLOW_SIGNER_ADDRESS=0x...        # fill in before Stage 2 (see step 2b)
```

---

## Stage 1 — Test Suite Green

Verify all tests pass locally before touching testnet. Run the three suites in parallel.

### 1a. Solidity contracts (Forge)

```bash
cd contracts
forge build
forge test --gas-report
```

Expected: **209 tests pass** across MockUSDC, RecoveryPool, GovernanceModule, RiskVault, OracleAggregator, FlightPool, Controller, Integration.

Look for: `Test result: ok. 209 passed; 0 failed; 0 skipped`

### 1b. CRE workflow unit tests (Jest)

```bash
cd cre
npm install   # first time only
npm test
```

Expected: **10 tests pass** — all AeroAPI response fixtures (ontime-landed, delayed-landed, cancelled-weather, cancelled-mechanical, cancelled-unknown, inflight-ontime, inflight-delayed, landed-fallback-runway, empty).

These run against `mock_aero_api/` fixtures — no network connection required.

### 1c. TypeScript build check

```bash
cd frontend
npm run build

cd ../centralized_cron
npm install && npx tsc --noEmit
```

Expected: Next.js builds clean (5 static routes generated), no TypeScript errors in centralized_cron.

**Checkpoint:** All three pass → move to Stage 2.

---

## Stage 2 — Live Flight Through Centralized Cron

Run a complete end-to-end cycle on Fuji testnet using the centralized cron as the settlement engine. This exercises the full on-chain state machine with a real AeroAPI flight.

Admin setup is done via `cast` (mint USDC, approve route, wire EOA). Everything the user sees — depositing into the vault, buying insurance, claiming a payout — is done through the frontend.

### Prerequisites

- `contracts/.env` filled (all addresses present, `PRIVATE_KEY` set)
- `centralized_cron/.env` configured (see step 2i below)
- Deployer and workflow signer wallets funded with Fuji AVAX — [core.app/tools/testnet-faucet](https://core.app/tools/testnet-faucet)
- AeroAPI key active
- Wallet connected to MetaMask / any injected wallet, pointed at **Avalanche Fuji (chain ID 43113)**

### Admin setup (cast — one-time)

Load the env if you haven't already:

```bash
set -a; source contracts/.env; set +a
```

#### 2a. Pick a real flight with a known outcome

Find a flight that **already landed or was cancelled today** — AeroAPI returns a final status immediately for completed flights so you don't have to wait for the demo.

Check [flightaware.com](https://flightaware.com) for a major hub route flown earlier today (e.g. `AA1` JFK→LAX, `UA200` ORD→LAX, `DL400` ATL→LAX). Note the **IATA flight ID** and **departure date** in `YYYY-MM-DD` format.

#### 2b. Pick a workflow signer wallet and fill WORKFLOW_SIGNER_ADDRESS

Choose a wallet to act as the "workflow signer" for the cron and fund it with Fuji AVAX. Add its address to `contracts/.env`:

```
WORKFLOW_SIGNER_ADDRESS=0x<address of the workflow signer wallet>
```

The matching private key goes in `centralized_cron/.env` as `WORKFLOW_PRIVATE_KEY`.

Re-source the env after editing:

```bash
set -a; source contracts/.env; set +a
```

#### 2c. Wire the workflow signer on-chain

```bash
# Trust the workflow signer to write oracle statuses (one-time setter)
cast send $ORACLE_AGGREGATOR_ADDRESS \
  "setOracle(address)" $WORKFLOW_SIGNER_ADDRESS \
  --rpc-url $AVAX_FUJI_RPC --private-key $PRIVATE_KEY

# Trust the workflow signer to call checkAndSettle() (owner-updatable)
cast send $CONTROLLER_ADDRESS \
  "setCreWorkflow(address)" $WORKFLOW_SIGNER_ADDRESS \
  --rpc-url $AVAX_FUJI_RPC --private-key $PRIVATE_KEY
```

#### 2d. Approve the route in GovernanceModule

Replace `AA1`, `JFK`, `LAX` with the flight you picked in step 2a.

```bash
# premium = $10 USDC (10_000_000), payoff = $50 USDC (50_000_000)
cast send $GOVERNANCE_ADDRESS \
  "approveRoute(string,string,string,uint256,uint256)" \
  "AA1" "JFK" "LAX" 10000000 50000000 \
  --rpc-url $AVAX_FUJI_RPC --private-key $PRIVATE_KEY
```

#### 2e. Mint MockUSDC to demo wallets

```bash
export UNDERWRITER=0x...   # wallet that will deposit into the vault
export TRAVELER=0x...      # wallet that will buy insurance

# Mint 1000 USDC to the underwriter
cast send $MOCK_USDC_ADDRESS \
  "mint(address,uint256)" $UNDERWRITER 1000000000 \
  --rpc-url $AVAX_FUJI_RPC --private-key $PRIVATE_KEY

# Mint 50 USDC to the traveler
cast send $MOCK_USDC_ADDRESS \
  "mint(address,uint256)" $TRAVELER 50000000 \
  --rpc-url $AVAX_FUJI_RPC --private-key $PRIVATE_KEY
```

---

### Underwriter flow — frontend

#### 2f. Connect wallet as underwriter

Open the frontend and click **Connect Wallet** in the top-right. Select the underwriter wallet (the one you just minted 1000 USDC to). Confirm the network is **Avalanche Fuji**.

#### 2g. Deposit into the vault

Navigate to **Vault** (`/vault`).

1. Your MockUSDC balance is shown at the top. Enter `500` USDC in the deposit input.
2. The UI shows estimated shares to receive at the current share price.
3. Click **Approve USDC** → sign the approval transaction in your wallet.
4. Once confirmed, click **Deposit** → sign the deposit transaction.
5. Share balance updates. TVL on the Dashboard increases to `$500`.

---

### Traveler flow — frontend

#### 2h. Connect wallet as traveler

Switch to the traveler wallet in MetaMask (or open an incognito window and connect the traveler wallet).

#### 2i. Buy insurance

Navigate to **Routes** (`/routes`).

1. Find the route matching the flight you picked in step 2a (e.g. AA1 · JFK → LAX).
2. Select the departure date in the date picker.
3. The card shows: premium `$10`, payoff `$50`, buyer count, and solvency status (green = capacity available).
4. Click **Approve USDC** → sign the approval transaction.
5. Once confirmed, click **Buy Insurance** → sign the buy transaction.
6. A success state shows the policy summary: flight, date, pool address, and payoff amount.
7. The policy is saved to your wallet's localStorage for the Policies page.

---

### Settlement — centralized cron

#### 2j. Configure and run a single tick

```bash
cd centralized_cron
cp .env.example .env
```

Edit `centralized_cron/.env`:

```
AVAX_FUJI_RPC_URL=https://api.avax-test.network/ext/bc/C/rpc
WORKFLOW_PRIVATE_KEY=0x...      # private key for the workflow signer wallet from step 2b
ORACLE_AGGREGATOR_ADDRESS=0x14cF0CD23B5A444f1e57765d12f21ee7F1e8a2c3
CONTROLLER_ADDRESS=0xd67c1b05Cdfa20aa23C295a2c24310763fED4888
AEROAPI_KEY=your-aeroapi-key-here
AEROAPI_BASE_URL=https://aeroapi.flightaware.com/aeroapi
```

```bash
npm install   # first time only
npm run tick
```

Watch the logs:

```
Reading active flights...              → getActiveFlights() from OracleAggregator
Fetching AeroAPI for AA1 / 2026-03-09...
Derived status: OnTime                 → (or Delayed / Cancelled)
updateFlightStatus tx: 0x...           → status written on-chain
checkAndSettle tx: 0x...               → Controller settles all registered flights
```

---

### Post-settlement — frontend

#### 2k. Dashboard updates

Navigate to **Dashboard** (`/`). Observe:

- **Policies Sold** counter incremented
- **Premiums Collected** increased by $10
- **Vault TVL** — if on-time, increased by $10 (premium flowed to vault)
- **Active Flights** table — the flight now shows its final oracle status badge (On Time / Delayed / Cancelled)

#### 2l. Traveler claims payout (if delayed or cancelled)

Still connected as the traveler, navigate to **Policies** (`/policies`).

1. The settled flight appears as a card showing flight ID, date, payoff amount, and claim expiry.
2. Click **Claim Payout** → sign the transaction.
3. Wallet receives `$50 USDC` automatically. Balance updates in the top nav.

#### 2m. Underwriter collects (if on-time)

Switch back to the underwriter wallet, navigate to **Vault** (`/vault`).

1. Share price is slightly higher — premium income accrued.
2. Enter your share balance in the **Withdraw** tab → click **Withdraw** → sign.
3. If capital is free (no active locked flights), the **Collect** section appears immediately with `$claimableBalance` ready.
4. Click **Collect** → sign → USDC lands in wallet.

**Checkpoint:** AeroAPI status flowed through the cron, hit the chain, Controller settled the pool, vault or traveler paid out — all visible through the frontend. Move to Stage 3.

---

## Stage 3 — CRE Workflow Simulation

Demonstrate the Chainlink CRE workflow running against live Fuji contracts. CRE is currently in beta — DON deployment is not yet available. Simulation mode runs the full TypeScript workflow locally: it reads real on-chain state, hits the real AeroAPI, and prints exactly what transactions the DON would submit — without broadcasting anything. The actual settlement still happens via the centralized cron.

This proves the CRE integration is correctly written and production-ready for when DON deployment opens.

### Prerequisites

- CRE CLI installed (no Early Access needed for simulation)
- `cre/.env` filled with `AEROAPI_KEY` — the only thing simulation needs that isn't in `config.ts`
- `cre/src/config.ts` already has the correct Fuji addresses hardcoded — no edits needed
- AeroAPI key active
- 2–3 real flights with known or predictable outcomes registered (from Stage 2, or new ones below)
- Vault seeded with underwriter capital (carry over from Stage 2 or repeat steps 2f–2g)

### One-time setup — do this before the demo

#### 3a. Install the CRE CLI and log in

```bash
curl -sSL https://cre.chain.link/install.sh | bash
cre version
cre auth login
```

No Early Access required — simulation works for any authenticated account.

#### 3b. Set the AeroAPI key in `cre/.env`

This is the only env file simulation reads from. `runtime.getSecret("AEROAPI_KEY")` resolves to this value during local simulation.

```bash
cp cre/.env.example cre/.env
```

Edit `cre/.env`:

```
AEROAPI_KEY=your-aeroapi-key-here
```

#### 3c. Verify `cre/src/config.ts` — no edits needed

These values are already hardcoded for Fuji testnet. Just confirm they look right:

```typescript
export const ORACLE_AGGREGATOR_ADDRESS = "0x14cF0CD23B5A444f1e57765d12f21ee7F1e8a2c3"
export const CONTROLLER_ADDRESS        = "0xd67c1b05Cdfa20aa23C295a2c24310763fED4888"
export const RISK_VAULT_ADDRESS        = "0x3E65cABB59773a7D21132dAAa587E7Fc777d427C"
export const CHAIN_SELECTOR_NAME       = "avalanche-testnet-fuji"
export const IS_TESTNET                = true
```

Nothing to change here. `CHAIN_SELECTOR_NAME` and `IS_TESTNET` are used by the CRE SDK to resolve the correct network for simulation.

#### 3d. Approve routes and mint USDC for multiple travelers

```bash
export TRAVELER_1=0x...
export TRAVELER_2=0x...
export TRAVELER_3=0x...

# Approve three routes (replace flight IDs with actual flights from today)
cast send $GOVERNANCE_ADDRESS \
  "approveRoute(string,string,string,uint256,uint256)" \
  "AA1" "JFK" "LAX" 10000000 50000000 \
  --rpc-url $AVAX_FUJI_RPC --private-key $PRIVATE_KEY

cast send $GOVERNANCE_ADDRESS \
  "approveRoute(string,string,string,uint256,uint256)" \
  "UA200" "ORD" "LAX" 10000000 50000000 \
  --rpc-url $AVAX_FUJI_RPC --private-key $PRIVATE_KEY

cast send $GOVERNANCE_ADDRESS \
  "approveRoute(string,string,string,uint256,uint256)" \
  "DL400" "ATL" "LAX" 10000000 50000000 \
  --rpc-url $AVAX_FUJI_RPC --private-key $PRIVATE_KEY

# Mint 50 USDC to each traveler wallet
cast send $MOCK_USDC_ADDRESS \
  "mint(address,uint256)" $TRAVELER_1 50000000 \
  --rpc-url $AVAX_FUJI_RPC --private-key $PRIVATE_KEY

cast send $MOCK_USDC_ADDRESS \
  "mint(address,uint256)" $TRAVELER_2 50000000 \
  --rpc-url $AVAX_FUJI_RPC --private-key $PRIVATE_KEY

cast send $MOCK_USDC_ADDRESS \
  "mint(address,uint256)" $TRAVELER_3 50000000 \
  --rpc-url $AVAX_FUJI_RPC --private-key $PRIVATE_KEY
```

---

### Traveler flow — three wallets, three flights — frontend

Open the frontend. Connect each traveler wallet in turn and buy insurance on their respective route.

#### 3e. Traveler 1 — buy insurance (on-time flight)

Connect **Traveler 1** wallet. Navigate to **Routes** (`/routes`).

1. Select the AA1 (JFK → LAX) route.
2. Pick today's departure date.
3. Approve USDC → Buy Insurance → confirm policy summary.

#### 3f. Traveler 2 — buy insurance (delayed flight)

Switch to **Traveler 2** wallet. Navigate to **Routes**.

1. Select the UA200 (ORD → LAX) route.
2. Pick the departure date.
3. Approve USDC → Buy Insurance → confirm.

#### 3g. Traveler 3 — buy insurance (cancelled flight)

Switch to **Traveler 3** wallet. Navigate to **Routes**.

1. Select the DL400 (ATL → LAX) route.
2. Pick the departure date.
3. Approve USDC → Buy Insurance → confirm.

After all three buys: **Dashboard** shows `Policies Sold: 3` and the Active Flights table lists all three flights with `Unknown` status badges.

---

### Settlement — CRE simulation + centralized cron

#### 3h. Run the CRE simulation

The simulation runs the full TypeScript workflow locally — reads live on-chain state, hits the real AeroAPI, and prints exactly what transactions the DON would submit. Nothing is broadcast to the chain.

```bash
cd cre
cre workflow simulate workflow.ts
```

Expected output:

```
[USER LOG] active flights: 3
[USER LOG] fetching AA1 2026-03-09...     → status: OnTime
[USER LOG] fetching UA200 2026-03-09...   → status: Delayed
[USER LOG] fetching DL400 2026-03-09...   → status: Cancelled
[SIMULATE] EVM write: updateFlightStatus("AA1", "2026-03-09", 1)
[SIMULATE] EVM write: updateFlightStatus("UA200", "2026-03-09", 2)
[SIMULATE] EVM write: updateFlightStatus("DL400", "2026-03-09", 3)
[SIMULATE] EVM write: checkAndSettle()
[SIMULATE] EVM write: snapshot()
Simulation complete — no transactions broadcast.
```

This proves the workflow logic, AeroAPI integration, and EVM write targets are all correct.

#### 3i. Settle on-chain with the centralized cron

Now use the centralized cron to actually broadcast the same transactions:

```bash
cd centralized_cron
npm run tick
```

Watch the logs:

```
Reading active flights...
Fetching AeroAPI for AA1 / 2026-03-09...     → status: OnTime
Fetching AeroAPI for UA200 / 2026-03-09...   → status: Delayed
Fetching AeroAPI for DL400 / 2026-03-09...   → status: Cancelled
updateFlightStatus tx: 0x...  (×3)
checkAndSettle tx: 0x...
snapshot tx: 0x...
```

Settlement is complete. Payouts are **pushed automatically** to traveler wallets during settlement — no claim step required.

---

### Post-settlement — frontend

#### 3j. Dashboard — live status updates

Navigate to **Dashboard** (`/`). The Active Flights table refreshes automatically:

- AA1 → **On Time** badge (green)
- UA200 → **Delayed** badge (amber)
- DL400 → **Cancelled** badge (red)

Stats: Policies Sold = 3, Premiums Collected = $30, Payouts Distributed = $100. The Settled Flights section shows all three flights.

#### 3k. Delayed and cancelled travelers — payout already received

Connect **Traveler 2** wallet. Navigate to **Policies** (`/policies`).

The UA200 policy card shows in **Payout History** (not Active Policies) with:

> "$50 USDC paid out to your wallet at settlement. Payout was sent automatically — check your USDC balance."

Switch to **Traveler 3** wallet. The DL400 card shows the same receipt.

No claim button, no transaction needed. The `_distributePayout()` loop in `FlightPool.settleDelayed/settleCancelled` already transferred USDC directly during the `checkAndSettle()` call.

#### 3l. On-time traveler — no claim

Connect **Traveler 1** wallet. Navigate to **Policies**.

Policy shows as settled with **On Time** — no payout. The $10 premium was credited to the vault.

#### 3m. Underwriter collects premium income

Connect the underwriter wallet. Navigate to **Vault** (`/vault`).

1. TVL has increased — $10 premium from AA1 has been credited to the vault.
2. Share price is slightly higher than at deposit time.
3. Enter share amount in **Withdraw** tab → click **Withdraw** → sign.
4. **Collect** section appears showing `claimableBalance` → click **Collect** → sign.
5. USDC lands in the underwriter wallet, reflecting the original deposit plus earned premium.

---

### Show the on-chain provenance on Routescan

Open [testnet.snowtrace.io](https://testnet.snowtrace.io) and pull up the Controller and OracleAggregator contracts. All `updateFlightStatus`, `checkAndSettle`, and `snapshot` calls originate from the **workflow signer EOA** (set in step 2c/2b). When the CRE workflow goes live on the DON, those same calls will originate from the **CRE forwarder address** instead — the on-chain access control (`onlyCREWorkflow`, `onlyOracle` modifiers) is already written for that.

| Contract | Routescan |
|---|---|
| OracleAggregator | [view ↗](https://testnet.snowtrace.io/address/0x14cf0cd23b5a444f1e57765d12f21ee7f1e8a2c3) |
| Controller | [view ↗](https://testnet.snowtrace.io/address/0xd67c1b05cdfa20aa23c295a2c24310763fed4888) |
| RiskVault | [view ↗](https://testnet.snowtrace.io/address/0x3e65cabb59773a7d21132daaa587e7fc777d427c) |

---

## Day-of Checklist

| Item | Notes |
|---|---|
| `contracts/.env` fully filled | all addresses + `PRIVATE_KEY` + `WORKFLOW_SIGNER_ADDRESS` |
| Fuji AVAX in deployer wallet | [core.app/tools/testnet-faucet](https://core.app/tools/testnet-faucet) |
| Fuji AVAX in workflow signer wallet | same faucet |
| MockUSDC minted to all traveler wallets | step 3d above |
| AeroAPI key confirmed working | `curl "https://aeroapi.flightaware.com/aeroapi/flights/AA1" -H "x-apikey: $AEROAPI_KEY"` |
| 2–3 real flights identified with known outcomes | check completed flights at flightaware.com |
| `centralized_cron/.env` filled and tested | `npm run tick` should run clean |
| `cre/.env` filled with `AEROAPI_KEY` | needed for `cre workflow simulate` |
| `cre/src/config.ts` verified (addresses + CHAIN_SELECTOR_NAME) | confirm `"avalanche-testnet-fuji"` is present |
| CRE CLI authenticated | `cre auth login` then `cre version` |
| `cre workflow simulate workflow.ts` passes clean | run a dry-run before the demo |
| Frontend open on Vercel | tab ready, wallet pre-connected to Fuji |
| Routescan tabs open for OracleAggregator + Controller | links in step 3n above |
