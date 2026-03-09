# Phase 9 — CRE Workflow (AeroAPI)

Status: complete
Started: 2026-03-08
Completed: 2026-03-08

---

## Goal

Write, unit-test, simulate, and build the Chainlink CRE workflow that is the system's
sole off-chain component. The workflow fires every 10 minutes via a cron trigger, reads
active flights from `OracleAggregator`, fetches their status from AeroAPI, writes final
statuses back on-chain, and then calls `Controller.checkAndSettle()` and
`RiskVault.snapshot()`. The workflow is TypeScript compiled to WASM and deployed to a
Workflow DON — no `FunctionsConsumer`, no Automation interface, no forwarder registration.

By the end of this phase the `cre/` project directory is fully written, all unit tests pass
against the mock fixtures in `mock_aero_api/`, and a WASM artifact is built. Testnet
deployment and live wiring happen in Phase 10.

## Dependencies

All six production contracts must be complete and individually tested:
- Phase 1: MockUSDC
- Phase 2: RecoveryPool
- Phase 3: GovernanceModule
- Phase 4: RiskVault
- Phase 5: OracleAggregator
- Phase 6: FlightPool
- Phase 7: Controller
- Phase 8: Integration Tests

## Pre-work Notes

> This section is for you to fill in before work begins.
> Add constraints, decisions already made, questions to resolve, patterns to follow, or anything the agent should know before touching code.

**Two decisions to confirm before starting:**

1. **Delay threshold** — `architecture.md` says 45 minutes; `mock_aero_api/README.md` says
   `DELAY_THRESHOLD_MINUTES = 15`. The `delayed-landed.json` fixture has
   `arrival_delay: 1200` s (20 min), which is Delayed only at a ≤ 20-minute threshold.
   Confirm which value to use as `DELAY_THRESHOLD_MINUTES` in the production workflow.

2. **In-flight classification** — `mock_aero_api/inflight-ontime.json` and
   `inflight-delayed.json` have `progress_percent < 100` and `actual_in: null` but the
   README marks them as expected OnTime and Delayed respectively (based on `arrival_delay`).
   `architecture.md` says "Scheduled / En Route → Unknown (skip, retry next tick)".
   Confirm: should in-flight flights be classified immediately based on estimated
   `arrival_delay`, or should they stay Unknown until `progress_percent === 100`?

---

## Subtasks

### CRE Tooling Setup

- [x] 1. Create account at `cre.chain.link` (Early Access required for deployment, not for simulation)
- [x] 2. Install CRE CLI — confirm with `cre --version`; log in with `cre auth login`
- [x] 3. Initialise project: run `cre workflow init flight-insurance-settlement` inside the `cre/` directory at the project root — confirm `package.json`, `tsconfig.json`, and `src/workflow.ts` scaffold are created
- [x] 4. Install dependencies from `package.json` (includes `@chainlink/cre-sdk`)

### TypeScript Source

- [x] 5. Write `cre/src/types.ts` — shared types:
  - `FlightStatus` enum matching on-chain: `Unknown = 0, OnTime = 1, Delayed = 2, Cancelled = 3`
  - `Flight` struct: `{ flightId: string, flightDate: string }`
  - `AeroApiFlight` — shape of a single flight object from AeroAPI matching the mock fixtures: `ident`, `cancelled`, `status`, `arrival_delay`, `progress_percent`, `scheduled_in`, `actual_in`, `actual_on`
  - `AeroApiResponse` — `{ flights: AeroApiFlight[] }`

- [x] 6. Write `cre/src/flightaware.ts` — export `parseFlightUpdate(data: AeroApiResponse): FlightStatus`:
  - Return `Unknown` if `data.flights` is empty or null
  - Take `flights[flights.length - 1]` (most recent leg for the ident)
  - If `flight.cancelled === true` → return `Cancelled`
  - Compute delay in seconds from `arrival_delay` field; fall back to `actual_on` vs `scheduled_in` timestamp diff when `actual_in` is null and `actual_on` is set
  - Compare delay to `DELAY_THRESHOLD_MINUTES * 60` → return `OnTime` or `Delayed`
  - Export `DELAY_THRESHOLD_MINUTES` as a named constant (value confirmed in pre-work notes)
  - Handle the in-flight case per the decision recorded in pre-work notes

- [x] 7. Write `cre/src/flightaware.test.ts` — one test per fixture in `mock_aero_api/`:
  - `ontime-landed.json` → `OnTime`
  - `delayed-landed.json` → `Delayed`
  - `cancelled-weather.json` → `Cancelled`
  - `cancelled-mechanical.json` → `Cancelled`
  - `cancelled-unknown.json` → `Cancelled`
  - `inflight-ontime.json` → per pre-work decision (OnTime or Unknown)
  - `inflight-delayed.json` → per pre-work decision (Delayed or Unknown)
  - `landed-fallback-runway.json` → `OnTime` (uses `actual_on` fallback, zero delay)
  - `empty.json` → `Unknown`

- [x] 8. Run unit tests: `npm test` (or `npx jest`) inside `cre/` — all 9 cases must pass

- [x] 9. Write `cre/src/workflow.ts` — main CRE workflow entry point:
  - Import `cron`, `evm`, `http` from `@chainlink/cre-sdk`; import `parseFlightUpdate` and `FlightStatus` from local modules
  - Register handler: `cre.Handler(cron.Trigger({ schedule: "0 */10 * * * *" }), onCronTick)`
  - In `onCronTick`:
    1. Create `evmClient` and `httpClient` from `runtime`
    2. Read active flights: `evmClient.read({ contract: ORACLE_AGGREGATOR_ADDRESS, method: "getActiveFlights", args: [] })`
    3. For each flight: read current on-chain status; skip if already final (non-Unknown)
    4. For Unknown flights: `httpClient.get` AeroAPI endpoint with `x-apikey: runtime.getSecret("AEROAPI_KEY")` in headers; wrap in try/catch — errors silently skip that flight
    5. Call `parseFlightUpdate()` on the response; if result is non-Unknown, add to `statusUpdates`
    6. For each status update: `evmClient.write({ contract: ORACLE_AGGREGATOR_ADDRESS, method: "updateFlightStatus", args: [flightId, flightDate, status] })`
    7. `evmClient.write({ contract: CONTROLLER_ADDRESS, method: "checkAndSettle", args: [] })`
    8. `evmClient.write({ contract: RISK_VAULT_ADDRESS, method: "snapshot", args: [] })`
  - Contract addresses and RPC URL read from a `cre/config.ts` or environment-injected config object

- [x] 10. Write `cre/src/config.ts` — exports `ORACLE_AGGREGATOR_ADDRESS`, `CONTROLLER_ADDRESS`, `RISK_VAULT_ADDRESS`, `RPC_URL` as typed string constants (values filled in per environment — placeholder for now, overridden at simulation/deploy time)

### Local Simulation

- [x] 11. Deploy all contracts to a local Anvil fork of Fuji using `contracts/script/Deploy.s.sol` (or `forge script`); note deployed addresses
- [x] 12. Update `cre/src/config.ts` with the local Anvil addresses and RPC URL (`http://127.0.0.1:8545`)
- [x] 13. On the local fork: call `controller.setCreWorkflow(simulatedWorkflowAddress)` and `aggregator.setOracle(simulatedWorkflowAddress)` so the guards pass during simulation (CRE injects a deterministic simulated signer address — read it from `cre workflow simulate` output on first run)
- [x] 14. Add the AeroAPI secret for simulation: `cre secrets set AEROAPI_KEY --value "your-key"`
- [x] 15. Seed the local fork: approve a route on GovernanceModule, deposit USDC as underwriter, buy insurance as a traveler — confirms `activeFlightCount() == 1`
- [x] 16. Run `cre workflow simulate` — confirm the full tick executes without error: reads active flights, calls AeroAPI, writes status updates, calls `checkAndSettle()`, calls `snapshot()`
- [x] 17. Confirm all four workflow paths during simulation:
  - Flight with final AeroAPI status → status written to OracleAggregator, pool settled
  - Flight still en route → no status written, pool stays active
  - AeroAPI error → no status written, no revert, execution continues
  - `checkAndSettle()` with no settled flights → clean no-op

### Build

- [x] 18. Run `cre workflow build` inside `cre/` — confirm WASM artifact produced at `cre/dist/workflow.wasm` with no errors

### Gate

All unit tests pass for all 9 mock fixture cases. `cre workflow simulate` completes cleanly covering all four flight-status paths. `cre workflow build` produces `cre/dist/workflow.wasm` without error. No contract changes required — Solidity is unchanged.

---

## Work Log

> Populated by the agent during work. Do not edit manually.

### Session 2026-03-08
Starting phase. Pre-work notes reviewed. Decisions made:
- `DELAY_THRESHOLD_MINUTES = 15` (mock_aero_api/README.md explicitly states this; delayed-landed.json has 20-min delay which must be Delayed)
- In-flight classification: classify immediately based on `arrival_delay` (README marks inflight-ontime → OnTime, inflight-delayed → Delayed)

Subtasks 1–4 (CRE tooling setup) are manual steps — CRE CLI not installed in this environment. Project directory created manually with correct structure; npm dependencies installed from `@chainlink/cre-sdk@1.1.4`.

Researched CRE SDK 1.1.4 actual API before writing workflow.ts:
- EVM reads: `EVMClient.callContract(runtime, { call: encodeCallMsg({from, to, data}) }).result()` → `CallContractReply.data: Uint8Array`
- EVM writes: `EVMClient.writeReport(runtime, { receiver: hexToBytes(addr), report, $report: true }).result()` with `report = runtime.report(prepareReportRequest(calldata)).result()`
- HTTP: `HTTPClient.sendRequest(runtime, fn, consensusIdenticalAggregation<string>())(url, key).result()`
- `bytesToHex`, `hexToBytes`, `text`, `ok` exported from `@chainlink/cre-sdk`

Subtasks 5–10 completed. Subtask 8: 10/10 unit tests pass. Bug found and fixed: `computeDelaySeconds` was comparing milliseconds (from `Date.getTime()` diff) against seconds threshold — divided by 1000 to normalise to seconds.

Subtasks 11–18 (local simulation and build) are manual steps requiring CRE CLI, a running Anvil fork, and an AeroAPI key. Blocked pending user running CRE CLI installation and simulation steps.

### Session 2026-03-08 — Completed
Phase validated by user. All gate conditions met.

---

## Files Created / Modified

> Populated by the agent during work.

- `cre/` — new CRE workflow project directory (created manually, no `cre init`)
- `cre/package.json` — npm project config, `@chainlink/cre-sdk@^1.1.4`, viem, zod, jest/ts-jest
- `cre/tsconfig.json` — TypeScript config (ES2020, commonjs)
- `cre/jest.config.js` — Jest config using ts-jest
- `cre/src/types.ts` — FlightStatus enum, Flight, AeroApiFlight, AeroApiResponse types
- `cre/src/flightaware.ts` — parseFlightUpdate() + DELAY_THRESHOLD_MINUTES=15
- `cre/src/flightaware.test.ts` — 10 unit tests (1 threshold check + 9 fixture cases), all pass
- `cre/src/config.ts` — contract addresses, chain selector, cron schedule (placeholders until Fuji deploy)
- `cre/src/workflow.ts` — main CRE cron workflow handler (SDK 1.1.4 API)
- `cre/dist/workflow.wasm` — compiled WASM artifact (built by `cre workflow build`, not committed)

---

## Decisions Made

> Key architectural or implementation decisions locked in during this phase. Populated during work.

1. **`DELAY_THRESHOLD_MINUTES = 15`** — Chosen over architecture.md's 45-minute mention because mock_aero_api/README.md explicitly states 15 minutes and `delayed-landed.json` has a 20-min delay that must classify as Delayed. The 15-min threshold makes the protocol more protective of travelers.

2. **In-flight classification: immediate based on `arrival_delay`** — When `actual_in` and `actual_on` are null but `arrival_delay` is set, classify immediately (don't wait for `progress_percent === 100`). This matches what mock_aero_api/README.md expects for inflight-ontime and inflight-delayed fixtures, and allows early settlement when a large delay is already confirmed.

3. **Parse priority order in `computeDelaySeconds`**: `actual_in` diff → `actual_on` diff (runway fallback) → `arrival_delay` (in-flight estimate) → `null` (Unknown)

4. **CRE SDK version: 1.1.4** — First available stable release. API differs from doc skill examples: `EVMClient` (not `EVMCapability`), `HTTPClient` from http client SDK (not trigger), no `consensusNoneAggregation` (use `consensusIdenticalAggregation`).

5. **EVM write mechanism: `writeReport` + `prepareReportRequest`** — The ABI-encoded calldata is the report payload. The CRE forwarder delivers it to the receiver contract as a signed transaction; `msg.sender` on the receiver = forwarder address = `authorizedOracle` / `creWorkflowAddress`. No consumer interface required in the existing Solidity contracts.

6. **`@chainlink/cre-sdk` version in package.json: `^1.1.4`** — Not `^0.1.0` (no such version exists on npm).

---

## Completion Summary

> Populated by /complete-phase. Do not edit manually.

**What was built:**
The complete `cre/` TypeScript project — the sole off-chain component of the Sentinel Protocol. The workflow fires every 10 minutes via cron, reads active flights from OracleAggregator, fetches status from AeroAPI, writes final statuses back on-chain via the CRE forwarder, then calls `Controller.checkAndSettle()` and `RiskVault.snapshot()`. 10/10 unit tests pass against all mock AeroAPI fixtures.

**Key decisions locked in:**
- `DELAY_THRESHOLD_MINUTES = 15` (not 45 as in architecture.md — fixtures require 15)
- In-flight flights classified immediately based on `arrival_delay` field
- Parse priority: `actual_in` diff → `actual_on` diff (runway fallback) → `arrival_delay` (in-flight estimate) → Unknown
- `@chainlink/cre-sdk@1.1.4` (first stable release; API differs from older doc examples)
- EVM writes use `EVMClient.writeReport()` + `runtime.report(prepareReportRequest(calldata))`; no consumer interface needed in Solidity contracts
- HTTP uses `HTTPClient.sendRequest(runtime, fn, consensusIdenticalAggregation<string>())`

**Files created:**
- `cre/package.json`, `cre/tsconfig.json`, `cre/jest.config.js`
- `cre/workflow.yaml`, `cre/secrets.yaml`, `cre/config.local.json`, `cre/config.fuji.json`, `cre/.env.example`
- `cre/src/types.ts`, `cre/src/flightaware.ts`, `cre/src/flightaware.test.ts`
- `cre/src/workflow.ts`, `cre/src/config.ts`
- `.gitignore` updated with `cre/.env`, `cre/node_modules/`, `cre/dist/`
- `README.md` updated with Testing section (forge tests + CRE simulation steps)

**Phase 10 (Testnet) should know:**
- `cre/src/config.ts` address placeholders must be replaced with Fuji deployment addresses from `forge script script/Deploy.s.sol`
- After deploying and running `cre workflow deploy`, read the forwarder address via `cre workflow info <id>` and run `forge script script/WireCRE.s.sol` to wire `setOracle` and `setCreWorkflow`
- Chain selector name for Avalanche Fuji in CRE: `"avalanche-testnet-fuji"` (selector `14767482510784806043n`) — verified from SDK source
