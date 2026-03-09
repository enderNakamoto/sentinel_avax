export enum LocalFlightStatus {
  Unknown = 'Unknown',
  OnTime = 'OnTime',
  Delayed = 'Delayed',
  Cancelled = 'Cancelled',
}

export interface ActiveFlight {
  flightId: string
  date: string
}

// Minimal shape we care about from AeroAPI /flights/{ident}
export interface AeroApiFlight {
  ident: string
  scheduled_in: string | null
  actual_in: string | null
  status: string
}

export interface AeroApiResponse {
  flights: AeroApiFlight[]
}

