'use client'

import { ConnectButton } from '@rainbow-me/rainbowkit'

export function ConnectPrompt() {
  return (
    <div
      className="flex flex-col items-center gap-4 rounded-xl p-8 text-center"
      style={{ border: '1px solid #1e2530', background: 'rgba(59,142,243,0.05)' }}
    >
      <p style={{ color: '#5a6478' }}>Connect your wallet to get started</p>
      <ConnectButton />
    </div>
  )
}
