import * as path from "path"
import * as fs from "fs"

import { parseFlightUpdate, DELAY_THRESHOLD_MINUTES } from "./flightaware"
import { AeroApiResponse, FlightStatus } from "./types"

const FIXTURES = path.resolve(__dirname, "../../mock_aero_api")

function load(filename: string): AeroApiResponse {
  const raw = fs.readFileSync(path.join(FIXTURES, filename), "utf-8")
  return JSON.parse(raw) as AeroApiResponse
}

describe("parseFlightUpdate", () => {
  it("uses DELAY_THRESHOLD_MINUTES = 15", () => {
    expect(DELAY_THRESHOLD_MINUTES).toBe(15)
  })

  it("ontime-landed.json → OnTime (5-min delay, below threshold)", () => {
    const data = load("ontime-landed.json")
    expect(parseFlightUpdate(data)).toBe(FlightStatus.OnTime)
  })

  it("delayed-landed.json → Delayed (20-min delay, above threshold)", () => {
    const data = load("delayed-landed.json")
    expect(parseFlightUpdate(data)).toBe(FlightStatus.Delayed)
  })

  it("cancelled-weather.json → Cancelled", () => {
    const data = load("cancelled-weather.json")
    expect(parseFlightUpdate(data)).toBe(FlightStatus.Cancelled)
  })

  it("cancelled-mechanical.json → Cancelled", () => {
    const data = load("cancelled-mechanical.json")
    expect(parseFlightUpdate(data)).toBe(FlightStatus.Cancelled)
  })

  it("cancelled-unknown.json → Cancelled", () => {
    const data = load("cancelled-unknown.json")
    expect(parseFlightUpdate(data)).toBe(FlightStatus.Cancelled)
  })

  it("inflight-ontime.json → OnTime (in-flight, estimated delay ≤ threshold)", () => {
    // arrival_delay = 300s (5 min), threshold = 15 min. Flight still en route
    // but carrier estimate is available — classify now rather than waiting.
    const data = load("inflight-ontime.json")
    expect(parseFlightUpdate(data)).toBe(FlightStatus.OnTime)
  })

  it("inflight-delayed.json → Delayed (in-flight, estimated delay > threshold)", () => {
    // arrival_delay = 1200s (20 min), threshold = 15 min.
    const data = load("inflight-delayed.json")
    expect(parseFlightUpdate(data)).toBe(FlightStatus.Delayed)
  })

  it("landed-fallback-runway.json → OnTime (actual_on fallback, zero delay)", () => {
    // actual_in is null; actual_on is set. Delay = actual_on - scheduled_in.
    // actual_on = 11:58, scheduled_in = 12:00 → −120s (early) → OnTime.
    const data = load("landed-fallback-runway.json")
    expect(parseFlightUpdate(data)).toBe(FlightStatus.OnTime)
  })

  it("empty.json → Unknown (no flights in response)", () => {
    const data = load("empty.json")
    expect(parseFlightUpdate(data)).toBe(FlightStatus.Unknown)
  })
})
