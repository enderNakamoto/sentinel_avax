import axios from 'axios'
import { config } from '../config'
import type { AeroApiResponse } from '../types'

export async function fetchFlightFromAeroApi(flightId: string, date: string): Promise<AeroApiResponse | null> {
  // Simple date window: full UTC day based on the provided date string.
  // Assumes format YYYY-MM-DD; if not, the API may still handle it, but this
  // should match how flights are configured for the protocol.
  const start = `${date}T00:00:00Z`
  const end = `${date}T23:59:59Z`

  const url = `${config.AEROAPI_BASE_URL}/flights/${encodeURIComponent(
    flightId,
  )}?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`

  try {
    const res = await axios.get<AeroApiResponse>(url, {
      headers: {
        'x-apikey': config.AEROAPI_KEY,
      },
      timeout: 10_000,
    })
    return res.data
  } catch (err) {
    console.error('AeroAPI request failed', { flightId, date, error: (err as Error).message })
    return null
  }
}

