/**
 * Shared types for the flight insurance CRE workflow.
 * FlightStatus enum values must match the on-chain OracleAggregator enum exactly.
 */

export enum FlightStatus {
  Unknown = 0,
  OnTime = 1,
  Delayed = 2,
  Cancelled = 3,
}

/** On-chain flight record returned by OracleAggregator.getActiveFlights() */
export interface Flight {
  flightId: string
  flightDate: string
}

/** Single flight entry from the AeroAPI response body */
export interface AeroApiFlight {
  ident: string
  cancelled: boolean
  status: string
  arrival_delay: number | null
  progress_percent: number
  scheduled_in: string | null
  actual_in: string | null
  actual_on: string | null
}

/** Top-level AeroAPI response shape for GET /flights/{ident} */
export interface AeroApiResponse {
  flights: AeroApiFlight[]
}
