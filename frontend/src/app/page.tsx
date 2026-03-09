'use client'

import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount } from 'wagmi'
import { ConnectPrompt } from '@/components/ConnectPrompt'

export default function Home() {
  const { address, isConnected, chain } = useAccount()

  return (
    <main className="min-h-screen bg-white px-6 py-16">
      <div className="mx-auto max-w-2xl space-y-10">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">Sentinel Protocol</h1>
          <p className="text-lg text-slate-500">
            Parametric flight delay insurance on Avalanche — automatic payouts, no claim forms.
          </p>
        </div>

        {isConnected ? (
          <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-6">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-500">Connected wallet</span>
              <ConnectButton />
            </div>
            <div className="space-y-1">
              <p className="font-mono text-sm text-slate-800 break-all">{address}</p>
              <p className="text-sm text-slate-500">
                Network:{' '}
                <span className="font-medium text-slate-700">{chain?.name ?? 'Unknown'}</span>
              </p>
            </div>
          </div>
        ) : (
          <ConnectPrompt />
        )}
      </div>
    </main>
  )
}
