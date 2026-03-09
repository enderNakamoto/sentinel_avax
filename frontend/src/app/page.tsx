'use client'

import Link from 'next/link'
import { useReadContracts } from 'wagmi'
import { controllerAbi, riskVaultAbi, fujiAddresses } from '@/contracts'
import { formatUsdc } from '@/lib/format'

function StatCard({
  label,
  value,
  sub,
  color = '#3b8ef3',
  delay = 0,
}: {
  label: string
  value: string
  sub?: string
  color?: string
  delay?: number
}) {
  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-1"
      style={{
        border: '1px solid #1e2530',
        background: '#0f1218',
        animation: `fade-in-up 0.5s ease both`,
        animationDelay: `${delay}ms`,
      }}
    >
      <p style={{ color: '#5a6478', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </p>
      <p className="text-2xl font-bold" style={{ color }}>
        {value}
      </p>
      {sub && <p style={{ color: '#5a6478', fontSize: '0.75rem' }}>{sub}</p>}
    </div>
  )
}

function StepCard({
  number,
  title,
  body,
  delay = 0,
}: {
  number: string
  title: string
  body: string
  delay?: number
}) {
  return (
    <div
      className="rounded-xl p-6 flex flex-col gap-3"
      style={{
        border: '1px solid #1e2530',
        background: '#0f1218',
        animation: `fade-in-up 0.5s ease both`,
        animationDelay: `${delay}ms`,
      }}
    >
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
        style={{ background: 'rgba(59,142,243,0.15)', color: '#3b8ef3' }}
      >
        {number}
      </div>
      <p className="font-semibold" style={{ color: '#e8ecf4' }}>{title}</p>
      <p className="text-sm" style={{ color: '#5a6478' }}>{body}</p>
    </div>
  )
}

export default function LandingPage() {
  const { data: statsData } = useReadContracts({
    contracts: [
      { address: fujiAddresses.controller, abi: controllerAbi, functionName: 'totalPoliciesSold' as const },
      { address: fujiAddresses.controller, abi: controllerAbi, functionName: 'totalPremiumsCollected' as const },
      { address: fujiAddresses.controller, abi: controllerAbi, functionName: 'totalPayoutsDistributed' as const },
      { address: fujiAddresses.riskVault, abi: riskVaultAbi, functionName: 'totalManagedAssets' as const },
    ],
  })

  const totalPoliciesSold = statsData?.[0]?.result as bigint | undefined
  const totalPremiumsCollected = statsData?.[1]?.result as bigint | undefined
  const totalPayoutsDistributed = statsData?.[2]?.result as bigint | undefined
  const tvl = statsData?.[3]?.result as bigint | undefined

  return (
    <div className="space-y-20">
      {/* Hero */}
      <div className="text-center space-y-6 pt-8" style={{ animation: 'fade-in-up 0.6s ease both' }}>
        <div
          className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium"
          style={{ background: 'rgba(59,142,243,0.1)', border: '1px solid rgba(59,142,243,0.3)', color: '#3b8ef3' }}
        >
          <span>⚡</span> Powered by Chainlink CRE + Avalanche
        </div>

        <h1
          className="text-5xl font-bold tracking-tight sm:text-6xl"
          style={{ color: '#e8ecf4', lineHeight: 1.1 }}
        >
          Your flight delayed?<br />
          <span style={{ color: '#3b8ef3' }}>Get paid automatically.</span>
        </h1>

        <p className="text-lg max-w-2xl mx-auto" style={{ color: '#5a6478' }}>
          Sentinel Protocol is fully on-chain parametric flight insurance.
          Pay a fixed USDC premium — if your flight is delayed or cancelled,
          your payout arrives the moment the oracle confirms it. No claims. No forms. No waiting.
        </p>

        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Link
            href="/routes"
            className="rounded-lg px-6 py-3 text-sm font-semibold transition-all"
            style={{ background: '#3b8ef3', color: '#e8ecf4' }}
          >
            Insure My Flight →
          </Link>
          <Link
            href="/vault"
            className="rounded-lg px-6 py-3 text-sm font-semibold transition-all"
            style={{ border: '1px solid #1e2530', background: '#0f1218', color: '#e8ecf4' }}
          >
            Earn as Underwriter
          </Link>
        </div>
      </div>

      {/* Live stats bar */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Policies Sold"
          value={totalPoliciesSold?.toString() ?? '—'}
          delay={100}
          color="#3b8ef3"
        />
        <StatCard
          label="Premiums Collected"
          value={totalPremiumsCollected !== undefined ? `$${formatUsdc(totalPremiumsCollected)}` : '—'}
          sub="USDC"
          delay={150}
          color="#f5c842"
        />
        <StatCard
          label="Payouts Distributed"
          value={totalPayoutsDistributed !== undefined ? `$${formatUsdc(totalPayoutsDistributed)}` : '—'}
          sub="USDC"
          delay={200}
          color="#2ecc8f"
        />
        <StatCard
          label="Vault TVL"
          value={tvl !== undefined ? `$${formatUsdc(tvl)}` : '—'}
          sub="USDC under management"
          delay={250}
          color="#3b8ef3"
        />
      </div>

      {/* How it works */}
      <div className="space-y-8">
        <div style={{ animation: 'fade-in-up 0.5s ease both', animationDelay: '300ms' }}>
          <p style={{ color: '#3b8ef3', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>
            How it works
          </p>
          <h2 className="text-3xl font-bold mt-2" style={{ color: '#e8ecf4' }}>
            Three steps. Fully automatic.
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <StepCard
            number="1"
            title="Choose a route + date"
            body="Browse approved routes and pick your departure date. See live capacity and buyer count before committing."
            delay={350}
          />
          <StepCard
            number="2"
            title="Pay the premium"
            body="Approve and pay a fixed USDC premium. Your policy is recorded on-chain immediately — no intermediary."
            delay={400}
          />
          <StepCard
            number="3"
            title="Get paid if delayed"
            body="Chainlink CRE polls FlightAware every 10 minutes. The moment your flight is confirmed delayed, your payout is sent automatically."
            delay={450}
          />
        </div>
      </div>

      {/* Two roles */}
      <div className="grid gap-6 sm:grid-cols-2" style={{ animation: 'fade-in-up 0.5s ease both', animationDelay: '500ms' }}>
        {/* Traveler */}
        <div
          className="rounded-xl p-8 space-y-4"
          style={{ border: '1px solid #1a3a6b', background: 'rgba(59,142,243,0.06)' }}
        >
          <div className="text-2xl">✈️</div>
          <h3 className="text-xl font-bold" style={{ color: '#e8ecf4' }}>Traveler</h3>
          <p className="text-sm" style={{ color: '#5a6478' }}>
            Insure your flight for a fixed premium. If delayed 45+ minutes or cancelled, receive your full payout automatically — no claim required.
          </p>
          <ul className="text-sm space-y-1" style={{ color: '#5a6478' }}>
            <li>✓ Fixed premium, fixed payout</li>
            <li>✓ Paid automatically on settlement</li>
            <li>✓ Pull claim fallback if push fails</li>
          </ul>
          <Link
            href="/routes"
            className="inline-block rounded-lg px-4 py-2 text-sm font-semibold"
            style={{ background: 'rgba(59,142,243,0.15)', color: '#3b8ef3', border: '1px solid rgba(59,142,243,0.3)' }}
          >
            Browse Routes →
          </Link>
        </div>

        {/* Underwriter */}
        <div
          className="rounded-xl p-8 space-y-4"
          style={{ border: '1px solid #0d3d27', background: 'rgba(46,204,143,0.06)' }}
        >
          <div className="text-2xl">🏦</div>
          <h3 className="text-xl font-bold" style={{ color: '#e8ecf4' }}>Underwriter</h3>
          <p className="text-sm" style={{ color: '#5a6478' }}>
            Deposit USDC into the RiskVault to back flight policies. Earn premium income from every on-time flight. Projected 37% APY.
          </p>
          <ul className="text-sm space-y-1" style={{ color: '#5a6478' }}>
            <li>✓ Earn USDC premiums passively</li>
            <li>✓ FIFO withdrawal queue — no lockups</li>
            <li>✓ Share price accrues with income</li>
          </ul>
          <Link
            href="/vault"
            className="inline-block rounded-lg px-4 py-2 text-sm font-semibold"
            style={{ background: 'rgba(46,204,143,0.15)', color: '#2ecc8f', border: '1px solid rgba(46,204,143,0.3)' }}
          >
            Go to Vault →
          </Link>
        </div>
      </div>

      {/* Footer */}
      <div
        className="rounded-xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4"
        style={{ border: '1px solid #1e2530', background: '#0f1218' }}
      >
        <div>
          <p className="font-semibold" style={{ color: '#e8ecf4' }}>Sentinel Protocol</p>
          <p className="text-sm" style={{ color: '#5a6478' }}>Parametric flight insurance on Avalanche Fuji testnet</p>
        </div>
        <div className="flex items-center gap-4">
          <span
            className="rounded-full px-3 py-1 text-xs font-semibold"
            style={{ background: 'rgba(55,91,210,0.15)', color: '#375bd2', border: '1px solid rgba(55,91,210,0.3)' }}
          >
            Chainlink CRE
          </span>
          <span
            className="rounded-full px-3 py-1 text-xs font-semibold"
            style={{ background: 'rgba(232,65,66,0.15)', color: '#e84142', border: '1px solid rgba(232,65,66,0.3)' }}
          >
            Avalanche
          </span>
        </div>
      </div>
    </div>
  )
}
