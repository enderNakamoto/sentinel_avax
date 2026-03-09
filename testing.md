# Testing

## Forge tests (Solidity)

All forge commands run from inside `contracts/`.

```bash
cd contracts

# Run the full test suite (209 tests across 6 contracts + integration)
forge test

# Run with gas reporting
forge test --gas-report

# Run a specific test file
forge test --match-path test/Integration.t.sol

# Run a specific test by name
forge test --match-test test_buyInsurance_success -vvvv
```

---

## CRE workflow unit tests

Tests for the AeroAPI response parser (`parseFlightUpdate`) run against the mock fixtures in `mock_aero_api/`. No CRE CLI or network connection required.

### Run all tests

```bash
cd cre
npm install   # first time only
npm test
```

Jest picks up `src/flightaware.test.ts` automatically via `jest.config.js`. You should see all 10 tests pass: `ontime-landed`, `delayed-landed`, `cancelled-weather`, `cancelled-mechanical`, `cancelled-unknown`, `inflight-ontime`, `inflight-delayed`, `landed-fallback-runway`, `empty`.

### Run a single test by name

```bash
npm test -- --testNamePattern "ontime"
```

### Watch mode while editing

```bash
npm test -- --watch
```

---

## CRE workflow local simulation

End-to-end test of the full workflow tick against a local Anvil fork. Requires the [CRE CLI](https://docs.chain.link/cre/getting-started/overview) and an [AeroAPI key](https://flightaware.com/commercial/aeroapi/).

**1. Start an Anvil fork of Fuji**

```bash
anvil --fork-url $AVAX_FUJI_RPC
```

**2. Deploy contracts to the local fork**

```bash
cd contracts
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url http://127.0.0.1:8545 \
  --broadcast \
  -vvvv
```

Note the logged contract addresses.

**3. Update `cre/src/config.ts`** with the deployed addresses.

**4. Run a first simulation pass to get the simulated signer address**

```bash
cd cre
cre workflow simulate --target local --trigger-index 0
```

Read the simulated signer address from the output (labelled something like `workflow signer` or `forwarder`).

**5. Wire the local fork**

```bash
cast send $ORACLE_AGGREGATOR_ADDRESS \
  "setOracle(address)" $SIMULATED_SIGNER \
  --rpc-url http://127.0.0.1:8545 --private-key $PRIVATE_KEY

cast send $CONTROLLER_ADDRESS \
  "setCreWorkflow(address)" $SIMULATED_SIGNER \
  --rpc-url http://127.0.0.1:8545 --private-key $PRIVATE_KEY
```

**6. Seed the fork** (approve a route, deposit USDC as underwriter, buy insurance as traveler)

```bash
# Approve a route
cast send $GOVERNANCE_ADDRESS \
  "approveRoute(string,string,string,uint256,uint256)" \
  "AA123" "DEN" "SEA" 12000000 150000000 \
  --rpc-url http://127.0.0.1:8545 --private-key $PRIVATE_KEY

# Confirm one active flight is registered
cast call $ORACLE_AGGREGATOR_ADDRESS "activeFlightCount()(uint256)" \
  --rpc-url http://127.0.0.1:8545
```

**7. Set the AeroAPI secret**

```bash
export AEROAPI_KEY=your-aeroapi-key
```

**8. Run the full simulation**

```bash
cre workflow simulate --target local --trigger-index 0
```

Expected output: workflow reads active flights, fetches AeroAPI, writes status updates to OracleAggregator, calls `checkAndSettle()`, calls `snapshot()`. Check `[USER LOG]` lines for per-flight results.

**9. Build the WASM artifact**

```bash
cre workflow build
# produces: cre/dist/workflow.wasm
```
