# Chainlink Functions: Agent Guide for Solidity Contracts

A complete reference for integrating Chainlink Functions into any Solidity smart contract. This guide covers concepts, contract patterns, JavaScript source code, secrets management, subscriptions, supported networks, and Foundry workflows.

> **BETA Warning:** Chainlink Functions is currently in open beta on mainnet. Do not use it to secure high-value transactions or in production environments without independent audits.

---

## 1. What Chainlink Functions Does

Chainlink Functions allows a smart contract to:
- Execute arbitrary JavaScript in a decentralised off-chain environment (the DON — Decentralised Oracle Network)
- Fetch data from any HTTP/HTTPS API (REST, GraphQL, etc.)
- Run custom computation on that data
- Return a single result (up to 256 bytes) back to the calling contract

The flow is: **Contract sends request → DON executes JS → DON consensus on result → DON calls `fulfillRequest` on your contract.**

Key constraint: the JavaScript runs in a **sandboxed Deno-like runtime** with no filesystem access, no persistent state, and a ~300ms time limit per request. All API keys and secrets are passed in at request time, never stored on-chain.

---

## 2. Supported Networks & Contract Addresses

> ⚠️ Always verify addresses at https://docs.chain.link/chainlink-functions/supported-networks before deployment — these can be updated by Chainlink.

### Mainnet Networks

| Network | Chain ID | Functions Router | DON ID |
|---|---|---|---|
| Ethereum Mainnet | 1 | `0x65Dcc24F8ff9e51F10DCc7Ed1e4e2A61e6E14ea6` | `fun-ethereum-mainnet-1` |
| Arbitrum One | 42161 | `0x97083E831F8F0638855e2A515c90EdCF158DF238` | `fun-arbitrum-mainnet-1` |
| Avalanche C-Chain | 43114 | `0x9f82a6A0758517FD0AfA463820F586999AF314a0` | `fun-avalanche-mainnet-1` |
| Base Mainnet | 8453 | `0xf9B8fc078197181C841c296C876945aaa425B278` | `fun-base-mainnet-1` |
| Optimism Mainnet | 10 | `0xC17094E3A1348E5C7544D4fF8A36c28f2C6AAE28` | `fun-optimism-mainnet-1` |
| Polygon Mainnet | 137 | `0xdc2AAF042Aeff2E68B3e8E33F19e4B9fAe9d2174` | `fun-polygon-mainnet-1` |

### Testnet Networks

| Network | Chain ID | Functions Router | LINK Token | DON ID |
|---|---|---|---|---|
| Ethereum Sepolia | 11155111 | `0xb83E47C2bC239B3bf370bc41e1459A34b41238D0` | `0x779877A7B0D9E8603169DdbD7836e478b4624789` | `fun-ethereum-sepolia-1` |
| Arbitrum Sepolia | 421614 | `0x234a5fb5Bd614a7AA2FfAB244D603abFA0Ac5C5C` | `0xd14838A68E8AFBAdE5efb411d5871ea0011AFd28` | `fun-arbitrum-sepolia-1` |
| Avalanche Fuji | 43113 | `0xA9d587a00A31A52Ed70D6026794a8FC5E2F5dCb0` | `0x0b9d5D9136855f6FEc3c0993feE6E9CE8a297846` | `fun-avalanche-fuji-1` |
| Base Sepolia | 84532 | `0xf9B8fc078197181C841c296C876945aaa425B278` | `0xE4aB69C077896252FAFBD49EFD26B5D171A32410` | `fun-base-sepolia-1` |
| Optimism Sepolia | 11155420 | `0xC17094E3A1348E5C7544D4fF8A36c28f2C6AAE28` | `0xE4aB69C077896252FAFBD49EFD26B5D171A32410` | `fun-optimism-sepolia-1` |
| Polygon Amoy | 80002 | `0xC22a79eBA640940ABB6dF0f7982cc119578E11De` | `0x0Fd9e8d3aF1aaee056EB9e802c3A762a667b1904` | `fun-polygon-amoy-1` |

**Faucets:**
- All testnets: `https://faucets.chain.link/{network}` (e.g. `/fuji`, `/sepolia`, `/base-sepolia`)

---

## 3. Installation & Project Setup

### Install Chainlink contracts

```bash
# Foundry
forge install smartcontractkit/chainlink --no-commit

# npm (for JS toolkit and local simulation)
npm install @chainlink/functions-toolkit
npm install @chainlink/contracts
```

### foundry.toml remappings

```toml
[profile.default]
remappings = [
  "@chainlink/contracts/=lib/chainlink/contracts/",
  "@chainlink/contracts-ccip/=lib/chainlink/contracts/src/v0.8/ccip/",
]
```

---

## 4. Core Solidity Contract Pattern

Every Functions consumer contract follows this structure:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {FunctionsClient} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/FunctionsClient.sol";
import {FunctionsRequest} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/libraries/FunctionsRequest.sol";

contract MyFunctionsConsumer is FunctionsClient {
    using FunctionsRequest for FunctionsRequest.Request;

    // ── State ──────────────────────────────────────────────────────────────
    bytes32 public s_lastRequestId;
    bytes   public s_lastResponse;
    bytes   public s_lastError;
    uint64  public s_subscriptionId;
    uint32  public s_gasLimit;
    bytes32 public s_donId;           // encoded DON ID string

    // ── Events ─────────────────────────────────────────────────────────────
    event RequestSent(bytes32 indexed requestId);
    event ResponseReceived(bytes32 indexed requestId, bytes response, bytes err);

    // ── Constructor ────────────────────────────────────────────────────────
    constructor(
        address router,       // Functions Router address for this network
        uint64 subscriptionId,
        uint32 gasLimit,
        bytes32 donId
    ) FunctionsClient(router) {
        s_subscriptionId = subscriptionId;
        s_gasLimit       = gasLimit;
        s_donId          = donId;
    }

    // ── Send a request ─────────────────────────────────────────────────────
    function sendRequest(
        string calldata source,         // JavaScript source code as a string
        string[] calldata args,         // plaintext args passed to JS as `args[]`
        bytes calldata encryptedSecretsUrls  // optional; pass "" if not using secrets
    ) external returns (bytes32 requestId) {
        FunctionsRequest.Request memory req;
        req.initializeRequestForInlineConfig(FunctionsRequest.Location.Inline);
        req.setArgs(args);

        if (encryptedSecretsUrls.length > 0) {
            req.addSecretsReference(encryptedSecretsUrls);
        }

        req.setSource(source);

        requestId = _sendRequest(
            req.encodeCBOR(),
            s_subscriptionId,
            s_gasLimit,
            s_donId
        );

        s_lastRequestId = requestId;
        emit RequestSent(requestId);
    }

    // ── Receive the DON's response ─────────────────────────────────────────
    function fulfillRequest(
        bytes32 requestId,
        bytes memory response,
        bytes memory err
    ) internal override {
        s_lastResponse = response;
        s_lastError    = err;
        emit ResponseReceived(requestId, response, err);
        // ↑ Add your application logic here — decode response and update state
    }
}
```

### Key points
- Your contract **must** inherit `FunctionsClient` and **must** implement `fulfillRequest`.
- `fulfillRequest` is called by the DON's router — only callable by the trusted router, enforced by the parent contract.
- `_sendRequest` costs LINK from your subscription balance. Ensure the subscription has enough LINK before sending.
- `gasLimit` is the max gas allowed for the `fulfillRequest` callback. If the callback exceeds this, the response is discarded. 300,000 is a safe default; tune down for gas efficiency.

---

## 5. JavaScript Source Code Patterns

The JavaScript `source` string runs in the DON. It must return a value using `Functions.encodeString()`, `Functions.encodeUint256()`, or `Functions.encodeInt256()`. It has access to `args[]`, `secrets{}`, and the `Functions` global.

### Pattern 1 — Simple API fetch

```javascript
// Fetch ETH price from CoinGecko
const response = await Functions.makeHttpRequest({
  url: "https://api.coingecko.com/api/v3/simple/price",
  params: { ids: "ethereum", vs_currencies: "usd" }
});

if (response.error) throw Error("Request failed");

const price = response.data.ethereum.usd;
// Return as uint256 with 8 decimals (match Chainlink price feed convention)
return Functions.encodeUint256(Math.round(price * 1e8));
```

### Pattern 2 — Authenticated API with secrets

```javascript
// args[0] = flight number, secrets.apiKey = your API key
const flightNum = args[0];

const response = await Functions.makeHttpRequest({
  url: `https://api.aviationstack.com/v1/flights`,
  params: {
    access_key: secrets.apiKey,
    flight_iata: flightNum
  }
});

if (response.error) throw Error("API request failed");

const flight = response.data.data[0];
const delayMinutes = flight.arrival.delay || 0;

return Functions.encodeUint256(delayMinutes);
```

### Pattern 3 — Multiple API calls with aggregation

```javascript
// Call two price sources and return the average
const [resp1, resp2] = await Promise.all([
  Functions.makeHttpRequest({ url: "https://api.source1.com/price" }),
  Functions.makeHttpRequest({ url: "https://api.source2.com/price" })
]);

if (resp1.error || resp2.error) throw Error("One or more requests failed");

const avg = (resp1.data.price + resp2.data.price) / 2;
return Functions.encodeUint256(Math.round(avg * 1e8));
```

### Pattern 4 — Return a string

```javascript
// Return a string (e.g. status label)
const status = response.data.status; // "delayed", "on_time", "cancelled"
return Functions.encodeString(status);
```

### JavaScript environment constraints

| Constraint | Limit |
|---|---|
| Execution time | ~300ms total |
| HTTP requests | Max 5 per request |
| Response size | Max 256 bytes |
| Memory | ~128MB |
| Filesystem | None |
| Persistent state | None |
| External imports (`import`) | Allowed on mainnet via URL |

### Using imports

```javascript
// Import ethers.js for ABI encoding (mainnet only, not testnets)
import { ethers } from "npm:ethers@6.10.0";

const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
  ["uint256", "string"],
  [price, status]
);
return encoded; // raw bytes, decode with abi.decode() in contract
```

---

## 6. ABI Encoding for Multi-Value Returns

To return multiple values, ABI-encode them in JS and decode in Solidity:

**JavaScript:**
```javascript
import { ethers } from "npm:ethers@6.10.0";

const price   = 180050000000; // uint256
const status  = "delayed";    // string

const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
  ["uint256", "string"],
  [price, status]
);
return ethers.getBytes(encoded); // return as Uint8Array
```

**Solidity:**
```solidity
function fulfillRequest(bytes32, bytes memory response, bytes memory err) internal override {
    if (err.length > 0) { /* handle error */ return; }

    (uint256 price, string memory status) = abi.decode(response, (uint256, string));
    // use price and status
}
```

---

## 7. Secrets Management

Never hardcode API keys in JavaScript source or contract storage. Use Chainlink's secrets system.

### Option A — DON-hosted secrets (Recommended)

Upload secrets to the DON via the Chainlink Functions Subscription Manager UI or the SDK. The DON encrypts and hosts them for a configurable expiration time.

```javascript
// In your Node.js upload script
const { SecretsManager } = require("@chainlink/functions-toolkit");

const secretsManager = new SecretsManager({
  signer: wallet,
  functionsRouterAddress: ROUTER_ADDRESS,
  donId: DON_ID
});
await secretsManager.initialize();

const { encryptedSecrets, slotId, version } = await secretsManager.uploadEncryptedSecretsToDON({
  encryptedSecretsHexstring: await secretsManager.encryptSecrets({ apiKey: process.env.API_KEY }),
  gatewayUrls: [/* DON gateway URLs from supported-networks page */],
  slotId: 0,
  minutesUntilExpiration: 60
});
```

In your Solidity `sendRequest`, pass `slotId` and `version`:

```solidity
req.addDONHostedSecrets(slotId, version);
```

### Option B — Gist-hosted secrets (Easier, less secure)

Host an encrypted secrets JSON file at a public HTTPS URL (e.g. GitHub Gist):

```javascript
// In Node.js
const encryptedSecrets = await secretsManager.encryptSecrets({ apiKey: "..." });
// Upload encryptedSecrets JSON to a gist, get the raw URL
```

In Solidity, pass the URL as bytes:

```solidity
req.addSecretsReference(abi.encode(["https://gist.githubusercontent.com/..."]));
```

---

## 8. Subscriptions

Chainlink Functions uses a **subscription model** — LINK is pre-paid into a subscription, and requests draw from it.

### Create a subscription (UI)

1. Go to `https://functions.chain.link`
2. Select network
3. Click "Create Subscription"
4. Fund with LINK (minimum ~2 LINK for testing)
5. Add your consumer contract address to the subscription

### Create a subscription (programmatically)

```javascript
const { SubscriptionManager } = require("@chainlink/functions-toolkit");

const sm = new SubscriptionManager({
  signer: wallet,
  linkTokenAddress: LINK_ADDRESS,
  functionsRouterAddress: ROUTER_ADDRESS
});
await sm.initialize();

const subscriptionId = await sm.createSubscription();
await sm.fundSubscription({ subscriptionId, juelsAmount: BigInt("2000000000000000000") }); // 2 LINK
await sm.addConsumer({ subscriptionId, consumerAddress: YOUR_CONTRACT });
```

### Cost estimation

Fees = gas callback cost (in native token, converted to LINK at request time) + premium fee (fixed USD-denominated amount, paid in LINK equivalent).

Premium fee varies by network (~$0.20–$0.40 USD per request). Always verify at https://docs.chain.link/chainlink-functions/resources/billing.

---

## 9. Local Simulation (Before Deploying)

Use the Functions Playground or the local simulator to test JS source code without spending LINK:

```javascript
// simulate.js — run with: node simulate.js
const { simulateScript } = require("@chainlink/functions-toolkit");

const result = await simulateScript({
  source: `
    const r = await Functions.makeHttpRequest({ url: "https://api.example.com/price" });
    return Functions.encodeUint256(r.data.price);
  `,
  args: ["ETH"],
  secrets: { apiKey: "test_key" },
  bytesArgs: []
});

console.log("Result:", result.responseBytesHexstring);
console.log("Error:", result.errorString);
```

Or use the browser playground at `https://functions.chain.link/playground`.

---

## 10. Foundry Integration

### Deployment script

```solidity
// script/DeployFunctionsConsumer.s.sol
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../src/MyFunctionsConsumer.sol";

contract DeployFunctionsConsumer is Script {
    // ── Network config — update per network ───────────────────────────────
    // Avalanche Fuji
    address constant ROUTER          = 0xA9d587a00A31A52Ed70D6026794a8FC5E2F5dCb0;
    bytes32 constant DON_ID          = 0x66756e2d6176616c616e6368652d66756a692d31000000000000000000000000; // bytes32("fun-avalanche-fuji-1")
    uint64  constant SUBSCRIPTION_ID = 123;   // your subscription ID
    uint32  constant GAS_LIMIT       = 300_000;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);

        MyFunctionsConsumer consumer = new MyFunctionsConsumer(
            ROUTER,
            SUBSCRIPTION_ID,
            GAS_LIMIT,
            DON_ID
        );
        console.log("Consumer deployed:", address(consumer));

        vm.stopBroadcast();
    }
}
```

### Encode DON ID to bytes32

The DON ID string must be right-padded with zeros and encoded as bytes32:

```bash
# Using cast
cast --from-utf8 "fun-avalanche-fuji-1"
# Result: 0x66756e2d6176616c616e6368652d66756a692d31

# Pad to 32 bytes:
# 0x66756e2d6176616c616e6368652d66756a692d31000000000000000000000000
```

Or in Solidity/tests:

```solidity
bytes32 donId = bytes32(bytes("fun-avalanche-fuji-1"));
```

### Testing with a forked network

```bash
# Fork Fuji and run integration tests
anvil --fork-url https://api.avax-test.network/ext/bc/C/rpc

forge test --fork-url http://127.0.0.1:8545 -vvv
```

Note: You cannot simulate an actual DON callback in a fork test since the DON nodes won't call your contract. For unit testing, mock the `fulfillRequest` call directly:

```solidity
// In your Foundry test
function test_FulfillRequest() public {
    bytes32 fakeRequestId = bytes32(uint256(1));
    bytes memory fakeResponse = abi.encode(uint256(180050000000));
    bytes memory noError = "";

    // Prank as the router to call fulfillRequest
    vm.prank(ROUTER_ADDRESS);
    consumer.handleOracleFulfillment(fakeRequestId, fakeResponse, noError);

    assertEq(consumer.s_lastResponse(), fakeResponse);
}
```

---

## 11. Common Errors & Fixes

| Error | Cause | Fix |
|---|---|---|
| `UnauthorizedSender` | `fulfillRequest` called by non-router | Don't call `fulfillRequest` directly in tests; use `handleOracleFulfillment` |
| `InsufficientBalance` | Subscription has too little LINK | Fund subscription at `functions.chain.link` |
| `ConsumerNotAllowed` | Contract not added to subscription | Add consumer via UI or SDK |
| JS `timeout` error | JS took >300ms | Reduce API calls; remove slow operations |
| Empty `response`, non-empty `err` | JS threw an exception | Check JS source for errors; log `args` values |
| `InvalidRequestConfirmations` | Wrong gas limit or DON ID | Verify DON ID bytes32 encoding |
| Request pending forever | Subscription out of LINK mid-flight | Manually time out via Subscription Manager |

---

## 12. Quick Reference — Addresses to Always Verify

Always cross-check contract addresses against:
- **Functions Supported Networks:** `https://docs.chain.link/chainlink-functions/supported-networks`
- **Functions Subscription Manager UI:** `https://functions.chain.link`
- **Chainlink Faucets:** `https://faucets.chain.link`