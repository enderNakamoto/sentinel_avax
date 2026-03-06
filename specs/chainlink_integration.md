# Flight Delay Insurance Protocol — CRE Integration

---

## Overview

This protocol uses the **Chainlink Runtime Environment (CRE)** as its sole Chainlink
integration. One TypeScript workflow, deployed to a Decentralised Oracle Network, handles
everything that previously required two separate Chainlink products (Automation and Functions):

| Responsibility | How CRE handles it |
|---|---|
| Triggering the settlement loop every 10 minutes | Native `cron.Trigger` — no contract interface required |
| Fetching real-world flight status from AeroAPI | `http.NewClient()` with native secrets management |
| Writing flight statuses on-chain | `evmClient.write()` EVM write capability |
| Calling `Controller.checkAndSettle()` | `evmClient.write()` in the same tick |
| Triggering daily share price snapshots | `evmClient.write(RiskVault.snapshot())` at end of each tick |

> **CRE deployment note:** Workflow deployment is in Early Access. Create an account at
> `cre.chain.link` and request access before attempting deployment. Simulation runs locally
> without access approval — begin development there.

---

## What CRE Is

CRE is an orchestration layer for building workflows that combine on-chain and off-chain
operations. A workflow is written in TypeScript (or Go) using the CRE SDK, compiled to
WebAssembly, and deployed to a Workflow DON via the CRE CLI.

Key properties for this protocol:

- Every capability call (HTTP fetch, EVM read, EVM write) is independently executed by
  each node in the DON and verified by BFT consensus before the result is used.
- Workflows are stateless per execution. State lives on-chain. Each tick is a fresh run.
- Secrets (API keys) are managed natively by the CRE platform — never in source code,
  never on-chain, no manual upload script, no expiry rotation.
- A single LINK cost model replaces the separate Automation upkeep fund and Functions subscription.

---

## Workflow Structure

The settlement workflow uses the trigger-and-callback model:

```typescript
import { cron, evm, http } from "@chainlink/cre-sdk";

// Register handler: cron trigger fires every 10 minutes
cre.Handler(
  cron.Trigger({ schedule: "0 */10 * * * *" }),
  onCronTick
);

async function onCronTick(
  config:  Config,
  runtime: cre.Runtime,
  trigger: cron.Payload
): Promise<void> {
  const evmClient  = evm.NewClient(runtime);
  const httpClient = http.NewClient(runtime);

  // 1. Read active flights from OracleAggregator
  const flights: FlightRecord[] = await evmClient.read({
    contract: ORACLE_AGGREGATOR_ADDRESS,
    method:   "getActiveFlights",
    args:     []
  });

  // 2. For each Unknown flight — fetch from AeroAPI
  const statusUpdates: StatusUpdate[] = [];

  for (const flight of flights) {
    const currentStatus = await evmClient.read({
      contract: ORACLE_AGGREGATOR_ADDRESS,
      method:   "getFlightStatus",
      args:     [flight.flightId, flight.flightDate]
    });

    if (currentStatus !== FlightStatus.Unknown) continue; // already final

    try {
      const resp = await httpClient.get({
        url: `https://aeroapi.flightaware.com/aeroapi/flights/${flight.flightId}`,
        params: {
          start: toDateString(flight.flightDate) + "T00:00:00Z",
          end:   toDateString(flight.flightDate) + "T23:59:59Z"
        },
        headers: { "x-apikey": secrets.AEROAPI_KEY }
      });

      const derived = deriveStatus(resp.data, flight.flightDate);
      if (derived !== FlightStatus.Unknown) {
        statusUpdates.push({ flight, status: derived });
      }
    } catch {
      // API error — leave Unknown, retry next tick
    }
  }

  // 3. Write final statuses to OracleAggregator
  for (const update of statusUpdates) {
    await evmClient.write({
      contract: ORACLE_AGGREGATOR_ADDRESS,
      method:   "updateFlightStatus",
      args:     [update.flight.flightId, update.flight.flightDate, update.status]
    });
  }

  // 4. Call Controller.checkAndSettle()
  await evmClient.write({
    contract: CONTROLLER_ADDRESS,
    method:   "checkAndSettle",
    args:     []
  });

  // 5. Call RiskVault.snapshot() — no-op if already snapshotted today
  await evmClient.write({
    contract: RISK_VAULT_ADDRESS,
    method:   "snapshot",
    args:     []
  });
}
```

### Status Derivation Logic

```typescript
const DELAY_THRESHOLD_MS = 45 * 60 * 1000; // 45 minutes

function deriveStatus(data: AeroApiResponse, flightDate: bigint): FlightStatus {
  const flights = data.flights;
  if (!flights || flights.length === 0) return FlightStatus.Unknown;

  const flight    = flights[flights.length - 1]; // most recent entry for this ident
  const scheduled = new Date(flight.scheduled_in).getTime();
  const actual    = flight.actual_in
    ? new Date(flight.actual_in).getTime()
    : null;

  if (flight.status === "Cancelled") return FlightStatus.Cancelled;

  if (flight.status === "Landed" && actual !== null) {
    return (actual - scheduled) > DELAY_THRESHOLD_MS
      ? FlightStatus.Delayed
      : FlightStatus.OnTime;
  }

  return FlightStatus.Unknown; // Scheduled or En Route — not yet final
}
```

---

## Solidity Side

The entire Chainlink integration in Solidity is a single access guard on the Controller.
There is no `FunctionsConsumer` contract, no Automation interface, and no forwarder.

### Controller — CRE Access Guard

```solidity
// State
address public creWorkflowAddress;

// Modifier
modifier onlyCREWorkflow() {
    require(msg.sender == creWorkflowAddress, "Controller: not CRE workflow");
    _;
}

// Setter — owner only, callable after workflow deployment
function setCreWorkflow(address workflow) external onlyOwner {
    require(workflow != address(0), "Controller: zero address");
    creWorkflowAddress = workflow;
}

// Entry point — called by CRE workflow once per tick
function checkAndSettle() external onlyCREWorkflow {
    _checkAndSettle();
    riskVault.snapshot();
}
```

### `_checkAndSettle()` — No Oracle Requests

The internal settlement loop does not initiate any oracle requests. The CRE workflow writes
all final statuses to OracleAggregator before calling `checkAndSettle()`. The Controller
reads from OracleAggregator and acts:

```solidity
function _checkAndSettle() internal {
    uint256 length = activeFlightKeys.length;
    uint256 i = 0;

    while (i < length) {
        bytes32 key = activeFlightKeys[i];
        FlightRecord storage record = flightRecords[key];

        if (!record.active) {
            _removeFlightKey(i);
            length--;
            continue;
        }

        IOracleAggregator.FlightStatus status = oracleAggregator.getFlightStatus(
            record.flightId,
            record.flightDate
        );

        if (status == IOracleAggregator.FlightStatus.Unknown) {
            i++; // not yet final — skip
        } else if (status == IOracleAggregator.FlightStatus.OnTime) {
            _settleNotDelayed(key, FlightPool(record.poolAddress));
            _clearFlight(key, i);
            length--;
        } else {
            // Delayed or Cancelled
            _settleDelayed(key, FlightPool(record.poolAddress));
            _clearFlight(key, i);
            length--;
        }
    }
}
```

### OracleAggregator — No Code Change Required

The only change for the CRE design is the address passed to `setOracle()`. Previously this
was the `FunctionsConsumer` contract address. Now it is the CRE workflow's forwarder/signer
address. The contract itself is identical — the one-time setter pattern and append-only
status guard are unchanged.

---

## Secrets Management

The AeroAPI key is stored as a CRE native secret. There is no `SecretsManager` upload
script, no `slotId` / `version` pair to manage, and no expiry rotation required. Secrets
are managed through the CRE platform directly.

```bash
# Set the secret once
cre secrets set AEROAPI_KEY --value "your-api-key"

# Update the secret (no contract transaction required)
cre secrets set AEROAPI_KEY --value "new-api-key"
```

In the workflow source, the secret is accessed as:

```typescript
headers: { "x-apikey": secrets.AEROAPI_KEY }
```

The CRE runtime injects the value at execution time. The key never appears in source code
or on-chain.

---

## Workflow Deployment

```bash
# Prerequisites
# 1. Create account at cre.chain.link (Early Access required for deployment)
# 2. Install CRE CLI
cre --version

# Authenticate
cre auth login

# Initialise project
cre workflow init flight-insurance-settlement

# Add secret
cre secrets set AEROAPI_KEY --value "your-api-key"

# Simulate locally (no access approval needed, uses real HTTP + EVM reads)
cre workflow simulate

# Build to WASM
cre workflow build

# Deploy to DON (requires Early Access)
cre workflow deploy ./dist/workflow.wasm

# Activate
cre workflow activate <workflow-id>

# Read the workflow's forwarder/signer address
cre workflow info <workflow-id>
```

After reading the forwarder address, wire it into the Solidity contracts:

```
OracleAggregator.setOracle(creWorkflowAddress)    ← one-time, locks forever
Controller.setCreWorkflow(creWorkflowAddress)       ← owner only
```

---

## Workflow Lifecycle Management

```bash
# Check status of deployed workflows
cre workflow list

# View details for a specific workflow
cre workflow info <workflow-id>

# Stream execution logs (useful for debugging API responses and EVM write failures)
cre workflow logs <workflow-id>

# Pause (stops ticks — no settlement runs while paused)
cre workflow pause <workflow-id>

# Resume a paused workflow
cre workflow activate <workflow-id>

# Update workflow source (redeploy WASM — no Solidity transaction required)
cre workflow build
cre workflow update <workflow-id> ./dist/workflow.wasm

# Delete permanently
cre workflow delete <workflow-id>
```

Pausing the workflow freezes the settlement loop. Flights with statuses already written to
OracleAggregator will settle on the first tick after resuming. Flights still `Unknown` will
not settle until the workflow resumes and the next AeroAPI fetch returns a final status.

---

## Local Simulation

Before deploying to a DON, simulate the workflow locally. Simulation compiles to WASM and
runs on your machine with real HTTP calls and real EVM reads against a local chain fork.
EVM writes are simulated — they do not broadcast to mainnet or testnet.

```bash
# Configure environment for simulation
export AEROAPI_KEY="your-aeroapi-key"
export RPC_URL="https://your-rpc-endpoint"

# Run simulation — prints full execution trace
cre workflow simulate

# Simulate with a specific trigger payload
cre workflow simulate --trigger-payload '{"timestamp": 1748736000}'
```

Test all outcomes during simulation:

- A flight that has landed on time → `OnTime` status written, pool settles
- A flight that is delayed > 45 minutes → `Delayed` status written, pool settles
- A cancelled flight → `Cancelled` status written, pool settles
- A flight still en route → no status written, pool stays active
- An AeroAPI error or empty response → no status written, no revert, pool stays active
- `checkAndSettle()` with no settled flights → clean no-op

---

## Foundry Testing

The CRE workflow executes off-chain. In Foundry tests, simulate its effect directly using
`vm.prank`. Test the contracts as if the workflow has already written statuses to
OracleAggregator and is now calling the Controller.

```solidity
function test_settleOnTime() public {
    // Setup: register flight, buy insurance
    vm.prank(address(controller));
    aggregator.registerFlight("AA123", flightDate);

    vm.prank(traveler);
    controller.buyInsurance("AA123", "DEN", "SEA", flightDate);

    // Simulate CRE workflow writing OnTime status
    vm.prank(creWorkflowAddress);
    aggregator.updateFlightStatus("AA123", flightDate, IOracleAggregator.FlightStatus.OnTime);

    // Simulate CRE workflow calling checkAndSettle
    vm.prank(creWorkflowAddress);
    controller.checkAndSettle();

    assertEq(controller.activeFlightCount(), 0);
    assertGt(riskVault.totalManagedAssets(), initialDeposit); // premiums absorbed as yield
}

function test_settleDelayed() public {
    vm.prank(address(controller));
    aggregator.registerFlight("AA123", flightDate);
    vm.prank(traveler);
    controller.buyInsurance("AA123", "DEN", "SEA", flightDate);

    vm.prank(creWorkflowAddress);
    aggregator.updateFlightStatus("AA123", flightDate, IOracleAggregator.FlightStatus.Delayed);

    vm.prank(creWorkflowAddress);
    controller.checkAndSettle();

    address poolAddr = controller.getPoolAddress("AA123", flightDate);
    FlightPool pool = FlightPool(poolAddr);
    assertTrue(pool.isSettled());
    assertTrue(pool.canClaim(traveler));
}

function test_checkAndSettle_revertsIfNotWorkflow() public {
    vm.expectRevert("Controller: not CRE workflow");
    controller.checkAndSettle(); // called from non-workflow address — must revert
}

function test_updateFlightStatus_revertsIfNotOracle() public {
    vm.expectRevert(); // authorizedOracle check
    aggregator.updateFlightStatus("AA123", flightDate, IOracleAggregator.FlightStatus.OnTime);
}

function test_unknownFlightSkipped() public {
    vm.prank(address(controller));
    aggregator.registerFlight("AA123", flightDate);
    vm.prank(traveler);
    controller.buyInsurance("AA123", "DEN", "SEA", flightDate);

    // CRE calls checkAndSettle — flight is Unknown, should be a no-op
    vm.prank(creWorkflowAddress);
    controller.checkAndSettle();

    assertEq(controller.activeFlightCount(), 1); // pool still active
}
```

---

## Deployment Checklist

### CRE Workflow

- [ ] Create account at `cre.chain.link`
- [ ] Install CRE CLI (`cre --version` to confirm)
- [ ] Log in: `cre auth login`
- [ ] Write workflow TypeScript source
- [ ] Add secret: `cre secrets set AEROAPI_KEY --value "..."`
- [ ] Run `cre workflow simulate` against a local Anvil fork with all four outcomes
- [ ] Confirm AeroAPI errors produce no status update and no revert
- [ ] Confirm cancelled flights produce `Cancelled` status, not `Delayed`
- [ ] Build: `cre workflow build`
- [ ] Deploy: `cre workflow deploy ./dist/workflow.wasm` (requires Early Access)
- [ ] Activate: `cre workflow activate <workflow-id>`
- [ ] Read forwarder/signer address: `cre workflow info <workflow-id>`

### Solidity Wiring

- [ ] Deploy all contracts following the order in the architecture document
- [ ] Call `OracleAggregator.setController(controller)` — one-time, locks forever
- [ ] Call `RiskVault.setController(controller)` — one-time, locks forever
- [ ] Call `OracleAggregator.setOracle(creWorkflowAddress)` — one-time, locks forever
- [ ] Call `Controller.setCreWorkflow(creWorkflowAddress)` — owner only

### Post-Deployment Verification

- [ ] `aggregator.authorizedOracle()` equals CRE workflow address
- [ ] `controller.creWorkflowAddress()` equals CRE workflow address
- [ ] Approve a test route via GovernanceModule
- [ ] Deposit USDC as underwriter
- [ ] Buy insurance as traveler — confirm pool deployed, `activeFlightCount() == 1`
- [ ] `OracleAggregator.getFlightStatus()` returns `Unknown`
- [ ] Wait for first workflow tick — check `cre workflow logs <workflow-id>`
- [ ] If flight has a final status, confirm `StatusUpdated` event on OracleAggregator
- [ ] On next tick, confirm `checkAndSettle()` called and settlement executes
- [ ] If OnTime: `activeFlightCount() == 0`, premiums in vault, share price increased
- [ ] If Delayed: pool claimable, traveler can call `claim()`

---

## Operational Monitoring

- Monitor workflow execution history in the CRE platform UI — alert on missed ticks
- Alert on gaps in workflow execution exceeding 15 minutes
- Index `StatusUpdated` events on OracleAggregator — flights showing no update for
  more than 24 hours after their departure date may indicate an AeroAPI issue or workflow pause
- Index `PayoutFailed` events on FlightPool — any occurrence requires manual recovery
- Monitor `balanceSanityCheck()` on RiskVault periodically — should always return zero
- If workflow is paused for an extended period, check `activeFlightCount()` — flights
  past their departure date and still `Unknown` may need manual operator attention

---

## Supported Networks

Always verify current network support at `https://docs.chain.link/cre/supported-networks`.

CRE-supported networks are fewer than Automation-supported networks. Confirm your target
chain is listed before committing to CRE for a mainnet deployment.

Simulation runs against any public EVM RPC endpoint regardless of CRE network support —
only the actual DON deployment requires an officially supported network.

---

## Common Errors

| Error | Cause | Fix |
|---|---|---|
| `checkAndSettle` reverts `not CRE workflow` | `creWorkflowAddress` not set or wrong address | Call `controller.setCreWorkflow(workflowAddress)` |
| `updateFlightStatus` reverts | `authorizedOracle` not set or wrong address | Call `aggregator.setOracle(workflowAddress)` — can only be done once |
| Workflow tick fails (HTTP error) | AeroAPI unreachable or key invalid | Check `cre workflow logs`, verify `AEROAPI_KEY` secret, check AeroAPI status |
| Flights stay `Unknown` indefinitely | Flight not yet in final state, or workflow paused | Confirm workflow is active via `cre workflow list`; verify flight date has passed |
| Simulation fails on EVM read | Wrong contract address or ABI in workflow config | Update `ORACLE_AGGREGATOR_ADDRESS`, `CONTROLLER_ADDRESS`, `RISK_VAULT_ADDRESS` |
| `OracleAlreadySet` on `setOracle` | Called `setOracle` twice | Cannot be changed after first call — ensure correct address before calling |
| Snapshot not recorded | Workflow paused for over 24 hours | Resume workflow; snapshot writes on the next tick |
| Workflow deployed but not writing | Activated but `setOracle` / `setCreWorkflow` not called | Wire contract addresses per deployment checklist |