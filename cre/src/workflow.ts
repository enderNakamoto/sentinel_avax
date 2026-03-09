/**
 * Sentinel Protocol — CRE Workflow
 *
 * Fires every 10 minutes via cron trigger.
 *
 * Each tick:
 *   1. Read active flights from OracleAggregator (EVM read via callContract).
 *   2. For each flight still at Unknown status: fetch status from AeroAPI (HTTP capability).
 *   3. Parse the response; if a final status is determined, write it on-chain via writeReport.
 *   4. Call Controller.checkAndSettle() via writeReport.
 *   5. Call RiskVault.snapshot() via writeReport.
 *
 * CRE rules observed:
 *   - runtime.log() not console.log()
 *   - .result() for all SDK capability calls
 *   - Stateless callback — no persistent in-memory state between runs
 *   - Config validated with Zod (implements StandardSchemaV1)
 *   - No Node built-ins
 *
 * EVM write model:
 *   - Reads use EVMClient.callContract() (eth_call simulation)
 *   - Writes use EVMClient.writeReport() with runtime.report(prepareReportRequest(calldata))
 *   - The CRE forwarder delivers the ABI-encoded calldata to the receiver contract
 *   - msg.sender on the receiver = forwarder address = authorizedOracle / creWorkflowAddress
 *   - No consumer interface required in the receiver contracts
 *
 * ABI encoding uses viem (browser-compatible). Validate with `cre workflow simulate` before deploying.
 */

import {
  Runner,
  CronCapability,
  EVMClient,
  HTTPClient,
  handler,
  getNetwork,
  consensusIdenticalAggregation,
  encodeCallMsg,
  prepareReportRequest,
  bytesToHex,
  hexToBytes,
  text,
  ok,
  type Runtime,
  type CronPayload,
  type HTTPSendRequester,
  type WriteCreReportRequest,
} from "@chainlink/cre-sdk"
import { z } from "zod"
import {
  encodeFunctionData,
  decodeFunctionResult,
  parseAbi,
  type Hex,
} from "viem"

import { parseFlightUpdate } from "./flightaware"
import { FlightStatus, type Flight, type AeroApiResponse } from "./types"
import {
  AEROAPI_BASE_URL,
  ORACLE_AGGREGATOR_ADDRESS,
  CONTROLLER_ADDRESS,
  RISK_VAULT_ADDRESS,
  CHAIN_SELECTOR_NAME,
  IS_TESTNET,
  CRON_SCHEDULE,
} from "./config"

// ---------------------------------------------------------------------------
// Config schema (Zod implements StandardSchemaV1)
// ---------------------------------------------------------------------------

const configSchema = z.object({
  schedule: z.string(),
})

type Config = z.infer<typeof configSchema>

// ---------------------------------------------------------------------------
// Minimal ABIs — only the functions the workflow calls
// ---------------------------------------------------------------------------

const ORACLE_ABI = parseAbi([
  "function getActiveFlights() view returns ((string flightId, string flightDate)[])",
  "function getFlightStatus(string flightId, string flightDate) view returns (uint8)",
  "function updateFlightStatus(string flightId, string flightDate, uint8 status)",
])

const CONTROLLER_ABI = parseAbi([
  "function checkAndSettle()",
])

const RISK_VAULT_ABI = parseAbi([
  "function snapshot()",
])

// Zero address for read calls (no signing required for eth_call).
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const

// ---------------------------------------------------------------------------
// EVM helpers
// ---------------------------------------------------------------------------

/** Execute a read-only eth_call and return the raw ABI-encoded return data. */
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

/**
 * Write state to a contract via the CRE forwarder.
 *
 * The forwarder delivers the ABI-encoded calldata to the receiver contract.
 * msg.sender on the receiver = forwarder address (set as authorizedOracle / creWorkflowAddress).
 */
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

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function fetchFlightStatus(
  httpClient: HTTPClient,
  runtime: Runtime<Config>,
  apiKey: string,
  flightId: string,
  flightDate: string
): AeroApiResponse | null {
  const url =
    `${AEROAPI_BASE_URL}/flights/${flightId}` +
    `?start=${flightDate}T00:00:00Z&end=${flightDate}T23:59:59Z`

  try {
    const body = httpClient
      .sendRequest(
        runtime,
        (sendRequester: HTTPSendRequester, reqUrl: string, key: string): string => {
          const response = sendRequester
            .sendRequest({
              url: reqUrl,
              method: "GET",
              headers: { "x-apikey": key },
            })
            .result()

          if (!ok(response)) {
            throw new Error(
              `AeroAPI HTTP ${response.statusCode} for ${reqUrl}`
            )
          }

          return text(response)
        },
        consensusIdenticalAggregation<string>()
      )(url, apiKey)
      .result()

    return JSON.parse(body) as AeroApiResponse
  } catch (err) {
    runtime.log(
      `[WARN] AeroAPI fetch failed for ${flightId} on ${flightDate}: ${String(err)}`
    )
    return null
  }
}

// ---------------------------------------------------------------------------
// Main tick handler
// ---------------------------------------------------------------------------

const onCronTick = (runtime: Runtime<Config>, _payload: CronPayload): string => {
  runtime.log("[Sentinel] CRE workflow tick starting")

  // --- 1. Set up clients ---------------------------------------------------

  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: CHAIN_SELECTOR_NAME,
    isTestnet: IS_TESTNET,
  })

  if (!network) {
    runtime.log(`[ERROR] Network not found: ${CHAIN_SELECTOR_NAME}`)
    return "error: network not found"
  }

  const evmClient = new EVMClient(network.chainSelector.selector)
  const httpClient = new HTTPClient()

  // --- 2. Fetch active flights from OracleAggregator -----------------------

  const getFlightsCalldata = encodeFunctionData({
    abi: ORACLE_ABI,
    functionName: "getActiveFlights",
    args: [],
  })

  const getFlightsReply = evmRead(
    evmClient,
    runtime,
    ORACLE_AGGREGATOR_ADDRESS,
    getFlightsCalldata
  )

  const activeFlights = decodeFunctionResult({
    abi: ORACLE_ABI,
    functionName: "getActiveFlights",
    data: getFlightsReply,
  }) as unknown as Array<{ flightId: string; flightDate: string }>

  runtime.log(`[Sentinel] Active flights: ${activeFlights.length}`)

  if (activeFlights.length === 0) {
    // Still run settle + snapshot — both are safe no-ops with no active flights.
    runSettleAndSnapshot(evmClient, runtime)
    return "ok: no active flights"
  }

  // --- 3. Fetch AeroAPI secret ---------------------------------------------

  const secret = runtime.getSecret({ id: "AEROAPI_KEY" }).result()
  const apiKey = secret.value

  // --- 4. For each Unknown flight: fetch AeroAPI and collect status updates -

  const statusUpdates: Array<{ flight: Flight; status: FlightStatus }> = []

  for (const flight of activeFlights) {
    // Check current on-chain status; skip if already final.
    const getStatusCalldata = encodeFunctionData({
      abi: ORACLE_ABI,
      functionName: "getFlightStatus",
      args: [flight.flightId, flight.flightDate],
    })

    const getStatusReply = evmRead(
      evmClient,
      runtime,
      ORACLE_AGGREGATOR_ADDRESS,
      getStatusCalldata
    )

    const currentStatus = decodeFunctionResult({
      abi: ORACLE_ABI,
      functionName: "getFlightStatus",
      data: getStatusReply,
    }) as unknown as number

    if (currentStatus !== FlightStatus.Unknown) {
      runtime.log(
        `[Sentinel] ${flight.flightId} ${flight.flightDate} already final (${currentStatus}) — skipping`
      )
      continue
    }

    // Fetch from AeroAPI.
    const apiResponse = fetchFlightStatus(
      httpClient,
      runtime,
      apiKey,
      flight.flightId,
      flight.flightDate
    )

    if (apiResponse === null) {
      // HTTP error already logged; silently continue.
      continue
    }

    const newStatus = parseFlightUpdate(apiResponse)

    if (newStatus === FlightStatus.Unknown) {
      runtime.log(
        `[Sentinel] ${flight.flightId} ${flight.flightDate} still Unknown — will retry next tick`
      )
      continue
    }

    statusUpdates.push({ flight, status: newStatus })
    runtime.log(
      `[Sentinel] ${flight.flightId} ${flight.flightDate} → status ${newStatus}`
    )
  }

  // --- 5. Write final statuses to OracleAggregator -------------------------

  for (const { flight, status } of statusUpdates) {
    const updateCalldata = encodeFunctionData({
      abi: ORACLE_ABI,
      functionName: "updateFlightStatus",
      args: [flight.flightId, flight.flightDate, status],
    })

    try {
      evmWrite(evmClient, runtime, ORACLE_AGGREGATOR_ADDRESS, updateCalldata)
      runtime.log(
        `[Sentinel] Wrote status ${status} for ${flight.flightId} ${flight.flightDate}`
      )
    } catch (err) {
      runtime.log(
        `[WARN] updateFlightStatus failed for ${flight.flightId}: ${String(err)}`
      )
    }
  }

  // --- 6. Settle + snapshot -------------------------------------------------

  runSettleAndSnapshot(evmClient, runtime)

  runtime.log("[Sentinel] Tick complete")
  return "ok"
}

// ---------------------------------------------------------------------------
// Settle and snapshot — always run at end of every tick
// ---------------------------------------------------------------------------

function runSettleAndSnapshot(
  evmClient: EVMClient,
  runtime: Runtime<Config>
): void {
  try {
    const settleCalldata = encodeFunctionData({
      abi: CONTROLLER_ABI,
      functionName: "checkAndSettle",
      args: [],
    })
    evmWrite(evmClient, runtime, CONTROLLER_ADDRESS, settleCalldata)
    runtime.log("[Sentinel] checkAndSettle() complete")
  } catch (err) {
    runtime.log(`[WARN] checkAndSettle failed: ${String(err)}`)
  }

  try {
    const snapshotCalldata = encodeFunctionData({
      abi: RISK_VAULT_ABI,
      functionName: "snapshot",
      args: [],
    })
    evmWrite(evmClient, runtime, RISK_VAULT_ADDRESS, snapshotCalldata)
    runtime.log("[Sentinel] snapshot() complete")
  } catch (err) {
    runtime.log(`[WARN] snapshot failed: ${String(err)}`)
  }
}

// ---------------------------------------------------------------------------
// Workflow registration
// ---------------------------------------------------------------------------

function initWorkflow(config: Config) {
  const cron = new CronCapability()
  return [
    handler(cron.trigger({ schedule: config.schedule }), onCronTick),
  ]
}

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema })
  await runner.run(initWorkflow)
}
