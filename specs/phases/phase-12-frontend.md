# Phase 12 — Frontend

Status: in_progress
Started: 2026-03-09
Completed: —

---

## Goal

Build the MVP frontend for Sentinel Protocol against the Fuji testnet contracts. Three flows: protocol dashboard (TVL, share price, standin APY, active flights), traveler (browse routes → buy insurance → claim payout), and underwriter (deposit → withdraw → collect). Active pools are scanned for claim lookup. APY is a hardcoded standin of 37%. By the end of this phase both user cycles complete end-to-end through the UI on testnet.

## Dependencies

- Phase 11: Next.js scaffolded, RainbowKit wired, wagmi v2, `src/generated.ts` with typed ABIs, `fujiAddresses` with all 6 contract addresses
- Phase 10: All 6 contracts deployed and wired on Fuji, routes approved, vault funded
- CRE workflow live and ticking on Fuji (for live flight status and settlement)

## Pre-work Notes

> This section is for you to fill in before work begins.
> Add constraints, decisions already made, questions to resolve, patterns to follow, or anything the agent should know before touching code.

**Decisions locked in:**
- **Scope:** MVP only — traveler, underwriter, dashboard. No APY from snapshots, no queue cancel, no event indexing.
- **Claim lookup:** scan `getActivePools()` and check `hasBought[address]` on each pool (works at hackathon scale)
- **APY:** hardcoded standin of 37%, labeled "projected" — no snapshot binary search
- **Page structure:** Separate routes — `/` (dashboard), `/routes` (buy insurance), `/policies` (traveler claims), `/vault` (underwriter deposit/withdraw/collect)
- **Token:** MockUSDC on Fuji — 6 decimals, `1_000_000 = 1 USDC`

---

## Subtasks

**Shared setup:**
- [ ] 1. Smoke-test a `useReadContract` call — read `totalPoliciesSold()` from Controller and log it in `page.tsx`; confirm the hook works and remove the log
- [ ] 2. Create `src/hooks/useUsdcBalance.ts` — returns `balanceOf(address)` from MockUSDC for the connected wallet
- [ ] 3. Create `src/hooks/useUsdcApprove.ts` — checks allowance for a given spender, returns `approve()` write + `needsApproval` boolean

**Protocol dashboard:**
- [ ] 4. Read and display lifetime stats: `totalPoliciesSold()`, `totalPremiumsCollected()`, `totalPayoutsDistributed()`, `activeFlightCount()` from Controller
- [ ] 5. Read vault TVL: `totalManagedAssets()` from RiskVault — display formatted as USDC
- [ ] 6. Read current share price: `totalManagedAssets() / totalShares()` from RiskVault — display formatted to 6 decimals
- [ ] 7. Display standin APY of 37% — hardcoded, labeled clearly as "Projected APY"
- [ ] 8. Read `getActivePools()` from Controller — build an active flights table (columns: flightId, date, buyer count, oracle status)
- [ ] 9. For each row in the active flights table, read `getFlightStatus(flightId, date)` from OracleAggregator — display as Unknown / On Time / Delayed / Cancelled

**Route browsing + buy insurance (Traveler):**
- [ ] 10. Read `getApprovedRoutes()` from GovernanceModule — display all active routes with premium and payoff
- [ ] 11. Add a date picker to each route — traveler selects departure date
- [ ] 12. On date select, call `getPoolAddress(flightId, date)` on Controller — if non-zero address, read `buyerCount()` on the pool and display
- [ ] 13. On date select, call `isSolventForNewPurchase(flightId, date)` — disable buy button and show capacity warning if false
- [ ] 14. If pool exists, check `hasBought[address]` on the FlightPool — show "already insured" and hide buy button
- [ ] 15. Show premium cost and payoff prominently in a confirmation summary before the buy action
- [ ] 16. On buy: check MockUSDC allowance for Controller, show and await `approve()` transaction if insufficient
- [ ] 17. Call `Controller.buyInsurance(flightId, origin, destination, date)` — show pending state
- [ ] 18. On confirmation, show policy summary: flight, date, payoff amount, pool address

**Traveler — claim:**
- [ ] 19. Iterate `getActivePools()` — for each pool, read `hasBought[address]` to find the connected wallet's policies
- [ ] 20. Filter for pools where `outcome == Delayed` or `outcome == Cancelled` and `claimed[address] == false`
- [ ] 21. Display each claimable pool: flightId, date, payoff amount, `claimExpiry` countdown
- [ ] 22. Show claim button per pool — call `FlightPool.claim()` — show pending state, confirm payoff on success
- [ ] 23. After `claimExpiry` has passed, replace claim button with "claim window closed"

**Underwriter — deposit:**
- [ ] 24. Display connected wallet's MockUSDC balance (from `useUsdcBalance`) and current share balance (`shares[address]` on RiskVault)
- [ ] 25. Build deposit amount input — validate > 0; show estimated shares to receive using current share price
- [ ] 26. On submit: check MockUSDC allowance for RiskVault via `useUsdcApprove`; show and await `approve()` if needed
- [ ] 27. Call `RiskVault.deposit(amount)` — show pending state
- [ ] 28. On confirmation, refresh share balance, TVL, and share price

**Underwriter — withdraw + collect:**
- [ ] 29. Build share amount input — validate <= owned shares (accounting for queued shares)
- [ ] 30. Show `previewRedeem(shares)` as total value and `previewRedeemFree(shares)` as immediately available — label the gap as "locked capital"
- [ ] 31. Call `RiskVault.withdraw(shares)` — show pending state
- [ ] 32. On confirmation: if immediately fulfilled, refresh `claimableBalance`; if queued, show queue confirmation message
- [ ] 33. Read and display `claimableBalance(address)` from RiskVault — show as "ready to collect"
- [ ] 34. Show collect button when `claimableBalance > 0` — call `RiskVault.collect()` — refresh balances on confirmation

**Error and edge cases (MVP):**
- [ ] 35. Wallet not connected — show `<ConnectPrompt />` on any action button instead of the action
- [ ] 36. Insufficient USDC balance — check before showing approval step; display message if balance < required
- [ ] 37. `isSolventForNewPurchase = false` — disable buy button with tooltip
- [ ] 38. Transaction reverted — catch and display a user-friendly error message (extract revert reason where possible)

**Final validation on testnet:**
- [ ] 39. Complete full underwriter deposit → withdraw → collect cycle through the UI
- [ ] 40. Complete full traveler buy insurance → wait for settlement → claim cycle through the UI
- [ ] 41. Confirm dashboard stats update after each action (TVL, share price, active flight count)
- [ ] 42. Confirm oracle status updates appear in active flights table within two CRE workflow ticks

### Gate

Both user cycles complete end-to-end on testnet through the UI without errors. Dashboard stats reflect on-chain state. Oracle status updates appear in the active flights table. No TypeScript errors or unhandled promise rejections in console.

---

## Work Log

### Session 2026-03-09
Starting phase. Pre-work notes reviewed. Scope: dashboard, routes/buy, policies/claim, vault. 4 separate routes. MockUSDC, 6 decimals. APY hardcoded 37%.

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
