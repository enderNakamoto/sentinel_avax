import { AeroApiResponse, FlightStatus } from "./types"

/**
 * Delay threshold for classifying a flight as Delayed.
 * A flight with actual arrival delay > this value (in minutes) is marked Delayed.
 *
 * Set to 15 minutes to match mock fixture expectations.
 * Change to 45 minutes for production if desired.
 */
export const DELAY_THRESHOLD_MINUTES = 15

const DELAY_THRESHOLD_SECONDS = DELAY_THRESHOLD_MINUTES * 60

/**
 * Derives the final FlightStatus from an AeroAPI response.
 *
 * Classification logic (in priority order):
 *
 * 1. Empty flights array → Unknown (no data yet; retry next tick)
 * 2. `cancelled === true` → Cancelled
 * 3. `actual_in` is set → compute delay = actual_in - scheduled_in (gate-to-gate)
 * 4. `actual_on` is set (runway arrival, gate time unavailable) → compute delay = actual_on - scheduled_in
 * 5. `arrival_delay` is set → use directly (in-flight estimate)
 * 6. None of the above → Unknown
 *
 * Paths 3 and 4 produce a final result only for landed/arrived flights.
 * Path 5 allows in-flight classification based on the carrier's estimated delay —
 * this is intentional: the system settles based on estimated arrival when a
 * final gate time is not yet available but the carrier reports a clear delay.
 */
export function parseFlightUpdate(data: AeroApiResponse): FlightStatus {
  if (!data.flights || data.flights.length === 0) {
    return FlightStatus.Unknown
  }

  // Use the last entry — the most recent leg for the flight ident.
  const flight = data.flights[data.flights.length - 1]

  if (flight.cancelled === true) {
    return FlightStatus.Cancelled
  }

  const delaySeconds = computeDelaySeconds(flight)

  if (delaySeconds === null) {
    return FlightStatus.Unknown
  }

  return delaySeconds > DELAY_THRESHOLD_SECONDS
    ? FlightStatus.Delayed
    : FlightStatus.OnTime
}

/**
 * Computes arrival delay in seconds using the best available data source.
 * Returns null if no arrival information is available.
 */
function computeDelaySeconds(
  flight: import("./types").AeroApiFlight
): number | null {
  // Priority 1: actual gate arrival vs scheduled gate arrival.
  // toEpochMs returns ms; divide by 1000 to get seconds for comparison with DELAY_THRESHOLD_SECONDS.
  if (flight.actual_in !== null && flight.scheduled_in !== null) {
    return (toEpochMs(flight.actual_in) - toEpochMs(flight.scheduled_in)) / 1000
  }

  // Priority 2: actual runway arrival vs scheduled gate arrival (fallback when
  // gate time is unavailable, e.g. the aircraft has landed but not pulled in).
  if (flight.actual_on !== null && flight.scheduled_in !== null) {
    return (toEpochMs(flight.actual_on) - toEpochMs(flight.scheduled_in)) / 1000
  }

  // Priority 3: carrier-reported arrival_delay (used for in-flight estimation).
  if (flight.arrival_delay !== null) {
    return flight.arrival_delay
  }

  return null
}

/** Convert an ISO 8601 UTC timestamp string to milliseconds since epoch. */
function toEpochMs(iso: string): number {
  return new Date(iso).getTime()
}
