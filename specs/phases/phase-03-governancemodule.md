# Phase 3 — GovernanceModule

Status: planned
Started: —
Completed: —

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

- [ ] 1. Define `Route` struct — `(flightId, origin, destination, premium, payoff, active)`
- [ ] 2. Add `routes` mapping — `bytes32 key → Route`
- [ ] 3. Add `routeKeys` array — `bytes32[]` for iteration; push on first approval; used by `getApprovedRoutes()`
- [ ] 4. Add `admins` mapping — `address → bool`
- [ ] 5. Write `_routeKey(string flightId, string origin, string destination)` internal pure — returns `keccak256(abi.encodePacked(flightId, origin, destination))`
- [ ] 6. Write `addAdmin(address)` — owner only
- [ ] 7. Write `removeAdmin(address)` — owner only
- [ ] 8. Write `onlyOwnerOrAdmin` modifier
- [ ] 9. Write `approveRoute(flightId, origin, destination, premium, payoff)` — validate premium > 0, payoff > premium, route not already active; push key to `routeKeys` only on first-ever approval (not re-approval of a disabled route)
- [ ] 10. Write `disableRoute(flightId, origin, destination)` — mark `active = false`
- [ ] 11. Write `updateRouteTerms(flightId, origin, destination, newPremium, newPayoff)` — validate terms, update in place; reverts if route does not exist; succeeds on disabled routes
- [ ] 12. Write `isRouteApproved(flightId, origin, destination)` view
- [ ] 13. Write `getRouteTerms(flightId, origin, destination)` view — returns `(premium, payoff)`
- [ ] 14. Write `getApprovedRoutes()` view — iterate `routeKeys`, filter `active == true`, return `Route[]`
- [ ] 15. Test: non-owner, non-admin cannot call `approveRoute`
- [ ] 16. Test: non-owner, non-admin cannot call `disableRoute`
- [ ] 17. Test: non-owner, non-admin cannot call `updateRouteTerms`
- [ ] 18. Test: non-owner cannot call `addAdmin`
- [ ] 19. Test: non-owner cannot call `removeAdmin`
- [ ] 20. Test: admin can call `approveRoute`, `disableRoute`, `updateRouteTerms`
- [ ] 21. Test: admin cannot call `addAdmin` or `removeAdmin`
- [ ] 22. Test: after `removeAdmin`, revoked address loses access immediately
- [ ] 23. Test: `approveRoute` → `isRouteApproved` returns true
- [ ] 24. Test: `disableRoute` → `isRouteApproved` returns false
- [ ] 25. Test: re-approving a disabled route works
- [ ] 26. Test: `getRouteTerms` returns correct premium and payoff after approval
- [ ] 27. Test: `getRouteTerms` returns updated values after `updateRouteTerms`
- [ ] 28. Test: `getApprovedRoutes` returns only active routes, not disabled ones
- [ ] 29. Test: `getApprovedRoutes` returns empty array when no routes approved
- [ ] 30. Test: `approveRoute` reverts if premium is zero
- [ ] 31. Test: `approveRoute` reverts if payoff <= premium
- [ ] 32. Test: `approveRoute` reverts if route already active
- [ ] 33. Test: `updateRouteTerms` reverts if route does not exist
- [ ] 34. Test: `updateRouteTerms` reverts if new payoff <= new premium
- [ ] 35. Test: `updateRouteTerms` succeeds on a disabled route

### Gate

All access control, lifecycle, and validation tests pass. `getApprovedRoutes()` correctly filters disabled routes.

---

## Work Log

> Populated by the agent during work. Do not edit manually.

---

## Files Created / Modified

> Populated by the agent during work.

---

## Decisions Made

> Key architectural or implementation decisions locked in during this phase. Populated during work.

---

## Completion Summary

> Populated by /complete-phase. Do not edit manually.
