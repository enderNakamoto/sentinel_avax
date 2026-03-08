# Chainlink CRE for Coding Agents (TypeScript)

> Purpose: This is an agent-friendly Markdown handbook for building with **Chainlink Runtime Environment (CRE)** in **TypeScript**.
>
> It is based on Chainlink’s official CRE documentation and the LLM-oriented source bundle at:
> `https://docs.chain.link/cre/llms-full-ts.txt`

## Scope and intent

Use this document as a **working handbook for an autonomous coding agent** that needs to:

- understand the CRE execution model
- scaffold and modify CRE workflows in TypeScript
- simulate workflows locally
- work with HTTP, secrets, and EVM interactions
- avoid common CRE/QuickJS/WASM mistakes
- know when to consult official docs for details

This is **not** a byte-for-byte conversion of the source `.txt`. It is a **cleaned and restructured Markdown version** optimized for implementation work.

---

## What CRE is

**Chainlink Runtime Environment (CRE)** is Chainlink’s workflow platform for orchestrating offchain and onchain actions with decentralized execution and built-in consensus.

At a high level:

- You write **workflows** with the **CRE SDK** in **TypeScript** or **Go**
- The CRE CLI compiles them to **WebAssembly (WASM)**
- A **Workflow DON** runs and coordinates the workflow
- Specialized **Capability DONs** perform tasks such as:
  - HTTP fetches
  - EVM reads
  - EVM writes
  - secrets access
- Capability results are verified and aggregated via Chainlink consensus

### Core mental model

A CRE workflow is built around the **trigger-and-callback** pattern:

- **Trigger** = when execution starts
- **Callback** = your business logic
- **handler(trigger, callback)** = binds the two together

Each trigger fire creates a **fresh stateless execution**. Do not assume persistent memory between runs.

---

## Non-negotiable rules for coding agents

When generating or editing CRE TypeScript code, follow these rules:

### 1) Treat CRE workflows as WASM programs, not Node.js apps

CRE TypeScript workflows are compiled to **WASM** and run with **QuickJS**, not full Node.js.

Implications:

- do **not** assume Node built-ins are available
- avoid packages that depend on unsupported Node APIs
- test third-party packages in simulation before relying on them
- `node:crypto` may not work; use lightweight JS-compatible alternatives when needed

### 2) Do not use `console.log` for workflow logs

Inside workflow callbacks, use:

```ts
runtime.log("message")
```

Do **not** rely on:

```ts
console.log(...)
console.error(...)
```

Those do not produce normal workflow logs in the CRE WASM environment.

### 3) Use CRE’s `.result()` pattern for SDK operations

CRE TypeScript SDK operations do **not** use standard `await` in the normal way for capability calls.

Use the two-step pattern:

```ts
const req = httpClient.sendRequest(runtime, { url: "https://example.com" })
const res = req.result()
```

or inline:

```ts
const res = httpClient.sendRequest(runtime, { url: "https://example.com" }).result()
```

This pattern applies to:

- HTTP requests
- EVM reads
- EVM writes
- secrets retrieval
- report generation
- node-mode execution

### 4) Prefer the high-level SDK APIs first

When possible:

- use the high-level HTTP client helpers
- use `getNetwork(...)` for network lookup
- use the standard `handler(...)` pattern
- use `runtime.getSecret(...).result()` for secrets
- use `cre workflow simulate` before thinking about deployment

### 5) Keep workflows deterministic and simple

A coding agent should favor:

- clear callback boundaries
- explicit config
- small helper functions
- predictable parsing and validation
- minimal dependencies
- no hidden global state

### 6) Never treat tutorial/demo code as production-ready

Official tutorials are educational examples. Before production, add:

- stronger validation
- auth checks
- retries/timeouts where appropriate
- chain-specific safety checks
- consumer contract security checks
- better error handling
- audits

---

## Recommended build loop

The default CRE development loop is:

1. create account / log in
2. install CRE CLI
3. scaffold a TS project with `cre init`
4. build callback logic
5. simulate with `cre workflow simulate`
6. iterate until stable
7. add production secret handling
8. deploy only after local simulation passes

---

## Fast start commands

## Install the CLI

The docs page for macOS/Linux recommends the CRE CLI installation script:

```bash
curl -sSL https://cre.chain.link/install.sh | bash
cre version
```

At the time of the referenced docs, the recommended CLI version was **v1.2.0**.

## Create a project

```bash
cre init
```

Suggested choices for a new TypeScript project:

- language: `Typescript`
- template: start simple / hello world
- workflow name: descriptive and specific

## Simulate a workflow

```bash
cre workflow simulate my-workflow --target staging-settings
```

For non-interactive simulation, select a handler explicitly with `--trigger-index`.

---

## Workflow anatomy

A minimal TypeScript workflow typically has:

- a config schema
- `main()`
- `initWorkflow(config)`
- one or more `handler(...)` registrations
- callback functions that use `runtime`

### Canonical structure

```ts
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
})

type Config = z.infer<typeof configSchema>

const onCronTrigger = (runtime: Runtime<Config>, _payload: CronPayload): string => {
  runtime.log("Workflow triggered")
  return "ok"
}

function initWorkflow(config: Config) {
  const cron = new CronCapability()

  return [
    handler(
      cron.trigger({ schedule: config.schedule }),
      onCronTrigger
    ),
  ]
}

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema })
  await runner.run(initWorkflow)
}
```

### Notes

- `main()` is the workflow entry point
- `initWorkflow(...)` returns an array of handlers
- each handler binds one trigger to one callback
- callback signatures must match the trigger payload shape
- recent SDK versions automatically handle `main()` execution and default error reporting

---

## Trigger model

Common trigger types include:

- **Cron trigger**
- **HTTP trigger**
- **EVM log trigger**

### Agent guidance

Use:

- **cron** for scheduled automation
- **HTTP trigger** for webhooks / signed inbound requests
- **EVM log trigger** when reacting to onchain events

If a workflow has multiple handlers, simulation may require choosing the correct handler index.

---

## HTTP usage patterns

The TypeScript `HTTPClient` is the standard way to fetch offchain data.

Important points:

- HTTP execution is a node-level action
- CRE wraps it with consensus to produce a single trusted result
- the **high-level API is recommended**

### High-level pattern

```ts
import {
  HTTPClient,
  consensusMedianAggregation,
  type Runtime,
  type HTTPSendRequester,
} from "@chainlink/cre-sdk"

const httpClient = new HTTPClient()

const fetchNumber = httpClient.sendRequest(
  runtime,
  (sendRequester: HTTPSendRequester, url: string): number => {
    const response = sendRequester.sendRequest({ url }).result()

    if (response.statusCode !== 200) {
      throw new Error(`HTTP request failed: ${response.statusCode}`)
    }

    const text = new TextDecoder().decode(response.body)
    const data = JSON.parse(text)

    return Number(data.value)
  },
  consensusMedianAggregation()
)
```

### Agent guidance for HTTP

A coding agent should:

- validate `statusCode`
- decode response body safely
- parse JSON defensively
- coerce output into explicit types
- prefer simple primitive outputs for aggregation when possible
- keep parsing logic small and deterministic

---

## EVM usage patterns

Use `EVMClient` for reads and writes against EVM-compatible chains.

### Instantiate with `getNetwork(...)`

```ts
import { EVMClient, getNetwork } from "@chainlink/cre-sdk"

const network = getNetwork({
  chainFamily: "evm",
  chainSelectorName: "ethereum-testnet-sepolia",
  isTestnet: true,
})

if (!network) {
  throw new Error("Network not found")
}

const evmClient = new EVMClient(network.chainSelector.selector)
```

### Read pattern

```ts
const result = evmClient.callContract(runtime, {
  call: {
    from: "0x0000000000000000000000000000000000000000",
    to: contractAddress,
    data: encodedCallData,
  },
}).result()
```

### Agent guidance for EVM reads

A coding agent should:

- resolve the correct chain selector with `getNetwork(...)`
- keep ABIs minimal and explicit
- validate addresses
- isolate ABI encoding / decoding helpers
- prefer finalized/latest-safe semantics where appropriate
- avoid mixing chain configuration into business logic

---

## Onchain write model

CRE onchain writes do **not** behave like a normal app directly sending transactions to an arbitrary contract.

Important ideas:

- the DON must agree on the value to be written
- the chain needs cryptographic proof that the data came from the trusted workflow / network
- there is an auditable trail of workflow metadata

### Practical consequence

A coding agent should not assume:

- “I can just call any contract write directly from workflow code the same way as a normal ethers/viem app”

Instead, follow CRE’s report / consumer-contract flow and the official onchain write docs.

### Consumer contract expectations

Expect to implement or integrate:

- a receiver contract
- workflow report handling
- sender / forwarder validation
- stale report protection
- optional workflow identity checks

If there is any uncertainty here, consult the official **Onchain Write** guide before generating production code.

---

## Secrets model

CRE uses different secret handling for local simulation vs deployed workflows.

### Local simulation

Use when running locally with `cre workflow simulate`.

Characteristics:

- secrets declared in `secrets.yaml`
- actual values come from environment variables or `.env`
- no Vault DON required

### Deployed workflows

Use when the workflow is actually deployed.

Characteristics:

- secrets stored in the **Vault DON**
- managed with `cre secrets ...`
- workflow still retrieves them with the same runtime API

### In-code access pattern

```ts
const secret = runtime.getSecret({ id: "API_KEY" }).result()
const apiKey = secret.value
```

### Best practice

Prefer a secure secret manager flow such as 1Password CLI integration rather than long-lived plaintext secret files.

---

## Simulation first

Simulation is the default testing path for CRE.

It:

- compiles workflow code to WASM
- runs locally
- uses real HTTP endpoints and public chains you configure
- helps surface compatibility issues with QuickJS/WASM

### Standard command

```bash
cre workflow simulate <workflow-name-or-path> [flags]
```

### Good simulation checklist

Before simulation, a coding agent should verify:

- project root is correct
- `workflow.yaml` exists
- target configuration exists
- RPCs are configured if EVM is used
- secrets are available if required
- trigger parameters are supplied if needed
- handler index is selected for non-interactive runs

### Logging in simulation

Look for user logs under the terminal prefix:

- `[USER LOG]`

---

## Deployment reality check

Deployment is currently documented as **Early Access**.

Before deployment, expect requirements such as:

- CRE account and authentication
- linked key / wallet
- access approval
- ETH on Ethereum mainnet for registry transaction gas
- proper `project.yaml` and network config

### Deployment flow

Conceptually, `cre workflow deploy` does the following:

1. compile workflow to WASM
2. upload artifacts/config
3. register the workflow onchain
4. make the workflow live on the DON

### Agent rule

A coding agent should default to:

- **simulate first**
- **deploy second**
- never skip local validation

---

## Important CRE-specific constraints

These matter when generating code.

### Execution model

- callbacks are **stateless**
- each trigger fire is a new execution
- return values are per-execution results, not persistent state

### Logging

- use `runtime.log(...)`
- do not expect `console.log(...)` output

### Async semantics

- SDK capabilities use `.result()`
- do not convert capability operations into normal `await` patterns unless the docs explicitly support it

### Package compatibility

- QuickJS is not full Node.js
- avoid heavy Node-centric libraries
- validate packages in simulation

### Structure

- keep config in schema form
- prefer explicit inputs/outputs
- avoid unclear side effects
- keep consensus-facing parsing deterministic

---

## Service quota snapshot

These values came from the official CRE service quota docs at the time referenced by the source material and may change.

### Per-owner

- maximum simultaneous workflow executions: **5**
- maximum secrets per owner: **100**

### Per-workflow

- compiled WASM binary size: **100 MB**
- compressed WASM binary size: **20 MB**
- workflow config size: **1 MB**
- trigger subscription limit: **10**
- workflow execution concurrency: **5**
- execution timeout: **5 minutes**
- WASM memory limit: **100 MB**
- execution response size: **100 KB**
- capability concurrency limit: **3**
- capability call timeout: **3 minutes**
- total accessible secrets size: **1 MB**

### Agent implication

Do not design workflows that assume:

- unbounded concurrency
- large in-memory datasets
- long-running operations
- huge return payloads

Keep workflows lean.

---

## Recommended coding style for CRE TypeScript

When asked to generate CRE code, prefer this style:

- TypeScript first
- Zod config schema
- direct imports from `@chainlink/cre-sdk`
- one file per workflow entry point unless project structure demands more
- small pure helpers for parsing / transformation
- runtime-based logging
- capability calls isolated in named helpers
- descriptive workflow and handler names

---

## Good prompts for a coding agent

Examples of effective instructions:

### Scaffold a workflow

> Create a TypeScript CRE workflow with a cron trigger that runs every 10 minutes, fetches JSON from an HTTP endpoint, validates a numeric field, logs the value, and returns a typed object.

### Add EVM read support

> Extend the CRE workflow to read a value from a Sepolia contract using `EVMClient` and `getNetwork(...)`. Keep ABI definitions minimal and isolate encoding/decoding helpers.

### Add secrets safely

> Refactor the workflow so the API key is loaded via `runtime.getSecret({ id: "API_KEY" }).result()`. Assume local simulation first, then document how the same code works with Vault DON in deployment.

### Prepare for simulation

> Generate the workflow code plus a checklist for `workflow.yaml`, target settings, required environment variables, and the exact `cre workflow simulate` command.

---

## Anti-patterns for coding agents

Avoid generating these unless explicitly requested and verified against docs:

- direct `console.log` as the main logging strategy
- Node-only libraries without compatibility checks
- arbitrary direct contract write assumptions
- hidden global mutable state
- workflows that depend on persistent in-memory state
- vague parsing of untrusted HTTP responses
- giant multi-purpose callbacks
- skipping config schemas
- production claims based only on tutorial code

---

## Minimal implementation checklist

When producing CRE TypeScript code, verify all of the following:

- [ ] Uses `@chainlink/cre-sdk`
- [ ] Defines `main()`
- [ ] Defines `initWorkflow(...)`
- [ ] Registers at least one `handler(...)`
- [ ] Uses correct trigger type
- [ ] Uses `runtime.log(...)` instead of `console.log(...)`
- [ ] Uses `.result()` for SDK capability calls
- [ ] Keeps config explicit and validated
- [ ] Simulates locally before deployment
- [ ] Uses correct secret flow for the environment
- [ ] Uses the proper EVM network selector if interacting with a chain

---

## Official doc map

Use these as the source of truth when details matter:

- CRE overview: `https://docs.chain.link/cre`
- Full TypeScript LLM text bundle: `https://docs.chain.link/cre/llms-full-ts.txt`
- Getting started overview: `https://docs.chain.link/cre/getting-started/overview`
- TypeScript project setup: `https://docs.chain.link/cre/getting-started/part-1-project-setup-ts`
- Simulating workflows: `https://docs.chain.link/cre/guides/operations/simulating-workflows`
- Deploying workflows: `https://docs.chain.link/cre/guides/operations/deploying-workflows`
- Key terms: `https://docs.chain.link/cre/key-terms`
- Capabilities overview: `https://docs.chain.link/cre/capabilities`
- TypeScript core SDK reference: `https://docs.chain.link/cre/reference/sdk/core-ts`
- HTTP client reference: `https://docs.chain.link/cre/reference/sdk/http-client-ts`
- EVM client reference: `https://docs.chain.link/cre/reference/sdk/evm-client-ts`
- Onchain write overview: `https://docs.chain.link/cre/guides/workflow/using-evm-client/onchain-write/overview-ts`
- Secrets overview: `https://docs.chain.link/cre/guides/workflow/secrets`
- Secrets for deployed workflows: `https://docs.chain.link/cre/guides/workflow/secrets/using-secrets-deployed`
- Service quotas: `https://docs.chain.link/cre/service-quotas`

---

## Short version for an autonomous agent

If you only remember one page of rules, remember this:

1. CRE TS workflows run in **WASM/QuickJS**, not full Node.
2. Use `handler(trigger, callback)` and keep callbacks stateless.
3. Use `runtime.log(...)`, not `console.log(...)`.
4. Use SDK `.result()` for HTTP, EVM, secrets, and related operations.
5. Prefer simulation first with `cre workflow simulate`.
6. Local secrets use `.env` / env vars; deployed secrets use **Vault DON**.
7. EVM writes require CRE’s report/consumer flow; do not assume arbitrary direct writes.
8. Keep workflows small, typed, deterministic, and easy to validate.

---

## Provenance

This handbook was prepared from Chainlink’s official CRE documentation, primarily:

- the full LLM-oriented TypeScript bundle
- the CRE overview
- getting started docs
- SDK reference pages
- simulation / deployment docs
- secrets docs
- service quota docs

Re-check official docs before production deployment because CRE docs, quotas, and CLI versions can change.
