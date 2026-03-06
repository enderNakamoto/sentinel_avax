# Avalanche Network: Deploy & Verify with Foundry

A complete reference for deploying and verifying smart contracts on Avalanche's Primary Network using Foundry. Use this file to instruct an agent to handle all deployment and verification tasks correctly.

---

## 1. Avalanche Primary Network Overview

Avalanche's Primary Network runs three chains. For smart contract deployment, only the **C-Chain** is relevant. The P-Chain and X-Chain are not EVM-compatible and cannot run Solidity contracts.

| Chain | Purpose | EVM? |
|---|---|---|
| **C-Chain** (Contract Chain) | Smart contracts, DeFi, EVM dApps | ✅ Yes |
| **P-Chain** (Platform Chain) | Validators, staking, subnet management | ❌ No |
| **X-Chain** (Exchange Chain) | Native token transfers (Avalanche Native Tokens) | ❌ No |

---

## 2. C-Chain Network Parameters

### Mainnet

| Property | Value |
|---|---|
| Network Name | Avalanche C-Chain |
| Chain ID | `43114` (hex: `0xA86A`) |
| Currency | AVAX |
| RPC URL | `https://api.avax.network/ext/bc/C/rpc` |
| Explorer | `https://subnets.avax.network/c-chain` |
| Snowtrace Explorer | `https://snowtrace.io` |

### Fuji Testnet

| Property | Value |
|---|---|
| Network Name | Avalanche Fuji C-Chain |
| Chain ID | `43113` (hex: `0xA869`) |
| Currency | AVAX (test) |
| RPC URL | `https://api.avax-test.network/ext/bc/C/rpc` |
| Explorer | `https://subnets-test.avax.network/c-chain` |
| Snowtrace Testnet Explorer | `https://testnet.snowtrace.io` |
| Faucet | `https://faucet.avax.network` |

> **C-Chain is an instance of Coreth** — Ava Labs' fork of go-ethereum. It is fully EVM-compatible and supports all Geth APIs. Any Solidity contract that compiles for Ethereum will compile and run identically on C-Chain.

---

## 3. Environment Setup

### .env file

```bash
# Private key (no 0x prefix needed for Foundry scripts, but include it)
PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE

# Snowtrace API key — get from https://snowtrace.io/myapikey
SNOWTRACE_API_KEY=YOUR_SNOWTRACE_API_KEY

# RPC URLs
AVAX_MAINNET_RPC=https://api.avax.network/ext/bc/C/rpc
AVAX_FUJI_RPC=https://api.avax-test.network/ext/bc/C/rpc
```

### foundry.toml

```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
solc = "0.8.20"          # set to your target version
optimizer = true
optimizer_runs = 200
evm_version = "london"   # C-Chain is compatible with london and later

# RPC endpoints
[rpc_endpoints]
avax_mainnet = "${AVAX_MAINNET_RPC}"
avax_fuji    = "${AVAX_FUJI_RPC}"

# Etherscan-compatible block explorers
# Snowtrace is powered by Routescan and accepts Etherscan-compatible API calls
[etherscan]
avax_mainnet = { key = "${SNOWTRACE_API_KEY}", url = "https://api.routescan.io/v2/network/mainnet/evm/43114/etherscan" }
avax_fuji    = { key = "${SNOWTRACE_API_KEY}", url = "https://api.routescan.io/v2/network/testnet/evm/43113/etherscan" }
```

> **Important:** Snowtrace migrated its backend to Routescan. Always use the Routescan API URLs above, not the old `api.snowtrace.io` endpoints — those are deprecated or unreliable.

---

## 4. Deploying with `forge script` (Recommended)

Using `forge script` is the preferred method for production deployments. It supports simulation, broadcasting, and verification in a single command.

### Basic deploy script structure

```solidity
// script/Deploy.s.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/YourContract.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        YourContract deployed = new YourContract(/* constructor args */);
        console.log("Deployed to:", address(deployed));

        vm.stopBroadcast();
    }
}
```

### Deploy to Fuji testnet

```bash
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url avax_fuji \
  --chain-id 43113 \
  --broadcast \
  --verify \
  --verifier etherscan \
  --verifier-url https://api.routescan.io/v2/network/testnet/evm/43113/etherscan \
  --etherscan-api-key $SNOWTRACE_API_KEY \
  -vvvv
```

### Deploy to Avalanche Mainnet

```bash
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url avax_mainnet \
  --chain-id 43114 \
  --broadcast \
  --verify \
  --verifier etherscan \
  --verifier-url https://api.routescan.io/v2/network/mainnet/evm/43114/etherscan \
  --etherscan-api-key $SNOWTRACE_API_KEY \
  -vvvv
```

> Add `--slow` if you see nonce issues or the broadcast fails silently — this adds a small delay between transactions.

---

## 5. Deploying with `forge create` (Quick/Simple)

For single-contract deploys without a script file:

```bash
# Fuji
forge create src/YourContract.sol:YourContract \
  --rpc-url $AVAX_FUJI_RPC \
  --private-key $PRIVATE_KEY \
  --chain-id 43113 \
  --verify \
  --verifier etherscan \
  --verifier-url https://api.routescan.io/v2/network/testnet/evm/43113/etherscan \
  --etherscan-api-key $SNOWTRACE_API_KEY \
  --constructor-args <arg1> <arg2>
```

```bash
# Mainnet
forge create src/YourContract.sol:YourContract \
  --rpc-url $AVAX_MAINNET_RPC \
  --private-key $PRIVATE_KEY \
  --chain-id 43114 \
  --verify \
  --verifier etherscan \
  --verifier-url https://api.routescan.io/v2/network/mainnet/evm/43114/etherscan \
  --etherscan-api-key $SNOWTRACE_API_KEY \
  --constructor-args <arg1> <arg2>
```

---

## 6. Verifying Already-Deployed Contracts

If deployment succeeded but verification failed, or you need to verify a contract deployed without `--verify`:

```bash
# Fuji — post-deployment verification
forge verify-contract \
  <DEPLOYED_CONTRACT_ADDRESS> \
  src/YourContract.sol:YourContract \
  --chain-id 43113 \
  --verifier etherscan \
  --verifier-url https://api.routescan.io/v2/network/testnet/evm/43113/etherscan \
  --etherscan-api-key $SNOWTRACE_API_KEY \
  --constructor-args $(cast abi-encode "constructor(address,uint256)" <arg1> <arg2>)
```

```bash
# Mainnet — post-deployment verification
forge verify-contract \
  <DEPLOYED_CONTRACT_ADDRESS> \
  src/YourContract.sol:YourContract \
  --chain-id 43114 \
  --verifier etherscan \
  --verifier-url https://api.routescan.io/v2/network/mainnet/evm/43114/etherscan \
  --etherscan-api-key $SNOWTRACE_API_KEY \
  --constructor-args $(cast abi-encode "constructor(address,uint256)" <arg1> <arg2>)
```

### Checking verification status

```bash
forge verify-check <GUID> \
  --chain-id 43113 \
  --verifier-url https://api.routescan.io/v2/network/testnet/evm/43113/etherscan \
  --etherscan-api-key $SNOWTRACE_API_KEY
```

---

## 7. Interacting with Deployed Contracts (cast)

Once deployed, use `cast` for all on-chain reads and writes:

```bash
# Read a value
cast call <CONTRACT_ADDRESS> "functionName()(returnType)" \
  --rpc-url $AVAX_FUJI_RPC

# Send a transaction
cast send <CONTRACT_ADDRESS> "functionName(uint256)" 1000 \
  --rpc-url $AVAX_FUJI_RPC \
  --private-key $PRIVATE_KEY

# Check AVAX balance
cast balance <ADDRESS> --rpc-url $AVAX_FUJI_RPC

# Get chain ID (sanity check)
cast chain-id --rpc-url $AVAX_FUJI_RPC
# Expected: 43113

# Decode calldata
cast 4byte-decode <CALLDATA>

# Get transaction receipt
cast receipt <TX_HASH> --rpc-url $AVAX_FUJI_RPC
```

---

## 8. Local Forking with anvil

Fork C-Chain locally for fast testing against real state:

```bash
# Fork Fuji testnet locally
anvil --fork-url $AVAX_FUJI_RPC --chain-id 43113

# Fork Mainnet locally
anvil --fork-url $AVAX_MAINNET_RPC --chain-id 43114

# Fork at a specific block
anvil --fork-url $AVAX_MAINNET_RPC --fork-block-number 45000000

# Then run tests against the fork
forge test --fork-url http://127.0.0.1:8545 -vvv
```

---

## 9. foundry.toml Full Reference for Avalanche

```toml
[profile.default]
src           = "src"
out           = "out"
libs          = ["lib"]
solc          = "0.8.20"
optimizer     = true
optimizer_runs = 200
evm_version   = "london"
via_ir        = false       # enable if stack too deep errors occur

[profile.ci]
fuzz = { runs = 1000 }
invariant = { runs = 256 }

[rpc_endpoints]
localhost    = "http://127.0.0.1:8545"
avax_fuji    = "${AVAX_FUJI_RPC}"
avax_mainnet = "${AVAX_MAINNET_RPC}"

[etherscan]
avax_mainnet = { key = "${SNOWTRACE_API_KEY}", url = "https://api.routescan.io/v2/network/mainnet/evm/43114/etherscan", chain = 43114 }
avax_fuji    = { key = "${SNOWTRACE_API_KEY}", url = "https://api.routescan.io/v2/network/testnet/evm/43113/etherscan", chain = 43113 }
```

---

## 10. Typical Agent Deployment Workflow

When an agent is instructed to deploy to Avalanche, follow this exact sequence:

```
1. Load .env → validate PRIVATE_KEY and SNOWTRACE_API_KEY are set
2. Run: forge build  →  confirm zero errors
3. Run: forge test   →  confirm all tests pass
4. Simulate (no broadcast):
       forge script script/Deploy.s.sol --rpc-url avax_fuji --chain-id 43113
5. Broadcast + verify:
       forge script script/Deploy.s.sol --rpc-url avax_fuji --chain-id 43113 \
         --broadcast --verify [flags as shown in Section 4]
6. Confirm output contains:
       - "Deployed to: 0x..."
       - "Contract successfully verified"
7. Record deployed address in deployments/<network>.json
8. (Mainnet only) Repeat steps 4–7 with avax_mainnet / chain-id 43114
```

---

## 11. Common Errors and Fixes

| Error | Cause | Fix |
|---|---|---|
| `transaction underpriced` | Gas price too low | Add `--gas-price 30000000000` (30 gwei) |
| `nonce too low` | Pending txs in mempool | Add `--slow` flag or wait and retry |
| `NOTOK: Pending in queue` | Verification takes time | Wait ~30s, recheck with `forge verify-check` |
| `Invalid API Key` | Wrong Snowtrace key or wrong URL | Use Routescan URL, not old `api.snowtrace.io` |
| `chain ID mismatch` | Wrong `--chain-id` flag | Fuji = 43113, Mainnet = 43114 |
| `Stack too deep` | Complex contract | Enable `via_ir = true` in foundry.toml |
| Verification fails silently | Compiler version mismatch | Ensure `solc` in foundry.toml matches contract pragma |

---

## 12. Get Test AVAX (Fuji Faucet)

The official faucet is at `https://faucet.avax.network`. It dispenses test AVAX to a C-Chain address. Wallet must have a minimum mainnet AVAX balance to use the faucet (spam prevention). Alternatives:
- Guildhall faucet: `https://faucet.avax-test.network`  
- Triangle faucet: accessible via Catapulta

---

## 13. Explorer Links

| Network | Explorer | Contract page format |
|---|---|---|
| Mainnet | `https://snowtrace.io` | `https://snowtrace.io/address/<ADDRESS>` |
| Fuji | `https://testnet.snowtrace.io` | `https://testnet.snowtrace.io/address/<ADDRESS>` |
| Mainnet (Ava Labs) | `https://subnets.avax.network/c-chain` | `https://subnets.avax.network/c-chain/address/<ADDRESS>` |
| Fuji (Ava Labs) | `https://subnets-test.avax.network/c-chain` | `https://subnets-test.avax.network/c-chain/address/<ADDRESS>` |

---

## 14. Notes on C-Chain Architecture

- C-Chain is an instance of **Coreth**, Ava Labs' fork of `go-ethereum`
- Supports all Geth-compatible APIs (eth_, net_, web3_, debug_)
- EIP-1559 gas model is active — transactions use `maxFeePerGas` and `maxPriorityFeePerGas`
- After the **Octane upgrade** (2025), gas fees dropped ~43% to ~$0.03/tx average
- Block time: ~2 seconds
- Finality: ~1–2 blocks (near-instant, unlike Ethereum's 12+ block confirmation convention)
- No Flashbots / MEV infrastructure — front-running risk is minimal
- Precompile at `0x0200...0005` (WarpMessenger) enables cross-subnet messaging — irrelevant for C-Chain-only contracts

---

*Source: https://build.avax.network/docs/primary-network — Avalanche Builder Hub*