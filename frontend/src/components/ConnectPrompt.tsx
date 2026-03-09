'use client'

import { ConnectButton } from '@rainbow-me/rainbowkit'

export function ConnectPrompt() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-8 text-center">
      <p className="text-slate-600">Connect your wallet to get started</p>
      <ConnectButton />
    </div>
  )
}
