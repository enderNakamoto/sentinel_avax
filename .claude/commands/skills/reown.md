---
description: Reown AppKit wallet connection reference. Trigger when working on frontend wallet connection, setting up AppKit with Next.js, using useAppKitAccount / useAppKitNetwork / useAppKitBalance, reading or writing smart contracts from the frontend, handling wallet connect/disconnect, or switching networks.
---

# Skill: Reown AppKit — Wallet Connection

## Layer 1 — Setup and core hooks (always read this)

### What AppKit is

Reown AppKit (formerly WalletConnect) is the wallet connection layer. It handles:
- 600+ wallet connections (MetaMask, Coinbase, WalletConnect QR, email/social)
- Network switching
- Account state across the app
- Native balance reads

We use it with **Next.js + wagmi adapter** (recommended for EVM).

### Install

```bash
npm install @reown/appkit @reown/appkit-adapter-wagmi wagmi viem @tanstack/react-query
```

Get a **Project ID** from https://dashboard.reown.com — required, free.

### Config file — `frontend/config/index.tsx`

```tsx
import { cookieStorage, createStorage, http } from '@wagmi/core'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { avalanche, avalancheFuji } from '@reown/appkit/networks'

export const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID!

export const networks = [avalancheFuji, avalanche] // fuji first = default

export const wagmiAdapter = new WagmiAdapter({
  storage: createStorage({ storage: cookieStorage }),
  ssr: true,
  projectId,
  networks,
})

export const config = wagmiAdapter.wagmiConfig
```

### Context provider — `frontend/context/index.tsx`

```tsx
'use client'
import { wagmiAdapter, projectId, networks } from '@/config'
import { createAppKit } from '@reown/appkit/react'
import { WagmiProvider, cookieToInitialState } from 'wagmi'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'

const queryClient = new QueryClient()

createAppKit({
  adapters: [wagmiAdapter],
  projectId,
  networks,
  metadata: {
    name: 'Sentinel Protocol',
    description: 'Parametric flight delay insurance',
    url: 'https://yourapp.com',
    icons: ['https://yourapp.com/icon.png'],
  },
})

export default function ContextProvider({ children, cookies }: {
  children: React.ReactNode
  cookies: string | null
}) {
  const initialState = cookieToInitialState(wagmiAdapter.wagmiConfig, cookies)
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig} initialState={initialState}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  )
}
```

### Root layout — `frontend/app/layout.tsx`

```tsx
import { headers } from 'next/headers'
import ContextProvider from '@/context'

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headersObj = await headers()
  const cookies = headersObj.get('cookie')
  return (
    <html lang="en">
      <body>
        <ContextProvider cookies={cookies}>{children}</ContextProvider>
      </body>
    </html>
  )
}
```

### `next.config.js` — required webpack fix

```js
const nextConfig = {
  webpack: config => {
    config.externals.push('pino-pretty', 'lokijs', 'encoding')
    return config
  }
}
module.exports = nextConfig
```

### Core hooks — the ones we use

```tsx
// Is wallet connected? What address?
const { address, isConnected, status } = useAppKitAccount()

// What network are we on? Switch network?
const { chainId, switchNetwork } = useAppKitNetwork()

// Open the connect modal
const { open } = useAppKit()
<button onClick={() => open()}>Connect Wallet</button>

// Or use the built-in button (zero config)
<AppKitButton />

// Native token balance (AVAX)
const { fetchBalance } = useAppKitBalance()
const balance = await fetchBalance()

// Disconnect
const { disconnect } = useDisconnect()
```

### Network switching to Avalanche

```tsx
import { avalancheFuji, avalanche } from '@reown/appkit/networks'
import { useAppKitNetwork } from '@reown/appkit/react'

const { switchNetwork } = useAppKitNetwork()

// Prompt user to switch to Fuji testnet
await switchNetwork(avalancheFuji)
```

---

## Layer 2 — Reading smart contracts (wagmi hooks)

> Only read this when implementing contract read calls (getApprovedRoutes, getActivePools, vault TVL, etc.)

Use wagmi's `useReadContract` — works seamlessly inside the AppKit/WagmiProvider.

```tsx
import { useReadContract } from 'wagmi'
import { CONTROLLER_ABI, CONTROLLER_ADDRESS } from '@/contracts'

const { data: activePools, isLoading } = useReadContract({
  address: CONTROLLER_ADDRESS,
  abi: CONTROLLER_ABI,
  functionName: 'getActivePools',
})
```

For multiple reads at once:
```tsx
import { useReadContracts } from 'wagmi'

const { data } = useReadContracts({
  contracts: [
    { address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: 'totalManagedAssets' },
    { address: VAULT_ADDRESS, abi: VAULT_ABI, functionName: 'lockedCapital' },
    { address: CONTROLLER_ADDRESS, abi: CONTROLLER_ABI, functionName: 'totalPoliciesSold' },
  ]
})
```

---

## Layer 3 — Writing to smart contracts (wagmi hooks)

> Only read this when implementing contract write calls (buyInsurance, deposit, claim, collect, etc.)

```tsx
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'

const { writeContract, data: hash, isPending } = useWriteContract()
const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

// Example: buy insurance
writeContract({
  address: CONTROLLER_ADDRESS,
  abi: CONTROLLER_ABI,
  functionName: 'buyInsurance',
  args: [flightId, origin, destination, date],
})
```

**USDC approval pattern** (required before deposit and buyInsurance):
```tsx
// 1. Check allowance first
const { data: allowance } = useReadContract({
  address: USDC_ADDRESS,
  abi: ERC20_ABI,
  functionName: 'allowance',
  args: [address, CONTROLLER_ADDRESS],
})

// 2. Approve if insufficient
if (allowance < requiredAmount) {
  writeContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [CONTROLLER_ADDRESS, requiredAmount],
  })
}
```

---

## Layer 4 — All AppKit hooks reference

> Only read this if you need a hook not covered in Layer 1.
> Reference: `docs/reown.md` or https://docs.reown.com/appkit/next/core/hooks

Key hooks not in Layer 1:
- `useAppKitState` — modal open/loading/activeChain state
- `useAppKitTheme` — dark/light mode, CSS variables
- `useWalletInfo` — wallet name and icon for display
- `useAppKitEvents` — subscribe to connect/disconnect events for analytics
- `useAppKitProvider` — raw provider for direct ethers/viem calls

---

## Layer 5 — Environment variables

```bash
# frontend/.env.local
NEXT_PUBLIC_REOWN_PROJECT_ID=your_project_id_from_dashboard_reown_com
NEXT_PUBLIC_CONTROLLER_ADDRESS=0x...
NEXT_PUBLIC_RISK_VAULT_ADDRESS=0x...
NEXT_PUBLIC_GOVERNANCE_MODULE_ADDRESS=0x...
NEXT_PUBLIC_ORACLE_AGGREGATOR_ADDRESS=0x...
NEXT_PUBLIC_USDC_ADDRESS=0x...
```

All contract addresses are `NEXT_PUBLIC_` — they are not secrets, they go on-chain anyway.
