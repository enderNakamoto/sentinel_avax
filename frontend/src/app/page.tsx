'use client'

import { useReadContract, useReadContracts } from 'wagmi'
import type { Address } from 'viem'
import {
  controllerAbi,
  riskVaultAbi,
  flightPoolAbi,
  oracleAggregatorAbi,
  fujiAddresses,
} from '@/contracts'
import { formatUsdc, formatSharePrice } from '@/lib/format'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// FlightPool.Outcome: 0=Pending 1=NotDelayed 2=Delayed 3=Cancelled
// OracleAggregator.FlightStatus: 0=Unknown 1=OnTime 2=Delayed 3=Cancelled

const STATUS_LABELS: Record<number, string> = {
  0: 'Unknown',
  1: 'On Time',
  2: 'Delayed',
  3: 'Cancelled',
}

const STATUS_VARIANT: Record<number, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  0: 'outline',
  1: 'secondary',
  2: 'destructive',
  3: 'destructive',
}

function ActivePoolsTable() {
  // Step 1: get active pool addresses
  const { data: poolAddresses, isLoading: poolsLoading } = useReadContract({
    address: fujiAddresses.controller,
    abi: controllerAbi,
    functionName: 'getActivePools',
  })

  const pools = (poolAddresses ?? []) as Address[]

  // Step 2: pool metadata (flightId, flightDate, buyerCount) — 3 reads per pool
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

  // Step 3: oracle status for each pool
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

  if (poolsLoading) return <p className="text-sm text-muted-foreground">Loading active flights…</p>
  if (pools.length === 0)
    return <p className="text-sm text-muted-foreground">No active flights being tracked.</p>

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Flight</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Buyers</TableHead>
          <TableHead>Oracle Status</TableHead>
          <TableHead className="font-mono text-xs">Pool</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {parsedMeta.map((p, i) => {
          const statusNum = Number((statusData?.[i]?.result as number | undefined) ?? 0)
          return (
            <TableRow key={p.address}>
              <TableCell className="font-medium">{p.flightId || '…'}</TableCell>
              <TableCell>{p.flightDate || '…'}</TableCell>
              <TableCell>{p.buyerCount.toString()}</TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[statusNum]}>
                  {STATUS_LABELS[statusNum] ?? 'Unknown'}
                </Badge>
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {p.address.slice(0, 8)}…{p.address.slice(-4)}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

export default function Dashboard() {
  // Controller stats
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
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Protocol overview — Avalanche Fuji testnet
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Policies Sold
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {totalPoliciesSold?.toString() ?? '—'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Premiums Collected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">${formatUsdc(totalPremiumsCollected)}</p>
            <p className="text-xs text-muted-foreground">USDC</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Payouts Distributed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">${formatUsdc(totalPayoutsDistributed)}</p>
            <p className="text-xs text-muted-foreground">USDC</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Flights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {activeFlightCount?.toString() ?? '—'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Vault stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Vault TVL
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">${formatUsdc(totalManagedAssets)}</p>
            <p className="text-xs text-muted-foreground">USDC under management</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Share Price
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {totalManagedAssets !== undefined && totalShares !== undefined
                ? formatSharePrice(totalManagedAssets, totalShares)
                : '—'}
            </p>
            <p className="text-xs text-muted-foreground">USDC per share</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Projected APY
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">37%</p>
            <p className="text-xs text-muted-foreground">Standin estimate</p>
          </CardContent>
        </Card>
      </div>

      {/* Active flights table */}
      <Card>
        <CardHeader>
          <CardTitle>Active Flights</CardTitle>
        </CardHeader>
        <CardContent>
          <ActivePoolsTable />
        </CardContent>
      </Card>
    </div>
  )
}
