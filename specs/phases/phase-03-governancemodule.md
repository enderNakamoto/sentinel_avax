# Phase 3 — GovernanceModule

Status: complete
Started: 2026-03-08
Completed: 2026-03-08

---

## Goal

Write the route authority contract — the single source of truth for which flight routes are approved and what their premium and payoff are. The Controller reads from this contract before every insurance purchase and before deploying any new FlightPool. GovernanceModule has no dependency on any other Sentinel contract and will not change structurally after this phase.

## Dependencies

- No other Sentinel contract dependencies — GovernanceModule is standalone
- `MockUSDC` is NOT needed — this contract has no token logic

## Pre-work Notes

> This section is for you to fill in before work begins.
> Add constraints, decisions already made, questions to resolve, patterns to follow, or anything the agent should know before touching code.

**Decided before work began:**
- `flightId`, `origin`, `destination` are all `string` parameters — `_routeKey()` hashes them to `bytes32` for the mapping key
- Backing storage for `getApprovedRoutes()`: maintain a `bytes32[] routeKeys` array — push key on `approveRoute`, filter `active == true` at read time. No swap-and-pop needed on disable.
- `updateRouteTerms` succeeds on a disabled route (only reverts if the route has never been approved / does not exist at all)
- Follow solidity conventions throughout: custom errors, PascalCase events, camelCase state vars, no `s_` Hungarian notation

---

## Subtasks

- [x] 1. Define `Route` struct — `(flightId, origin, destination, premium, payoff, active)`
- [x] 2. Add `routes` mapping — `bytes32 key → Route`
- [x] 3. Add `routeKeys` array — `bytes32[]` for iteration; push on first approval; used by `getApprovedRoutes()`
- [x] 4. Add `admins` mapping — `address → bool`
- [x] 5. Write `_routeKey(string flightId, string origin, string destination)` internal pure — returns `keccak256(abi.encodePacked(flightId, origin, destination))`
- [x] 6. Write `addAdmin(address)` — owner only
- [x] 7. Write `removeAdmin(address)` — owner only
- [x] 8. Write `onlyOwnerOrAdmin` modifier
- [x] 9. Write `approveRoute(flightId, origin, destination, premium, payoff)` — validate premium > 0, payoff > premium, route not already active; push key to `routeKeys` only on first-ever approval (not re-approval of a disabled route)
- [x] 10. Write `disableRoute(flightId, origin, destination)` — mark `active = false`
- [x] 11. Write `updateRouteTerms(flightId, origin, destination, newPremium, newPayoff)` — validate terms, update in place; reverts if route does not exist; succeeds on disabled routes
- [x] 12. Write `isRouteApproved(flightId, origin, destination)` view
- [x] 13. Write `getRouteTerms(flightId, origin, destination)` view — returns `(premium, payoff)`
- [x] 14. Write `getApprovedRoutes()` view — iterate `routeKeys`, filter `active == true`, return `Route[]`
- [x] 15. Test: non-owner, non-admin cannot call `approveRoute`
- [x] 16. Test: non-owner, non-admin cannot call `disableRoute`
- [x] 17. Test: non-owner, non-admin cannot call `updateRouteTerms`
- [x] 18. Test: non-owner cannot call `addAdmin`
- [x] 19. Test: non-owner cannot call `removeAdmin`
- [x] 20. Test: admin can call `approveRoute`, `disableRoute`, `updateRouteTerms`
- [x] 21. Test: admin cannot call `addAdmin` or `removeAdmin`
- [x] 22. Test: after `removeAdmin`, revoked address loses access immediately
- [x] 23. Test: `approveRoute` → `isRouteApproved` returns true
- [x] 24. Test: `disableRoute` → `isRouteApproved` returns false
- [x] 25. Test: re-approving a disabled route works
- [x] 26. Test: `getRouteTerms` returns correct premium and payoff after approval
- [x] 27. Test: `getRouteTerms` returns updated values after `updateRouteTerms`
- [x] 28. Test: `getApprovedRoutes` returns only active routes, not disabled ones
- [x] 29. Test: `getApprovedRoutes` returns empty array when no routes approved
- [x] 30. Test: `approveRoute` reverts if premium is zero
- [x] 31. Test: `approveRoute` reverts if payoff <= premium
- [x] 32. Test: `approveRoute` reverts if route already active
- [x] 33. Test: `updateRouteTerms` reverts if route does not exist
- [x] 34. Test: `updateRouteTerms` reverts if new payoff <= new premium
- [x] 35. Test: `updateRouteTerms` succeeds on a disabled route

### Gate

All access control, lifecycle, and validation tests pass. `getApprovedRoutes()` correctly filters disabled routes.

---

## Work Log

### Session 2026-03-08
Starting phase. Pre-work notes reviewed.

**Subtasks 1–14 (contract):** Wrote `contracts/src/GovernanceModule.sol`.
- `Route` struct with `(flightId, origin, destination, premium, payoff, active)`
- `routes` mapping (`bytes32 → Route`), `routeKeys` array (pushed only on first-ever approval), `routeExists` private mapping for O(1) deduplication
- `admins` mapping; `onlyOwnerOrAdmin` modifier; `addAdmin` / `removeAdmin` (owner only)
- `_routeKey` hashes `keccak256(abi.encodePacked(flightId, origin, destination))`
- `approveRoute`, `disableRoute`, `updateRouteTerms` with custom error validation
- `isRouteApproved`, `getRouteTerms`, `getApprovedRoutes` views

**Subtasks 15–35 (tests):** Wrote `contracts/test/GovernanceModule.t.sol`. 26 tests, all pass.

**All 26 tests pass: `forge test --match-path test/GovernanceModule.t.sol`**

All subtasks complete. Gate condition met. Ready for /complete-phase.

### Session 2026-03-08 — Completed
Phase validated by user. All gate conditions met.

---

## Files Created / Modified

- `contracts/src/GovernanceModule.sol` — created
- `contracts/test/GovernanceModule.t.sol` — created

---

## Decisions Made

- Added private `routeExists` mapping alongside `routeKeys` array so `approveRoute` can check first-ever approval in O(1) without iterating the array.
- `disableRoute` does not validate whether the route exists — marking a non-existent route inactive is a no-op and harmless.
- `routeExists[key]` is set once and never unset — re-approving a disabled route skips the `routeKeys.push` correctly.

---

## Completion Summary

**What was built:**
- `contracts/src/GovernanceModule.sol` — standalone route authority contract. Inherits OZ `Ownable`. Admin whitelist managed by owner. Routes keyed by `keccak256(flightId, origin, destination)`. Full lifecycle: approve → disable → re-approve. Term updates succeed even on disabled routes.
- `contracts/test/GovernanceModule.t.sol` — 26 tests, all pass. Covers access control (owner vs admin vs stranger), route lifecycle, validation reverts, `getApprovedRoutes` filtering, and re-approve deduplication.

**Key decisions locked in:**
- Private `routeExists` mapping alongside `routeKeys` for O(1) first-approval detection (avoids array scan).
- `disableRoute` does not revert on non-existent routes — marking inactive is harmless.
- `routeExists[key]` is set once, never unset — deduplication is permanent.
- `_routeKey` uses `calldata` string params — consistent with all function signatures in this contract.

**Files created:**
- `contracts/src/GovernanceModule.sol`
- `contracts/test/GovernanceModule.t.sol`

**Phase 4 (RiskVault) should be aware:**
- Controller will call `GovernanceModule.isRouteApproved()` and `getRouteTerms()` — both are `external view`, no side effects.
- GovernanceModule constructor takes `(address initialOwner)` — deploy before Controller, no post-deploy wiring needed.
