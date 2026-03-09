import { publicClient, walletClient } from './chain/clients'
import { ORACLE_AGGREGATOR_ADDRESS, CONTROLLER_ADDRESS, oracleAggregatorAbi, controllerAbi } from './chain/contracts'
import { flightStatusEnum } from './chain/status'
import { fetchFlightFromAeroApi } from './aero/client'
import { deriveStatusFromAeroApi } from './aero/deriveStatus'
import { LocalFlightStatus, type ActiveFlight } from './types'

async function getActiveFlights(): Promise<ActiveFlight[]> {
  const flights = await publicClient.readContract({
    address: ORACLE_AGGREGATOR_ADDRESS,
    abi: oracleAggregatorAbi,
    functionName: 'getActiveFlights',
  })

  // viem will type this as any tuple array; normalise to our local type
  return (flights as any[]).map((f) => ({
    flightId: f.flightId as string,
    date: f.date as string,
  }))
}

async function getFlightStatus(flightId: string, date: string): Promise<LocalFlightStatus> {
  const raw = await publicClient.readContract({
    address: ORACLE_AGGREGATOR_ADDRESS,
    abi: oracleAggregatorAbi,
    functionName: 'getFlightStatus',
    args: [flightId, date],
  })

  const value = Number(raw)
  switch (value) {
    case 1:
      return LocalFlightStatus.OnTime
    case 2:
      return LocalFlightStatus.Delayed
    case 3:
      return LocalFlightStatus.Cancelled
    case 0:
    default:
      return LocalFlightStatus.Unknown
  }
}

async function updateFlightStatusOnChain(flightId: string, date: string, status: LocalFlightStatus) {
  const statusEnum = flightStatusEnum[status]
  const hash = await walletClient.writeContract({
    address: ORACLE_AGGREGATOR_ADDRESS,
    abi: oracleAggregatorAbi,
    functionName: 'updateFlightStatus',
    args: [flightId, date, statusEnum],
  })
  console.log('updateFlightStatus tx sent', { flightId, date, status, hash })
}

async function callCheckAndSettle() {
  const hash = await walletClient.writeContract({
    address: CONTROLLER_ADDRESS,
    abi: controllerAbi,
    functionName: 'checkAndSettle',
    args: [],
  })
  console.log('checkAndSettle tx sent', { hash })
}

export async function onCronTick() {
  console.log('--- centralized_cron tick start ---')

  const flights = await getActiveFlights()
  if (flights.length === 0) {
    console.log('No active flights; nothing to do.')
    return
  }

  console.log(`Active flights: ${flights.length}`)

  const updates: { flightId: string; date: string; status: LocalFlightStatus }[] = []

  for (const flight of flights) {
    try {
      const currentStatus = await getFlightStatus(flight.flightId, flight.date)
      if (currentStatus !== LocalFlightStatus.Unknown) {
        continue
      }

      const aeroData = await fetchFlightFromAeroApi(flight.flightId, flight.date)
      const derived = deriveStatusFromAeroApi(aeroData)

      if (derived === LocalFlightStatus.Unknown) {
        continue
      }

      updates.push({ flightId: flight.flightId, date: flight.date, status: derived })
    } catch (err) {
      console.error('Error processing flight', {
        flightId: flight.flightId,
        date: flight.date,
        error: (err as Error).message,
      })
    }
  }

  if (updates.length === 0) {
    console.log('No status updates to write this tick.')
  } else {
    for (const u of updates) {
      try {
        await updateFlightStatusOnChain(u.flightId, u.date, u.status)
      } catch (err) {
        console.error('Failed to updateFlightStatus', {
          flightId: u.flightId,
          date: u.date,
          status: u.status,
          error: (err as Error).message,
        })
      }
    }
  }

  try {
    await callCheckAndSettle()
  } catch (err) {
    console.error('checkAndSettle reverted or failed', {
      error: (err as Error).message,
    })
  }

  console.log('--- centralized_cron tick end ---')
}

// Allow running this file directly via `npm run tick`
if (require.main === module) {
  onCronTick()
    .then(() => {
      // keep process alive only as long as the tick runs
    })
    .catch((err) => {
      console.error('Fatal error in onCronTick', err)
      process.exit(1)
    })
}

