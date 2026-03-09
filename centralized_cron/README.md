# centralized_cron — Sentinel Protocol CRE Simulation

This package runs a centralized TypeScript cron that simulates the Chainlink CRE
workflow for Sentinel Protocol on Avalanche Fuji. It polls AeroAPI for flight
statuses and calls the existing on-chain contracts; no Solidity changes are
required.

## 1. Prerequisites

- Node.js 20+
- An Avalanche Fuji RPC URL
- A funded Fuji wallet (EOA) whose private key you control
- Deployed Sentinel contracts on Fuji (see `deploy.md` at the repo root)
- An AeroAPI key from FlightAware

## 2. Wiring the workflow EOA on Fuji

Pick one EOA to act as the "workflow signer" and fund it with Fuji AVAX.

1. Export the private key for this EOA and set it in `.env` as `WORKFLOW_PRIVATE_KEY`.
2. From your usual deployer wallet, wire the contracts so they trust this EOA:

   - Set the OracleAggregator controller (one-time, if not already set):

     ```bash
     cast send $ORACLE_AGGREGATOR_ADDRESS \
       "setController(address)" $CONTROLLER_ADDRESS \
       --rpc-url $AVAX_FUJI_RPC --private-key $DEPLOYER_PRIVATE_KEY
     ```

   - Set the OracleAggregator oracle writer (one-time):

     ```bash
     cast send $ORACLE_AGGREGATOR_ADDRESS \
       "setOracle(address)" $WORKFLOW_EOA_ADDRESS \
       --rpc-url $AVAX_FUJI_RPC --private-key $DEPLOYER_PRIVATE_KEY
     ```

   - Set the Controller CRE workflow address (owner-only, updatable later):

     ```bash
     cast send $CONTROLLER_ADDRESS \
       "setCreWorkflow(address)" $WORKFLOW_EOA_ADDRESS \
       --rpc-url $AVAX_FUJI_RPC --private-key $DEPLOYER_PRIVATE_KEY
     ```

   Here `$WORKFLOW_EOA_ADDRESS` is the address derived from `WORKFLOW_PRIVATE_KEY`.

## 3. Configuration

Create a local `.env` file:

```bash
cd centralized_cron
cp .env.example .env
```

Then edit `.env` and set:

- `AVAX_FUJI_RPC_URL` — Fuji RPC endpoint
- `WORKFLOW_PRIVATE_KEY` — 0x-prefixed private key for the workflow EOA
- `ORACLE_AGGREGATOR_ADDRESS` — deployed OracleAggregator on Fuji
- `CONTROLLER_ADDRESS` — deployed Controller on Fuji
- `AEROAPI_KEY` — your AeroAPI key
- `AEROAPI_BASE_URL` — usually `https://aeroapi.flightaware.com/aeroapi`
- `CRON_SCHEDULE` — optional; defaults to `*/10 * * * *` (every 10 minutes)

On startup, `src/config.ts` validates these values and exits with a clear error
message if anything is missing or malformed.

## 4. Installation

```bash
cd centralized_cron
npm install
```

## 5. Running a single tick

For debugging, you can run a single workflow tick:

```bash
npm run tick
```

This will:

1. Read active flights from `OracleAggregator.getActiveFlights()`.
2. For each flight with `Unknown` status, call AeroAPI for that `flightId` and `date`.
3. Derive a final status:
   - Landed + delay > 45 min  → Delayed
   - Landed + delay <= 45 min → OnTime
   - Cancelled                → Cancelled
   - Scheduled / En Route / errors / empty → Unknown (no write)
4. Call `updateFlightStatus(flightId, date, status)` on OracleAggregator for final statuses.
5. Call `Controller.checkAndSettle()` once at the end of the tick.

All transactions and errors are logged to stdout.

## 6. Running as a local cron

To run continuously with a cron schedule:

```bash
npm start
```

This runs `dist/index.js` (or `src/index.ts` in dev via `npm run dev`), which:

1. Prints the workflow signer address.
2. Runs `onCronTick()` once immediately on startup.
3. Schedules `onCronTick()` according to `CRON_SCHEDULE` using `node-cron`.

If a tick fails (AeroAPI error, on-chain revert, etc.), the error is logged and
the process continues to the next scheduled tick.

## 7. Migration path to real CRE

This service is designed to mirror the eventual CRE workflow:

- `src/aero/deriveStatus.ts` contains pure status-derivation logic that can be
  copied into the CRE project.
- `src/workflow.ts` reads active flights, writes final statuses, then calls
  `checkAndSettle()`, matching the intended CRE behavior.

When you are ready to move to Chainlink CRE:

1. Stop the `centralized_cron` process.
2. Deploy the CRE workflow and obtain its forwarder/signer address.
3. Call `Controller.setCreWorkflow(creForwarderAddress)` so only CRE can call
   `checkAndSettle()`.
4. Ensure the CRE workflow forwarder uses the same address that is already set
   as `authorizedOracle` on OracleAggregator, or plan a follow-up change that
   introduces a forwarding contract if a different address is required.

The Solidity contracts do not need to change for this centralized simulation;
only the off-chain implementation is swapped out.

