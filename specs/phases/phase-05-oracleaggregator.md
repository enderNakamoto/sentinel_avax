# Phase 5 — OracleAggregator

Status: complete
Started: 2026-03-08
Completed: 2026-03-08

---

## Goal

Write the on-chain flight status registry. This is the single source of truth for all settlement decisions. The CRE workflow reads the active flight list every tick, fetches statuses from AeroAPI, and writes final statuses here. The Controller reads from it to know which FlightPools are ready to settle. Status transitions are append-only toward finality — once a flight is `OnTime`, `Delayed`, or `Cancelled`, it can never go back to `Unknown`.

## Dependencies

- No other Sentinel contracts required at deploy time — OracleAggregator is standalone.
- Controller and oracle (CRE workflow) addresses are wired via one-time setters post-deploy.
- MockUSDC is NOT needed — no token logic.

## Pre-work Notes

> This section is for you to fill in before work begins.
> Add constraints, decisions already made, questions to resolve, patterns to follow, or anything the agent should know before touching code.

**Decided before work began:**

- **`date` is `string`** — matches AeroAPI date format (e.g. `"2026-03-08"`). Used in `_flightKey`, `registerFlight`, `deregisterFlight`, `updateFlightStatus`, `getFlightStatus`.
- **`registeredFlights` stores `Flight(string flightId, string date)` structs** — no `bytes32` keys in the array. `getActiveFlights()` returns `Flight[]` directly so the CRE workflow can read flight IDs and dates without any reverse lookup.
- **`_flightKey(flightId, date)`** — `keccak256(abi.encodePacked(flightId, date))` → `bytes32` used only as mapping key internally.
- **`flightIndex` mapping** — `bytes32 key → uint256 index` for O(1) swap-and-pop deregistration.
- **Append-only status** — `updateFlightStatus` requires `uint8(newStatus) > uint8(currentStatus)`. Since `Unknown=0, OnTime=1, Delayed=2, Cancelled=3`, any transition from a final status back toward `Unknown` is rejected.
- **`setController` and `setOracle` are one-time setters** — revert with `ControllerAlreadySet` / `OracleAlreadySet` if already set.
- **`getFlightStatus` never reverts** — returns `Unknown` for any unregistered flight key.
- Follow all Solidity conventions: custom errors, PascalCase events, camelCase state vars, no `s_` Hungarian notation.

---

## Subtasks

- [x] 1. Define `FlightStatus` enum — `Unknown, OnTime, Delayed, Cancelled`
- [x] 2. Define `Flight` struct — `(string flightId, string date)`
- [x] 3. Declare state — `authorizedController`, `authorizedOracle`, `flightStatuses` mapping (`bytes32 → FlightStatus`), `registeredFlights` array (`Flight[]`), `flightIndex` mapping (`bytes32 → uint256`)
- [x] 4. Write `setController(address)` — one-time setter, reverts with `ControllerAlreadySet` if already set
- [x] 5. Write `setOracle(address)` — one-time setter, reverts with `OracleAlreadySet` if already set
- [x] 6. Write `onlyController` and `onlyOracle` modifiers
- [x] 7. Write `_flightKey(string flightId, string date)` internal pure — `keccak256(abi.encodePacked(flightId, date))`
- [x] 8. Write `registerFlight(string flightId, string date)` — `onlyController`, push `Flight` to `registeredFlights`, record index in `flightIndex`, set status to `Unknown`
- [x] 9. Write `deregisterFlight(string flightId, string date)` — `onlyController`, swap-and-pop from `registeredFlights`, update `flightIndex` for the swapped entry, delete index for removed entry
- [x] 10. Write `updateFlightStatus(string flightId, string date, FlightStatus status)` — `onlyOracle`, require flight registered, final-state guard
- [x] 11. Write `getFlightStatus(string flightId, string date)` — public view, returns `Unknown` if not registered, never reverts
- [x] 12. Write `getActiveFlights()` — returns current `registeredFlights` array as `Flight[]`

**Test one-time setters:**

- [x] 13. Test: `setController` succeeds on first call
- [x] 14. Test: `setController` reverts on second call with `ControllerAlreadySet`
- [x] 15. Test: `setOracle` succeeds on first call
- [x] 16. Test: `setOracle` reverts on second call with `OracleAlreadySet`
- [x] 17. Test: `registerFlight` reverts before `setController` is called
- [x] 18. Test: `updateFlightStatus` reverts before `setOracle` is called

**Test registration:**

- [x] 19. Test: `registerFlight` adds flight to active list, status initialised to `Unknown`
- [x] 20. Test: `registerFlight` by non-controller reverts
- [x] 21. Test: `deregisterFlight` removes flight from active list
- [x] 22. Test: `deregisterFlight` by non-controller reverts
- [x] 23. Test: `getFlightStatus` for unregistered flight returns `Unknown` without reverting
- [x] 24. Test: `getActiveFlights` returns correct set after each register/deregister

**Test status transitions:**

- [x] 25. Test: `Unknown → OnTime` accepted
- [x] 26. Test: `Unknown → Delayed` accepted
- [x] 27. Test: `Unknown → Cancelled` accepted
- [x] 28. Test: `OnTime → Unknown` reverts
- [x] 29. Test: `OnTime → Delayed` reverts
- [x] 30. Test: `Delayed → Unknown` reverts
- [x] 31. Test: `Delayed → OnTime` reverts
- [x] 32. Test: `Cancelled → anything` reverts
- [x] 33. Test: non-oracle cannot call `updateFlightStatus`
- [x] 34. Test: update for unregistered flight reverts

**Test swap-and-pop deregistration:**

- [x] 35. Test: register 5 flights, deregister index 2 — remaining 4 have no gaps
- [x] 36. Test: register 3 flights, deregister the last — no out-of-bounds error
- [x] 37. Test: register 1 flight, deregister it — array is empty
- [x] 38. Test: `flightIndex` for swapped entry updated correctly after deregistration

### Gate

All status lifecycle, access control, and swap-and-pop tests pass.

---

## Work Log

### Session 2026-03-08
Starting phase. Pre-work notes reviewed.

Implemented `OracleAggregator.sol` (subtasks 1–12):
- `FlightStatus` enum, `Flight` struct, state variables
- `setController` / `setOracle` one-time setters
- `onlyController` / `onlyOracle` modifiers
- `_flightKey` internal pure (string memory — allows both calldata and memory inputs)
- `registerFlight` with `flightRegistered` bool mapping for O(1) registration check
- `deregisterFlight` with swap-and-pop and `flightIndex` update
- `updateFlightStatus` with terminal-state guard (see Decisions)
- `getFlightStatus` (never reverts), `getActiveFlights`

Wrote `OracleAggregator.t.sol` (subtasks 13–38) with 30 tests covering all subtasks plus 3 event tests.

Fixed compilation issue: `_flightKey` signature changed from `calldata` to `memory` to accept struct field strings inside `deregisterFlight`.

All 30 tests pass. Full suite 109/109 pass. Gate condition met. Ready for /complete-phase.

### Session 2026-03-08 — Completed
Phase validated by user. All gate conditions met.

---

## Files Created / Modified

- `contracts/src/OracleAggregator.sol` — created
- `contracts/test/OracleAggregator.t.sol` — created
- `specs/phases/phase-05-oracleaggregator.md` — updated (status, subtasks, work log)
- `specs/progress.md` — updated (status, started date)

---

## Decisions Made

**Status guard is `current == Unknown` not `uint8 >`**

Pre-work notes described `uint8(newStatus) > uint8(currentStatus)` but with the enum ordering `Unknown=0, OnTime=1, Delayed=2, Cancelled=3`, that would allow `OnTime → Delayed` (2 > 1). Test 29 explicitly requires `OnTime → Delayed` to revert. The correct semantic is: all three final statuses (OnTime, Delayed, Cancelled) are terminal — only `Unknown → final` is allowed. Implemented as:
```solidity
if (current != FlightStatus.Unknown || status == FlightStatus.Unknown) revert StatusNotProgressing();
```

**`_flightKey` uses `string memory`**

Changed from `string calldata` to `string memory` so the function can be called with struct fields (memory) from inside `deregisterFlight` as well as from external functions (where calldata is implicitly copied to memory).

---

## Completion Summary

**What was built:**
- `OracleAggregator.sol` — on-chain flight status registry with `FlightStatus` enum (`Unknown, OnTime, Delayed, Cancelled`), `Flight` struct, swap-and-pop registration, append-only terminal status guard, and one-time setters for controller/oracle wiring.
- `OracleAggregator.t.sol` — 30 tests covering one-time setters, registration, all status transitions, access control, and swap-and-pop edge cases.

**Key decisions locked in:**
- Status guard: `if (current != FlightStatus.Unknown || status == FlightStatus.Unknown) revert StatusNotProgressing()` — OnTime, Delayed, and Cancelled are all terminal; only `Unknown → final` is permitted. The `uint8 >` ordering from pre-work notes was insufficient (would allow `OnTime → Delayed`).
- `_flightKey` uses `string memory` (not `calldata`) so it can be called with both external calldata params and in-memory struct fields from `deregisterFlight`.
- `flightRegistered` bool mapping used alongside `flightStatuses` — needed to distinguish a genuinely unregistered flight (where `getFlightStatus` should return `Unknown` without reverting) from a registered flight with status `Unknown` (which can receive a status update).

**Files created:**
- `contracts/src/OracleAggregator.sol`
- `contracts/test/OracleAggregator.t.sol`

**For Phase 6 (FlightPool):**
- OracleAggregator is not a dependency at FlightPool deploy time — only the Controller calls `registerFlight` / `deregisterFlight`.
- The `Flight` struct (`flightId string`, `date string`) matches what the CRE workflow expects to read from `getActiveFlights()`.
- 30 tests, 109 total suite — all passing.
