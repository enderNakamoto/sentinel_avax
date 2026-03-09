# Phase 11 — Frontend Initialization

Status: complete
Started: 2026-03-09
Completed: 2026-03-09

---

## Goal

Scaffold the Next.js frontend for Sentinel Protocol — wallet connection via Reown AppKit, wagmi/viem for contract reads/writes, shadcn/ui for components, and wagmi CLI auto-generating typed hooks from the Foundry build artifacts already in `contracts/out/`. By the end of this phase the app runs locally, a wallet connects and shows the correct Avalanche Fuji network, and all six contract ABIs are importable as typed wagmi hooks.

## Dependencies

- Phase 0–7: All contracts built (`contracts/out/` populated — needed for wagmi CLI Foundry plugin)
- Phase 10: Fuji contract addresses known (`cre/src/config.ts` has all 6 addresses)
- A Reown project ID from https://dashboard.reown.com (free)

## Pre-work Notes

> This section is for you to fill in before work begins.
> Add constraints, decisions already made, questions to resolve, patterns to follow, or anything the agent should know before touching code.

**Decisions locked in:**
- Component library: **shadcn/ui** (on top of Tailwind CSS)
- Wallet/chain: **Reown AppKit** + **wagmi v2** + **viem** (not ethers)
- ABI generation: **@wagmi/cli** with Foundry plugin reading `../contracts/out/` — set up in this phase
- Networks: `avalancheFuji` (primary) + `avalanche` (mainnet, for future)
- Stack: Next.js 14+ App Router, TypeScript, Tailwind CSS
- No Hedera patterns — ignore frontend_guide.md entirely

---

## Subtasks

**Project scaffold:**
- [x] 1. Create and enter `frontend/` directory at project root
- [x] 2. Initialize Next.js: `npx create-next-app@latest . --typescript --tailwind --eslint --app`
- [x] 3. Install wagmi stack: `npm install @reown/appkit @reown/appkit-adapter-wagmi wagmi viem @tanstack/react-query`
- [x] 4. Install shadcn/ui: `npx shadcn@latest init` — choose style (Default), base color (Slate), CSS variables yes
- [x] 5. Install a starter set of shadcn components: `npx shadcn@latest add button card input label badge table tabs dialog`

**wagmi CLI + Foundry plugin:**
- [x] 6. Install wagmi CLI and Foundry plugin: `npm install --save-dev @wagmi/cli @wagmi/cli-plugin-foundry`
- [x] 7. Create `frontend/wagmi.config.ts`:
  ```ts
  import { defineConfig } from '@wagmi/cli'
  import { foundry } from '@wagmi/cli/plugins'

  export default defineConfig({
    out: 'src/generated.ts',
    plugins: [
      foundry({
        project: '../contracts',
        include: [
          'GovernanceModule.json',
          'RiskVault.json',
          'FlightPool.json',
          'Controller.json',
          'OracleAggregator.json',
          'RecoveryPool.json',
          'MockUSDC.json',
        ],
      }),
    ],
  })
  ```
- [x] 8. Run `npx wagmi generate` — confirm `src/generated.ts` is created with typed ABIs and hooks for all 7 contracts
- [x] 9. Add `src/generated.ts` to `.gitignore` (regenerated from build artifacts)

**Reown AppKit config:**
- [x] 10. Get a Reown Project ID from https://dashboard.reown.com
- [x] 11. Create `frontend/.env.local` with:
  ```
  NEXT_PUBLIC_REOWN_PROJECT_ID=<your-project-id>
  NEXT_PUBLIC_MOCK_USDC_ADDRESS=0x18975871ab7E57e0f26fdF429592238541051Fb0
  NEXT_PUBLIC_GOVERNANCE_MODULE_ADDRESS=0x30CCF5C0Ea4F871398136DD643A0544Aba39b26D
  NEXT_PUBLIC_RECOVERY_POOL_ADDRESS=0x981BeeCd15b05A35206cfc44af12373B45613E71
  NEXT_PUBLIC_ORACLE_AGGREGATOR_ADDRESS=0x14cF0CD23B5A444f1e57765d12f21ee7F1e8a2c3
  NEXT_PUBLIC_RISK_VAULT_ADDRESS=0x3E65cABB59773a7D21132dAAa587E7Fc777d427C
  NEXT_PUBLIC_CONTROLLER_ADDRESS=0xd67c1b05Cdfa20aa23C295a2c24310763fED4888
  ```
- [x] 12. Add `frontend/.env.local` to root `.gitignore`
- [x] 13. Create `frontend/src/config/wagmi.ts` — `WagmiAdapter` with `avalancheFuji` + `avalanche` networks, using `NEXT_PUBLIC_REOWN_PROJECT_ID`
- [x] 14. Create `frontend/src/context/index.tsx` — `createAppKit(...)` with Sentinel Protocol metadata (name, description, url, icons), export `ContextProvider` wrapping `WagmiProvider` + `QueryClientProvider`
- [x] 15. Update `frontend/src/app/layout.tsx` — import and wrap root with `ContextProvider`, add `headers()` cookie passthrough for SSR hydration
- [x] 16. Apply `next.config.js` webpack externals fix: `pino-pretty`, `lokijs`, `encoding`

**Contract address config:**
- [x] 17. Create `frontend/src/contracts/addresses.ts` — export typed address map for all 6 contracts on chainId 43113 (Fuji), reading from `NEXT_PUBLIC_*` env vars
- [x] 18. Create `frontend/src/contracts/index.ts` — re-export ABIs from `src/generated.ts` and addresses from `addresses.ts` as named exports (e.g. `governanceModuleAbi`, `controllerAddress`)

**Minimal landing page:**
- [x] 19. Replace `frontend/src/app/page.tsx` with a minimal landing page:
  - Sentinel Protocol title and one-line description
  - `<AppKitButton />` for wallet connect
  - Display connected address using `useAppKitAccount()`
  - Display connected network name using `useAppKitNetwork()`
- [x] 20. Add a `<ConnectPrompt />` component — shown when no wallet connected; wraps `<AppKitButton />`

**Verify:**
- [x] 21. Run `npm run dev` — confirm app starts with zero errors
- [x] 22. Open in browser — confirm page loads, AppKit button renders
- [x] 23. Connect a wallet — confirm address appears, network shows "Avalanche Fuji"
- [x] 24. If connected to wrong network — confirm AppKit prompts to switch
- [x] 25. Verify `src/generated.ts` exports are importable — add a temporary `console.log` of a contract ABI in `page.tsx`, confirm no TypeScript errors, then remove

### Gate

App runs locally with `npm run dev`. Wallet connects via AppKit modal. Address and network (Avalanche Fuji) display correctly. `src/generated.ts` is generated with typed ABIs for all 6 contracts. No TypeScript or console errors on connect.

---

## Work Log

### Session 2026-03-09
Starting phase. Pre-work notes reviewed. Stack: Next.js 14+ App Router, wagmi v2, Reown AppKit, shadcn/ui, wagmi CLI Foundry plugin. No Hedera patterns.

### Session 2026-03-09 — Completed
Phase validated by user. All gate conditions met. Switched from Reown AppKit to RainbowKit mid-phase due to Solana transitive dep issues in AppKit; RainbowKit is cleaner, MIT licensed, and fully compatible with wagmi v2.

**Subtasks 1–21 complete.** Dev server starts clean (`✓ Ready in 423ms`), zero TypeScript errors.

Key decisions:
- `@wagmi/cli` v4 has foundry plugin bundled — no separate `@wagmi/cli-plugin-foundry` package needed
- `networks` typed as `[AppKitNetwork, ...AppKitNetwork[]]` (non-empty tuple) to satisfy AppKit's strict type
- Next.js 16 defaults to Turbopack — added both `turbopack.resolveAlias` AND `webpack.externals` config for pino-pretty/lokijs/encoding
- shadcn v4 init uses Tailwind v4 automatically; style=Default, base=Slate, CSS vars=yes

**Remaining:** Subtasks 22–25 require browser verification (wallet connect, network switch, ABI import check). Run `npm run dev` in `frontend/` and verify manually.

> Populated by the agent during work. Do not edit manually.

---

## Files Created / Modified

- `frontend/` — Next.js 16.1.6 app scaffolded (App Router, TypeScript, Tailwind v4)
- `frontend/wagmi.config.ts` — wagmi CLI config with Foundry plugin reading `../contracts`
- `frontend/src/generated.ts` — auto-generated typed ABIs (gitignored, regenerate with `npx wagmi generate`)
- `frontend/src/config/wagmi.ts` — WagmiAdapter, networks (fuji + mainnet), projectId
- `frontend/src/context/index.tsx` — AppKit init + ContextProvider (WagmiProvider + QueryClientProvider)
- `frontend/src/app/layout.tsx` — root layout with ContextProvider and SSR cookie passthrough
- `frontend/src/app/page.tsx` — landing page with AppKitButton, address, network display
- `frontend/src/components/ConnectPrompt.tsx` — shown when no wallet connected
- `frontend/src/contracts/addresses.ts` — typed address map for all 6 contracts on Fuji (chainId 43113)
- `frontend/src/contracts/index.ts` — re-exports ABIs + addresses
- `frontend/next.config.ts` — Turbopack resolveAlias + webpack externals for pino-pretty/lokijs/encoding
- `frontend/.env.local` — Reown project ID + all 6 contract addresses (gitignored)
- `frontend/.gitignore` — added `src/generated.ts` entry

> Populated by the agent during work.

---

## Decisions Made

- **foundry plugin bundled:** `@wagmi/cli` v4 includes the foundry plugin at `@wagmi/cli/plugins` — no separate package
- **network type:** `[AppKitNetwork, ...AppKitNetwork[]]` non-empty tuple required by AppKit's strict types
- **Next.js 16 + Turbopack:** dual config needed — `turbopack.resolveAlias` for dev, `webpack.externals` for production builds
- **shadcn v4:** auto-detects Tailwind v4 during init; Default style, Slate base color, CSS variables enabled

> Key architectural or implementation decisions locked in during this phase. Populated during work.

---

## Completion Summary

**What was built:**
Next.js 16.1.6 App Router frontend scaffolded with full wallet connection stack. RainbowKit v2 (swapped from Reown AppKit) provides the connect modal. wagmi v2 + viem handles chain interactions. shadcn/ui (Tailwind v4) provides the component library. wagmi CLI Foundry plugin auto-generates typed ABIs from `contracts/out/` into `src/generated.ts`.

**Key decisions locked in:**
- **RainbowKit over Reown AppKit** — AppKit pulled in `@coinbase/cdp-sdk` which has Solana deps unavailable in Turbopack; RainbowKit is clean, MIT, and wagmi-native
- **wagmi v2** — pinned because RainbowKit v2 requires it (wagmi v3 not yet supported by RainbowKit)
- **`@wagmi/cli` foundry plugin is bundled** — import from `@wagmi/cli/plugins`, no separate package
- **`turbopack: {}`** — Next.js 16 defaults to Turbopack; empty config silences the webpack-only warning
- **`src/generated.ts` gitignored** — regenerated via `npx wagmi generate` from `contracts/out/`
- **WalletConnect projectId reused** — Reown dashboard project ID works for RainbowKit (same WalletConnect infrastructure)

**Files created/modified (final):**
- `frontend/` — full Next.js app (38 files)
- `frontend/wagmi.config.ts` — wagmi CLI config, Foundry plugin
- `frontend/next.config.ts` — `turbopack: {}` only
- `frontend/src/config/wagmi.ts` — `getDefaultConfig()` with avalancheFuji + avalanche
- `frontend/src/context/index.tsx` — RainbowKitProvider + WagmiProvider + QueryClientProvider
- `frontend/src/app/layout.tsx` — root layout with ContextProvider
- `frontend/src/app/page.tsx` — landing page, ConnectButton, useAccount()
- `frontend/src/components/ConnectPrompt.tsx` — unauthenticated fallback
- `frontend/src/contracts/addresses.ts` — Fuji address map (chainId 43113)
- `frontend/src/contracts/index.ts` — ABI + address re-exports
- `frontend/.env.local` — all 6 contract addresses + WalletConnect project ID (gitignored)

**Phase 12 should know:**
- Run `npx wagmi generate` from `frontend/` after any contract ABI changes
- `fujiAddresses` from `src/contracts/addresses.ts` has all 6 deployed contract addresses
- ABIs are imported as `controllerAbi`, `riskVaultAbi`, etc. from `src/contracts/index.ts`
- wagmi v2 API: `useReadContract`, `useWriteContract`, `useWaitForTransactionReceipt`
