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
 * - Cancelled (status string or boolean)  → Cancelled
 * - Arrived/Landed + delay > 15 min       → Delayed
 * - Arrived/Landed + delay <= 15 min      → OnTime
 * - Scheduled / En Route / errors / empty → Unknown
 *
 * AeroAPI may return multiple flight entries (e.g. "result unknown" + "Cancelled").
 * We pick the first entry with a meaningful final status.
 */
export function deriveStatusFromAeroApi(data: AeroApiResponse | null): LocalFlightStatus {
  if (!data || !Array.isArray(data.flights) || data.flights.length === 0) {
    return LocalFlightStatus.Unknown
  }

  // Try each flight entry — AeroAPI sometimes returns a "result unknown" entry first
  for (const flight of data.flights) {
    const status = (flight.status || '').toLowerCase()

    // Check cancelled boolean OR status string
    if (flight.cancelled || status.includes('cancelled')) {
      return LocalFlightStatus.Cancelled
    }

    if (status.includes('arrived') || status.includes('landed')) {
      const delayMinutes = minutesBetween(flight.scheduled_in, flight.actual_in)
      if (delayMinutes === null) continue
      if (delayMinutes > 15) return LocalFlightStatus.Delayed
      return LocalFlightStatus.OnTime
    }
  }

  // Scheduled, En Route, or anything else that is not clearly final
  return LocalFlightStatus.Unknown
}

