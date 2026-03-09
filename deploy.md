# Deployment Guide

## Prerequisites

- [Foundry](https://getfoundry.sh) installed (`forge`, `cast`, `anvil`)
- [Node.js](https://nodejs.org) v18+ and npm
- [CRE CLI](https://cre.chain.link) installed and authenticated (Early Access required for DON deployment)
- A wallet funded with AVAX on Fuji (see step below)
- A [Snowtrace API key](https://snowtrace.io/myapikey) for contract verification
- An [AeroAPI key](https://flightaware.com/commercial/aeroapi/) from FlightAware

---

## Get Fuji AVAX from the Faucet

You need AVAX on the Avalanche Fuji testnet to pay for gas. You can get it for free:

1. Go to [core.app/tools/testnet-faucet](https://core.app/tools/testnet-faucet)
2. Connect your wallet or paste your deployer address
3. Select **Fuji (C-Chain)** and request AVAX
4. Wait ~30 seconds — you'll receive 2 AVAX, which is more than enough for a full deployment

Alternatively, use the [Chainlink faucet](https://faucets.chain.link/fuji) which also provides Fuji AVAX.

---

## Part 1 — Deploy Solidity Contracts

### 1. Set up environment

```bash
cp contracts/.env.example contracts/.env
```

Edit `contracts/.env` and fill in:

```
PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE     # must include 0x prefix
SNOWTRACE_API_KEY=YOUR_SNOWTRACE_KEY
AVAX_FUJI_RPC=https://api.avax-test.network/ext/bc/C/rpc   # already defaulted
```

### 2. Build and test contracts

```bash
cd contracts
forge build
forge test
```

All 209 tests should pass before deploying.

### 3. Deploy all 6 contracts to Fuji

```bash
cd contracts
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url avax_fuji \
  --chain-id 43113 \
  --broadcast \
  --verify \
  --verifier etherscan \
  --verifier-url https://api.routescan.io/v2/network/testnet/evm/43113/etherscan \
  --etherscan-api-key $SNOWTRACE_API_KEY \
  --slow \
  -vvvv
```

> Add `--slow` if you encounter nonce errors. The script deploys and wires all contracts in a single broadcast.

The script executes these steps automatically:

| # | Action | Notes |
|---|---|---|
| 1 | Deploy `MockUSDC` | Testnet stand-in for real USDC |
| 2 | Deploy `GovernanceModule` | Owner = deployer |
| 3 | Deploy `RecoveryPool` | Depends on USDC |
| 4 | Deploy `OracleAggregator` | No deps at deploy time |
| 5 | Deploy `RiskVault` | `controller = address(0)` placeholder |
| 6 | Deploy `Controller` | Depends on all above |
| 7 | `OracleAggregator.setController(controller)` | One-time, locks forever |
| 8 | `RiskVault.setController(controller)` | One-time, locks forever |

The script prints a deployment summary. Copy the logged addresses.

### 4. Update `.env` with deployed addresses

```
ORACLE_AGGREGATOR_ADDRESS=0x...   # from deploy output
CONTROLLER_ADDRESS=0x...          # from deploy output
```

Also update `cre/src/config.ts` with all three addresses:

```typescript
export const ORACLE_AGGREGATOR_ADDRESS = "0x..."  // from deploy output
export const CONTROLLER_ADDRESS        = "0x..."  // from deploy output
export const RISK_VAULT_ADDRESS        = "0x..."  // from deploy output
```

### 5. Approve a route and fund the vault

Amounts use 6 decimal USDC units: `10000000` = $10, `50000000` = $50.

```bash
# Approve a route (flightId, origin, destination, premium, payoff)
cast send $GOVERNANCE_ADDRESS \
  "approveRoute(string,string,string,uint256,uint256)" \
  "AA1" "JFK" "LAX" 10000000 50000000 \
  --rpc-url avax_fuji --private-key $PRIVATE_KEY

# Mint testnet USDC to your wallet
cast send $MOCK_USDC_ADDRESS \
  "mint(address,uint256)" \
  $YOUR_ADDRESS 1000000000 \
  --rpc-url avax_fuji --private-key $PRIVATE_KEY

# Approve RiskVault to spend USDC
cast send $MOCK_USDC_ADDRESS \
  "approve(address,uint256)" \
  $RISK_VAULT_ADDRESS 500000000 \
  --rpc-url avax_fuji --private-key $PRIVATE_KEY

# Deposit into RiskVault
cast send $RISK_VAULT_ADDRESS \
  "deposit(uint256)" 500000000 \
  --rpc-url avax_fuji --private-key $PRIVATE_KEY
```

---

## Part 2 — Deploy the CRE Workflow

### 1. Install the CRE CLI

```bash
curl -sSL https://cre.chain.link/install.sh | bash
cre version
```

### 2. Log in and request Early Access

```bash
cre auth login
```

Go to [cre.chain.link](https://cre.chain.link) and request Early Access if you haven't already. Simulation works without approval; DON deployment requires it.

### 3. Install CRE project dependencies

```bash
cd cre
npm install
```

### 4. Set the AeroAPI secret

```bash
cre secrets set AEROAPI_KEY --value "your-aeroapi-key-here"
```

### 5. (Optional) Simulate against Fuji before deploying

Dry-runs the full workflow tick against the live Fuji contracts without broadcasting any transactions.

```bash
cd cre
cre workflow simulate --target fuji --trigger-index 0
```

Check the `[USER LOG]` lines in the output. If flights are registered, you should see status fetch attempts.

### 6. Build the WASM artifact

```bash
cre workflow build
# produces: cre/dist/workflow.wasm
```

### 7. Deploy to the DON

```bash
cre workflow deploy ./dist/workflow.wasm
```

Output:
```
Workflow deployed successfully
Workflow ID: <workflow-id>
```

Save the workflow ID.

### 8. Activate the workflow

```bash
cre workflow activate <workflow-id>
```

### 9. Get the forwarder address

```bash
cre workflow info <workflow-id>
```

The output includes a **forwarder/signer address** — this is the address that will call `updateFlightStatus()`, `checkAndSettle()`, and `snapshot()` on-chain. Copy it.

---

## Part 3 — Wire the CRE Workflow into the Contracts

### 1. Add the forwarder address to `.env`

```
CRE_WORKFLOW_ADDRESS=0x...   # forwarder address from `cre workflow info`
```

### 2. Run the wiring script

```bash
cd contracts
forge script script/WireCRE.s.sol:WireCREScript \
  --rpc-url avax_fuji \
  --chain-id 43113 \
  --broadcast \
  -vvvv
```

This performs two calls:
- `OracleAggregator.setOracle(creForwarder)` — **one-time, locks forever**. Make sure the address is correct before running.
- `Controller.setCreWorkflow(creForwarder)` — owner-updatable; safe to re-run if the workflow is redeployed.

The system is now fully operational. The CRE workflow will fire every 10 minutes, fetch flight statuses from AeroAPI, write results to OracleAggregator, and call `checkAndSettle()`.

---

## Workflow Management

```bash
# View live execution logs
cre workflow logs <workflow-id>

# Pause the workflow
cre workflow pause <workflow-id>

# Resume a paused workflow
cre workflow activate <workflow-id>

# Update workflow source (after rebuilding)
cre workflow build
cre workflow update <workflow-id> ./dist/workflow.wasm

# List all deployed workflows
cre workflow list
```

---

## Deployed Contracts — Avalanche Fuji Testnet

Current testnet deployment (2026-03-09):

| Contract | Address | Explorer |
|---|---|---|
| MockUSDC | `0x18975871ab7E57e0f26fdF429592238541051Fb0` | [view ↗](https://testnet.snowscan.xyz/address/0x18975871ab7e57e0f26fdf429592238541051fb0) |
| GovernanceModule | `0x30CCF5C0Ea4F871398136DD643A0544Aba39b26D` | [view ↗](https://testnet.snowscan.xyz/address/0x30ccf5c0ea4f871398136dd643a0544aba39b26d) |
| RecoveryPool | `0x981BeeCd15b05A35206cfc44af12373B45613E71` | [view ↗](https://testnet.snowscan.xyz/address/0x981beecd15b05a35206cfc44af12373b45613e71) |
| OracleAggregator | `0x14cF0CD23B5A444f1e57765d12f21ee7F1e8a2c3` | [view ↗](https://testnet.snowscan.xyz/address/0x14cf0cd23b5a444f1e57765d12f21ee7f1e8a2c3) |
| RiskVault | `0x3E65cABB59773a7D21132dAAa587E7Fc777d427C` | [view ↗](https://testnet.snowscan.xyz/address/0x3e65cabb59773a7d21132daaa587e7fc777d427c) |
| Controller | `0xd67c1b05Cdfa20aa23C295a2c24310763fED4888` | [view ↗](https://testnet.snowscan.xyz/address/0xd67c1b05cdfa20aa23c295a2c24310763fed4888) |
