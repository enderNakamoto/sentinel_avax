---
description: Chainlink CRE workflow reference. Trigger when writing or modifying a CRE workflow in TypeScript, using @chainlink/cre-sdk, simulating with `cre workflow simulate`, handling secrets via runtime.getSecret(), reading or writing EVM contracts from a workflow, or deploying a workflow to a DON.
---

# Skill: Chainlink CRE — TypeScript Workflows

## Layer 1 — Non-negotiable rules + skeleton (always read this)

### 8 rules — memorise these before writing any CRE code

1. **WASM/QuickJS, not Node.js.** No Node built-ins. No Node-centric packages without simulation validation.
2. **Use `runtime.log()`.** Never `console.log()` — it produces no output in the WASM environment.
3. **Use `.result()` for every SDK capability call.** Not `await`. HTTP, EVM read, EVM write, secrets — all use `.result()`.
4. **Callbacks are stateless.** Each cron tick is a fresh execution. No persistent in-memory state between runs.
5. **EVM writes use `writeReport` + `prepareReportRequest`.** NOT ethers/viem `sendTransaction`. The CRE forwarder delivers calldata to the receiver contract; `msg.sender` on the receiver = forwarder address.
6. **Simulate before deploying.** `cre workflow simulate` catches WASM/QuickJS compatibility issues. Never skip it.
7. **Config must be a Zod schema.** Explicit, validated, typed.
8. **Keep workflows lean.** WASM memory limit: 100 MB. Execution timeout: 5 minutes. Capability concurrency: 3. No large in-memory datasets.

### Canonical workflow skeleton

```typescript
import {
  Runner,
  CronCapability,
  handler,
  type Runtime,
  type CronPayload,
} from "@chainlink/cre-sdk"
import { z } from "zod"

const configSchema = z.object({
  schedule: z.string(),
  // add other config fields here
})

type Config = z.infer<typeof configSchema>

const onCronTrigger = (runtime: Runtime<Config>, _payload: CronPayload): string => {
  runtime.log("Workflow triggered")
  // business logic here
  return "ok"
}

function initWorkflow(config: Config) {
  const cron = new CronCapability()
  return [
    handler(
      cron.trigger({ schedule: config.schedule }),
      onCronTick
    ),
  ]
}

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema })
  await runner.run(initWorkflow)
}
```

**Cron schedule for every 10 minutes:** `"0 */10 * * * *"`

### Minimal implementation checklist

Before submitting any CRE TypeScript code, verify all of these:

- [ ] Uses `@chainlink/cre-sdk`
- [ ] Defines `main()`
- [ ] Defines `initWorkflow(...)`
- [ ] Registers at least one `handler(...)`
- [ ] Uses correct trigger type (cron for this project)
- [ ] Uses `runtime.log(...)` — no `console.log(...)`
- [ ] Uses `.result()` for all SDK capability calls
- [ ] Config is explicit and validated with Zod
- [ ] Simulates locally before deployment
- [ ] Uses correct secret retrieval for the environment
- [ ] Uses correct EVM network selector for Avalanche C-Chain

---

## Layer 2 — HTTP fetches

### Imports

```typescript
import {
  HTTPClient,
  consensusIdenticalAggregation,
  consensusMedianAggregation,
  ok,
  text,
  type HTTPSendRequester,
} from "@chainlink/cre-sdk"
```

### High-level pattern (lambda callback)

The `sendRequest` high-level API takes `(runtime, callback, aggregation)` and returns a
curried function that accepts the callback's extra arguments.

```typescript
const httpClient = new HTTPClient()

// Returns a string; consensus across DON nodes via identicalAggregation
const body = httpClient
  .sendRequest(
    runtime,
    (sendRequester: HTTPSendRequester, url: string, apiKey: string): string => {
      const response = sendRequester
        .sendRequest({
          url,
          method: "GET",
          headers: { "x-apikey": apiKey },
        })
        .result()

      if (!ok(response)) {
        throw new Error(`HTTP ${response.statusCode}`)
      }

      return text(response) // decodes body as UTF-8 string
    },
    consensusIdenticalAggregation<string>()
  )(url, apiKey) // pass extra args here
  .result()

const data = JSON.parse(body)
```

**Helper functions:**
- `ok(response)` — true if `statusCode === 200`
- `text(response)` — `new TextDecoder().decode(response.body)`
- `consensusIdenticalAggregation()` — all nodes must return identical value (use for string/JSON)
- `consensusMedianAggregation()` — median of numeric values across nodes

### Agent guidance for HTTP

- Validate `statusCode` (use `ok()` helper)
- Decode body with `text()` helper
- Parse JSON defensively
- Coerce output into explicit types
- Wrap in try/catch — HTTP errors should not crash the workflow tick

---

## Layer 3 — EVM reads

### Imports

```typescript
import {
  EVMClient,
  getNetwork,
  encodeCallMsg,
  bytesToHex,
} from "@chainlink/cre-sdk"
import {
  encodeFunctionData,
  decodeFunctionResult,
  parseAbi,
  type Hex,
} from "viem"
```

### Network resolution

```typescript
const network = getNetwork({
  chainFamily: "evm",
  chainSelectorName: "avalanche-testnet-fuji", // or "avalanche-mainnet"
  isTestnet: true,
})

if (!network) {
  runtime.log("[ERROR] Network not found")
  return "error: network not found"
}

const evmClient = new EVMClient(network.chainSelector.selector)
```

**Chain selector names (verify with `cre network list`):**
- Fuji testnet: `"avalanche-testnet-fuji"`
- Avalanche mainnet: `"avalanche-mainnet"`
- Sepolia: `"ethereum-testnet-sepolia"`

### Read pattern

```typescript
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const

const MY_ABI = parseAbi([
  "function getValue() view returns (uint256)",
])

// Encode calldata with viem
const calldata = encodeFunctionData({
  abi: MY_ABI,
  functionName: "getValue",
  args: [],
})

// Execute eth_call
const reply = evmClient
  .callContract(runtime, {
    call: encodeCallMsg({
      from: ZERO_ADDRESS,
      to: contractAddress as `0x${string}`,
      data: calldata,
    }),
  })
  .result()

// Decode return data
const value = decodeFunctionResult({
  abi: MY_ABI,
  functionName: "getValue",
  data: bytesToHex(reply.data),
}) as unknown as bigint
```

### Reusable helper

```typescript
function evmRead(
  evmClient: EVMClient,
  runtime: Runtime<Config>,
  contractAddr: string,
  calldata: Hex
): Hex {
  const reply = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: ZERO_ADDRESS,
        to: contractAddr as `0x${string}`,
        data: calldata,
      }),
    })
    .result()
  return bytesToHex(reply.data)
}
```

---

## Layer 4 — EVM writes

> **Read this before writing any EVM write code.** CRE writes are NOT like ethers/viem.

### How CRE writes work

1. Encode the calldata with viem `encodeFunctionData`
2. Wrap it in a CRE report: `runtime.report(prepareReportRequest(calldata)).result()`
3. Submit it via `evmClient.writeReport(runtime, writeRequest).result()`
4. The CRE forwarder delivers the calldata to the receiver contract
5. On the receiver: `msg.sender === forwarder address` (= `authorizedOracle` / `creWorkflowAddress`)

**No consumer interface required in the receiver contract.** The receiver just needs an
access guard checking `msg.sender == forwarderAddress`.

### Imports

```typescript
import {
  EVMClient,
  prepareReportRequest,
  hexToBytes,
  type WriteCreReportRequest,
} from "@chainlink/cre-sdk"
import { encodeFunctionData, parseAbi } from "viem"
```

### Write pattern

```typescript
const MY_ABI = parseAbi([
  "function updateValue(uint256 value)",
])

// Encode calldata
const calldata = encodeFunctionData({
  abi: MY_ABI,
  functionName: "updateValue",
  args: [BigInt(42)],
})

// Wrap in CRE report and submit
const report = runtime.report(prepareReportRequest(calldata)).result()
const writeRequest: WriteCreReportRequest = {
  receiver: hexToBytes(contractAddress),
  report,
  $report: true,
}
evmClient.writeReport(runtime, writeRequest).result()
```

### Reusable helper

```typescript
function evmWrite(
  evmClient: EVMClient,
  runtime: Runtime<Config>,
  contractAddr: string,
  calldata: Hex
): void {
  const report = runtime.report(prepareReportRequest(calldata)).result()
  const writeRequest: WriteCreReportRequest = {
    receiver: hexToBytes(contractAddr),
    report,
    $report: true,
  }
  evmClient.writeReport(runtime, writeRequest).result()
}
```

### Solidity receiver side (no special consumer interface needed)

```solidity
address public creWorkflowAddress; // = forwarder address from `cre workflow info`

modifier onlyCREWorkflow() {
    if (msg.sender != creWorkflowAddress) revert NotCREWorkflow();
    _;
}

function myFunction() external onlyCREWorkflow {
    // called by CRE forwarder
}
```

---

## Layer 5 — Secrets

### In-code access (same code in both environments)

```typescript
const secret = runtime.getSecret({ id: "AEROAPI_KEY" }).result()
const apiKey = secret.value
```

### Local simulation — secrets.yaml

```yaml
# cre/secrets.yaml
secrets:
  AEROAPI_KEY: "${AEROAPI_KEY}"
```

Values read from env vars or `.env` file in the project directory.

```bash
# Set for local simulation
export AEROAPI_KEY="your_api_key_here"
# or add to cre/.env
```

### Deployed workflows — Vault DON

```bash
# Set once (no contract transaction required)
cre secrets set AEROAPI_KEY --value "your-api-key"

# Update any time
cre secrets set AEROAPI_KEY --value "new-api-key"
```

---

## Layer 6 — Project structure & configuration files

### workflow.yaml

```yaml
# workflow.yaml — defines artifacts and targets
workflow-artifacts:
  - artifact-name: wasm
    workflows:
      workflow-path: "./src/workflow.ts"
    secrets-path: "./secrets.yaml"

targets:
  local:
    config: "./config.local.json"
  fuji:
    config: "./config.fuji.json"
```

### config.local.json / config.fuji.json

Config files provide the Zod-validated `Config` object to the workflow. Must match your `configSchema`.

```json
{
  "schedule": "0 */10 * * * *"
}
```

Add any other fields your `configSchema` defines (contract addresses, thresholds, etc.).

### package.json dependencies

```json
{
  "dependencies": {
    "@chainlink/cre-sdk": "^1.1.4",
    "viem": "^2.21.19",
    "zod": "^3.22.4"
  }
}
```

**viem is safe in QuickJS/WASM** — it is browser-compatible and does not use Node built-ins.
Always validate new packages in simulation before relying on them.

---

## Layer 7 — CLI installation & commands

### Install

```bash
# Automatic (recommended)
curl -sSL https://cre.chain.link/install.sh | bash
cre version   # confirm: CRE CLI version v1.2.0 (or later)

# Manual (macOS arm64)
curl -LO https://github.com/smartcontractkit/cre/releases/download/v1.2.0/cre_darwin_arm64.zip
shasum -a 256 cre_darwin_arm64.zip   # verify checksum
unzip cre_darwin_arm64.zip
chmod +x cre
sudo mv cre /usr/local/bin/

# Manual (Linux amd64)
curl -LO https://github.com/smartcontractkit/cre/releases/download/v1.2.0/cre_linux_amd64.tar.gz
shasum -a 256 cre_linux_amd64.tar.gz
tar -xzf cre_linux_amd64.tar.gz
chmod +x cre
sudo mv cre /usr/local/bin/

# Add to PATH if not using /usr/local/bin
echo 'export PATH="/path/to/cre/dir:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### Auth

```bash
cre auth login
```

### Project init

```bash
cre init
# prompts: language (TypeScript), template, workflow name
```

### Simulate

```bash
# Interactive — prompts for trigger selection
cre workflow simulate --target local

# Non-interactive — specify trigger index
cre workflow simulate --target local --trigger-index 0

# With broadcast (writes to testnet during simulation)
cre workflow simulate --target fuji --trigger-index 0 --broadcast

# HTTP trigger workflow
cre workflow simulate my-workflow --non-interactive \
  --trigger-index 0 \
  --http-payload '{"userId":"123","action":"purchase"}' \
  --target staging-settings
```

### Build & deploy

```bash
cre workflow build

# Deploy to DON (requires Early Access)
cre workflow deploy ./dist/workflow.wasm

# Or: deploy with explicit name
cre workflow deploy ./dist/workflow.wasm --name my-workflow
```

### Lifecycle management

```bash
cre workflow list
cre workflow info <workflow-id>       # get forwarder/signer address here
cre workflow logs <workflow-id>       # stream execution logs
cre workflow activate <workflow-id>
cre workflow pause <workflow-id>
cre workflow update <workflow-id> ./dist/workflow.wasm
cre workflow delete <workflow-id>
```

### Network list

```bash
cre network list   # verify chain selector names before deploying
```

---

## Layer 8 — Deployment

### Deployment flow

1. `cre auth login`
2. Write and simulate workflow: `cre workflow simulate --target local --trigger-index 0`
3. `cre secrets set AEROAPI_KEY --value "..."`
4. `cre workflow build`
5. `cre workflow deploy ./dist/workflow.wasm` (requires Early Access)
6. `cre workflow activate <workflow-id>`
7. `cre workflow info <workflow-id>` → get forwarder address
8. Wire forwarder into contracts:
   - `OracleAggregator.setOracle(forwarderAddress)` — one-time
   - `Controller.setCreWorkflow(forwarderAddress)` — owner only

### Forwarder address

The forwarder address is the address the DON uses as `msg.sender` when it calls your
receiver contracts. Get it from:

```bash
cre workflow info <workflow-id>
```

Wire it into contracts before the workflow can write onchain.

---

## Layer 9 — Service quotas

| Limit | Value |
|---|---|
| WASM binary size | 100 MB (20 MB compressed) |
| Workflow config size | 1 MB |
| Execution timeout | 5 minutes |
| WASM memory limit | 100 MB |
| Execution response size | 100 KB |
| Capability concurrency | 3 |
| Capability call timeout | 3 minutes |
| Trigger subscription limit | 10 |
| Workflow execution concurrency | 5 |
| Max simultaneous workflow executions per owner | 5 |
| Max secrets per owner | 100 |
| Total accessible secrets size | 1 MB |

Keep workflows lean — no large in-memory datasets, no unbounded loops.

---

## Anti-patterns

Avoid generating these unless explicitly requested and verified:

- `console.log(...)` as logging strategy — use `runtime.log(...)`
- Node-only libraries without WASM compatibility verification
- `await` for SDK capability calls — use `.result()`
- `evmClient.sendTransaction(...)` or ethers/viem `sendTransaction` for writes — use `writeReport`
- Hidden global mutable state
- Giant multi-purpose callbacks
- Skipping Zod config schema
- Skipping `cre workflow simulate` before deploy
