'use client'

import { useState, useEffect, useMemo } from 'react'
import { useAccount, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import type { Address } from 'viem'
import { controllerAbi, flightPoolAbi, fujiAddresses } from '@/contracts'
import { formatUsdc, getErrMsg } from '@/lib/format'
import { loadPolicies, StoredPolicy } from '@/lib/policyStore'
import { ConnectPrompt } from '@/components/ConnectPrompt'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// FlightPool.Outcome: 0=Pending 1=NotDelayed 2=Delayed 3=Cancelled
const OUTCOME_LABELS: Record<number, string> = {
  0: 'Pending settlement',
  1: 'On Time — no payout',
  2: 'Delayed — claim available',
  3: 'Cancelled — claim available',
}
const OUTCOME_VARIANT: Record<number, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  0: 'outline',
  1: 'secondary',
  2: 'destructive',
  3: 'destructive',
}

// ── Policy card ──────────────────────────────────────────────────────────────

function PolicyCard({
  poolAddress,
  walletAddress,
  onClaimed,
}: {
  poolAddress: string
  walletAddress: Address
  onClaimed: () => void
}) {
  const addr = poolAddress as Address

  // Read all relevant pool data in one shot
  const { data, refetch } = useReadContracts({
    contracts: [
      { address: addr, abi: flightPoolAbi, functionName: 'flightId' as const },
      { address: addr, abi: flightPoolAbi, functionName: 'flightDate' as const },
      { address: addr, abi: flightPoolAbi, functionName: 'payoff' as const },
      { address: addr, abi: flightPoolAbi, functionName: 'outcome' as const },
      { address: addr, abi: flightPoolAbi, functionName: 'claimExpiry' as const },
      { address: addr, abi: flightPoolAbi, functionName: 'canClaim' as const, args: [walletAddress] as const },
      { address: addr, abi: flightPoolAbi, functionName: 'claimed' as const, args: [walletAddress] as const },
      { address: addr, abi: flightPoolAbi, functionName: 'hasBought' as const, args: [walletAddress] as const },
    ],
  })

  const flightId = data?.[0]?.result as string | undefined
  const flightDate = data?.[1]?.result as string | undefined
  const payoff = data?.[2]?.result as bigint | undefined
  const outcome = Number((data?.[3]?.result as number | undefined) ?? 0)
  const claimExpiry = data?.[4]?.result as bigint | undefined
  const canClaim = data?.[5]?.result as boolean | undefined
  const claimed = data?.[6]?.result as boolean | undefined
  const hasBought = data?.[7]?.result as boolean | undefined

  const [claimHash, setClaimHash] = useState<`0x${string}` | undefined>()
  const [claimError, setClaimError] = useState('')
  const [claimSuccess, setClaimSuccess] = useState(false)

  const { writeContractAsync, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: claimHash })

  useEffect(() => {
    if (isSuccess) {
      setClaimSuccess(true)
      refetch()
      onClaimed()
    }
  }, [isSuccess, refetch, onClaimed])

  // Expiry countdown
  const expiryDate = claimExpiry ? new Date(Number(claimExpiry) * 1000) : null
  const isExpired = expiryDate ? Date.now() > expiryDate.getTime() : false

  async function handleClaim() {
    setClaimError('')
    try {
      const hash = await writeContractAsync({
        address: addr,
        abi: flightPoolAbi,
        functionName: 'claim',
      })
      setClaimHash(hash)
    } catch (err) {
      setClaimError(getErrMsg(err))
    }
  }

  if (!hasBought && hasBought !== undefined) return null

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{flightId ?? '…'}</CardTitle>
            <p className="text-sm text-muted-foreground">{flightDate ?? '…'}</p>
          </div>
          <Badge variant={OUTCOME_VARIANT[outcome]}>{OUTCOME_LABELS[outcome] ?? 'Unknown'}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Payout</span>
            <span className="font-semibold">${formatUsdc(payoff)} USDC</span>
          </div>
          {expiryDate && (outcome === 2 || outcome === 3) && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Claim deadline</span>
              <span className={isExpired ? 'text-destructive' : ''}>
                {expiryDate.toLocaleDateString()}
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Pool</span>
            <span className="font-mono text-xs">
              {poolAddress.slice(0, 8)}…{poolAddress.slice(-4)}
            </span>
          </div>
        </div>

        {/* Claim UI */}
        {claimSuccess ? (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            <p className="font-medium">Claimed! ${formatUsdc(payoff)} USDC sent to your wallet.</p>
          </div>
        ) : claimed ? (
          <p className="text-sm text-muted-foreground">Already claimed.</p>
        ) : canClaim ? (
          <Button
            onClick={handleClaim}
            disabled={isPending || isConfirming}
            className="w-full"
          >
            {isPending ? 'Confirm in wallet…' : isConfirming ? 'Processing…' : `Claim $${formatUsdc(payoff)} USDC`}
          </Button>
        ) : isExpired && (outcome === 2 || outcome === 3) ? (
          <p className="text-sm text-destructive">Claim window closed.</p>
        ) : outcome === 0 ? (
          <p className="text-sm text-muted-foreground">Awaiting flight settlement…</p>
        ) : outcome === 1 ? (
          <p className="text-sm text-muted-foreground">Flight landed on time — no payout due.</p>
        ) : null}

        {claimError && (
          <p className="text-sm text-destructive rounded border border-destructive/20 bg-destructive/5 p-2">
            {claimError}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function PoliciesPage() {
  const { address } = useAccount()
  const [claimedCount, setClaimedCount] = useState(0)

  // Stored policies from localStorage (purchased through this browser)
  const storedPolicies: StoredPolicy[] = useMemo(
    () => (address ? loadPolicies(address) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [address, claimedCount],
  )

  // Also scan getActivePools() — may find pools the user bought on another device
  const { data: activePools } = useReadContract({
    address: fujiAddresses.controller,
    abi: controllerAbi,
    functionName: 'getActivePools',
    query: { enabled: !!address },
  })

  // Read hasBought for each active pool
  const activePoolAddresses = (activePools ?? []) as Address[]
  const { data: hasBoughtData } = useReadContracts({
    contracts: activePoolAddresses.map((poolAddr) => ({
      address: poolAddr,
      abi: flightPoolAbi,
      functionName: 'hasBought' as const,
      args: [address as Address] as const,
    })),
    query: { enabled: activePoolAddresses.length > 0 && !!address },
  })

  // All pool addresses to show: stored + active pools where hasBought is true
  const allPoolAddresses = useMemo(() => {
    const stored = storedPolicies.map((p) => p.poolAddress.toLowerCase())
    const activeWithBought = activePoolAddresses.filter(
      (_, i) => hasBoughtData?.[i]?.result === true,
    )
    const combined = new Set([...stored, ...activeWithBought.map((a) => a.toLowerCase())])
    return Array.from(combined)
  }, [storedPolicies, activePoolAddresses, hasBoughtData])

  if (!address) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">My Policies</h1>
        <div className="max-w-sm">
          <ConnectPrompt />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My Policies</h1>
        <p className="text-muted-foreground mt-1">
          Your purchased flight insurance policies.
        </p>
      </div>

      {allPoolAddresses.length === 0 ? (
        <div className="rounded-xl border bg-muted/30 p-8 text-center">
          <p className="text-muted-foreground">No policies found.</p>
          <p className="text-sm text-muted-foreground mt-1">
            Buy insurance on the{' '}
            <a href="/routes" className="underline underline-offset-2">
              Buy Insurance
            </a>{' '}
            page.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {allPoolAddresses.map((poolAddr) => (
            <PolicyCard
              key={poolAddr}
              poolAddress={poolAddr}
              walletAddress={address}
              onClaimed={() => setClaimedCount((c) => c + 1)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
