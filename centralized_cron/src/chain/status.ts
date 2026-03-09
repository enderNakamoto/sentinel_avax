import { LocalFlightStatus } from '../types'

// Solidity enum FlightStatus { Unknown, OnTime, Delayed, Cancelled }
export const flightStatusEnum = {
  [LocalFlightStatus.Unknown]: 0,
  [LocalFlightStatus.OnTime]: 1,
  [LocalFlightStatus.Delayed]: 2,
  [LocalFlightStatus.Cancelled]: 3,
} as const

