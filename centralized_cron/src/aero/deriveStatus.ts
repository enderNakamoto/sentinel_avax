import type { AeroApiResponse } from '../types'
import { LocalFlightStatus } from '../types'

function minutesBetween(startIso: string | null, endIso: string | null): number | null {
  if (!startIso || !endIso) return null
  const start = new Date(startIso).getTime()
  const end = new Date(endIso).getTime()
  if (Number.isNaN(start) || Number.isNaN(end)) return null
  const diffMs = end - start
  return Math.round(diffMs / 60000)
}

/**
 * Derive a protocol-level flight status from an AeroAPI response.
 * Mirrors the rules documented in the specs:
 * - Landed + delay > 45 min  → Delayed
 * - Landed + delay <= 45 min → OnTime
 * - Cancelled                → Cancelled
 * - Scheduled / En Route / errors / empty → Unknown
 */
export function deriveStatusFromAeroApi(data: AeroApiResponse | null): LocalFlightStatus {
  if (!data || !Array.isArray(data.flights) || data.flights.length === 0) {
    return LocalFlightStatus.Unknown
  }

  const flight = data.flights[0]
  const status = (flight.status || '').toLowerCase()

  if (status.includes('cancelled')) {
    return LocalFlightStatus.Cancelled
  }

  if (status.includes('landed')) {
    const delayMinutes = minutesBetween(flight.scheduled_in, flight.actual_in)
    if (delayMinutes === null) return LocalFlightStatus.Unknown
    if (delayMinutes > 45) return LocalFlightStatus.Delayed
    return LocalFlightStatus.OnTime
  }

  // Scheduled, En Route, or anything else that is not clearly final
  return LocalFlightStatus.Unknown
}

