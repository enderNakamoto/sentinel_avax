'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useReadContracts } from 'wagmi'
import { controllerAbi, riskVaultAbi, fujiAddresses } from '@/contracts'
import { FlightBackground } from '@/components/FlightBackground'

// ── Count-up hook ────────────────────────────────────────────────────────────

function useCountUp(end: number | undefined, duration = 1200) {
  const [count, setCount] = useState(0)
  const frame = useRef<number>(0)

  useEffect(() => {
    if (end === undefined || end === 0) return
    const start = Date.now()
    const tick = () => {
      const elapsed = Date.now() - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - (1 - progress) ** 3
      setCount(Math.round(end * eased))
      if (progress < 1) frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
  }, [end, duration])

  return count
}

// ── Stat card with count-up ──────────────────────────────────────────────────

function StatCard({
  label,
  rawValue,
  prefix = '',
  suffix = '',
  sub,
  color = '#3b8ef3',
  delay = 0,
  decimals = 0,
}: {
  label: string
  rawValue: number | undefined
  prefix?: string
  suffix?: string
  sub?: string
  color?: string
  delay?: number
  decimals?: number
}) {
  const counted = useCountUp(rawValue ? Math.round(rawValue) : undefined)
  const display =
    rawValue === undefined
      ? '—'
      : `${prefix}${decimals > 0 ? (counted / 10 ** decimals).toFixed(2) : counted.toLocaleString()}${suffix}`

  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-1"
      style={{
        border: '1px solid #1e2530',
        background: 'rgba(15,18,24,0.8)',
        backdropFilter: 'blur(8px)',
        animation: `fade-in-up 0.5s ease both`,
        animationDelay: `${delay}ms`,
      }}
    >
      <p
        style={{
          color: '#5a6478',
          fontSize: '0.7rem',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontWeight: 600,
        }}
      >
        {label}
      </p>
      <p className="text-2xl font-bold tabular-nums" style={{ color }}>
        {display}
      </p>
      {sub && <p style={{ color: '#5a6478', fontSize: '0.72rem' }}>{sub}</p>}
    </div>
  )
}

// ── Step card with pulsing number ────────────────────────────────────────────

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
        background: 'rgba(15,18,24,0.8)',
        backdropFilter: 'blur(8px)',
        animation: `fade-in-up 0.5s ease both`,
        animationDelay: `${delay}ms`,
      }}
    >
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
        style={{
          background: 'rgba(59,142,243,0.15)',
          color: '#3b8ef3',
          border: '1px solid rgba(59,142,243,0.3)',
          animation: 'pulse-scale 3s ease-in-out infinite',
          animationDelay: `${delay + 600}ms`,
        }}
      >
        {number}
      </div>
      <p className="font-semibold" style={{ color: '#e8ecf4' }}>
        {title}
      </p>
      <p className="text-sm leading-relaxed" style={{ color: '#5a6478' }}>
        {body}
      </p>
    </div>
  )
}

// ── Role card with hover glow ─────────────────────────────────────────────────

function RoleCard({
  icon,
  title,
  body,
  perks,
  cta,
  href,
  accentColor,
  accentDim,
  delay = 0,
}: {
  icon: string
  title: string
  body: string
  perks: string[]
  cta: string
  href: string
  accentColor: string
  accentDim: string
  delay?: number
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className="rounded-xl p-8 flex flex-col gap-4 transition-all duration-300"
      style={{
        border: `1px solid ${hovered ? accentColor + '55' : accentDim}`,
        background: `rgba(${accentColor === '#3b8ef3' ? '59,142,243' : '46,204,143'}, ${hovered ? '0.09' : '0.05'})`,
        boxShadow: hovered
          ? `0 0 30px rgba(${accentColor === '#3b8ef3' ? '59,142,243' : '46,204,143'}, 0.12)`
          : 'none',
        animation: `fade-in-up 0.5s ease both`,
        animationDelay: `${delay}ms`,
        cursor: 'default',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="text-3xl">{icon}</div>
      <h3 className="text-xl font-bold" style={{ color: '#e8ecf4' }}>
        {title}
      </h3>
      <p className="text-sm leading-relaxed" style={{ color: '#5a6478' }}>
        {body}
      </p>
      <ul className="text-sm space-y-1.5" style={{ color: '#5a6478' }}>
        {perks.map((p) => (
          <li key={p} style={{ color: hovered ? '#e8ecf4' : '#5a6478', transition: 'color 0.2s' }}>
            <span style={{ color: accentColor }}>✓</span> {p}
          </li>
        ))}
      </ul>
      <Link
        href={href}
        className="inline-block rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200 w-fit"
        style={{
          background: `rgba(${accentColor === '#3b8ef3' ? '59,142,243' : '46,204,143'}, ${hovered ? '0.25' : '0.12'})`,
          color: accentColor,
          border: `1px solid rgba(${accentColor === '#3b8ef3' ? '59,142,243' : '46,204,143'}, ${hovered ? '0.5' : '0.25'})`,
        }}
      >
        {cta}
      </Link>
    </div>
  )
}

// ── Divider ──────────────────────────────────────────────────────────────────

function Divider() {
  return <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, #1e2530 30%, #1e2530 70%, transparent)' }} />
}

// ── Page ────────────────────────────────────────────────────────────────────

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

  // Convert BigInt to JS numbers for count-up
  const policiesNum = totalPoliciesSold !== undefined ? Number(totalPoliciesSold) : undefined
  const premiumsNum = totalPremiumsCollected !== undefined ? Number(totalPremiumsCollected) / 1_000_000 : undefined
  const payoutsNum = totalPayoutsDistributed !== undefined ? Number(totalPayoutsDistributed) / 1_000_000 : undefined
  const tvlNum = tvl !== undefined ? Number(tvl) / 1_000_000 : undefined

  return (
    <div className="relative space-y-16">
      {/* Fixed SVG background — behind everything */}
      <FlightBackground />

      {/* Hero */}
      <div
        className="relative text-center space-y-6 pt-10 pb-4"
        style={{ animation: 'fade-in-up 0.6s ease both', zIndex: 1 }}
      >
        {/* Radial glow behind hero text */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(ellipse 70% 60% at 50% 40%, rgba(59,142,243,0.07) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        <div
          className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold"
          style={{
            background: 'rgba(59,142,243,0.1)',
            border: '1px solid rgba(59,142,243,0.3)',
            color: '#3b8ef3',
          }}
        >
          <span>⚡</span> Powered by Chainlink CRE + Avalanche
        </div>

        <h1
          className="text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl"
          style={{ color: '#e8ecf4', lineHeight: 1.08 }}
        >
          Your flight delayed?
          <br />
          <span style={{ color: '#3b8ef3' }}>Get paid automatically.</span>
        </h1>

        <p
          className="text-lg max-w-2xl mx-auto leading-relaxed"
          style={{ color: '#5a6478' }}
        >
          Sentinel Protocol is fully on-chain parametric flight insurance.
          Pay a fixed USDC premium — if your flight is delayed or cancelled,
          your payout arrives the moment the oracle confirms it.{' '}
          <span style={{ color: '#e8ecf4' }}>No claims. No forms. No waiting.</span>
        </p>

        <div className="flex items-center justify-center gap-4 flex-wrap">
          {/* Shimmer primary CTA */}
          <Link
            href="/routes"
            className="relative overflow-hidden rounded-lg px-7 py-3 text-sm font-bold transition-transform hover:scale-105"
            style={{
              background: 'linear-gradient(90deg, #2a6fd4 0%, #3b8ef3 30%, #5ba8ff 60%, #3b8ef3 80%, #2a6fd4 100%)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 3s linear infinite',
              color: '#e8ecf4',
              boxShadow: '0 0 20px rgba(59,142,243,0.3)',
            }}
          >
            Insure My Flight →
          </Link>

          <Link
            href="/vault"
            className="rounded-lg px-7 py-3 text-sm font-semibold transition-all hover:border-[#3b8ef3]/40 hover:text-[#e8ecf4]"
            style={{
              border: '1px solid #1e2530',
              background: 'rgba(15,18,24,0.6)',
              color: '#5a6478',
            }}
          >
            Earn as Underwriter
          </Link>
        </div>
      </div>

      <Divider />

      {/* Live stats bar */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            label="Policies Sold"
            rawValue={policiesNum}
            color="#3b8ef3"
            delay={100}
          />
          <StatCard
            label="Premiums Collected"
            rawValue={premiumsNum}
            prefix="$"
            sub="USDC"
            color="#f5c842"
            delay={150}
          />
          <StatCard
            label="Payouts Distributed"
            rawValue={payoutsNum}
            prefix="$"
            sub="USDC"
            color="#2ecc8f"
            delay={200}
          />
          <StatCard
            label="Vault TVL"
            rawValue={tvlNum}
            prefix="$"
            sub="USDC under management"
            color="#3b8ef3"
            delay={250}
          />
        </div>
      </div>

      <Divider />

      {/* How it works */}
      <div className="space-y-8" style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ animation: 'fade-in-up 0.5s ease both', animationDelay: '300ms' }}>
          <p
            style={{
              color: '#3b8ef3',
              fontSize: '0.7rem',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              fontWeight: 700,
            }}
          >
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
            delay={420}
          />
          <StepCard
            number="3"
            title="Get paid if delayed"
            body="Chainlink CRE polls FlightAware every 10 minutes. The moment your flight is confirmed delayed, your payout is sent automatically."
            delay={490}
          />
        </div>
      </div>

      <Divider />

      {/* Two roles */}
      <div className="grid gap-6 sm:grid-cols-2" style={{ position: 'relative', zIndex: 1 }}>
        <RoleCard
          icon="✈️"
          title="Traveler"
          body="Insure your flight for a fixed premium. If delayed 45+ minutes or cancelled, receive your full payout automatically — no claim required."
          perks={[
            'Fixed premium, fixed payout',
            'Paid automatically on settlement',
            'Pull claim fallback if push fails',
          ]}
          cta="Browse Routes →"
          href="/routes"
          accentColor="#3b8ef3"
          accentDim="#1a3a6b"
          delay={550}
        />
        <RoleCard
          icon="🏦"
          title="Underwriter"
          body="Deposit USDC into the RiskVault to back flight policies. Earn premium income from every on-time flight. Projected 37% APY."
          perks={[
            'Earn USDC premiums passively',
            'FIFO withdrawal queue — no lockups',
            'Share price accrues with income',
          ]}
          cta="Go to Vault →"
          href="/vault"
          accentColor="#2ecc8f"
          accentDim="#0d3d27"
          delay={600}
        />
      </div>

      {/* Footer */}
      <div
        className="rounded-xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4"
        style={{
          border: '1px solid #1e2530',
          background: 'rgba(15,18,24,0.8)',
          backdropFilter: 'blur(8px)',
          position: 'relative',
          zIndex: 1,
          animation: 'fade-in-up 0.5s ease both',
          animationDelay: '650ms',
        }}
      >
        <div>
          <p className="font-semibold" style={{ color: '#e8ecf4' }}>
            Sentinel Protocol
          </p>
          <p className="text-sm" style={{ color: '#5a6478' }}>
            Parametric flight insurance on Avalanche Fuji testnet
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="rounded-full px-3 py-1 text-xs font-semibold"
            style={{
              background: 'rgba(55,91,210,0.15)',
              color: '#375bd2',
              border: '1px solid rgba(55,91,210,0.3)',
            }}
          >
            Chainlink CRE
          </span>
          <span
            className="rounded-full px-3 py-1 text-xs font-semibold"
            style={{
              background: 'rgba(232,65,66,0.15)',
              color: '#e84142',
              border: '1px solid rgba(232,65,66,0.3)',
            }}
          >
            Avalanche
          </span>
          <span
            className="rounded-full px-3 py-1 text-xs font-semibold"
            style={{
              background: 'rgba(59,142,243,0.1)',
              color: '#5a6478',
              border: '1px solid #1e2530',
            }}
          >
            Fuji Testnet
          </span>
        </div>
      </div>
    </div>
  )
}
