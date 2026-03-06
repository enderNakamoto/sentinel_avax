# FlightAware AeroAPI v4 — Agent Reference

> **Version:** 4.17.1  
> **Base URL:** `https://aeroapi.flightaware.com/aeroapi`  
> **Spec:** https://flightaware.com/commercial/aeroapi/resources/aeroapi-openapi.yml  
> **Format:** REST / JSON only (SOAP/XML was dropped in v4)

---

## Table of Contents

1. [Authentication](#authentication)
2. [Pagination](#pagination)
3. [Error Responses](#error-responses)
4. [Endpoint Reference](#endpoint-reference)
   - [Flights](#flights)
   - [Airports](#airports)
   - [Operators](#operators)
   - [Alerts](#alerts)
   - [History](#history)
   - [Miscellaneous](#miscellaneous)
5. [Flight Tracking Use Case](#flight-tracking-use-case)
6. [Get All Flights From an Airport](#get-all-flights-from-an-airport)
7. [TypeScript Code Snippets](#typescript-code-snippets)

---

## Authentication

All requests require an API key passed as a **request header**. Your FlightAware username is NOT used.

```
Header name:  x-apikey
Header value: <your_api_key>
```

**Example curl:**
```bash
curl -X GET "https://aeroapi.flightaware.com/aeroapi/flights/UAL1211" \
  -H "x-apikey: YOUR_API_KEY"
```

**Tiers:** Personal (free, personal use only) · Standard (business) · Premium (B2B + Aireon satellite + Foresight ML)

---

## Pagination

Most collection endpoints support cursor-based pagination via two parameters:

| Parameter | Type | Default | Description |
|---|---|---|---|
| `max_pages` | integer | 1 | Upper limit on pages fetched (each page = up to 15 records) |
| `cursor` | string | — | Opaque token returned in `links.next` to fetch the next batch |

**Paginated response envelope:**
```json
{
  "links": {
    "next": "/aeroapi/airports/KORD/flights?cursor=abc123&max_pages=1"
  },
  "num_pages": 3,
  "<data_key>": [ ... ]
}
```

When `links.next` is `null`, you have reached the last page. To paginate, extract the `cursor` value from the `next` URL and pass it as a query parameter on your next request.

**Billing note:** You are charged per page returned (not per request). Set `max_pages=1` when you only need the first batch to control cost.

---

## Error Responses

All errors return a consistent JSON object:

```json
{
  "title": "Not Found",
  "reason": "FLIGHT_NOT_FOUND",
  "detail": "No flight found matching identifier UA9999",
  "status": 404
}
```

| HTTP Status | Meaning |
|---|---|
| 400 | Bad request — invalid or missing parameters |
| 401 | Authentication failure — check `x-apikey` header |
| 403 | Forbidden — endpoint not available on your tier |
| 404 | No data found for the given identifier |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

---

## Endpoint Reference

### Flights

---

#### `GET /flights/{ident}`

Returns flight status summary for a registration, callsign, or `fa_flight_id`. Returns up to ~14 days of recent and upcoming flights when an ident is given.

**Path parameters:**

| Param | Type | Description |
|---|---|---|
| `ident` | string | Flight callsign (e.g. `UAL1211`), tail number, or FlightAware `fa_flight_id` |

**Query parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `ident_type` | string | — | Force ident resolution: `designator`, `registration`, or `fa_id` |
| `start` | datetime | — | ISO8601 start of time range filter |
| `end` | datetime | — | ISO8601 end of time range filter |
| `max_pages` | integer | 1 | Pagination limit |
| `cursor` | string | — | Pagination cursor |

**Key response fields (per flight object):**

| Field | Type | Description |
|---|---|---|
| `fa_flight_id` | string | Unique FlightAware flight identifier |
| `ident` | string | Flight callsign or registration |
| `ident_iata` | string | IATA flight number (e.g. `UA1211`) |
| `ident_icao` | string | ICAO flight number (e.g. `UAL1211`) |
| `cancelled` | boolean | True if flight is cancelled |
| `diverted` | boolean | True if flight was diverted |
| `origin.code_iata` | string | Origin airport IATA code (e.g. `DFW`) |
| `destination.code_iata` | string | Destination airport IATA code (e.g. `SEA`) |
| `scheduled_out` | datetime | Scheduled gate departure time |
| `estimated_out` | datetime | Estimated gate departure time |
| `actual_out` | datetime | Actual gate departure (pushback) time |
| `scheduled_off` | datetime | Scheduled runway departure (wheels-up) time |
| `estimated_off` | datetime | Estimated runway departure time |
| `actual_off` | datetime | Actual runway departure (wheels-up) time |
| `scheduled_on` | datetime | Scheduled runway arrival (wheels-down) time |
| `estimated_on` | datetime | Estimated runway arrival time |
| `actual_on` | datetime | Actual runway arrival (wheels-down) time |
| `scheduled_in` | datetime | Scheduled gate arrival time |
| `estimated_in` | datetime | Estimated gate arrival time |
| `actual_in` | datetime | Actual gate arrival time |
| `departure_delay` | integer | Departure delay in seconds (negative = early) |
| `arrival_delay` | integer | Arrival delay in seconds (negative = early) |
| `progress_percent` | integer | 0–100 flight progress |
| `status` | string | Human-readable status string (e.g. `"Delayed"`, `"En Route"`, `"Landed"`) |
| `aircraft_type` | string | ICAO aircraft type code (e.g. `B739`) |
| `route` | string | Filed route string |
| `gate_origin` | string | Departure gate |
| `gate_destination` | string | Arrival gate |
| `terminal_origin` | string | Departure terminal |
| `terminal_destination` | string | Arrival terminal |
| `baggage_claim` | string | Baggage claim info |
| `foresight_predictions_available` | boolean | Whether Foresight ML predictions are available (Premium only) |

> **All times are ISO 8601 UTC strings.** Example: `"2024-03-15T20:00:00Z"`

---

#### `GET /flights/{ident}/track`

Returns the full position track for a specific flight.

**Path parameters:** `ident` — must be an `fa_flight_id`

**Response:** Array of position objects with `timestamp`, `latitude`, `longitude`, `altitude` (hundreds of feet), `groundspeed` (knots), `heading`, `update_type`

**`update_type` values:** `A`=ADS-B, `Z`=radar, `M`=multilateration, `O`=oceanic, `D`=datalink, `P`=projected, `X`=surface, `S`=space-based

---

#### `GET /flights/{ident}/map`

Returns a static map image URL for a flight's track.

**Query parameters:**

| Param | Type | Description |
|---|---|---|
| `height` | integer | Image height in pixels |
| `width` | integer | Image width in pixels |
| `layer_on` | string | Map layers to enable (e.g. `US-Cities`) |
| `layer_off` | string | Map layers to disable |
| `show_data_block` | boolean | Overlay flight data on map |
| `airports_expand_view` | boolean | Expand view to include airports |
| `show_airports` | boolean | Show airport markers |

---

#### `GET /flights/search`

Search for currently or recently airborne flights using simplified query syntax.

**Query parameters:**

| Param | Type | Description |
|---|---|---|
| `query` | string | Search string. Supports `-origin`, `-destination`, `-idents`, `-airline`, `-type`, `-aboveAltitude`, `-belowAltitude`, `-latlong "MINLAT MINLON MAXLAT MAXLON"`, `-filter {ga\|airline}` |
| `max_pages` | integer | Pagination limit |
| `cursor` | string | Pagination cursor |

**Example query strings:**
```
-origin KDFW -filter airline
-destination KSEA -airline UAL
-latlong "47.0 -123.0 48.0 -121.0"
```

---

#### `GET /flights/search/advanced`

Same as `/flights/search` but uses a more expressive query syntax using `{operator key value}` terms. Searches only the last ~24 hours.

**Advanced query syntax example:**
```
{= orig KDFW} {match ident UAL*} {airline 1}
```

**Supported operators:** `=`, `!=`, `<`, `>`, `<=`, `>=`, `match`, `notmatch`, `range`, `in`, `orig_or_dest`, `true`, `false`, `null`, `notnull`

**Supported key names (selection):**

| Key | Description |
|---|---|
| `orig` | ICAO origin airport code |
| `dest` | ICAO destination airport code |
| `ident` | Flight callsign with wildcard support |
| `status` | `S`=Scheduled, `F`=Filed, `A`=Active, `Z`=Completed, `X`=Cancelled |
| `cancelled` | boolean |
| `arrived` | boolean |
| `actualDepartureTime` | Unix timestamp |
| `arrivalTime` | Unix timestamp |
| `edt` | Estimated departure time (Unix) |
| `eta` | Estimated arrival time (Unix) |
| `gs` | Ground speed in knots |
| `alt` | Altitude in hundreds of feet |
| `aircraftType` | ICAO aircraft type with wildcard |

---

#### `GET /flights/search/count`

Returns count of flights matching a search query. Same query syntax as `/flights/search`.

**Response:** `{ "count": 42 }`

---

#### `GET /flights/search/positions`

Search for flight positions geospatially. Searches last ~24 hours. Returns position objects rather than full flight objects.

**Query parameters:** `query` (same `{operator key value}` syntax as advanced search), `unique_flights` (boolean, return one position per flight), `max_pages`, `cursor`

---

### Airports

---

#### `GET /airports/{id}`

Returns general information about an airport.

**Path parameters:** `id` — ICAO, IATA, or LID airport code (e.g. `KDFW`, `DFW`)

**Response fields:** `airport_code`, `code_icao`, `code_iata`, `code_lid`, `name`, `city`, `state`, `country`, `timezone`, `latitude`, `longitude`, `elevation`, `wiki_url`, `airport_flights_url`

---

#### `GET /airports/{id}/flights`

Returns all flights (departures and arrivals) for an airport. **This is the primary endpoint for getting all flights from an airport.**

**Path parameters:** `id` — Airport code

**Query parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `type` | string | — | Filter by `departure` or `arrival` |
| `airline` | string | — | Filter by ICAO airline code (e.g. `UAL`) |
| `flight_number` | string | — | Filter by flight number |
| `start` | datetime | — | ISO8601 start time filter |
| `end` | datetime | — | ISO8601 end time filter |
| `max_pages` | integer | 1 | Pagination limit |
| `cursor` | string | — | Pagination cursor |

**Response:** `{ "departures": [...], "arrivals": [...], "links": {...}, "num_pages": N }`

Each flight object includes all scheduled/actual/estimated times, cancellation status, delays, and gate info.

---

#### `GET /airports/{id}/flights/departures`

Returns only departing flights from the airport. Same parameters as `/airports/{id}/flights` minus `type`.

---

#### `GET /airports/{id}/flights/arrivals`

Returns only arriving flights to the airport. Same parameters as `/airports/{id}/flights/departures`.

---

#### `GET /airports/{id}/flights/scheduled_departures`

Returns scheduled (future) departure flights. Useful for getting tomorrow's schedule.

**Query parameters:** `airline`, `flight_number`, `start`, `end`, `max_pages`, `cursor`

---

#### `GET /airports/{id}/flights/scheduled_arrivals`

Returns scheduled (future) arrival flights.

---

#### `GET /airports/{id}/delays`

Returns current delay information for the airport (ATCSCC advisories, GDPs, ground stops).

**Response fields:** `delays` array with `category` (Ground Stop, Ground Delay, etc.), `color` severity indicator, `delay_secs`, `reasons`, `depart_arrive` (D/A/DA)

---

#### `GET /airports/{id}/weather/observations`

Returns current METAR weather observation for the airport.

---

#### `GET /airports/{id}/weather/forecast`

Returns TAF weather forecast for the airport.

---

#### `GET /airports`

Search for airports by name, ICAO code, or city.

**Query parameters:** `max_pages`, `cursor`; airport filter via query string

---

#### `GET /airports/nearby`

Returns airports near a given lat/lon.

**Query parameters:** `latitude`, `longitude`, `radius` (nautical miles), `max_pages`, `cursor`

---

### Operators

---

#### `GET /operators/{id}`

Returns information about an airline/operator.

**Path parameters:** `id` — ICAO, IATA, or ICAO callsign (e.g. `UAL`, `UA`)

---

#### `GET /operators/{id}/flights`

Returns recent and upcoming flights for an operator/airline.

**Query parameters:** `start`, `end`, `max_pages`, `cursor`

---

#### `GET /operators/{id}/flights/enroute`

Returns all currently airborne flights for the operator.

---

#### `GET /operators/{id}/flights/scheduled`

Returns upcoming scheduled flights for the operator.

---

### Alerts

Alerts deliver real-time push notifications to your endpoint URL when flight events occur.

**Setup order:** First call `PUT /alerts/endpoint` to register your URL, then `POST /alerts` to configure individual flight alerts.

---

#### `PUT /alerts/endpoint`

Sets the account-wide default URL for alert delivery.

**Request body:**
```json
{ "url": "https://your-server.com/webhook" }
```

---

#### `GET /alerts`

Returns all currently configured alerts for your API key.

---

#### `POST /alerts`

Creates a new flight alert.

**Request body fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `ident` | string | Yes | Flight ident to alert on |
| `origin` | string | No | Filter by origin airport |
| `destination` | string | No | Filter by destination airport |
| `aircraft_type` | string | No | Filter by aircraft type |
| `start` | datetime | No | Alert window start |
| `end` | datetime | No | Alert window end |
| `max_occurrences` | integer | No | Max number of alert deliveries |
| `events` | object | Yes | Events to trigger on (see below) |
| `target_url` | string | No | Override URL for this specific alert |

**Alert event types:**

| Event | Description |
|---|---|
| `departure` | Bundled: flight plan filed + actual OFF + up to 5 departure changes (delays >30min, gate changes) |
| `arrival` | Bundled: actual ON + up to 5 en-route changes |
| `cancelled` | Flight cancelled |
| `diverted` | Flight diverted |
| `filed` | Flight plan filed |
| `out` | Actual gate departure (pushback) |
| `off` | Actual runway departure (wheels up) |
| `on` | Actual runway arrival (wheels down) |
| `in` | Actual gate arrival |

**Example request body:**
```json
{
  "ident": "UAL1211",
  "origin": "KDFW",
  "destination": "KSEA",
  "events": {
    "departure": true,
    "arrival": true,
    "cancelled": true,
    "diverted": true
  }
}
```

---

#### `GET /alerts/{id}`

Returns a specific alert configuration.

---

#### `PUT /alerts/{id}`

Updates an existing alert. Preferred over deleting and recreating to avoid duplicate deliveries.

---

#### `DELETE /alerts/{id}`

Deletes an alert so it no longer fires.

---

### History

History endpoints mirror their non-history counterparts but allow querying flights going back to January 1, 2011. Requires Standard tier or above.

---

#### `GET /history/flights/{id}/track`

Returns the historical position track for a completed flight by `fa_flight_id`.

---

#### `GET /history/flights/{id}/map`

Returns a static map of the historical flight track.

---

### Miscellaneous

---

#### `GET /disruption_counts/mainpage`

Returns top-level disruption counts (cancellations, delays) for the current day.

---

#### `GET /schedules/{date_start}/{date_end}`

Returns published airline schedule data (future flights) for a date range. Useful for pre-populating scheduled departure/arrival times.

**Path parameters:** `date_start` and `date_end` in `YYYY-MM-DD` format

**Query parameters:** `origin`, `destination`, `airline`, `flight_number`, `max_pages`, `cursor`

---

#### `GET /aircraft/{ident}/owner`

Returns the registered owner of an aircraft by tail number. Requires Standard tier.

---

## Flight Tracking Use Case

To answer the six core questions about a specific flight:

> _What is UA1211's scheduled departure, actual departure, scheduled arrival, actual arrival, delay status, and cancellation status?_

### Step 1 — Look up the flight

```
GET /flights/UAL1211
Header: x-apikey: YOUR_KEY
```

Optional: narrow by date range to avoid getting 14 days of results:
```
GET /flights/UAL1211?start=2024-03-15T00:00:00Z&end=2024-03-15T23:59:59Z
```

### Step 2 — Read the key fields

| Question | Field to check |
|---|---|
| Scheduled departure (gate) | `scheduled_out` |
| Scheduled departure (runway) | `scheduled_off` |
| Actual departure (gate) | `actual_out` |
| Actual departure (runway) | `actual_off` |
| Scheduled arrival (runway) | `scheduled_on` |
| Scheduled arrival (gate) | `scheduled_in` |
| Actual arrival (runway) | `actual_on` |
| Actual arrival (gate) | `actual_in` |
| Was it cancelled? | `cancelled` (boolean) |
| Was it diverted? | `diverted` (boolean) |
| Departure delay | `departure_delay` (seconds; negative = early) |
| Arrival delay | `arrival_delay` (seconds; negative = early) |
| Current status string | `status` |

### Step 3 — Compute delay over threshold X

```typescript
const DELAY_THRESHOLD_HOURS = 2;
const delayHours = flight.arrival_delay / 3600;
const isSignificantlyDelayed = delayHours >= DELAY_THRESHOLD_HOURS;
```

### Determining on-time vs delayed vs cancelled

```typescript
type FlightOutcome = 'cancelled' | 'delayed' | 'on_time' | 'unknown';

function getOutcome(flight: FlightResult, thresholdHours = 2): FlightOutcome {
  if (flight.cancelled) return 'cancelled';
  if (flight.arrival_delay !== null && flight.arrival_delay / 3600 >= thresholdHours) {
    return 'delayed';
  }
  if (flight.actual_in !== null) {
    return 'on_time';
  }
  return 'unknown'; // flight not yet completed
}
```

---

## Get All Flights From an Airport

Use the airport flights endpoints. All use ICAO airport codes (e.g. `KDFW` for Dallas/Fort Worth, `KSEA` for Seattle).

### All departures from an airport (today)

```
GET /airports/KDFW/flights/departures
Header: x-apikey: YOUR_KEY
```

### Filter to airline departures only in a time window

```
GET /airports/KDFW/flights/departures
  ?start=2024-03-15T12:00:00Z
  &end=2024-03-15T20:00:00Z
  &airline=UAL
  &max_pages=5
```

### Get future scheduled departures

```
GET /airports/KDFW/flights/scheduled_departures
  ?start=2024-03-16T00:00:00Z
  &end=2024-03-16T23:59:59Z
```

### Paginating through all results

When `links.next` is not null, extract the `cursor` value and call again:
```
GET /airports/KDFW/flights/departures?cursor=<cursor_from_previous_response>
```

---

## TypeScript Code Snippets

### Base client setup

```typescript
const AEROAPI_BASE = 'https://aeroapi.flightaware.com/aeroapi';
const API_KEY = process.env.AEROAPI_KEY!;

async function aeroGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${AEROAPI_BASE}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const res = await fetch(url.toString(), {
    headers: { 'x-apikey': API_KEY },
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`AeroAPI ${res.status}: ${err.detail}`);
  }
  return res.json() as Promise<T>;
}
```

---

### Fetch a specific flight by callsign

```typescript
interface FlightAirportRef {
  code: string | null;
  code_iata: string | null;
  code_icao: string | null;
  name: string | null;
  city: string | null;
  timezone: string | null;
}

interface FlightResult {
  fa_flight_id: string;
  ident: string;
  ident_iata: string | null;
  ident_icao: string | null;
  cancelled: boolean;
  diverted: boolean;
  origin: FlightAirportRef | null;
  destination: FlightAirportRef | null;
  scheduled_out: string | null;   // gate departure scheduled
  estimated_out: string | null;
  actual_out: string | null;      // gate departure actual
  scheduled_off: string | null;   // runway departure scheduled
  estimated_off: string | null;
  actual_off: string | null;      // runway departure actual (wheels up)
  scheduled_on: string | null;    // runway arrival scheduled
  estimated_on: string | null;
  actual_on: string | null;       // runway arrival actual (wheels down)
  scheduled_in: string | null;    // gate arrival scheduled
  estimated_in: string | null;
  actual_in: string | null;       // gate arrival actual
  departure_delay: number | null; // seconds; negative = early
  arrival_delay: number | null;   // seconds; negative = early
  status: string;
  progress_percent: number | null;
  gate_origin: string | null;
  gate_destination: string | null;
  terminal_origin: string | null;
  terminal_destination: string | null;
}

interface FlightsResponse {
  flights: FlightResult[];
  links: { next: string | null };
  num_pages: number;
}

async function getFlightStatus(
  ident: string,
  date?: string  // e.g. '2024-03-15'
): Promise<FlightResult[]> {
  const params: Record<string, string> = {};
  if (date) {
    params.start = `${date}T00:00:00Z`;
    params.end   = `${date}T23:59:59Z`;
  }
  const data = await aeroGet<FlightsResponse>(`/flights/${ident}`, params);
  return data.flights;
}
```

---

### Check if a flight is delayed, cancelled, or on-time

```typescript
type FlightOutcome = 'cancelled' | 'diverted' | 'delayed' | 'on_time' | 'in_progress' | 'scheduled';

function evaluateFlight(flight: FlightResult, delayThresholdHours = 2): FlightOutcome {
  if (flight.cancelled) return 'cancelled';
  if (flight.diverted)  return 'diverted';

  const delaySeconds = flight.arrival_delay ?? flight.departure_delay ?? 0;
  const delayHours   = delaySeconds / 3600;

  if (flight.actual_in !== null) {
    // Flight has arrived
    return delayHours >= delayThresholdHours ? 'delayed' : 'on_time';
  }

  if (flight.actual_off !== null) {
    // Airborne
    return 'in_progress';
  }

  return 'scheduled';
}

// Example usage
const flights = await getFlightStatus('UAL1211', '2024-03-15');
for (const f of flights) {
  const outcome = evaluateFlight(f, 2);
  console.log({
    flight: f.ident_iata,
    from: f.origin?.code_iata,
    to: f.destination?.code_iata,
    scheduled_departure: f.scheduled_out,
    actual_departure: f.actual_out,
    scheduled_arrival: f.scheduled_in,
    actual_arrival: f.actual_in,
    delay_minutes: (f.arrival_delay ?? 0) / 60,
    outcome,
  });
}
```

---

### Get all departures from an airport with pagination

```typescript
interface AirportFlightsResponse {
  departures: FlightResult[];
  links: { next: string | null };
  num_pages: number;
}

async function getAllDeparturesFromAirport(
  airportCode: string,
  date: string,
  airlineIcao?: string
): Promise<FlightResult[]> {
  const all: FlightResult[] = [];
  let cursor: string | undefined;

  do {
    const params: Record<string, string> = {
      start: `${date}T00:00:00Z`,
      end:   `${date}T23:59:59Z`,
      max_pages: '1',
    };
    if (airlineIcao) params.airline = airlineIcao;
    if (cursor)      params.cursor  = cursor;

    const data = await aeroGet<AirportFlightsResponse>(
      `/airports/${airportCode}/flights/departures`,
      params
    );

    all.push(...data.departures);

    // Extract cursor from next link
    if (data.links.next) {
      const nextUrl = new URL(`https://aeroapi.flightaware.com${data.links.next}`);
      cursor = nextUrl.searchParams.get('cursor') ?? undefined;
    } else {
      cursor = undefined;
    }
  } while (cursor);

  return all;
}

// Example: all United Airlines departures from Dallas on 2024-03-15
const flights = await getAllDeparturesFromAirport('KDFW', '2024-03-15', 'UAL');
```

---

### Register an alert webhook for a flight

```typescript
// Step 1 - set your endpoint (only needed once per account)
async function setAlertEndpoint(webhookUrl: string): Promise<void> {
  await fetch(`${AEROAPI_BASE}/alerts/endpoint`, {
    method: 'PUT',
    headers: {
      'x-apikey': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url: webhookUrl }),
  });
}

// Step 2 - create an alert for a specific flight
interface AlertConfig {
  ident: string;
  origin?: string;
  destination?: string;
  start?: string;
  end?: string;
  events: {
    departure?: boolean;
    arrival?: boolean;
    cancelled?: boolean;
    diverted?: boolean;
    out?: boolean;
    off?: boolean;
    on?: boolean;
    in?: boolean;
  };
  target_url?: string; // optional per-alert override URL
}

async function createFlightAlert(config: AlertConfig): Promise<{ id: number }> {
  const res = await fetch(`${AEROAPI_BASE}/alerts`, {
    method: 'POST',
    headers: {
      'x-apikey': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });
  return res.json();
}

// Example
await setAlertEndpoint('https://my-server.com/webhooks/flights');
const alert = await createFlightAlert({
  ident: 'UAL1211',
  origin: 'KDFW',
  destination: 'KSEA',
  events: {
    departure: true,
    arrival: true,
    cancelled: true,
    diverted: true,
  },
});
console.log(`Alert created: ${alert.id}`);
```

---

### Important Notes for Agents

- **Airport codes:** AeroAPI uses ICAO codes (4-letter, e.g. `KDFW`, `KSEA`, `KORD`). Most endpoints also accept IATA (3-letter, e.g. `DFW`) but ICAO is preferred.
- **Airline codes:** Use ICAO codes for filtering (e.g. `UAL` for United, `AAL` for American, `DAL` for Delta). IATA codes (e.g. `UA`, `AA`, `DL`) are also supported on most endpoints.
- **Flight idents:** Use ICAO format in paths (e.g. `UAL1211`). IATA format (`UA1211`) also resolves correctly.
- **Time zones:** All API times are UTC. Convert to local time using the `timezone` field on origin/destination airport objects (TZ database format, e.g. `America/Chicago`).
- **`actual_off` vs `actual_out`:** `actual_off` is wheels-up (runway departure), `actual_out` is gate pushback. For delay calculation, use gate times (`out`/`in`) for passenger-facing delays, runway times (`off`/`on`) for operational metrics.
- **`cancelled` flag:** Per FlightAware docs, this means the flight is no longer being tracked — it covers airline cancellations but also cases where tracking was otherwise lost. Treat with appropriate caution.
- **Foresight predictions:** `predicted_out`, `predicted_off`, `predicted_on`, `predicted_in` fields are only populated when calling `/foresight/flights/{id}` endpoints, which require the Premium tier.