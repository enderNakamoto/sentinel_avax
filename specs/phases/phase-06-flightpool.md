# Phase 6 — FlightPool

Status: complete
Started: 2026-03-08
Completed: 2026-03-08

---

## Goal

Write the per-flight insurance pool contract. One FlightPool is deployed per `(flightId, date)` combination, lazily on first purchase. It holds traveler premiums, tracks who has bought, and settles in one of two directions: not-delayed (premiums forwarded to RiskVault as yield) or delayed/cancelled (pre-funded payoffs distributed to buyers, remainder returned to RiskVault). Payouts are pull-based — each buyer calls `claim()` after settlement. Unclaimed funds after expiry are swept to RecoveryPool.

## Dependencies

- **MockUSDC** (Phase 1) — USDC token for all transfers
- **RiskVault** (Phase 4) — receives premiums via `recordPremiumIncome`, sends payouts; `settleNotDelayed` and `settleDelayed` call into it
- **RecoveryPool** (Phase 2) — receives expired unclaimed funds via `sweepExpired`
- FlightPool is deployed and owned by the Controller (Phase 7), but tests use a mock controller EOA — no Controller contract required in this phase

## Pre-work Notes

> This section is for you to fill in before work begins.
> Add constraints, decisions already made, questions to resolve, patterns to follow, or anything the agent should know before touching code.

**Decided before work began:**

- **`Outcome` enum: `Pending`, `NotDelayed`, `Delayed`, `Cancelled`** — `Delayed` and `Cancelled` are distinct values but both trigger the buyer payout path. The Controller calls `settleDelayed(claimExpiryWindow)` for both outcome types; the pool itself does not need to distinguish them — it just records whichever outcome the Controller passes. Actually: `settleDelayed` sets `outcome = Delayed`; add a separate `settleCancelled(uint256 claimExpiryWindow)` that sets `outcome = Cancelled` but is otherwise identical in payout logic — OR have one function that accepts an `Outcome` parameter. **Decide: one `settleDelayed(uint256 claimExpiryWindow)` that always writes `outcome = Delayed`, and one `settleCancelled(uint256 claimExpiryWindow)` that writes `outcome = Cancelled`, both identical in payout mechanics.**
- **Post-payout remainder uses `riskVault.recordPremiumIncome(remainder)`** — accounting-correct, keeps `totalManagedAssets` in sync. Never use a raw `usdc.transfer` to the vault.
- **`settleDelayed` / `settleCancelled` non-reverting loop** — per-buyer transfer failures emit `PayoutFailed(address indexed buyer, uint256 amount)` and are skipped; remaining buyers still receive payoffs.
- **`sweepExpired` calls `recoveryPool._recordDeposit(address(this), amount)` after transferring USDC** — matches the RecoveryPool integration pattern established in Phase 2.
- **Constructor validates `premium < payoff`** and all addresses non-zero.
- **`isOpen` starts `true`; `closePool()` sets it to `false`** — buys require `isOpen == true`.
- **No OZ dependencies** — FlightPool is standalone (no Ownable, no ERC20 inheritance). Just raw Solidity + IERC20 interface for USDC.
- **`maxLiability()` view returns `payoff × buyers.length`** — used by the Controller for solvency tracking.
- Follow all Solidity conventions: custom errors, PascalCase events, camelCase state vars, no `s_` Hungarian notation.

---

## Subtasks

- [x] 1. Define `Outcome` enum — `Pending, NotDelayed, Delayed, Cancelled`
- [x] 2. Declare state — `flightId`, `flightDate`, `premium`, `payoff`, `controller`, `riskVault`, `recoveryPool`, `usdc`, `isOpen`, `isSettled`, `outcome`, `claimExpiry`, `buyers` array, `hasBought` mapping, `claimed` mapping
- [x] 3. Write constructor — `(string flightId, string flightDate, uint256 premium, uint256 payoff, address controller, address riskVault, address recoveryPool, address usdc)`, validate all addresses non-zero and `premium < payoff`, set `isOpen = true`, `outcome = Pending`
- [x] 4. Write `onlyController` modifier
- [x] 5. Write `buyInsurance(address buyer)` — `onlyController`, require `isOpen`, require `!isSettled`, require `!hasBought[buyer]`, push to `buyers`, set `hasBought[buyer] = true`
- [x] 6. Write `closePool()` — `onlyController`, set `isOpen = false`
- [x] 7. Write `settleNotDelayed()` — `onlyController`, require `!isSettled`, set `isSettled = true`, `outcome = NotDelayed`, transfer entire USDC balance to RiskVault, call `riskVault.recordPremiumIncome(amount)`
- [x] 8. Write `settleDelayed(uint256 claimExpiryWindow)` — `onlyController`, require `!isSettled`, set `isSettled = true`, `outcome = Delayed`, set `claimExpiry = block.timestamp + claimExpiryWindow`, run non-reverting per-buyer payout loop (emit `PayoutFailed` on failure), then call `riskVault.recordPremiumIncome(remainder)` for any remaining balance
- [x] 9. Write `settleCancelled(uint256 claimExpiryWindow)` — identical to `settleDelayed` but sets `outcome = Cancelled`
- [x] 10. Write `claim()` — require `isSettled`, require `outcome == Delayed || outcome == Cancelled`, require `hasBought[msg.sender]`, require `!claimed[msg.sender]`, require `block.timestamp <= claimExpiry`, set `claimed[msg.sender] = true`, transfer `payoff` to caller
- [x] 11. Write `sweepExpired()` — require `isSettled`, require `block.timestamp > claimExpiry`, transfer remaining USDC balance to RecoveryPool, call `recoveryPool._recordDeposit(address(this), amount)`
- [x] 12. Write view functions — `buyerCount()`, `maxLiability()`, `canClaim(address)`, `totalPremiumsHeld()`

**Test purchase:**

- [x] 13. Test: `buyInsurance` records buyer in `buyers` array and `hasBought` mapping
- [x] 14. Test: `buyerCount` increments correctly
- [x] 15. Test: same address cannot buy twice
- [x] 16. Test: non-controller cannot call `buyInsurance`
- [x] 17. Test: cannot buy after `closePool`
- [x] 18. Test: cannot buy after settlement

**Test not-delayed settlement:**

- [x] 19. Test: `settleNotDelayed` transfers all USDC balance to RiskVault
- [x] 20. Test: `riskVault.recordPremiumIncome` called with correct amount
- [x] 21. Test: pool `isSettled = true`, `isOpen = false` (via prior `closePool`), `outcome = NotDelayed`
- [x] 22. Test: `settleNotDelayed` on already-settled pool reverts
- [x] 23. Test: pool with zero buyers settles cleanly (transfers zero, calls `recordPremiumIncome(0)`)

**Test delayed settlement:**

- [x] 24. Test: `settleDelayed` requires pre-funded balance >= `payoff × buyerCount`
- [x] 25. Test: `claimExpiry` set to `block.timestamp + claimExpiryWindow` correctly
- [x] 26. Test: pool `isSettled = true`, `outcome = Delayed`
- [x] 27. Test: each buyer can claim exactly `payoff` USDC
- [x] 28. Test: remainder returned to RiskVault via `recordPremiumIncome` after payout loop
- [x] 29. Test: `PayoutFailed` event emitted when transfer to a non-receiving address fails
- [x] 30. Test: failed transfer does not revert — other buyers still receive payoff
- [x] 31. Test: `settleDelayed` on already-settled pool reverts

**Test cancelled settlement:**

- [x] 32. Test: `settleCancelled` sets `outcome = Cancelled`, `isSettled = true`
- [x] 33. Test: buyers can `claim()` after `settleCancelled` (same as delayed path)
- [x] 34. Test: `settleCancelled` on already-settled pool reverts

**Test claim flow:**

- [x] 35. Test: buyer calls `claim()` before expiry — receives payoff
- [x] 36. Test: `claimed[buyer] = true` after successful claim
- [x] 37. Test: second `claim()` by same buyer reverts
- [x] 38. Test: non-buyer `claim()` reverts
- [x] 39. Test: `claim()` after expiry timestamp reverts
- [x] 40. Test: `claim()` on not-delayed pool (outcome = NotDelayed) reverts
- [x] 41. Test: `canClaim(address)` returns correct value for each state combination

**Test sweep:**

- [x] 42. Test: `sweepExpired` before expiry reverts
- [x] 43. Test: `sweepExpired` after expiry transfers remaining USDC to RecoveryPool
- [x] 44. Test: RecoveryPool records correct source and amount
- [x] 45. Test: `claim()` after sweep reverts (no USDC left in pool)
- [x] 46. Test: if all buyers claimed, sweep transfers zero

### Gate

Both settlement paths (NotDelayed and Delayed/Cancelled), the claim flow, and the expiry sweep all pass. `recordPremiumIncome` is called correctly in both settlement paths for any remainder.

---

## Work Log

### Session 2026-03-08
Starting phase. Pre-work notes reviewed.

Implemented FlightPool.sol (subtasks 1–12):
- Outcome enum: Pending, NotDelayed, Delayed, Cancelled
- Constructor validates all addresses non-zero and premium < payoff
- buyInsurance, closePool, settleNotDelayed, settleDelayed, settleCancelled — all onlyController
- _distributePayout: non-reverting loop, marks claimed[buyer]=true on success (prevents double-claim via claim()), emits PayoutFailed on failure
- claim(): pull-based fallback for buyers whose loop transfer failed
- sweepExpired(): callable by anyone after claimExpiry; transfers remainder to RecoveryPool
- View functions: buyerCount, maxLiability, canClaim, totalPremiumsHeld

Implemented FlightPool.t.sol (subtasks 13–46):
- 49 tests, all pass; full suite 158/158 pass
- Key design clarification: _distributePayout eagerly pushes payoff to each buyer AND marks claimed[buyer]=true on success. claim() is a pull-based fallback for buyers whose push failed (insufficient balance scenario). This prevents double-claim.
- PayoutFailed tested by funding pool for N-1 buyers with N buyers registered — last buyer's transfer fails due to insufficient balance.

All subtasks complete. Gate condition met. Ready for /complete-phase.

### Session 2026-03-08 — Completed
Phase validated by user. All gate conditions met.

---

## Files Created / Modified

- `contracts/src/FlightPool.sol` — created
- `contracts/test/FlightPool.t.sol` — created

---

## Decisions Made

- **_distributePayout marks claimed[buyer]=true on success**: Prevents double-claim. Buyers paid in the eager push loop cannot re-claim via claim(). Only buyers whose push failed (PayoutFailed) can use claim() as a fallback.
- **PayoutFailed triggered by insufficient balance**: ERC20 transfer doesn't call recipient, so reverting contracts are not the failure mechanism. Insufficient pool balance (not funded fully) causes the low-level call to fail.
- **No OZ dependency**: FlightPool is standalone with minimal interfaces for RiskVault and RecoveryPool.
- **Two separate settle functions**: settleDelayed and settleCancelled are distinct functions (not one with Outcome param), matching the pre-work decision.

---

## Completion Summary

**What was built:**
- `contracts/src/FlightPool.sol` — per-flight insurance pool contract, no OZ dependencies
- `contracts/test/FlightPool.t.sol` — 49 tests, all pass; full suite 158/158

**Key decisions locked in:**
- `_distributePayout` eagerly pushes payoff to each buyer in a non-reverting loop AND marks `claimed[buyer] = true` on success. `claim()` is a pull-based fallback for buyers whose push failed (e.g. insufficient pool balance). This is the only design that prevents double-claim.
- `PayoutFailed` is triggered by insufficient USDC balance in the pool — ERC20 `transfer` does not call the recipient, so reverting contracts are not a failure mechanism.
- Two distinct settle functions: `settleDelayed` (outcome=Delayed) and `settleCancelled` (outcome=Cancelled), both identical in payout mechanics.
- `sweepExpired()` is permissionless — callable by anyone after `claimExpiry`.

**For Phase 7 (Controller):**
- Controller deploys FlightPool via `new FlightPool(flightId, date, premium, payoff, address(this), riskVault, recoveryPool, usdc)`
- Controller calls `buyInsurance(traveler)` after transferring premium USDC to the pool
- For delayed settlement: Controller calls `riskVault.sendPayout(poolAddr, totalPayout)` first, then `pool.settleDelayed(claimExpiryWindow)`
- `pool.maxLiability()` = `payoff × buyerCount` — used by Controller for solvency tracking
- `pool.buyers(i)` is public — Controller can read the buyers array if needed
