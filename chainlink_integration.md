# Flight Delay Insurance Protocol — Chainlink Integration

---

## Overview

The protocol uses two Chainlink products:

- **Chainlink Automation** — triggers the settlement loop every 10 minutes
- **Chainlink Functions** — fetches real-world flight status from external APIs and delivers
  it on-chain

Together they replace what would otherwise require a persistent off-chain server with a
private key. There is no centralised keeper bot, no cron job, and no oracle EOA in production.

---

## Chainlink Automation

### What It Does

Chainlink Automation calls `Controller.performUpkeep()` on a fixed time-based schedule
(every 10 minutes). This triggers `checkAndSettle()`, which is the protocol's core
settlement loop — it reads flight statuses, settles mature pools, processes the withdrawal
queue, and triggers Chainlink Functions requests for any flight still showing `Unknown`.

The keeper also calls `RiskVault.snapshot()` on each tick to ensure daily share price
snapshots are captured even on days with no flight settlements.

### Contract Changes Required

**Controller must implement `AutomationCompatibleInterface`:**

```solidity
interface AutomationCompatibleInterface {
    function checkUpkeep(bytes calldata checkData)
        external returns (bool upkeepNeeded, bytes memory performData);

    function performUpkeep(bytes calldata performData) external;
}
```

- `checkUpkeep()` is called off-chain by Chainlink nodes. For a time-based upkeep it
  always returns `upkeepNeeded = true` — the schedule is enforced by the Automation
  registry, not by on-chain logic.
- `performUpkeep()` maps directly to `checkAndSettle()` and `riskVault.snapshot()`.

**`onlyKeeper` modifier:**

The `onlyKeeper` modifier on `checkAndSettle()` must check `msg.sender` against the
registered Chainlink Automation registry address, set at Controller deployment:

```solidity
modifier onlyAutomationRegistry() {
    require(msg.sender == automationRegistry, "Controller: caller is not automation registry");
    _;
}
```

**`startLoop` / `stopLoop` are removed.** Loop lifecycle is managed entirely via the
Chainlink Automation registry (registering and cancelling the upkeep). The Controller
has no on-chain loop state to manage.

### Registration and Funding

1. Deploy the Controller with the Chainlink Automation registry address.
2. Register a **time-based upkeep** in the Chainlink Automation App or via the registry
   contract, pointing to `Controller.performUpkeep()`.
3. Set the interval to 600 seconds (10 minutes).
4. Fund the upkeep with LINK. The registry deducts LINK per execution.
5. Monitor the LINK balance — top up before it runs dry or the loop stops.

### Gas Considerations

`performUpkeep()` runs `checkAndSettle()` which loops over all active FlightPools and
may also call `FunctionsConsumer.requestFlightStatus()` for each Unknown flight. Gas
cost scales with the number of active flights. Chainlink Automation has a configurable
gas limit per upkeep — set this high enough to cover your expected maximum active flight
count. A reasonable starting point is 2,000,000 gas, adjustable as the protocol scales.

---

## Chainlink Functions

### What It Does

Chainlink Functions executes a JavaScript source file off-chain inside a decentralised
oracle network (DON). The JS source fetches flight status from an external flight data
API, formats the result, and returns it. Chainlink nodes deliver the result back on-chain
via a callback to the `FunctionsConsumer` contract, which then writes the status to
`OracleAggregator`.

This replaces the original architecture's "authorised oracle EOA" — there is no private
key, no server, and no single point of failure.

### FunctionsConsumer Contract

This is a new contract that must be written. It inherits from Chainlink's `FunctionsClient`
and serves as the bridge between the settlement loop and the OracleAggregator.

```solidity
contract FunctionsConsumer is FunctionsClient {

    // Maps Chainlink requestId → (flightId, date) so the callback knows
    // which flight to update
    mapping(bytes32 => FlightRequest) public pendingRequests;

    struct FlightRequest {
        string  flightId;
        uint256 flightDate;
    }

    // Called by Controller during settlement loop for Unknown flights
    function requestFlightStatus(string calldata flightId, uint256 flightDate)
        external onlyController returns (bytes32 requestId);

    // Chainlink callback — called by DON nodes after executing JS source
    function fulfillRequest(
        bytes32 requestId,
        bytes memory response,
        bytes memory err
    ) internal override;
}
```

**`requestFlightStatus()`:**
- Builds a `FunctionsRequest` with the JS source and encoded `(flightId, flightDate)`
  as arguments.
- Sends the request to the Chainlink Functions router via `_sendRequest()`.
- Stores `requestId → (flightId, flightDate)` so the callback can resolve the flight.
- Only callable by the Controller.

**`fulfillRequest()`:**
- Called by Chainlink DON nodes after executing the JS source.
- Parses the `response` bytes into a `FlightStatus` enum value.
- Looks up `(flightId, flightDate)` from `pendingRequests[requestId]`.
- Calls `OracleAggregator.updateFlightStatus(flightId, flightDate, status)`.
- Handles `err` gracefully — a failed request leaves the status as `Unknown`, which
  means the settlement loop will request again on the next tick.

### JavaScript Source

The JS source runs inside Chainlink DON nodes. It receives `(flightId, flightDate)` as
arguments, queries an external flight status API, and returns a single byte representing
the `FlightStatus` enum value.

Skeleton structure:

```javascript
const flightId   = args[0];  // e.g. "AA123"
const flightDate = args[1];  // Unix timestamp as string

// Fetch from flight data API
const response = await Functions.makeHttpRequest({
    url: `https://api.flightdata.example/status`,
    params: { flight: flightId, date: flightDate }
});

if (response.error) throw Error("API request failed");

const status = response.data.status;  // "ON_TIME" | "DELAYED" | "CANCELLED"

// Map to FlightStatus enum: 1=OnTime, 2=Delayed, 3=Cancelled
const statusMap = { "ON_TIME": 1, "DELAYED": 2, "CANCELLED": 3 };
const result = statusMap[status] ?? 0;  // 0 = Unknown if unrecognised

return Functions.encodeUint256(result);
```

The JS source is stored as a string in the FunctionsConsumer contract and can be
updated by the owner if the API endpoint or response format changes.

### OracleAggregator Trust Model Change

In the original architecture, `authorizedOracle` was an EOA address. With Chainlink
Functions, it becomes the `FunctionsConsumer` contract address.

```
Before: authorizedOracle = 0xABC...  (private key held by operator)
After:  authorizedOracle = FunctionsConsumer contract address
```

This is set via the one-time `OracleAggregator.setOracle(functionsConsumer)` call during
post-deployment wiring. Once set it cannot be changed — the same immutability guarantee
applies regardless of whether the oracle is an EOA or a contract.

### Subscription and Funding

Chainlink Functions uses a subscription model. The FunctionsConsumer contract must be
added as a consumer to a funded subscription.

1. Create a subscription at [functions.chain.link](https://functions.chain.link).
2. Fund the subscription with LINK.
3. Add the FunctionsConsumer contract address as an authorised consumer.
4. Store the `subscriptionId` in the FunctionsConsumer contract at deployment.
5. Monitor LINK balance — requests will fail silently (returning an error in `fulfillRequest`)
   if the subscription runs out of LINK.

### Request Latency

Chainlink Functions requests are not synchronous. After `requestFlightStatus()` is called
in tick N, the result arrives via `fulfillRequest()` asynchronously — typically within
1–3 minutes on mainnet. The OracleAggregator will have the status updated by tick N+1
or N+2 at the latest.

This means a flight does not settle in the same tick that its status is first requested.
This is expected behaviour — the settlement loop is designed to retry Unknown flights on
every tick until a final status arrives.

### Handling Failed Requests

If a Chainlink Functions request fails (API error, insufficient LINK, DON timeout), the
`fulfillRequest()` callback receives a non-empty `err` parameter. The FunctionsConsumer
should log the error via an event and take no action on the OracleAggregator — the status
remains `Unknown` and the settlement loop will re-request on the next tick.

```solidity
function fulfillRequest(bytes32 requestId, bytes memory response, bytes memory err)
    internal override
{
    if (err.length > 0) {
        emit RequestFailed(requestId, err);
        return;  // leave status as Unknown, retry next tick
    }
    // ... parse and update
}
```

---

## Integration Data Flow

```
Every 10 minutes:
    Chainlink Automation Registry
        │
        └─► Controller.performUpkeep()
                │
                └─► checkAndSettle()
                        │
                        ├─► for each active pool with Unknown status:
                        │       FunctionsConsumer.requestFlightStatus(flightId, date)
                        │           └─► _sendRequest() to Chainlink Functions router
                        │                   │
                        │           [async — 1-3 minutes later]
                        │                   │
                        │               Chainlink DON executes JS source
                        │               fetches flight API
                        │                   │
                        │               FunctionsConsumer.fulfillRequest(requestId, response)
                        │                   └─► OracleAggregator.updateFlightStatus(...)
                        │
                        ├─► for each active pool with OnTime / Delayed / Cancelled status:
                        │       settle pool → RiskVault → processWithdrawalQueue
                        │
                        └─► riskVault.snapshot()  ← daily price snapshot if due
```

---

## Deployment Checklist

- [ ] Deploy FunctionsConsumer with Chainlink Functions router address and DON ID
- [ ] Upload JS source to FunctionsConsumer (or encode at deployment)
- [ ] Create Chainlink Functions subscription and fund with LINK
- [ ] Add FunctionsConsumer as consumer on the subscription
- [ ] Deploy Controller with Chainlink Automation registry address
- [ ] Set `OracleAggregator.setOracle(functionsConsumer)`
- [ ] Register Controller upkeep in Chainlink Automation App (time-based, 600s interval)
- [ ] Fund Automation upkeep with LINK
- [ ] Set upkeep gas limit (recommend starting at 2,000,000)
- [ ] Verify `performUpkeep()` executes correctly on first tick
- [ ] Monitor both LINK balances (Functions subscription + Automation upkeep)

---

## Operational Monitoring

| What to monitor | Why | Where |
|---|---|---|
| Automation upkeep LINK balance | Loop stops if balance runs out | Chainlink Automation App |
| Functions subscription LINK balance | Oracle requests fail silently | Chainlink Functions App |
| `RequestFailed` events on FunctionsConsumer | API errors or DON failures | Event indexer / alerts |
| `OracleAggregator` status updates | Verify statuses arriving for active flights | Event indexer |
| `balanceSanityCheck()` on RiskVault | Detect unexpected USDC transfers | Periodic read |
| Active flight count vs settlements per day | Detect stuck flights | `activeFlightCount()` |