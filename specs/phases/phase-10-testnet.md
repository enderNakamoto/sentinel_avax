# Phase 10 — Testnet Deployment

Status: in_progress
Started: 2026-03-09
Completed: —

---

## Goal

Deploy all six Sentinel Protocol contracts to Avalanche Fuji testnet, wire the CRE workflow to the deployed addresses, and verify a full end-to-end cycle — including at least one insurance purchase, one workflow tick, and one settlement — entirely on-chain.

This phase is execution-only. The deploy scripts (`Deploy.s.sol`, `WireCRE.s.sol`), Foundry Fuji config, and CRE workflow YAML target are **already written**. No new code should be needed.

## Dependencies

All prior phases complete:
- Smart contracts: Phases 0–7
- Integration tests passing: Phase 8
- CRE workflow built and tested: Phase 9
- `contracts/script/Deploy.s.sol` — deploys + wires contracts (steps 1–8)
- `contracts/script/WireCRE.s.sol` — wires CRE forwarder into contracts (steps 14–15)
- `foundry.toml` — Fuji RPC endpoint and Routescan verifier already configured
- `cre/workflow.yaml` — `fuji` target already defined
- `cre/config.fuji.json` — needs contract addresses filled in post-deploy

## Pre-work Notes

> This section is for you to fill in before work begins.
> Add constraints, decisions already made, questions to resolve, patterns to follow, or anything the agent should know before touching code.

---

## Subtasks

**Script infrastructure (already complete — nothing to write):**
- [x] `contracts/script/Deploy.s.sol` — deploys all 6 contracts, wires Controller
- [x] `contracts/script/WireCRE.s.sol` — wires CRE forwarder into OracleAggregator + Controller
- [x] `foundry.toml` — Fuji RPC + Routescan verifier configured
- [x] `contracts/.env.example` — all required env vars documented
- [x] `cre/workflow.yaml` — `fuji` target defined
- [x] `cre/config.fuji.json` — scaffold exists (needs addresses)

**Deploy Solidity contracts:**
- [x] 1. Copy `contracts/.env.example` → `contracts/.env`, fill in `PRIVATE_KEY`, `SNOWTRACE_API_KEY`, `AVAX_FUJI_RPC`
- [x] 2. Confirm wallet is funded with AVAX on Fuji (faucet: core.app/tools/testnet-faucet)
- [x] 3. Run `forge script script/Deploy.s.sol:DeployScript --rpc-url avax_fuji --chain-id 43113 --broadcast --verify --verifier etherscan --verifier-url https://api.routescan.io/v2/network/testnet/evm/43113/etherscan --etherscan-api-key $SNOWTRACE_API_KEY -vvvv` from inside `contracts/`
- [x] 4. Copy the logged addresses into `contracts/.env`: `ORACLE_AGGREGATOR_ADDRESS`, `CONTROLLER_ADDRESS`
- [x] 5. Note all six addresses for CRE config

**Configure and deploy CRE workflow:**
- [x] 6. Fill `cre/config.fuji.json` with deployed contract addresses — confirmed: only `schedule` needed; contract addresses are in `cre/src/config.ts` (updated with Fuji addresses)
- [ ] 7. Run `cre workflow simulate --target fuji --trigger-index 0` against real Fuji contracts (dry run only, no --broadcast yet)
- [ ] 8. Run `cre workflow build` to compile TypeScript → WASM
- [ ] 9. Deploy workflow: `cre workflow deploy ./dist/workflow.wasm`
- [ ] 10. Activate workflow: `cre workflow activate <workflow-id>`
- [ ] 11. Read forwarder address: `cre workflow info <workflow-id>` → note `CRE_WORKFLOW_ADDRESS`

**Wire CRE workflow address:**
- [ ] 12. Fill `contracts/.env` with `CRE_WORKFLOW_ADDRESS` from step 11
- [ ] 13. Run `forge script script/WireCRE.s.sol:WireCREScript --rpc-url avax_fuji --chain-id 43113 --broadcast -vvvv` from inside `contracts/`

**Approve routes and fund vault:**
- [x] 14. Call `GovernanceModule.approveRoute()` for at least one testnet route via `cast send` (or Foundry script)
- [x] 15. Mint testnet USDC to underwriter address via `MockUSDC.mint()`
- [x] 16. Approve RiskVault for USDC spend: `cast send <usdc> "approve(address,uint256)" <riskVault> <amount>`
- [x] 17. Deposit into RiskVault: `cast send <riskVault> "deposit(uint256)" <amount>`

**Buy insurance and verify system health:**
- [x] 18. Confirm `isSolventForNewPurchase()` returns true
- [x] 19. Approve Controller for USDC spend (premium amount)
- [x] 20. Buy insurance as traveler via `Controller.buyInsurance()`
- [x] 21. Confirm FlightPool deployed — `Controller.getPool()` returns non-zero address
- [x] 22. Confirm `activeFlightCount()` == 1
- [x] 23. Confirm `OracleAggregator.getFlightStatus()` returns `Unknown (0)`

**Verify CRE workflow live execution:**
- [ ] 24. Wait for first workflow tick (up to 10 min) — check `cre workflow logs <workflow-id>`
- [ ] 25. Confirm `StatusUpdated` event emitted on OracleAggregator (if flight has a determinable status)
- [ ] 26. Wait for next tick — confirm `checkAndSettle()` called and settlement event emitted
- [ ] 27. If `OnTime`: confirm premiums in RiskVault, `activeFlightCount` decremented
- [ ] 28. If `Delayed`/`Cancelled`: call `claim()` as traveler, confirm payoff received

**Verify final state:**
- [ ] 29. Confirm `totalPoliciesSold`, `totalPremiumsCollected`, `totalPayoutsDistributed` are consistent
- [ ] 30. Confirm all six contracts verified on Routescan Fuji explorer

### Gate

Full end-to-end cycle completes on Fuji testnet. CRE workflow is live, writing flight statuses on-chain, and triggering settlement. At least one insurance policy settles to a final state.

---

## Work Log

> Populated by the agent during work. Do not edit manually.

### Session 2026-03-09
Starting phase. Pre-work notes reviewed (no pre-work notes provided — execution-only phase).
All scripts confirmed present and correct.

**Contracts deployed to Fuji and verified (all 6/6 Pass):**
- MockUSDC:         0x18975871ab7E57e0f26fdF429592238541051Fb0
- GovernanceModule: 0x30CCF5C0Ea4F871398136DD643A0544Aba39b26D
- RecoveryPool:     0x981BeeCd15b05A35206cfc44af12373B45613E71
- OracleAggregator: 0x14cF0CD23B5A444f1e57765d12f21ee7F1e8a2c3
- RiskVault:        0x3E65cABB59773a7D21132dAAa587E7Fc777d427C
- Controller:       0xd67c1b05Cdfa20aa23C295a2c24310763fED4888

Wiring complete: OracleAggregator.authorizedController = Controller, RiskVault.controller = Controller

**config.ts updated** with all 3 Fuji addresses (OracleAggregator, Controller, RiskVault).
config.fuji.json confirmed correct — only schedule needed; addresses are TypeScript compile-time constants.

**System bootstrapped:**
- Route approved: AA1 / JFK→LAX, premium=10 USDC, payoff=50 USDC
- Vault funded: 500 USDC deposited
- Insurance purchased: AA1/JFK/LAX for 2026-03-11
- FlightPool deployed: 0x5f0f6c0d512a3133c6a06ce8e3b349957b0e9d1d
- activeFlightCount() = 1 ✓
- OracleAggregator status for AA1/2026-03-11 = Unknown (0) ✓

**Remaining: CRE workflow deploy (steps 7–13) and end-to-end verification (steps 24–30)**

---

## Files Created / Modified

> Populated by the agent during work.

- `contracts/.env` — created from `.env.example`, filled with real keys and deployed addresses (PRIVATE_KEY 0x-prefixed, ORACLE_AGGREGATOR_ADDRESS, CONTROLLER_ADDRESS set)
- `cre/src/config.ts` — OracleAggregator, Controller, RiskVault addresses updated with Fuji testnet values
- `cre/config.fuji.json` — no change needed; schedule-only config is correct for CRE SDK

---

## Decisions Made

> Key architectural or implementation decisions locked in during this phase. Populated during work.

---

## Completion Summary

> Populated by /complete-phase. Do not edit manually.
