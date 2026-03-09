# Phase 12 — Frontend

Status: complete
Started: 2026-03-09
Completed: 2026-03-09

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
- [x] 1. Smoke-test a `useReadContract` call — read `totalPoliciesSold()` from Controller and log it in `page.tsx`; confirm the hook works and remove the log
- [x] 2. Create `src/hooks/useUsdcBalance.ts` — returns `balanceOf(address)` from MockUSDC for the connected wallet
- [x] 3. Create `src/hooks/useUsdcApprove.ts` — checks allowance for a given spender, returns `approve()` write + `needsApproval` boolean

**Protocol dashboard:**
- [x] 4. Read and display lifetime stats: `totalPoliciesSold()`, `totalPremiumsCollected()`, `totalPayoutsDistributed()`, `activeFlightCount()` from Controller
- [x] 5. Read vault TVL: `totalManagedAssets()` from RiskVault — display formatted as USDC
- [x] 6. Read current share price: `totalManagedAssets() / totalShares()` from RiskVault — display formatted to 6 decimals
- [x] 7. Display standin APY of 37% — hardcoded, labeled clearly as "Projected APY"
- [x] 8. Read `getActivePools()` from Controller — build an active flights table (columns: flightId, date, buyer count, oracle status)
- [x] 9. For each row in the active flights table, read `getFlightStatus(flightId, date)` from OracleAggregator — display as Unknown / On Time / Delayed / Cancelled

**Route browsing + buy insurance (Traveler):**
- [x] 10. Read `getApprovedRoutes()` from GovernanceModule — display all active routes with premium and payoff
- [x] 11. Add a date picker to each route — traveler selects departure date
- [x] 12. On date select, call `getPoolAddress(flightId, date)` on Controller — if non-zero address, read `buyerCount()` on the pool and display
- [x] 13. On date select, call `isSolventForNewPurchase(flightId, date)` — disable buy button and show capacity warning if false
- [x] 14. If pool exists, check `hasBought[address]` on the FlightPool — show "already insured" and hide buy button
- [x] 15. Show premium cost and payoff prominently in a confirmation summary before the buy action
- [x] 16. On buy: check MockUSDC allowance for Controller, show and await `approve()` transaction if insufficient
- [x] 17. Call `Controller.buyInsurance(flightId, origin, destination, date)` — show pending state
- [x] 18. On confirmation, show policy summary: flight, date, payoff amount, pool address

**Traveler — claim:**
- [x] 19. Iterate `getActivePools()` — for each pool, read `hasBought[address]` to find the connected wallet's policies
- [x] 20. Filter for pools where `outcome == Delayed` or `outcome == Cancelled` and `claimed[address] == false`
- [x] 21. Display each claimable pool: flightId, date, payoff amount, `claimExpiry` countdown
- [x] 22. Show claim button per pool — call `FlightPool.claim()` — show pending state, confirm payoff on success
- [x] 23. After `claimExpiry` has passed, replace claim button with "claim window closed"

**Underwriter — deposit:**
- [x] 24. Display connected wallet's MockUSDC balance (from `useUsdcBalance`) and current share balance (`shares[address]` on RiskVault)
- [x] 25. Build deposit amount input — validate > 0; show estimated shares to receive using current share price
- [x] 26. On submit: check MockUSDC allowance for RiskVault via `useUsdcApprove`; show and await `approve()` if needed
- [x] 27. Call `RiskVault.deposit(amount)` — show pending state
- [x] 28. On confirmation, refresh share balance, TVL, and share price

**Underwriter — withdraw + collect:**
- [x] 29. Build share amount input — validate <= owned shares (accounting for queued shares)
- [x] 30. Show `previewRedeem(shares)` as total value and `previewRedeemFree(shares)` as immediately available — label the gap as "locked capital"
- [x] 31. Call `RiskVault.withdraw(shares)` — show pending state
- [x] 32. On confirmation: if immediately fulfilled, refresh `claimableBalance`; if queued, show queue confirmation message
- [x] 33. Read and display `claimableBalance(address)` from RiskVault — show as "ready to collect"
- [x] 34. Show collect button when `claimableBalance > 0` — call `RiskVault.collect()` — refresh balances on confirmation

**Error and edge cases (MVP):**
- [x] 35. Wallet not connected — show `<ConnectPrompt />` on any action button instead of the action
- [x] 36. Insufficient USDC balance — check before showing approval step; display message if balance < required
- [x] 37. `isSolventForNewPurchase = false` — disable buy button with tooltip
- [x] 38. Transaction reverted — catch and display a user-friendly error message (extract revert reason where possible)

**Final validation on testnet:**
- [x] 39. Complete full underwriter deposit → withdraw → collect cycle through the UI
- [x] 40. Complete full traveler buy insurance → wait for settlement → claim cycle through the UI
- [x] 41. Confirm dashboard stats update after each action (TVL, share price, active flight count)
- [x] 42. Confirm oracle status updates appear in active flights table within two CRE workflow ticks

### Gate

Both user cycles complete end-to-end on testnet through the UI without errors. Dashboard stats reflect on-chain state. Oracle status updates appear in the active flights table. No TypeScript errors or unhandled promise rejections in console.

---

## Work Log

### Session 2026-03-09
Starting phase. Pre-work notes reviewed. Scope: dashboard, routes/buy, policies/claim, vault. 4 separate routes. MockUSDC, 6 decimals. APY hardcoded 37%.

**Shared setup (subtasks 1–3):**
- `src/lib/format.ts` — `formatUsdc`, `parseUsdc`, `parseShares`, `formatSharePrice`, `getErrMsg`
- `src/hooks/useUsdcBalance.ts` — reads `balanceOf` from MockUSDC
- `src/hooks/useUsdcApprove.ts` — reads allowance, approves, tracks confirmation, auto-refetches
- `src/lib/policyStore.ts` — localStorage helper for bought policy addresses per wallet

**Dashboard (subtasks 4–9):**
- `src/app/page.tsx` — 4 Controller stat cards + 3 vault cards (TVL, share price, 37% APY) + `ActivePoolsTable` component with 3-step chained `useReadContracts` (pools → metadata → oracle status)

**Routes / Buy Insurance (subtasks 10–18):**
- `src/app/routes/page.tsx` — `RouteCard` per route with date picker, pool lookup, solvency check, hasBought guard, two-step approve → buy flow, success state, localStorage store on confirmation

**Policies / Claim (subtasks 19–23):**
- `src/app/policies/page.tsx` — combines localStorage policies + active pool scan (hasBought), `PolicyCard` per pool reads all 8 fields via `useReadContracts`, `canClaim` check, claim tx flow, expiry display

**Vault / Underwriter (subtasks 24–34):**
- `src/app/vault/page.tsx` — `useVaultStats` hook (2 separate useReadContracts calls), `DepositTab` with approve→deposit flow + estimated shares, `WithdrawTab` with previewRedeem/Free display + queue warning, `CollectSection` shown when claimableBalance > 0

**Error and edge cases (subtasks 35–38):**
- ConnectPrompt on all write flows when wallet not connected
- Insufficient balance message before approve step
- isSolventForNewPurchase guards buy button
- try/catch with `getErrMsg()` on all write calls

**Build:** `tsconfig.json` target bumped to ES2020 for BigInt literals. `npm run build` passes clean — 5 routes generated static.

Subtasks 39–42 are testnet validation tasks — require user to run the UI against Fuji testnet with `npm run dev`.

All implementation subtasks (1–38) complete. Gate condition (both user cycles, dashboard stats, oracle status) can only be verified by the user running against Fuji. Ready for /complete-phase once testnet validation passes.

### Session 2026-03-09 — Completed
Phase validated by user. All gate conditions met. Both user cycles (traveler and underwriter) confirmed end-to-end on Fuji testnet. Dashboard stats and oracle status updates verified.

> Populated by the agent during work. Do not edit manually.

---

## Files Created / Modified

**Created:**
- `frontend/src/lib/format.ts`
- `frontend/src/lib/policyStore.ts`
- `frontend/src/hooks/useUsdcBalance.ts`
- `frontend/src/hooks/useUsdcApprove.ts`
- `frontend/src/components/Nav.tsx`
- `frontend/src/app/page.tsx` (replaced)
- `frontend/src/app/routes/page.tsx`
- `frontend/src/app/policies/page.tsx`
- `frontend/src/app/vault/page.tsx`

**Modified:**
- `frontend/src/app/layout.tsx` — added Nav + main wrapper
- `frontend/tsconfig.json` — target ES2017 → ES2020

---

## Decisions Made

- **Policies page**: localStorage is the primary source for settled/claimable pools (since `getActivePools()` only returns unsettled pools). `getActivePools()` is also scanned for hasBought as a fallback for cross-device purchases. Pool addresses are stored in localStorage when a purchase is confirmed.
- **Sequential approve → action**: Two-step UX (separate Approve button, then action button) rather than a single sequential tx — cleaner for the user and avoids needing `@wagmi/core` `waitForTransactionReceipt` in components.
- **`useVaultStats`**: Split into two `useReadContracts` calls (global vault stats + per-user stats) to avoid TypeScript union discrimination failures with conditional spread in contracts array.
- **tsconfig target**: Bumped to ES2020 for BigInt literal support (`0n`, `1_000_000n`).

---

## Completion Summary

**What was built:**
- Full MVP frontend for Sentinel Protocol on Next.js with wagmi v2 + Reown AppKit
- 4 pages: `/` (landing + live stats), `/routes` (buy insurance), `/policies` (traveler claims), `/vault` (underwriter)
- Landing page: hero with shimmer CTA, count-up stat cards (policies sold, premiums, payouts, TVL), "How it works" steps, role cards, SVG flight animation background
- Dashboard: live on-chain stats from Controller and RiskVault, active flights table with oracle status
- Routes page: RouteCard per route with date picker, pool lookup, solvency guard, hasBought check, two-step approve → buy flow, localStorage policy tracking
- Policies page: scans localStorage + getActivePools() for hasBought, PolicyCard with claim flow, expiry countdown
- Vault page: deposit tab (approve → deposit, estimated shares), withdraw tab (previewRedeem/Free, queue warning), collect section

**Key decisions locked in:**
- `localStorage` is the primary source for policy addresses; `getActivePools()` is a fallback scan for cross-device purchases
- Sequential two-step UX (separate Approve button then action button) — avoids `waitForTransactionReceipt` in components
- `useVaultStats` split into two `useReadContracts` calls to avoid TypeScript union discrimination failures
- `tsconfig.json` target bumped to ES2020 for BigInt literal support
- APY hardcoded at 37% labeled "Projected APY"
- Deployed on Vercel; `generated.ts` committed and unignored for Vercel build

**Files created:**
- `frontend/src/lib/format.ts`
- `frontend/src/lib/policyStore.ts`
- `frontend/src/hooks/useUsdcBalance.ts`
- `frontend/src/hooks/useUsdcApprove.ts`
- `frontend/src/components/Nav.tsx`
- `frontend/src/components/FlightBackground.tsx`
- `frontend/src/components/ConnectPrompt.tsx`
- `frontend/src/app/page.tsx` (replaced)
- `frontend/src/app/routes/page.tsx`
- `frontend/src/app/policies/page.tsx`
- `frontend/src/app/vault/page.tsx`

**Files modified:**
- `frontend/src/app/layout.tsx` — added Nav + main wrapper
- `frontend/tsconfig.json` — target ES2017 → ES2020
- `frontend/src/generated.ts` — committed and unignored for Vercel
- `frontend/.gitignore` — removed generated.ts exclusion

**Next phase should know:**
- All 6 contracts deployed and verified on Fuji; addresses in `frontend/src/contracts/addresses.ts`
- `generated.ts` is committed and must stay committed for Vercel builds
- Frontend live at Vercel (URL in README)
- Phase 13 (Mainnet) is next — requires mainnet USDC address, new deployment, and updating `addresses.ts`
