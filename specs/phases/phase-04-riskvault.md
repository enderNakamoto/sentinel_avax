# Phase 4 — RiskVault

Status: complete
Started: 2026-03-08
Completed: 2026-03-08

---

## Goal

Write the capital backing layer. All underwriter USDC sits here. Underwriters deposit and receive shares proportional to their contribution; share price rises as on-time flight premiums flow in. A `lockedCapital` counter tracks USDC committed as collateral for active policies — underwriters cannot withdraw locked capital. Withdrawals that would breach `lockedCapital` are queued in strict FIFO order and processed atomically after each flight settlement. All payments are pull-based: underwriters call `collect()` to receive USDC once their withdrawal is fulfilled.

## Dependencies

- **MockUSDC** (Phase 1) — used in tests for `deposit`, `sendPayout`, `collect`, `balanceSanityCheck`
- **Controller** — not yet deployed; deploy RiskVault with `controller = address(0)` and wire the real address via `setController()` post-phase

## Pre-work Notes

> This section is for you to fill in before work begins.
> Add constraints, decisions already made, questions to resolve, patterns to follow, or anything the agent should know before touching code.

**Decided before work began:**

- **All-or-nothing withdrawal** — if `freeCapital < sharesValue`, the entire `withdraw(shares)` request enters the queue. No partial immediate fills.
- **Strict FIFO queue halt** — `processWithdrawalQueue()` stops at the first entry it cannot fully serve. Entries behind it remain pending even if capital is available. Processing does NOT skip entries.
- **`totalManagedAssets` decrements at `collect()` time, not at `withdraw()` time** — USDC is still in the vault between `withdraw()` and `collect()`
- **`freeCapital = totalManagedAssets - lockedCapital`** — no deduction for uncollected `claimableBalance`; that USDC is still in the vault
- **Share price at queue fulfillment time** — when queue is processed, `usdcAmount = entry.shares × totalManagedAssets / totalShares` using current values
- **`onlyController` modifier** — gates `increaseLocked`, `decreaseLocked`, `sendPayout`, `recordPremiumIncome`, `processWithdrawalQueue`; `snapshot()` is callable by anyone
- **`setController` is a one-time setter** — reverts if `controller != address(0)`; constructor takes `controller` param (pass `address(0)` on deploy, wire later)
- **`decreaseLocked` floors at zero** — does not revert on underflow
- **Snapshot interval is 24 hours** — `_maybeSnapshot()` no-ops if called within the same 24h window; skips if `totalShares == 0`
- Follow all Solidity conventions: custom errors, PascalCase events, camelCase state vars, no `s_` Hungarian notation

---

## Subtasks

- [x] 1. Declare all state — `totalManagedAssets`, `lockedCapital`, `totalShares`, `shares` mapping, `queueHead`, `withdrawalQueue` array, `claimableBalance` mapping, `hasPendingWithdrawal`, `queuedShares` mapping, `priceHistory` array, `lastSnapshotTimestamp`, `controller`, `usdc`
- [x] 2. Write constructor — accept `usdc` and `controller` addresses; store both
- [x] 3. Write `deposit(amount)` — pull USDC via transferFrom, calculate shares 1:1 on first deposit (`totalShares == 0`), proportional thereafter (`amount × totalShares / totalManagedAssets`), increment `totalManagedAssets` and `totalShares`
- [x] 4. Write `_sharesToUsdc(shares)` internal — `shares × totalManagedAssets / totalShares`
- [x] 5. Write `withdraw(shares)` — if `freeCapital >= _sharesToUsdc(shares)`: burn shares, credit `claimableBalance`, clear `hasPendingWithdrawal` guard not needed here; else: require `!hasPendingWithdrawal[msg.sender]`, mark `hasPendingWithdrawal`, add to `queuedShares`, append `WithdrawalRequest(msg.sender, shares, block.timestamp)` to `withdrawalQueue`
- [x] 6. Write `collect()` — read `claimableBalance[msg.sender]`, revert if zero, zero it, decrement `totalManagedAssets`, transfer USDC
- [x] 7. Write `cancelWithdrawal(queueIndex)` — verify caller owns the entry, mark entry as cancelled, release `queuedShares[caller]`, clear `hasPendingWithdrawal[caller]`
- [x] 8. Write `processWithdrawalQueue()` — `onlyController`; loop from `queueHead`; skip cancelled entries (advance `queueHead`); stop at first entry that cannot be fully served (`freeCapital < _sharesToUsdc(entry.shares)`); for serviced entries: burn shares, credit `claimableBalance`, advance `queueHead`
- [x] 9. Write `increaseLocked(amount)` — `onlyController`
- [x] 10. Write `decreaseLocked(amount)` — `onlyController`, floor at zero (no revert on underflow)
- [x] 11. Write `sendPayout(flightPool, amount)` — `onlyController`, transfer USDC to `flightPool`, decrement `totalManagedAssets`
- [x] 12. Write `recordPremiumIncome(amount)` — `onlyController`, increment `totalManagedAssets` (USDC already in vault via FlightPool transfer)
- [x] 13. Write `_maybeSnapshot()` internal — no-op if `totalShares == 0` or `block.timestamp < lastSnapshotTimestamp + 24 hours`; otherwise push `PriceSnapshot(block.timestamp, totalManagedAssets × 1e6 / totalShares)` and update `lastSnapshotTimestamp`
- [x] 14. Write `snapshot()` external — calls `_maybeSnapshot()`, callable by anyone
- [x] 15. Write `setController(address)` — one-time setter; reverts if `controller != address(0)`
- [x] 16. Write view functions — `freeCapital()`, `totalAssets()` (alias for `totalManagedAssets`), `previewRedeem(shares)` (full value), `previewRedeemFree(shares)` (capped at `freeCapital`), `balanceSanityCheck()` (`usdc.balanceOf(this) - totalManagedAssets`), `priceHistoryLength()`, `getPriceSnapshot(index)`

**Test deposit and shares:**

- [x] 17. Test: first deposit issues shares 1:1
- [x] 18. Test: second deposit issues proportional shares based on current price
- [x] 19. Test: `totalManagedAssets` equals deposited amount after deposit with no other activity
- [x] 20. Test: share price rises after `recordPremiumIncome`
- [x] 21. Test: depositing zero reverts

**Test immediate withdrawal:**

- [x] 22. Test: `withdraw` when free capital sufficient → shares burned, `claimableBalance` credited
- [x] 23. Test: `collect` transfers exact credited amount
- [x] 24. Test: `totalManagedAssets` decrements at `collect` time, not at `withdraw` time
- [x] 25. Test: `collect` with zero balance reverts
- [x] 26. Test: cannot call `withdraw` again while `hasPendingWithdrawal` is true

**Test queued withdrawal:**

- [x] 27. Test: `withdraw` when free capital insufficient → request appended to queue
- [x] 28. Test: shares reserved in `queuedShares`, cannot be double-queued (`hasPendingWithdrawal` blocks second call)
- [x] 29. Test: `cancelWithdrawal` releases shares, clears `hasPendingWithdrawal`
- [x] 30. Test: cancelled entry does not block queue processing (queue advances past it)
- [x] 31. Test: `processWithdrawalQueue` starts from `queueHead`, not index 0
- [x] 32. Test: `queueHead` advances past fulfilled entries
- [x] 33. Test: `queueHead` advances past cancelled entries without crediting
- [x] 34. Test: queue processes FIFO — first requester credited before second
- [x] 35. Test: queue stops when free capital exhausted — first unserviceable entry halts processing; later entries stay pending
- [x] 36. Test: share price at fulfillment time is used, not request time

**Test capital locking:**

- [x] 37. Test: `increaseLocked` reduces `freeCapital` by exact amount
- [x] 38. Test: `decreaseLocked` increases `freeCapital` by exact amount
- [x] 39. Test: `decreaseLocked` beyond current value floors at zero, does not revert
- [x] 40. Test: withdrawal that would breach `lockedCapital` goes to queue even if total balance is sufficient
- [x] 41. Test: `sendPayout` transfers USDC and decrements `totalManagedAssets`
- [x] 42. Test: `sendPayout` with insufficient balance reverts

**Test totalManagedAssets integrity:**

- [x] 43. Test: direct USDC transfer to vault does NOT change `totalManagedAssets`
- [x] 44. Test: `balanceSanityCheck` returns the difference after a direct transfer
- [x] 45. Test: `balanceSanityCheck` returns zero in all normal operation scenarios
- [x] 46. Test: after full cycle (deposit + premium income + payout + collect), `totalManagedAssets` reconciles

**Test price snapshots:**

- [x] 47. Test: `_maybeSnapshot` writes entry when interval has elapsed
- [x] 48. Test: second call within same 24-hour window is a no-op
- [x] 49. Test: `getPriceSnapshot` returns correct timestamp and price per share
- [x] 50. Test: `priceHistoryLength` increments after each snapshot
- [x] 51. Test: `snapshot()` callable externally, respects same interval guard

### Gate

Every test group passes. `totalManagedAssets` stays in sync throughout all scenarios.

---

## Work Log

### Session 2026-03-08
Starting phase. Pre-work notes reviewed. Key constraints: all-or-nothing withdrawal, strict FIFO queue halt, totalManagedAssets decrements at collect() time, freeCapital = totalManagedAssets - lockedCapital, share price at fulfillment time, onlyController gates capital-moving functions, setController is one-time setter, decreaseLocked floors at zero, snapshot interval 24h.

**Implementation complete.** Wrote `contracts/src/RiskVault.sol` (subtasks 1–16) and `contracts/test/RiskVault.t.sol` (subtasks 17–51). All 39 tests pass (`forge test --match-path test/RiskVault.t.sol`).

Key implementation decision: `processWithdrawalQueue` uses a local `available` snapshot of `freeCapital()` at entry, decremented per-entry as queue is drained. This prevents over-committing claimableBalance when multiple entries are processed in one call (since `totalManagedAssets` doesn't decrement until `collect()`). The `_sharesToUsdc` price still uses current totalShares at each step ("share price at fulfillment time").

All subtasks complete. Gate condition met. Ready for /complete-phase.

### Session 2026-03-08 — Completed
Phase validated by user. All gate conditions met.

---

## Files Created / Modified

- `contracts/src/RiskVault.sol` — created
- `contracts/test/RiskVault.t.sol` — created
- `specs/phases/phase-04-riskvault.md` — updated (this file)
- `specs/progress.md` — updated

---

## Decisions Made

- **`processWithdrawalQueue` uses a local `available` accumulator** — snapshots `freeCapital()` at function entry and decrements per served entry. Prevents over-commitment when burning shares inflates the share price of later queue entries (since `totalManagedAssets` doesn't decrement until `collect()`).
- **`withdraw` checks `shares[msg.sender] - queuedShares[msg.sender] >= shares_`** — prevents an underwriter from over-spending shares that are already reserved in the queue, protecting against underflow when the queue eventually burns them.
- **`balanceSanityCheck` returns 0 on underflow** — safe floor since normal operation never results in `balanceOf < totalManagedAssets`.

---

## Completion Summary

**What was built:**
`RiskVault.sol` — the capital backing layer for the protocol. Underwriters deposit USDC and receive proportional shares. Share price rises as on-time premium income flows in. A `lockedCapital` counter tracks USDC committed to active policies; withdrawals that would breach it enter a FIFO queue processed after each settlement. All payments are pull-based via `collect()`.

**Key decisions locked in:**
- `processWithdrawalQueue` uses a local `available` accumulator (snapshot of `freeCapital()` at entry, decremented per served entry) to prevent over-commitment when burning shares would inflate later entries' share prices within the same call.
- `withdraw` validates `shares[msg.sender] - queuedShares[msg.sender] >= shares_` — queued shares are reserved and cannot be double-spent via an immediate withdrawal path.
- `totalManagedAssets` decrements only at `collect()` time — USDC credited to `claimableBalance` sits in the vault and still counts toward `freeCapital` until claimed.
- `balanceSanityCheck()` floors at 0 — never returns a negative value (normal operation cannot produce `balanceOf < totalManagedAssets`).
- `setController` is a one-time setter guarded by `controller != address(0)` — constructor accepts `address(0)` for deploy-then-wire workflow.

**Files created/modified:**
- `contracts/src/RiskVault.sol` — created (220 lines)
- `contracts/test/RiskVault.t.sol` — created (39 tests, all pass)
- `specs/phases/phase-04-riskvault.md` — this file
- `specs/progress.md` — updated

**Next phase awareness:**
- Controller (Phase 7) will call: `increaseLocked`, `decreaseLocked`, `sendPayout`, `recordPremiumIncome`, `processWithdrawalQueue` — all guarded by `onlyController`
- Post-deploy wiring: deploy RiskVault with `controller = address(0)`, deploy Controller, then call `RiskVault.setController(controllerAddress)` — one-time, irreversible
- CRE workflow calls `snapshot()` every 10-minute tick — no access control required
- `via_ir = false` is sufficient — no stack-too-deep issues encountered
