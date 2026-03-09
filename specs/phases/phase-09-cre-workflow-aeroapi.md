# Phase 9 — CRE Workflow (AeroAPI)

Status: planned
Started: —
Completed: —

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

- [ ] 1. Create account at `cre.chain.link` (Early Access required for deployment, not for simulation)
- [ ] 2. Install CRE CLI — confirm with `cre --version`; log in with `cre auth login`
- [ ] 3. Initialise project: run `cre workflow init flight-insurance-settlement` inside the `cre/` directory at the project root — confirm `package.json`, `tsconfig.json`, and `src/workflow.ts` scaffold are created
- [ ] 4. Install dependencies from `package.json` (includes `@chainlink/cre-sdk`)

### TypeScript Source

- [ ] 5. Write `cre/src/types.ts` — shared types:
  - `FlightStatus` enum matching on-chain: `Unknown = 0, OnTime = 1, Delayed = 2, Cancelled = 3`
  - `Flight` struct: `{ flightId: string, flightDate: string }`
  - `AeroApiFlight` — shape of a single flight object from AeroAPI matching the mock fixtures: `ident`, `cancelled`, `status`, `arrival_delay`, `progress_percent`, `scheduled_in`, `actual_in`, `actual_on`
  - `AeroApiResponse` — `{ flights: AeroApiFlight[] }`

- [ ] 6. Write `cre/src/flightaware.ts` — export `parseFlightUpdate(data: AeroApiResponse): FlightStatus`:
  - Return `Unknown` if `data.flights` is empty or null
  - Take `flights[flights.length - 1]` (most recent leg for the ident)
  - If `flight.cancelled === true` → return `Cancelled`
  - Compute delay in seconds from `arrival_delay` field; fall back to `actual_on` vs `scheduled_in` timestamp diff when `actual_in` is null and `actual_on` is set
  - Compare delay to `DELAY_THRESHOLD_MINUTES * 60` → return `OnTime` or `Delayed`
  - Export `DELAY_THRESHOLD_MINUTES` as a named constant (value confirmed in pre-work notes)
  - Handle the in-flight case per the decision recorded in pre-work notes

- [ ] 7. Write `cre/src/flightaware.test.ts` — one test per fixture in `mock_aero_api/`:
  - `ontime-landed.json` → `OnTime`
  - `delayed-landed.json` → `Delayed`
  - `cancelled-weather.json` → `Cancelled`
  - `cancelled-mechanical.json` → `Cancelled`
  - `cancelled-unknown.json` → `Cancelled`
  - `inflight-ontime.json` → per pre-work decision (OnTime or Unknown)
  - `inflight-delayed.json` → per pre-work decision (Delayed or Unknown)
  - `landed-fallback-runway.json` → `OnTime` (uses `actual_on` fallback, zero delay)
  - `empty.json` → `Unknown`

- [ ] 8. Run unit tests: `npm test` (or `npx jest`) inside `cre/` — all 9 cases must pass

- [ ] 9. Write `cre/src/workflow.ts` — main CRE workflow entry point:
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

- [ ] 10. Write `cre/src/config.ts` — exports `ORACLE_AGGREGATOR_ADDRESS`, `CONTROLLER_ADDRESS`, `RISK_VAULT_ADDRESS`, `RPC_URL` as typed string constants (values filled in per environment — placeholder for now, overridden at simulation/deploy time)

### Local Simulation

- [ ] 11. Deploy all contracts to a local Anvil fork of Fuji using `contracts/script/Deploy.s.sol` (or `forge script`); note deployed addresses
- [ ] 12. Update `cre/src/config.ts` with the local Anvil addresses and RPC URL (`http://127.0.0.1:8545`)
- [ ] 13. On the local fork: call `controller.setCreWorkflow(simulatedWorkflowAddress)` and `aggregator.setOracle(simulatedWorkflowAddress)` so the guards pass during simulation (CRE injects a deterministic simulated signer address — read it from `cre workflow simulate` output on first run)
- [ ] 14. Add the AeroAPI secret for simulation: `cre secrets set AEROAPI_KEY --value "your-key"`
- [ ] 15. Seed the local fork: approve a route on GovernanceModule, deposit USDC as underwriter, buy insurance as a traveler — confirms `activeFlightCount() == 1`
- [ ] 16. Run `cre workflow simulate` — confirm the full tick executes without error: reads active flights, calls AeroAPI, writes status updates, calls `checkAndSettle()`, calls `snapshot()`
- [ ] 17. Confirm all four workflow paths during simulation:
  - Flight with final AeroAPI status → status written to OracleAggregator, pool settled
  - Flight still en route → no status written, pool stays active
  - AeroAPI error → no status written, no revert, execution continues
  - `checkAndSettle()` with no settled flights → clean no-op

### Build

- [ ] 18. Run `cre workflow build` inside `cre/` — confirm WASM artifact produced at `cre/dist/workflow.wasm` with no errors

### Gate

All unit tests pass for all 9 mock fixture cases. `cre workflow simulate` completes cleanly covering all four flight-status paths. `cre workflow build` produces `cre/dist/workflow.wasm` without error. No contract changes required — Solidity is unchanged.

---

## Work Log

> Populated by the agent during work. Do not edit manually.

---

## Files Created / Modified

> Populated by the agent during work.

- `cre/` — new CRE workflow project directory
- `cre/src/types.ts` — shared type definitions
- `cre/src/flightaware.ts` — AeroAPI response parser + `DELAY_THRESHOLD_MINUTES`
- `cre/src/flightaware.test.ts` — unit tests against `mock_aero_api/` fixtures
- `cre/src/workflow.ts` — main CRE cron workflow handler
- `cre/src/config.ts` — contract addresses and RPC URL config
- `cre/dist/workflow.wasm` — compiled WASM artifact (built, not committed)

---

## Decisions Made

> Key architectural or implementation decisions locked in during this phase. Populated during work.

---

## Completion Summary

> Populated by /complete-phase. Do not edit manually.
