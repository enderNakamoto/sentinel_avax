---
description: Avalanche C-Chain deployment reference. Trigger when deploying Solidity contracts to Avalanche, configuring Foundry for Avalanche, running forge script / forge create / forge verify-contract, interacting with deployed contracts via cast, setting up anvil forks against Fuji or mainnet, or writing foundry.toml network config.
---

# Skill: Avalanche C-Chain — Deploy & Verify

## Layer 1 — Quick Reference (always read this)

### Chain IDs

| Network | Chain ID | RPC URL |
|---|---|---|
| **Fuji Testnet** | `43113` | `https://api.avax-test.network/ext/bc/C/rpc` |
| **Mainnet** | `43114` | `https://api.avax.network/ext/bc/C/rpc` |

### Critical: Verifier URLs

**Always use Routescan. Never use `api.snowtrace.io` — it is deprecated and unreliable.**

| Network | Verifier URL |
|---|---|
| Fuji | `https://api.routescan.io/v2/network/testnet/evm/43113/etherscan` |
| Mainnet | `https://api.routescan.io/v2/network/mainnet/evm/43114/etherscan` |

### foundry.toml minimum config

```toml
[rpc_endpoints]
avax_fuji    = "${AVAX_FUJI_RPC}"
avax_mainnet = "${AVAX_MAINNET_RPC}"

[etherscan]
avax_fuji    = { key = "${SNOWTRACE_API_KEY}", url = "https://api.routescan.io/v2/network/testnet/evm/43113/etherscan" }
avax_mainnet = { key = "${SNOWTRACE_API_KEY}", url = "https://api.routescan.io/v2/network/mainnet/evm/43114/etherscan" }
```

### Deploy + verify (forge script) — the standard command

```bash
# Fuji
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url avax_fuji \
  --chain-id 43113 \
  --broadcast \
  --verify \
  --verifier etherscan \
  --verifier-url https://api.routescan.io/v2/network/testnet/evm/43113/etherscan \
  --etherscan-api-key $SNOWTRACE_API_KEY \
  -vvvv

# Mainnet (swap fuji → mainnet, 43113 → 43114)
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

Add `--slow` if you see nonce errors or silent broadcast failures.

### Deployment sequence (always follow this order)

```
1. forge build           → zero errors
2. forge test            → all pass
3. forge script ... (no --broadcast)   → simulate, confirm output
4. forge script ... --broadcast --verify → deploy + verify
5. Confirm: "Deployed to: 0x..." and "Contract successfully verified"
6. Record address in deployments/<network>.json
```

---

## Layer 2 — cast interactions

> Only read this if you need to call, send transactions to, or read state from a deployed contract.
> Read: `docs/avalanche.md` — section **7. Interacting with Deployed Contracts (cast)**

---

## Layer 3 — Common errors

> Only read this if a deployment step is failing.
> Read: `docs/avalanche.md` — section **11. Common Errors and Fixes**

Quick lookup:
- `transaction underpriced` → add `--gas-price 30000000000`
- `Invalid API Key` → you're using the wrong verifier URL, use Routescan
- `chain ID mismatch` → Fuji = 43113, Mainnet = 43114
- `Stack too deep` → add `via_ir = true` in foundry.toml

---

## Layer 4 — Full foundry.toml reference

> Only read this if setting up the full foundry.toml from scratch (CI profiles, fuzz runs, optimizer settings).
> Read: `docs/avalanche.md` — section **9. foundry.toml Full Reference for Avalanche**

---

## Layer 5 — anvil forking

> Only read this if setting up a local fork of Fuji or mainnet for testing.
> Read: `docs/avalanche.md` — section **8. Local Forking with anvil**

---

## Layer 6 — Post-deploy verification (already-deployed contracts)

> Only read this if deployment succeeded but verification failed separately.
> Read: `docs/avalanche.md` — section **6. Verifying Already-Deployed Contracts**
