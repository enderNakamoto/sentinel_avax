'use client'

import { useState, useEffect } from 'react'
import { useReadContract, useReadContracts, usePublicClient } from 'wagmi'
import { type Address, parseAbiItem } from 'viem'
import {
  controllerAbi,
  riskVaultAbi,
  flightPoolAbi,
  oracleAggregatorAbi,
  fujiAddresses,
} from '@/contracts'
import { formatUsdc, formatSharePrice } from '@/lib/format'

// OracleAggregator.FlightStatus: 0=Unknown 1=OnTime 2=Delayed 3=Cancelled

const STATUS_LABELS: Record<number, string> = {
  0: 'Unknown',
  1: 'On Time',
  2: 'Delayed',
  3: 'Cancelled',
}

const STATUS_COLORS: Record<number, string> = {
  0: '#5a6478',
  1: '#2ecc8f',
  2: '#f5c842',
  3: '#e05c6b',
}

const STATUS_BG: Record<number, string> = {
  0: 'rgba(90,100,120,0.1)',
  1: 'rgba(46,204,143,0.1)',
  2: 'rgba(245,200,66,0.1)',
  3: 'rgba(224,92,107,0.1)',
}

// ── Active pools ─────────────────────────────────────────────────────────────

function ActivePoolsTable() {
  const { data: poolAddresses, isLoading: poolsLoading } = useReadContract({
    address: fujiAddresses.controller,
    abi: controllerAbi,
    functionName: 'getActivePools',
  })

  const pools = (poolAddresses ?? []) as Address[]

  const { data: metaData } = useReadContracts({
    contracts: pools.flatMap((addr) => [
      { address: addr, abi: flightPoolAbi, functionName: 'flightId' as const },
      { address: addr, abi: flightPoolAbi, functionName: 'flightDate' as const },
      { address: addr, abi: flightPoolAbi, functionName: 'buyerCount' as const },
    ]),
    query: { enabled: pools.length > 0 },
  })

  const parsedMeta = pools.map((addr, i) => ({
    address: addr,
    flightId: (metaData?.[i * 3]?.result as string | undefined) ?? '',
    flightDate: (metaData?.[i * 3 + 1]?.result as string | undefined) ?? '',
    buyerCount: (metaData?.[i * 3 + 2]?.result as bigint | undefined) ?? 0n,
  }))

  const { data: statusData } = useReadContracts({
    contracts: parsedMeta.map((p) => ({
      address: fujiAddresses.oracleAggregator as Address,
      abi: oracleAggregatorAbi,
      functionName: 'getFlightStatus' as const,
      args: [p.flightId, p.flightDate] as const,
    })),
    query: {
      enabled: parsedMeta.length > 0 && parsedMeta.every((p) => !!p.flightId),
    },
  })

  if (poolsLoading) {
    return <p className="text-sm py-4" style={{ color: '#5a6478' }}>Loading active flights…</p>
  }
  if (pools.length === 0) {
    return (
      <div className="text-center py-8">
        <p style={{ color: '#5a6478' }}>No active flights being tracked.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr style={{ borderBottom: '1px solid #1e2530' }}>
            <th className="text-left py-3 px-2 font-medium" style={{ color: '#5a6478' }}>Flight</th>
            <th className="text-left py-3 px-2 font-medium" style={{ color: '#5a6478' }}>Date</th>
            <th className="text-left py-3 px-2 font-medium" style={{ color: '#5a6478' }}>Buyers</th>
            <th className="text-left py-3 px-2 font-medium" style={{ color: '#5a6478' }}>Oracle Status</th>
            <th className="text-left py-3 px-2 font-medium font-mono text-xs" style={{ color: '#5a6478' }}>Pool</th>
          </tr>
        </thead>
        <tbody>
          {parsedMeta.map((p, i) => {
            const statusNum = Number((statusData?.[i]?.result as number | undefined) ?? 0)
            return (
              <tr
                key={p.address}
                style={{ borderBottom: '1px solid #1e2530' }}
              >
                <td className="py-3 px-2 font-medium" style={{ color: '#e8ecf4' }}>{p.flightId || '…'}</td>
                <td className="py-3 px-2" style={{ color: '#5a6478' }}>{p.flightDate || '…'}</td>
                <td className="py-3 px-2" style={{ color: '#e8ecf4' }}>{p.buyerCount.toString()}</td>
                <td className="py-3 px-2">
                  <span
                    className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                    style={{
                      color: STATUS_COLORS[statusNum],
                      background: STATUS_BG[statusNum],
                    }}
                  >
                    {STATUS_LABELS[statusNum] ?? 'Unknown'}
                  </span>
                </td>
                <td className="py-3 px-2 font-mono text-xs" style={{ color: '#5a6478' }}>
                  {p.address.slice(0, 8)}…{p.address.slice(-4)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Settled flights ───────────────────────────────────────────────────────────

type SettledEntry = {
  address: Address
  outcome: 2 | 3
  totalPayout: bigint
  blockNumber: bigint
}

function useSettledFlights(): SettledEntry[] {
  const publicClient = usePublicClient()
  const [entries, setEntries] = useState<SettledEntry[]>([])

  useEffect(() => {
    if (!publicClient) return
    let stale = false
    ;(async () => {
      try {
        const [delayed, cancelled] = await Promise.all([
          publicClient.getLogs({
            address: fujiAddresses.controller as Address,
            event: parseAbiItem('event SettledDelayed(bytes32 indexed key, address indexed poolAddress, uint256 totalPayout)'),
            fromBlock: 0n,
          }),
          publicClient.getLogs({
            address: fujiAddresses.controller as Address,
            event: parseAbiItem('event SettledCancelled(bytes32 indexed key, address indexed poolAddress, uint256 totalPayout)'),
            fromBlock: 0n,
          }),
        ])
        if (stale) return
        const combined: SettledEntry[] = [
          ...delayed.map((l) => ({
            address: l.args.poolAddress as Address,
            outcome: 2 as const,
            totalPayout: l.args.totalPayout as bigint,
            blockNumber: l.blockNumber ?? 0n,
          })),
          ...cancelled.map((l) => ({
            address: l.args.poolAddress as Address,
            outcome: 3 as const,
            totalPayout: l.args.totalPayout as bigint,
            blockNumber: l.blockNumber ?? 0n,
          })),
        ]
        combined.sort((a, b) => Number(b.blockNumber - a.blockNumber))
        setEntries(combined)
      } catch (err) {
        console.error('Failed to fetch settled flights:', err)
      }
    })()
    return () => {
      stale = true
    }
  }, [publicClient])

  return entries
}

const SETTLED_OUTCOME_LABEL: Record<2 | 3, string> = { 2: 'Delayed', 3: 'Cancelled' }
const SETTLED_OUTCOME_COLOR: Record<2 | 3, string> = { 2: '#f5c842', 3: '#e05c6b' }
const SETTLED_OUTCOME_BG: Record<2 | 3, string> = {
  2: 'rgba(245,200,66,0.1)',
  3: 'rgba(224,92,107,0.1)',
}

function SettledFlightsTable() {
  const entries = useSettledFlights()

  const { data: metaData } = useReadContracts({
    contracts: entries.flatMap((e) => [
      { address: e.address, abi: flightPoolAbi, functionName: 'flightId' as const },
      { address: e.address, abi: flightPoolAbi, functionName: 'flightDate' as const },
      { address: e.address, abi: flightPoolAbi, functionName: 'buyerCount' as const },
    ]),
    query: { enabled: entries.length > 0 },
  })

  const rows = entries.map((e, i) => ({
    ...e,
    flightId: (metaData?.[i * 3]?.result as string | undefined) ?? '…',
    flightDate: (metaData?.[i * 3 + 1]?.result as string | undefined) ?? '…',
    buyerCount: (metaData?.[i * 3 + 2]?.result as bigint | undefined) ?? 0n,
  }))

  if (entries.length === 0) {
    return (
      <div className="text-center py-8">
        <p style={{ color: '#5a6478' }}>No settled flights yet.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr style={{ borderBottom: '1px solid #1e2530' }}>
            <th className="text-left py-3 px-2 font-medium" style={{ color: '#5a6478' }}>Flight</th>
            <th className="text-left py-3 px-2 font-medium" style={{ color: '#5a6478' }}>Date</th>
            <th className="text-left py-3 px-2 font-medium" style={{ color: '#5a6478' }}>Buyers</th>
            <th className="text-left py-3 px-2 font-medium" style={{ color: '#5a6478' }}>Outcome</th>
            <th className="text-left py-3 px-2 font-medium" style={{ color: '#5a6478' }}>Total Paid Out</th>
            <th className="text-left py-3 px-2 font-medium font-mono text-xs" style={{ color: '#5a6478' }}>Pool</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.address} style={{ borderBottom: '1px solid #1e2530' }}>
              <td className="py-3 px-2 font-medium" style={{ color: '#e8ecf4' }}>{r.flightId}</td>
              <td className="py-3 px-2" style={{ color: '#5a6478' }}>{r.flightDate}</td>
              <td className="py-3 px-2" style={{ color: '#e8ecf4' }}>{r.buyerCount.toString()}</td>
              <td className="py-3 px-2">
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                  style={{
                    color: SETTLED_OUTCOME_COLOR[r.outcome],
                    background: SETTLED_OUTCOME_BG[r.outcome],
                  }}
                >
                  {SETTLED_OUTCOME_LABEL[r.outcome]}
                </span>
              </td>
              <td className="py-3 px-2 font-semibold" style={{ color: '#2ecc8f' }}>
                ${formatUsdc(r.totalPayout)} USDC
              </td>
              <td className="py-3 px-2 font-mono text-xs" style={{ color: '#5a6478' }}>
                {r.address.slice(0, 8)}…{r.address.slice(-4)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  color = '#e8ecf4',
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
      className="rounded-xl p-5"
      style={{
        border: '1px solid #1e2530',
        background: '#0f1218',
        animation: `fade-in-up 0.4s ease both`,
        animationDelay: `${delay}ms`,
      }}
    >
      <p className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: '#5a6478' }}>
        {label}
      </p>
      <p className="text-2xl font-bold" style={{ color }}>
        {value}
      </p>
      {sub && <p className="text-xs mt-0.5" style={{ color: '#5a6478' }}>{sub}</p>}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { data: statsData } = useReadContracts({
    contracts: [
      { address: fujiAddresses.controller, abi: controllerAbi, functionName: 'totalPoliciesSold' as const },
      { address: fujiAddresses.controller, abi: controllerAbi, functionName: 'totalPremiumsCollected' as const },
      { address: fujiAddresses.controller, abi: controllerAbi, functionName: 'totalPayoutsDistributed' as const },
      { address: fujiAddresses.controller, abi: controllerAbi, functionName: 'activeFlightCount' as const },
      { address: fujiAddresses.riskVault, abi: riskVaultAbi, functionName: 'totalManagedAssets' as const },
      { address: fujiAddresses.riskVault, abi: riskVaultAbi, functionName: 'totalShares' as const },
    ],
  })

  const totalPoliciesSold = statsData?.[0]?.result as bigint | undefined
  const totalPremiumsCollected = statsData?.[1]?.result as bigint | undefined
  const totalPayoutsDistributed = statsData?.[2]?.result as bigint | undefined
  const activeFlightCount = statsData?.[3]?.result as bigint | undefined
  const totalManagedAssets = statsData?.[4]?.result as bigint | undefined
  const totalShares = statsData?.[5]?.result as bigint | undefined

  return (
    <div className="space-y-8">
      <div style={{ animation: 'fade-in-up 0.4s ease both' }}>
        <h1 className="text-3xl font-bold tracking-tight" style={{ color: '#e8ecf4' }}>Dashboard</h1>
        <p className="mt-1" style={{ color: '#5a6478' }}>
          Protocol overview — Avalanche Fuji testnet
        </p>
      </div>

      {/* Controller stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Policies Sold"
          value={totalPoliciesSold?.toString() ?? '—'}
          color="#3b8ef3"
          delay={50}
        />
        <StatCard
          label="Premiums Collected"
          value={totalPremiumsCollected !== undefined ? `$${formatUsdc(totalPremiumsCollected)}` : '—'}
          sub="USDC"
          color="#f5c842"
          delay={100}
        />
        <StatCard
          label="Payouts Distributed"
          value={totalPayoutsDistributed !== undefined ? `$${formatUsdc(totalPayoutsDistributed)}` : '—'}
          sub="USDC"
          color="#2ecc8f"
          delay={150}
        />
        <StatCard
          label="Active Flights"
          value={activeFlightCount?.toString() ?? '—'}
          color="#3b8ef3"
          delay={200}
        />
      </div>

      {/* Vault stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Vault TVL"
          value={totalManagedAssets !== undefined ? `$${formatUsdc(totalManagedAssets)}` : '—'}
          sub="USDC under management"
          color="#3b8ef3"
          delay={250}
        />
        <StatCard
          label="Share Price"
          value={
            totalManagedAssets !== undefined && totalShares !== undefined
              ? formatSharePrice(totalManagedAssets, totalShares)
              : '—'
          }
          sub="USDC per share"
          color="#e8ecf4"
          delay={300}
        />
        <StatCard
          label="Projected APY"
          value="37%"
          sub="Standin estimate"
          color="#2ecc8f"
          delay={350}
        />
      </div>

      {/* Active flights table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          border: '1px solid #1e2530',
          background: '#0f1218',
          animation: 'fade-in-up 0.4s ease both',
          animationDelay: '400ms',
        }}
      >
        <div className="px-6 py-4" style={{ borderBottom: '1px solid #1e2530' }}>
          <h2 className="font-semibold" style={{ color: '#e8ecf4' }}>Active Flights</h2>
          <p className="text-sm mt-0.5" style={{ color: '#5a6478' }}>Tracked by Chainlink CRE — updates every 10 minutes</p>
        </div>
        <div className="px-6 py-2">
          <ActivePoolsTable />
        </div>
      </div>

      {/* Settled flights table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          border: '1px solid #1e2530',
          background: '#0f1218',
          animation: 'fade-in-up 0.4s ease both',
          animationDelay: '450ms',
        }}
      >
        <div className="px-6 py-4" style={{ borderBottom: '1px solid #1e2530' }}>
          <h2 className="font-semibold" style={{ color: '#e8ecf4' }}>Settled Flights</h2>
          <p className="text-sm mt-0.5" style={{ color: '#5a6478' }}>Delayed and cancelled flights — payouts distributed automatically</p>
        </div>
        <div className="px-6 py-2">
          <SettledFlightsTable />
        </div>
      </div>
    </div>
  )
}
