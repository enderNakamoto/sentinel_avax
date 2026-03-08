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
5. **EVM writes are NOT like ethers/viem.** They require CRE's report/consumer-contract flow. Do not assume arbitrary direct writes. Read Layer 4 before writing any write code.
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
      onCronTrigger
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

> Only read this if writing the AeroAPI HTTP fetch inside the workflow.
> Read: `docs/chainlink-cre.md` — section **HTTP usage patterns**

Key pattern: `HTTPClient`, `sendRequester.sendRequest({ url }).result()`, validate `statusCode`, decode body with `new TextDecoder().decode(response.body)`, parse with `JSON.parse()`.

---

## Layer 3 — EVM reads

> Only read this if writing `evmClient.callContract()` to read from OracleAggregator or any other contract.
> Read: `docs/chainlink-cre.md` — section **EVM usage patterns**

Key pattern: `getNetwork({ chainFamily: "evm", chainSelectorName: "...", isTestnet: true })`, then `new EVMClient(network.chainSelector.selector)`, then `.callContract(runtime, { call: { from, to, data } }).result()`.

---

## Layer 4 — EVM writes

> **Read this before writing any EVM write code.** CRE writes are NOT like ethers/viem.
> Read: `docs/chainlink-cre.md` — section **Onchain write model**

CRE writes require: receiver contract, workflow report handling, sender/forwarder validation, stale report protection. Do not assume arbitrary direct contract writes.

---

## Layer 5 — Secrets

> Only read this if setting up `runtime.getSecret()` or configuring secrets for local vs deployed environments.
> Read: `docs/chainlink-cre.md` — section **Secrets model**

Key pattern: `runtime.getSecret({ id: "API_KEY" }).result()` — same code in both environments. Local = `.env` / env vars via `secrets.yaml`. Deployed = Vault DON via `cre secrets set`.

---

## Layer 6 — Deployment

> Only read this if deploying the workflow to a DON (Early Access).
> Read: `docs/chainlink-cre.md` — section **Deployment reality check**

Requirements: CRE account, auth, linked wallet, access approval, ETH on Ethereum mainnet for registry gas. Flow: compile → upload → register onchain → live on DON.

---

## Layer 7 — Service quotas

> Only read this if you're hitting limits (memory, timeouts, concurrency).
> Read: `docs/chainlink-cre.md` — section **Service quota snapshot**

Key limits: WASM 100 MB / 20 MB compressed, execution timeout 5 min, capability concurrency 3, execution response 100 KB, max 5 simultaneous workflow executions per owner.
