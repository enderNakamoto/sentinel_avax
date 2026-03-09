'use client'

import { useState, useEffect } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import type { Address } from 'viem'
import {
  governanceModuleAbi,
  controllerAbi,
  flightPoolAbi,
  fujiAddresses,
} from '@/contracts'
import { formatUsdc, getErrMsg } from '@/lib/format'
import { useUsdcBalance } from '@/hooks/useUsdcBalance'
import { useUsdcApprove } from '@/hooks/useUsdcApprove'
import { storePolicyBought } from '@/lib/policyStore'
import { ConnectPrompt } from '@/components/ConnectPrompt'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Route {
  flightId: string
  origin: string
  destination: string
  premium: bigint
  payoff: bigint
  active: boolean
}

// ── Per-route card ──────────────────────────────────────────────────────────

function RouteCard({ route, walletAddress }: { route: Route; walletAddress: Address | undefined }) {
  const [date, setDate] = useState('')
  const [error, setError] = useState('')
  const [buyHash, setBuyHash] = useState<`0x${string}` | undefined>()
  const [success, setSuccess] = useState(false)

  const { needsApproval, approve, isApproving } = useUsdcApprove(
    walletAddress,
    fujiAddresses.controller,
  )
  const { data: usdcBalance } = useUsdcBalance(walletAddress)

  const { data: poolAddress, isLoading: poolLoading } = useReadContract({
    address: fujiAddresses.controller,
    abi: controllerAbi,
    functionName: 'getPoolAddress',
    args: date ? [route.flightId, date] : undefined,
    query: { enabled: !!date },
  })

  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
  const poolExists =
    !!poolAddress && (poolAddress as string) !== ZERO_ADDRESS

  const { data: buyerCount } = useReadContract({
    address: poolAddress as Address,
    abi: flightPoolAbi,
    functionName: 'buyerCount',
    query: { enabled: poolExists },
  })

  const { data: hasBought } = useReadContract({
    address: poolAddress as Address,
    abi: flightPoolAbi,
    functionName: 'hasBought',
    args: walletAddress ? [walletAddress] : undefined,
    query: { enabled: poolExists && !!walletAddress },
  })

  const { data: isSolvent } = useReadContract({
    address: fujiAddresses.controller,
    abi: controllerAbi,
    functionName: 'isSolventForNewPurchase',
    args: [route.flightId, route.origin, route.destination],
    query: { enabled: !!date },
  })

  const { writeContractAsync, isPending: isBuyPending } = useWriteContract()
  const { isLoading: isBuyConfirming, isSuccess: isBuyConfirmed } = useWaitForTransactionReceipt({
    hash: buyHash,
  })

  useEffect(() => {
    if (isBuyConfirmed && buyHash) {
      setSuccess(true)
      if (walletAddress && poolAddress) {
        storePolicyBought(walletAddress, {
          poolAddress: poolAddress as string,
          flightId: route.flightId,
          flightDate: date,
        })
      }
    }
  }, [isBuyConfirmed, buyHash, walletAddress, poolAddress, route.flightId, date])

  const insufficientBalance =
    usdcBalance !== undefined && usdcBalance < route.premium

  async function handleApprove() {
    setError('')
    try {
      await approve(route.premium)
    } catch (err) {
      setError(getErrMsg(err))
    }
  }

  async function handleBuy() {
    if (!walletAddress || !date) return
    setError('')
    try {
      const hash = await writeContractAsync({
        address: fujiAddresses.controller,
        abi: controllerAbi,
        functionName: 'buyInsurance',
        args: [route.flightId, route.origin, route.destination, date],
      })
      setBuyHash(hash)
    } catch (err) {
      setError(getErrMsg(err))
    }
  }

  useEffect(() => { setSuccess(false); setBuyHash(undefined); setError('') }, [date])

  const isPending = isBuyPending || isBuyConfirming || isApproving
  const canBuy =
    !!walletAddress &&
    !!date &&
    !hasBought &&
    isSolvent !== false &&
    !insufficientBalance &&
    !isPending &&
    !success

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-lg">{route.flightId}</CardTitle>
            <p className="text-sm mt-0.5" style={{ color: '#5a6478' }}>
              {route.origin} → {route.destination}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs" style={{ color: '#5a6478' }}>Premium</p>
            <p className="font-semibold" style={{ color: '#e8ecf4' }}>${formatUsdc(route.premium)} USDC</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Payout info */}
        <div className="rounded-lg p-3 text-sm space-y-1" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #1e2530' }}>
          <div className="flex justify-between">
            <span style={{ color: '#5a6478' }}>Payout if delayed / cancelled</span>
            <span className="font-semibold" style={{ color: '#2ecc8f' }}>${formatUsdc(route.payoff)} USDC</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: '#5a6478' }}>Premium</span>
            <span style={{ color: '#e8ecf4' }}>${formatUsdc(route.premium)} USDC</span>
          </div>
          {poolExists && buyerCount !== undefined && (
            <div className="flex justify-between">
              <span style={{ color: '#5a6478' }}>Buyers on this date</span>
              <span style={{ color: '#3b8ef3' }}>{buyerCount.toString()}</span>
            </div>
          )}
        </div>

        {/* Date picker */}
        <div className="space-y-1.5">
          <Label htmlFor={`date-${route.flightId}`}>Flight Date</Label>
          <Input
            id={`date-${route.flightId}`}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            min={new Date().toISOString().split('T')[0]}
            className="w-full"
          />
        </div>

        {/* Status messages */}
        {date && !poolLoading && (
          <div className="space-y-1">
            {isSolvent === false && (
              <p className="text-sm" style={{ color: '#e05c6b' }}>
                Vault is at capacity for this route — purchase not available.
              </p>
            )}
            {hasBought && (
              <p className="text-sm" style={{ color: '#5a6478' }}>
                You already have insurance on this flight.
              </p>
            )}
            {insufficientBalance && !hasBought && (
              <p className="text-sm" style={{ color: '#e05c6b' }}>
                Insufficient USDC balance (need ${formatUsdc(route.premium)}).
              </p>
            )}
          </div>
        )}

        {/* Action buttons */}
        {!walletAddress ? (
          <ConnectPrompt />
        ) : success ? (
          <div
            className="rounded-lg p-3 text-sm"
            style={{ border: '1px solid rgba(46,204,143,0.3)', background: 'rgba(46,204,143,0.08)' }}
          >
            <p className="font-medium" style={{ color: '#2ecc8f' }}>Insurance purchased!</p>
            <p className="text-xs mt-1" style={{ color: '#5a6478' }}>
              Flight {route.flightId} on {date}. Payout: ${formatUsdc(route.payoff)} USDC if delayed or cancelled.
            </p>
            {poolAddress && (
              <p className="text-xs mt-1 font-mono" style={{ color: '#5a6478' }}>
                Pool: {(poolAddress as string).slice(0, 10)}…
              </p>
            )}
          </div>
        ) : date && !hasBought && isSolvent !== false && !insufficientBalance ? (
          <div className="space-y-2">
            {needsApproval(route.premium) ? (
              <Button
                onClick={handleApprove}
                disabled={isApproving || !walletAddress}
                className="w-full"
                variant="secondary"
              >
                {isApproving ? 'Approving USDC…' : `Approve $${formatUsdc(route.premium)} USDC`}
              </Button>
            ) : (
              <Button
                onClick={handleBuy}
                disabled={!canBuy}
                className="w-full"
              >
                {isBuyPending
                  ? 'Confirm in wallet…'
                  : isBuyConfirming
                  ? 'Purchasing…'
                  : `Buy Insurance — $${formatUsdc(route.premium)} USDC`}
              </Button>
            )}
          </div>
        ) : null}

        {error && (
          <p
            className="text-sm rounded p-2"
            style={{ color: '#e05c6b', border: '1px solid rgba(224,92,107,0.2)', background: 'rgba(224,92,107,0.08)' }}
          >
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────

function UsdcBalance({ address }: { address: Address }) {
  const { data: balance } = useUsdcBalance(address)
  return (
    <div className="text-sm" style={{ color: '#5a6478' }}>
      Your MockUSDC balance:{' '}
      <span className="font-medium" style={{ color: '#3b8ef3' }}>${formatUsdc(balance)}</span>
    </div>
  )
}

export default function RoutesPage() {
  const { address } = useAccount()

  const { data: routesData, isLoading } = useReadContract({
    address: fujiAddresses.governanceModule,
    abi: governanceModuleAbi,
    functionName: 'getApprovedRoutes',
  })

  const routes = ((routesData ?? []) as Route[]).filter((r) => r.active)

  return (
    <div className="space-y-8" style={{ animation: 'fade-in-up 0.4s ease both' }}>
      <div>
        <h1 className="text-3xl font-bold tracking-tight" style={{ color: '#e8ecf4' }}>Buy Insurance</h1>
        <p className="mt-1" style={{ color: '#5a6478' }}>
          Select a route, pick your departure date, and insure your flight.
        </p>
      </div>

      {!address ? (
        <div className="max-w-sm">
          <ConnectPrompt />
        </div>
      ) : (
        <UsdcBalance address={address} />
      )}

      {isLoading && (
        <p className="text-sm" style={{ color: '#5a6478' }}>Loading approved routes…</p>
      )}

      {!isLoading && routes.length === 0 && (
        <p className="text-sm" style={{ color: '#5a6478' }}>No routes approved yet.</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {routes.map((route) => (
          <RouteCard
            key={`${route.flightId}-${route.origin}-${route.destination}`}
            route={route}
            walletAddress={address}
          />
        ))}
      </div>

      {address && routes.length > 0 && (
        <p className="text-xs" style={{ color: '#5a6478' }}>
          Payments use MockUSDC on Fuji testnet.
        </p>
      )}
    </div>
  )
}
