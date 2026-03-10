'use client'

import { useState, useEffect, useMemo } from 'react'
import { useAccount, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import type { Address } from 'viem'
import { controllerAbi, flightPoolAbi, fujiAddresses } from '@/contracts'
import { formatUsdc, getErrMsg } from '@/lib/format'
import { loadPolicies, StoredPolicy } from '@/lib/policyStore'
import { ConnectPrompt } from '@/components/ConnectPrompt'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// FlightPool.Outcome: 0=Pending 1=NotDelayed 2=Delayed 3=Cancelled
const OUTCOME_LABELS: Record<number, string> = {
  0: 'Pending settlement',
  1: 'On Time — no payout',
  2: 'Delayed — payout sent',
  3: 'Cancelled — payout sent',
}

const OUTCOME_COLORS: Record<number, string> = {
  0: '#5a6478',
  1: '#2ecc8f',
  2: '#f5c842',
  3: '#e05c6b',
}

const OUTCOME_BG: Record<number, string> = {
  0: 'rgba(90,100,120,0.1)',
  1: 'rgba(46,204,143,0.1)',
  2: 'rgba(245,200,66,0.1)',
  3: 'rgba(224,92,107,0.1)',
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
            <CardTitle className="text-base" style={{ color: '#e8ecf4' }}>{flightId ?? '…'}</CardTitle>
            <p className="text-sm" style={{ color: '#5a6478' }}>{flightDate ?? '…'}</p>
          </div>
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-semibold shrink-0"
            style={{
              color: OUTCOME_COLORS[outcome],
              background: OUTCOME_BG[outcome],
            }}
          >
            {OUTCOME_LABELS[outcome] ?? 'Unknown'}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-lg p-3 text-sm space-y-1" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #1e2530' }}>
          <div className="flex justify-between">
            <span style={{ color: '#5a6478' }}>Payout</span>
            <span className="font-semibold" style={{ color: '#2ecc8f' }}>${formatUsdc(payoff)} USDC</span>
          </div>
          {expiryDate && (outcome === 2 || outcome === 3) && !claimed && (
            <div className="flex justify-between">
              <span style={{ color: '#5a6478' }}>Claim deadline</span>
              <span style={{ color: isExpired ? '#e05c6b' : '#e8ecf4' }}>
                {expiryDate.toLocaleDateString()}
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span style={{ color: '#5a6478' }}>Pool</span>
            <span className="font-mono text-xs" style={{ color: '#5a6478' }}>
              {poolAddress.slice(0, 8)}…{poolAddress.slice(-4)}
            </span>
          </div>
        </div>

        {/* Claim UI */}
        {claimSuccess ? (
          <div
            className="rounded-lg p-3 text-sm"
            style={{ border: '1px solid rgba(46,204,143,0.3)', background: 'rgba(46,204,143,0.08)' }}
          >
            <p className="font-medium" style={{ color: '#2ecc8f' }}>
              Claimed! ${formatUsdc(payoff)} USDC sent to your wallet.
            </p>
          </div>
        ) : claimed && (outcome === 2 || outcome === 3) ? (
          <div
            className="rounded-lg p-3 text-sm"
            style={{ border: '1px solid rgba(46,204,143,0.3)', background: 'rgba(46,204,143,0.08)' }}
          >
            <p className="font-medium" style={{ color: '#2ecc8f' }}>
              ${formatUsdc(payoff)} USDC paid out to your wallet at settlement.
            </p>
            <p className="text-xs mt-1" style={{ color: '#5a6478' }}>
              Payout was sent automatically — check your USDC balance.
            </p>
          </div>
        ) : claimed ? (
          <p className="text-sm" style={{ color: '#5a6478' }}>Settled.</p>
        ) : canClaim ? (
          <Button
            onClick={handleClaim}
            disabled={isPending || isConfirming}
            className="w-full"
          >
            {isPending ? 'Confirm in wallet…' : isConfirming ? 'Processing…' : `Claim $${formatUsdc(payoff)} USDC`}
          </Button>
        ) : isExpired && (outcome === 2 || outcome === 3) ? (
          <p className="text-sm" style={{ color: '#e05c6b' }}>Claim window closed.</p>
        ) : outcome === 0 ? (
          <p className="text-sm" style={{ color: '#5a6478' }}>Awaiting flight settlement…</p>
        ) : outcome === 1 ? (
          <p className="text-sm" style={{ color: '#5a6478' }}>Flight landed on time — no payout due.</p>
        ) : (
          <p className="text-sm" style={{ color: '#5a6478' }}>Loading…</p>
        )}

        {claimError && (
          <p
            className="text-sm rounded p-2"
            style={{ color: '#e05c6b', border: '1px solid rgba(224,92,107,0.2)', background: 'rgba(224,92,107,0.08)' }}
          >
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

  const storedPolicies: StoredPolicy[] = useMemo(
    () => (address ? loadPolicies(address) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [address, claimedCount],
  )

  const { data: activePools } = useReadContract({
    address: fujiAddresses.controller,
    abi: controllerAbi,
    functionName: 'getActivePools',
    query: { enabled: !!address },
  })

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

  const allPoolAddresses = useMemo(() => {
    const stored = storedPolicies.map((p) => p.poolAddress.toLowerCase())
    const activeWithBought = activePoolAddresses.filter(
      (_, i) => hasBoughtData?.[i]?.result === true,
    )
    const combined = new Set([...stored, ...activeWithBought.map((a) => a.toLowerCase())])
    return Array.from(combined)
  }, [storedPolicies, activePoolAddresses, hasBoughtData])

  // Read outcome + claimed for all pools to split into active vs history
  const { data: splitData } = useReadContracts({
    contracts: allPoolAddresses.flatMap((addr) => [
      { address: addr as Address, abi: flightPoolAbi, functionName: 'outcome' as const },
      { address: addr as Address, abi: flightPoolAbi, functionName: 'claimed' as const, args: [address as Address] as const },
    ]),
    query: { enabled: allPoolAddresses.length > 0 && !!address },
  })

  const activePolicies = allPoolAddresses.filter((_, i) => {
    const outcome = Number((splitData?.[i * 2]?.result ?? 0) as number)
    const isPaid = splitData?.[i * 2 + 1]?.result as boolean | undefined
    return !((outcome === 2 || outcome === 3) && isPaid === true)
  })

  const paidHistory = allPoolAddresses.filter((_, i) => {
    const outcome = Number((splitData?.[i * 2]?.result ?? 0) as number)
    const isPaid = splitData?.[i * 2 + 1]?.result as boolean | undefined
    return (outcome === 2 || outcome === 3) && isPaid === true
  })

  if (!address) {
    return (
      <div className="space-y-6" style={{ animation: 'fade-in-up 0.4s ease both' }}>
        <h1 className="text-3xl font-bold tracking-tight" style={{ color: '#e8ecf4' }}>My Policies</h1>
        <div className="max-w-sm">
          <ConnectPrompt />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-10" style={{ animation: 'fade-in-up 0.4s ease both' }}>
      <div>
        <h1 className="text-3xl font-bold tracking-tight" style={{ color: '#e8ecf4' }}>My Policies</h1>
        <p className="mt-1" style={{ color: '#5a6478' }}>
          Your purchased flight insurance policies.
        </p>
      </div>

      {allPoolAddresses.length === 0 ? (
        <div className="rounded-xl p-8 text-center" style={{ border: '1px solid #1e2530', background: '#0f1218' }}>
          <p style={{ color: '#5a6478' }}>No policies found.</p>
          <p className="text-sm mt-1" style={{ color: '#5a6478' }}>
            Buy insurance on the{' '}
            <a href="/routes" style={{ color: '#3b8ef3' }} className="underline underline-offset-2">
              Buy Insurance
            </a>{' '}
            page.
          </p>
        </div>
      ) : (
        <>
          {/* Active policies */}
          {activePolicies.length > 0 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold" style={{ color: '#e8ecf4' }}>Active Policies</h2>
                <p className="text-sm" style={{ color: '#5a6478' }}>Policies awaiting settlement or with open claim windows.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {activePolicies.map((poolAddr) => (
                  <PolicyCard
                    key={poolAddr}
                    poolAddress={poolAddr}
                    walletAddress={address}
                    onClaimed={() => setClaimedCount((c) => c + 1)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Payout history */}
          {paidHistory.length > 0 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold" style={{ color: '#e8ecf4' }}>Payout History</h2>
                <p className="text-sm" style={{ color: '#5a6478' }}>Flights that were delayed or cancelled — USDC paid out to your wallet automatically.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {paidHistory.map((poolAddr) => (
                  <PolicyCard
                    key={poolAddr}
                    poolAddress={poolAddr}
                    walletAddress={address}
                    onClaimed={() => setClaimedCount((c) => c + 1)}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
