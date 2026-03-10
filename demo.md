# Sentinel Protocol — Demo Playbook

Three stages: verify everything is green locally, run a real flight end-to-end through the centralized cron against Fuji testnet, then run the same scenario with the full **Chainlink CRE** workflow — compiled to WASM, executed locally in simulation mode, broadcasting real transactions to Fuji.

Stage 2 uses the centralized cron as the settlement engine. Stage 3 is an independent CRE-only demo showing the Chainlink integration end-to-end.

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

## Stage 3 — Multi-Flight Chainlink CRE Demo

Demonstrate the full Chainlink CRE integration end-to-end. Three travelers, three flights (on-time, delayed, cancelled). Settlement is triggered by running the CRE workflow **locally in simulation mode** — the TypeScript workflow compiles to WASM, executes on your machine, reads active flights and flight statuses directly from Fuji testnet via EVM reads, fetches real flight data from AeroAPI, then broadcasts the status update and settlement transactions directly to Fuji. No centralized cron, no DON deployment required.

This is an independent demo. Run it standalone or after Stage 2.

---

### CRE simulation model

```
Your machine
  └─ cre workflow simulate --target fuji --trigger-index 0 --broadcast
       ├─ Compiles workflow.ts → WASM (QuickJS runtime)
       ├─ EVM reads  → Fuji testnet (live, real contract state)
       ├─ HTTP fetch → AeroAPI (real flight data)
       └─ EVM writes → Fuji testnet (broadcast, signed by CRE_SIGNER_PRIVATE_KEY)
```

The workflow WASM never touches a DON — it runs on localhost. The `--broadcast` flag makes the EVM writes real transactions on Fuji. `msg.sender` on the contracts = the address of `CRE_SIGNER_PRIVATE_KEY`.

---

### 3a. Environment setup — one place

All variables for Stage 3 live in `cre/.env`. Create it from the example:

```bash
cp cre/.env.example cre/.env
```

Fill in `cre/.env`:

```
# AeroAPI key — needed by the workflow for flight status fetching
AEROAPI_KEY=your_flightaware_aeroapi_key_here

# Dedicated CRE signer wallet (a throwaway testnet wallet is fine)
# This address will be wired as authorizedOracle and creWorkflowAddress
CRE_SIGNER_PRIVATE_KEY=0x...

# Fuji RPC — used by the CRE CLI for EVM reads and broadcast writes
AVAX_FUJI_RPC=https://api.avax-test.network/ext/bc/C/rpc
```

Derive and export the signer address:

```bash
set -a; source cre/.env; set +a
set -a; source contracts/.env; set +a

export CRE_SIGNER_ADDRESS=$(cast wallet address --private-key $CRE_SIGNER_PRIVATE_KEY)
echo "CRE signer: $CRE_SIGNER_ADDRESS"
```

Fund the CRE signer with Fuji AVAX for gas: [core.app/tools/testnet-faucet](https://core.app/tools/testnet-faucet)

---

### 3b. Wire the CRE signer on-chain

The contracts enforce `msg.sender` access guards. Wire the CRE signer address into both contracts before running the workflow.

```bash
# Authorize CRE signer to write flight statuses (one-time setter — irreversible)
cast send $ORACLE_AGGREGATOR_ADDRESS \
  "setOracle(address)" $CRE_SIGNER_ADDRESS \
  --rpc-url $AVAX_FUJI_RPC --private-key $PRIVATE_KEY

# Authorize CRE signer to call checkAndSettle() (owner-updatable)
cast send $CONTROLLER_ADDRESS \
  "setCreWorkflow(address)" $CRE_SIGNER_ADDRESS \
  --rpc-url $AVAX_FUJI_RPC --private-key $PRIVATE_KEY
```

Verify both are set correctly:

```bash
cast call $ORACLE_AGGREGATOR_ADDRESS "authorizedOracle()" --rpc-url $AVAX_FUJI_RPC
cast call $CONTROLLER_ADDRESS "creWorkflowAddress()" --rpc-url $AVAX_FUJI_RPC
# Both should return the CRE_SIGNER_ADDRESS
```

> **Note:** `setOracle` is a one-time setter — it cannot be changed after this call. If Stage 2 already wired a different address, deploy fresh contracts or use the same signer key as Stage 2's `WORKFLOW_SIGNER_ADDRESS`.

---

### 3c. Pick three flights with known outcomes

Find real flights that **already completed today** so AeroAPI returns a final status immediately — no waiting required during the demo.

Check [flightaware.com](https://flightaware.com) for completed flights. You need:

| Role | Target outcome | What to look for |
|---|---|---|
| Flight A | **On-time** | Landed, arrival within 45 min of schedule |
| Flight B | **Delayed** | Landed, arrival 45+ min late |
| Flight C | **Cancelled** | Status = Cancelled |

Note the **IATA flight ID** (e.g. `AA1`) and **departure date** (`YYYY-MM-DD`) for each.

Verify AeroAPI returns data for your chosen flights:

```bash
# Test each flight — look for "flights" array with status "Landed" or "Cancelled"
curl -s "https://aeroapi.flightaware.com/aeroapi/flights/AA1?start=2026-03-09T00:00:00Z&end=2026-03-09T23:59:59Z" \
  -H "x-apikey: $AEROAPI_KEY" | jq '.flights[0].status'
```

---

### 3d. Approve routes and mint MockUSDC

```bash
# Set traveler wallet addresses
export TRAVELER_1=0x...    # will buy on-time flight
export TRAVELER_2=0x...    # will buy delayed flight
export TRAVELER_3=0x...    # will buy cancelled flight
export UNDERWRITER=0x...   # deposits into vault

# Approve the three routes
# Replace AA1/JFK/LAX, UA200/ORD/LAX, DL400/ATL/LAX with your chosen flights
# premium = $10 USDC (10_000_000), payoff = $50 USDC (50_000_000)

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

# Mint MockUSDC to all wallets
cast send $MOCK_USDC_ADDRESS \
  "mint(address,uint256)" $UNDERWRITER 1000000000 \
  --rpc-url $AVAX_FUJI_RPC --private-key $PRIVATE_KEY

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

### Underwriter flow — frontend

#### 3e. Seed the vault

Open the frontend. Connect the **underwriter** wallet.

Navigate to **Vault** (`/vault`):

1. Enter `500` USDC → click **Approve USDC** → sign.
2. Once approved, click **Deposit** → sign.
3. TVL on Dashboard shows `$500`. Share balance appears in the vault UI.

---

### Traveler flows — frontend

Connect each traveler wallet in turn and buy insurance on their respective route.

#### 3f. Traveler 1 — on-time flight

Connect **Traveler 1** wallet. Navigate to **Routes** (`/routes`).

1. Find Flight A's route (e.g. AA1 · JFK → LAX).
2. Select the departure date.
3. Click **Approve USDC** → sign → **Buy Insurance** → sign.
4. Policy summary confirms: flight, date, pool address, payoff `$50`.

#### 3g. Traveler 2 — delayed flight

Switch to **Traveler 2** wallet. Navigate to **Routes**.

1. Find Flight B's route (e.g. UA200 · ORD → LAX).
2. Select the departure date.
3. Approve USDC → Buy Insurance → confirm.

#### 3h. Traveler 3 — cancelled flight

Switch to **Traveler 3** wallet. Navigate to **Routes**.

1. Find Flight C's route (e.g. DL400 · ATL → LAX).
2. Select the departure date.
3. Approve USDC → Buy Insurance → confirm.

**Dashboard** now shows `Policies Sold: 3`. Active Flights table lists all three with `Unknown` oracle status badges.

---

### Settlement — CRE workflow simulation

#### 3i. Configure the CRE workflow

Update `cre/src/config.ts` with the Fuji contract addresses (already there from Phase 10). Confirm `CHAIN_SELECTOR_NAME = "avalanche-testnet-fuji"` and `IS_TESTNET = true`.

Update `cre/config.fuji.json` if you need a different cron schedule for the demo (the default `"0 */10 * * * *"` is fine for broadcast — schedule only affects DON deployment):

```json
{
  "schedule": "0 */10 * * * *"
}
```

#### 3j. Run the CRE workflow simulation with broadcast

```bash
cd cre
npm install   # first time only

# Expose the CRE signer key so the CLI can sign broadcast transactions
export PRIVATE_KEY=$CRE_SIGNER_PRIVATE_KEY

cre workflow simulate --target fuji --trigger-index 0 --broadcast
```

Watch the terminal output — logs are prefixed `[USER LOG]`:

```
[USER LOG] [Sentinel] CRE workflow tick starting
[USER LOG] [Sentinel] Active flights: 3
[USER LOG] [Sentinel] AA1 2026-03-09 → status 1        ← 1 = OnTime
[USER LOG] [Sentinel] Wrote status 1 for AA1 2026-03-09
[USER LOG] [Sentinel] UA200 2026-03-09 → status 2      ← 2 = Delayed
[USER LOG] [Sentinel] Wrote status 2 for UA200 2026-03-09
[USER LOG] [Sentinel] DL400 2026-03-09 → status 3      ← 3 = Cancelled
[USER LOG] [Sentinel] Wrote status 3 for DL400 2026-03-09
[USER LOG] [Sentinel] checkAndSettle() complete
[USER LOG] [Sentinel] snapshot() complete
[USER LOG] [Sentinel] Tick complete
```

Three EVM write transactions are broadcast to Fuji:
1. `updateFlightStatus(AA1, date, 1)` — on-time
2. `updateFlightStatus(UA200, date, 2)` — delayed
3. `updateFlightStatus(DL400, date, 3)` — cancelled

Then `checkAndSettle()` settles all three pools in one call. Then `snapshot()`.

Settlement is complete. Payouts for Traveler 2 and Traveler 3 are **pushed automatically** to their wallets during `checkAndSettle()` — no claim step required.

---

### Post-settlement — frontend

#### 3k. Dashboard — live oracle status updates

Navigate to **Dashboard** (`/`). Active Flights table shows:

- AA1 → **On Time** badge (green)
- UA200 → **Delayed** badge (amber)
- DL400 → **Cancelled** badge (red)

Stats: Policies Sold = 3, Premiums Collected = $30, Payouts Distributed = $100. Settled Flights section shows all three.

#### 3l. Delayed and cancelled travelers — payout already received

Connect **Traveler 2** wallet. Navigate to **Policies** (`/policies`).

The UA200 policy card shows in **Payout History** with:

> "$50 USDC paid out to your wallet at settlement. Payout was sent automatically — check your USDC balance."

Switch to **Traveler 3** wallet. The DL400 card shows the same automatic receipt.

No claim button, no transaction needed. The `_distributePayout()` loop in `FlightPool.settleDelayed/settleCancelled` pushed USDC directly during `checkAndSettle()`.

#### 3m. On-time traveler — no payout

Connect **Traveler 1** wallet. Navigate to **Policies**.

Policy shows settled with **On Time** — no payout. The $10 premium was credited to the vault.

#### 3n. Underwriter collects premium income

Connect the **underwriter** wallet. Navigate to **Vault** (`/vault`).

1. TVL has increased — the $10 premium from AA1 is credited to the vault.
2. Share price is higher than at deposit time.
3. Enter share amount in **Withdraw** tab → **Withdraw** → sign.
4. **Collect** section appears with `claimableBalance` → **Collect** → sign.
5. USDC lands in wallet: original deposit + earned premium.

---

### Show the on-chain provenance on Routescan

Open [testnet.snowtrace.io](https://testnet.snowtrace.io). Pull up OracleAggregator and Controller. All three `updateFlightStatus` calls, the `checkAndSettle` call, and the `snapshot` call originate from **`CRE_SIGNER_ADDRESS`** — the address of the locally-run CRE workflow.

When this workflow is deployed to a Chainlink DON (Early Access), the same call flow repeats — but the transactions originate from the **CRE forwarder address** assigned by the DON. The on-chain access guards (`onlyCREWorkflow`, `onlyOracle`) are already written for it — no contract changes required.

| Contract | Routescan |
|---|---|
| OracleAggregator | [view ↗](https://testnet.snowtrace.io/address/0x14cf0cd23b5a444f1e57765d12f21ee7f1e8a2c3) |
| Controller | [view ↗](https://testnet.snowtrace.io/address/0xd67c1b05cdfa20aa23c295a2c24310763fed4888) |
| RiskVault | [view ↗](https://testnet.snowtrace.io/address/0x3e65cabb59773a7d21132daaa587e7fc777d427c) |

---

## Day-of Checklist

### Stages 1 & 2 (centralized cron)

| Item | Notes |
|---|---|
| `contracts/.env` fully filled | all addresses + `PRIVATE_KEY` + `WORKFLOW_SIGNER_ADDRESS` |
| Fuji AVAX in deployer wallet | [core.app/tools/testnet-faucet](https://core.app/tools/testnet-faucet) |
| Fuji AVAX in workflow signer wallet | same faucet |
| `centralized_cron/.env` filled and tested | `npm run tick` should run clean |
| Real flight identified with known outcome | check completed flights at flightaware.com |
| MockUSDC minted to underwriter + traveler | steps 2e above |
| Frontend open on Vercel | tab ready, wallet pre-connected to Fuji |
| Routescan tabs open for OracleAggregator + Controller | links above |

### Stage 3 (Chainlink CRE)

| Item | Notes |
|---|---|
| `cre/.env` filled | `AEROAPI_KEY` + `CRE_SIGNER_PRIVATE_KEY` + `AVAX_FUJI_RPC` |
| `CRE_SIGNER_ADDRESS` derived and funded with Fuji AVAX | `cast wallet address --private-key $CRE_SIGNER_PRIVATE_KEY` |
| `setOracle` called with `CRE_SIGNER_ADDRESS` | step 3b — irreversible, do this first |
| `setCreWorkflow` called with `CRE_SIGNER_ADDRESS` | step 3b |
| Three real flights identified (on-time, delayed, cancelled) | check completed flights at flightaware.com |
| AeroAPI verified returning data for all three flights | `curl` test in step 3c |
| MockUSDC minted to all three travelers + underwriter | step 3d |
| CRE CLI installed and authenticated | `cre auth login` |
| `cre/npm install` done | first-time only |
| Vault seeded with underwriter deposit | step 3e |
| All three travelers bought insurance | steps 3f–3h |
