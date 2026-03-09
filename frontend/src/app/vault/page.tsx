'use client'

import { useState, useEffect } from 'react'
import { useAccount, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import type { Address } from 'viem'
import { riskVaultAbi, fujiAddresses } from '@/contracts'
import { formatUsdc, parseUsdc, parseShares, formatSharePrice, getErrMsg } from '@/lib/format'
import { useUsdcBalance } from '@/hooks/useUsdcBalance'
import { useUsdcApprove } from '@/hooks/useUsdcApprove'
import { ConnectPrompt } from '@/components/ConnectPrompt'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

// ── Shared vault read hook ───────────────────────────────────────────────────

function useVaultStats(address: Address | undefined) {
  const { data: globalData, refetch: refetchGlobal } = useReadContracts({
    contracts: [
      { address: fujiAddresses.riskVault, abi: riskVaultAbi, functionName: 'totalManagedAssets' as const },
      { address: fujiAddresses.riskVault, abi: riskVaultAbi, functionName: 'totalShares' as const },
      { address: fujiAddresses.riskVault, abi: riskVaultAbi, functionName: 'lockedCapital' as const },
      { address: fujiAddresses.riskVault, abi: riskVaultAbi, functionName: 'freeCapital' as const },
    ],
  })

  const { data: userDataRaw, refetch: refetchUser } = useReadContracts({
    contracts: [
      { address: fujiAddresses.riskVault, abi: riskVaultAbi, functionName: 'shares' as const, args: [address ?? '0x0'] as const },
      { address: fujiAddresses.riskVault, abi: riskVaultAbi, functionName: 'queuedShares' as const, args: [address ?? '0x0'] as const },
      { address: fujiAddresses.riskVault, abi: riskVaultAbi, functionName: 'claimableBalance' as const, args: [address ?? '0x0'] as const },
      { address: fujiAddresses.riskVault, abi: riskVaultAbi, functionName: 'hasPendingWithdrawal' as const, args: [address ?? '0x0'] as const },
    ],
    query: { enabled: !!address },
  })

  function refetch() {
    refetchGlobal()
    refetchUser()
  }

  return {
    totalManagedAssets: globalData?.[0]?.result as bigint | undefined,
    totalShares: globalData?.[1]?.result as bigint | undefined,
    lockedCapital: globalData?.[2]?.result as bigint | undefined,
    freeCapital: globalData?.[3]?.result as bigint | undefined,
    myShares: userDataRaw?.[0]?.result as bigint | undefined,
    myQueuedShares: userDataRaw?.[1]?.result as bigint | undefined,
    myClaimableBalance: userDataRaw?.[2]?.result as bigint | undefined,
    hasPendingWithdrawal: userDataRaw?.[3]?.result as boolean | undefined,
    refetch,
  }
}

// ── Deposit tab ──────────────────────────────────────────────────────────────

function DepositTab({ address }: { address: Address }) {
  const [amount, setAmount] = useState('')
  const [depositHash, setDepositHash] = useState<`0x${string}` | undefined>()
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const { data: usdcBalance, refetch: refetchBalance } = useUsdcBalance(address)
  const { needsApproval, approve, isApproving, refetch: refetchAllowance } =
    useUsdcApprove(address, fujiAddresses.riskVault)
  const { totalManagedAssets, totalShares, myShares, refetch: refetchVault } = useVaultStats(address)

  const parsedAmount = parseUsdc(amount)
  const insufficientBalance = usdcBalance !== undefined && parsedAmount > usdcBalance

  const estimatedShares =
    parsedAmount > 0n
      ? totalManagedAssets && totalShares && totalManagedAssets > 0n
        ? (parsedAmount * totalShares) / totalManagedAssets
        : parsedAmount
      : 0n

  const { writeContractAsync, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: depositHash })

  useEffect(() => {
    if (isSuccess) {
      setSuccess(true)
      setAmount('')
      refetchBalance()
      refetchVault()
    }
  }, [isSuccess, refetchBalance, refetchVault])

  async function handleApprove() {
    setError('')
    try {
      await approve(parsedAmount)
    } catch (err) {
      setError(getErrMsg(err))
    }
  }

  async function handleDeposit() {
    setError('')
    setSuccess(false)
    try {
      const hash = await writeContractAsync({
        address: fujiAddresses.riskVault,
        abi: riskVaultAbi,
        functionName: 'deposit',
        args: [parsedAmount],
      })
      setDepositHash(hash)
    } catch (err) {
      setError(getErrMsg(err))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between text-sm">
        <span style={{ color: '#5a6478' }}>Your USDC balance</span>
        <span className="font-medium" style={{ color: '#3b8ef3' }}>${formatUsdc(usdcBalance)}</span>
      </div>
      <div className="flex justify-between text-sm">
        <span style={{ color: '#5a6478' }}>Your shares</span>
        <span className="font-medium" style={{ color: '#e8ecf4' }}>{formatUsdc(myShares)}</span>
      </div>

      <div className="space-y-1.5">
        <Label>Deposit amount (USDC)</Label>
        <div className="flex gap-2">
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={amount}
            onChange={(e) => { setAmount(e.target.value); setSuccess(false) }}
          />
          {usdcBalance && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAmount((Number(usdcBalance) / 1_000_000).toFixed(6))}
            >
              Max
            </Button>
          )}
        </div>
        {insufficientBalance && (
          <p className="text-xs" style={{ color: '#e05c6b' }}>Insufficient USDC balance.</p>
        )}
      </div>

      {parsedAmount > 0n && (
        <div className="rounded-lg p-3 text-sm space-y-1" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #1e2530' }}>
          <div className="flex justify-between">
            <span style={{ color: '#5a6478' }}>You deposit</span>
            <span style={{ color: '#e8ecf4' }}>${formatUsdc(parsedAmount)} USDC</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: '#5a6478' }}>Estimated shares</span>
            <span style={{ color: '#3b8ef3' }}>{formatUsdc(estimatedShares)}</span>
          </div>
        </div>
      )}

      {success ? (
        <div
          className="rounded-lg p-3 text-sm"
          style={{ border: '1px solid rgba(46,204,143,0.3)', background: 'rgba(46,204,143,0.08)' }}
        >
          <p style={{ color: '#2ecc8f' }}>Deposit successful! Shares credited to your account.</p>
        </div>
      ) : needsApproval(parsedAmount) && parsedAmount > 0n ? (
        <Button
          onClick={handleApprove}
          disabled={isApproving || parsedAmount === 0n || insufficientBalance}
          className="w-full"
          variant="secondary"
        >
          {isApproving ? 'Approving USDC…' : `Approve $${formatUsdc(parsedAmount)} USDC`}
        </Button>
      ) : (
        <Button
          onClick={handleDeposit}
          disabled={isPending || isConfirming || parsedAmount === 0n || insufficientBalance}
          className="w-full"
        >
          {isPending ? 'Confirm in wallet…' : isConfirming ? 'Depositing…' : 'Deposit'}
        </Button>
      )}

      {error && (
        <p
          className="text-sm rounded p-2"
          style={{ color: '#e05c6b', border: '1px solid rgba(224,92,107,0.2)', background: 'rgba(224,92,107,0.08)' }}
        >
          {error}
        </p>
      )}
    </div>
  )
}

// ── Withdraw tab ──────────────────────────────────────────────────────────────

function WithdrawTab({ address }: { address: Address }) {
  const [shareAmount, setShareAmount] = useState('')
  const [withdrawHash, setWithdrawHash] = useState<`0x${string}` | undefined>()
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const { myShares, myQueuedShares, hasPendingWithdrawal, refetch: refetchVault } =
    useVaultStats(address)

  const parsedShares = parseShares(shareAmount)
  const availableShares =
    myShares !== undefined && myQueuedShares !== undefined
      ? myShares - myQueuedShares
      : undefined
  const exceedsAvailable = availableShares !== undefined && parsedShares > availableShares

  const { data: previewData } = useReadContracts({
    contracts: [
      { address: fujiAddresses.riskVault, abi: riskVaultAbi, functionName: 'previewRedeem' as const, args: [parsedShares] as const },
      { address: fujiAddresses.riskVault, abi: riskVaultAbi, functionName: 'previewRedeemFree' as const, args: [parsedShares] as const },
    ],
    query: { enabled: parsedShares > 0n },
  })

  const previewRedeem = previewData?.[0]?.result as bigint | undefined
  const previewRedeemFree = previewData?.[1]?.result as bigint | undefined
  const lockedAmount =
    previewRedeem !== undefined && previewRedeemFree !== undefined
      ? previewRedeem - previewRedeemFree
      : undefined
  const willBeQueued = lockedAmount !== undefined && lockedAmount > 0n

  const { writeContractAsync, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: withdrawHash })

  useEffect(() => {
    if (isSuccess) {
      setSuccess(true)
      setShareAmount('')
      refetchVault()
    }
  }, [isSuccess, refetchVault])

  async function handleWithdraw() {
    setError('')
    setSuccess(false)
    try {
      const hash = await writeContractAsync({
        address: fujiAddresses.riskVault,
        abi: riskVaultAbi,
        functionName: 'withdraw',
        args: [parsedShares],
      })
      setWithdrawHash(hash)
    } catch (err) {
      setError(getErrMsg(err))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between text-sm">
        <span style={{ color: '#5a6478' }}>Your shares</span>
        <span className="font-medium" style={{ color: '#e8ecf4' }}>{formatUsdc(myShares)}</span>
      </div>
      {myQueuedShares !== undefined && myQueuedShares > 0n && (
        <div className="flex justify-between text-sm">
          <span style={{ color: '#5a6478' }}>Queued shares</span>
          <span style={{ color: '#f5c842' }}>{formatUsdc(myQueuedShares)} (pending withdrawal)</span>
        </div>
      )}
      {hasPendingWithdrawal && (
        <div
          className="rounded-lg p-2 text-xs"
          style={{ border: '1px solid rgba(245,200,66,0.3)', background: 'rgba(245,200,66,0.08)', color: '#f5c842' }}
        >
          You have a pending withdrawal request in the queue.
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Shares to withdraw</Label>
        <div className="flex gap-2">
          <Input
            type="number"
            min="0"
            step="0.000001"
            placeholder="0.000000"
            value={shareAmount}
            onChange={(e) => { setShareAmount(e.target.value); setSuccess(false) }}
          />
          {availableShares !== undefined && availableShares > 0n && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShareAmount((Number(availableShares) / 1_000_000).toFixed(6))}
            >
              Max
            </Button>
          )}
        </div>
        {exceedsAvailable && (
          <p className="text-xs" style={{ color: '#e05c6b' }}>
            Exceeds available shares ({formatUsdc(availableShares)}).
          </p>
        )}
      </div>

      {parsedShares > 0n && previewRedeem !== undefined && (
        <div className="rounded-lg p-3 text-sm space-y-1" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #1e2530' }}>
          <div className="flex justify-between">
            <span style={{ color: '#5a6478' }}>Total redemption value</span>
            <span style={{ color: '#e8ecf4' }}>${formatUsdc(previewRedeem)} USDC</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: '#5a6478' }}>Immediately available</span>
            <span style={{ color: '#2ecc8f' }}>${formatUsdc(previewRedeemFree)} USDC</span>
          </div>
          {willBeQueued && (
            <div className="flex justify-between">
              <span style={{ color: '#f5c842' }}>Queued (locked capital)</span>
              <span style={{ color: '#f5c842' }}>${formatUsdc(lockedAmount)} USDC</span>
            </div>
          )}
          {willBeQueued && (
            <p className="text-xs pt-1" style={{ color: '#5a6478' }}>
              Part of this withdrawal will be queued and processed after upcoming flight settlements.
            </p>
          )}
        </div>
      )}

      {success ? (
        <div
          className="rounded-lg p-3 text-sm"
          style={{ border: '1px solid rgba(46,204,143,0.3)', background: 'rgba(46,204,143,0.08)' }}
        >
          <p style={{ color: '#2ecc8f' }}>
            {willBeQueued
              ? 'Withdrawal submitted. Queued portion will be credited after settlement.'
              : 'Withdrawal processed. Check your collectable balance below.'}
          </p>
        </div>
      ) : (
        <Button
          onClick={handleWithdraw}
          disabled={isPending || isConfirming || parsedShares === 0n || exceedsAvailable || hasPendingWithdrawal}
          className="w-full"
        >
          {isPending ? 'Confirm in wallet…' : isConfirming ? 'Processing…' : 'Withdraw'}
        </Button>
      )}

      {error && (
        <p
          className="text-sm rounded p-2"
          style={{ color: '#e05c6b', border: '1px solid rgba(224,92,107,0.2)', background: 'rgba(224,92,107,0.08)' }}
        >
          {error}
        </p>
      )}
    </div>
  )
}

// ── Collect section ───────────────────────────────────────────────────────────

function CollectSection({ address }: { address: Address }) {
  const [collectHash, setCollectHash] = useState<`0x${string}` | undefined>()
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const { myClaimableBalance, refetch } = useVaultStats(address)

  const { writeContractAsync, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: collectHash })

  useEffect(() => {
    if (isSuccess) {
      setSuccess(true)
      refetch()
    }
  }, [isSuccess, refetch])

  if (!myClaimableBalance || myClaimableBalance === 0n) return null

  return (
    <div
      className="rounded-xl p-5 space-y-3"
      style={{ border: '1px solid rgba(46,204,143,0.3)', background: 'rgba(46,204,143,0.06)' }}
    >
      <div>
        <p className="font-semibold" style={{ color: '#2ecc8f' }}>Funds ready to collect</p>
        <p className="text-2xl font-bold mt-1" style={{ color: '#2ecc8f' }}>
          ${formatUsdc(myClaimableBalance)} USDC
        </p>
        <p className="text-xs mt-0.5" style={{ color: '#5a6478' }}>
          Your withdrawal has been processed and is ready to receive.
        </p>
      </div>
      {success ? (
        <p className="text-sm font-medium" style={{ color: '#2ecc8f' }}>
          Collected! USDC sent to your wallet.
        </p>
      ) : (
        <Button
          onClick={async () => {
            setError('')
            try {
              const hash = await writeContractAsync({
                address: fujiAddresses.riskVault,
                abi: riskVaultAbi,
                functionName: 'collect',
              })
              setCollectHash(hash)
            } catch (err) {
              setError(getErrMsg(err))
            }
          }}
          disabled={isPending || isConfirming}
          className="font-semibold"
          style={{ background: '#2ecc8f', color: '#080a0f' }}
        >
          {isPending ? 'Confirm in wallet…' : isConfirming ? 'Processing…' : `Collect $${formatUsdc(myClaimableBalance)} USDC`}
        </Button>
      )}
      {error && <p className="text-sm" style={{ color: '#e05c6b' }}>{error}</p>}
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function VaultPage() {
  const { address } = useAccount()

  const {
    totalManagedAssets,
    totalShares,
    lockedCapital,
    freeCapital,
    myShares,
    myClaimableBalance,
  } = useVaultStats(address)

  if (!address) {
    return (
      <div className="space-y-6" style={{ animation: 'fade-in-up 0.4s ease both' }}>
        <h1 className="text-3xl font-bold tracking-tight" style={{ color: '#e8ecf4' }}>Vault</h1>
        <div className="max-w-sm">
          <ConnectPrompt />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8" style={{ animation: 'fade-in-up 0.4s ease both' }}>
      <div>
        <h1 className="text-3xl font-bold tracking-tight" style={{ color: '#e8ecf4' }}>Vault</h1>
        <p className="mt-1" style={{ color: '#5a6478' }}>
          Deposit USDC to back flights and earn yield from on-time premiums.
        </p>
      </div>

      {/* Vault-level stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'TVL', value: `$${formatUsdc(totalManagedAssets)}`, color: '#3b8ef3' },
          {
            label: 'Share Price',
            value: totalManagedAssets !== undefined && totalShares !== undefined
              ? formatSharePrice(totalManagedAssets, totalShares)
              : '—',
            color: '#e8ecf4',
          },
          { label: 'Free Capital', value: `$${formatUsdc(freeCapital)}`, color: '#2ecc8f' },
          { label: 'Locked', value: `$${formatUsdc(lockedCapital)}`, color: '#f5c842' },
        ].map(({ label, value, color }, i) => (
          <div
            key={label}
            className="rounded-xl p-4"
            style={{
              border: '1px solid #1e2530',
              background: '#0f1218',
              animation: 'fade-in-up 0.4s ease both',
              animationDelay: `${i * 50}ms`,
            }}
          >
            <p className="text-xs font-medium uppercase tracking-wide" style={{ color: '#5a6478' }}>{label}</p>
            <p className="text-xl font-bold mt-1" style={{ color }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Per-user summary */}
      <div
        className="grid grid-cols-2 gap-4 sm:grid-cols-3 rounded-xl p-4"
        style={{ border: '1px solid #1e2530', background: '#0f1218' }}
      >
        <div>
          <p className="text-xs" style={{ color: '#5a6478' }}>Your shares</p>
          <p className="text-lg font-semibold" style={{ color: '#e8ecf4' }}>{formatUsdc(myShares)}</p>
        </div>
        <div>
          <p className="text-xs" style={{ color: '#5a6478' }}>Estimated value</p>
          <p className="text-lg font-semibold" style={{ color: '#3b8ef3' }}>
            ${totalManagedAssets !== undefined && totalShares !== undefined && myShares !== undefined && totalShares > 0n
              ? formatUsdc((myShares * totalManagedAssets) / totalShares)
              : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs" style={{ color: '#5a6478' }}>Projected APY</p>
          <p className="text-lg font-semibold" style={{ color: '#2ecc8f' }}>37%</p>
        </div>
      </div>

      {/* Collect section */}
      {myClaimableBalance !== undefined && myClaimableBalance > 0n && (
        <CollectSection address={address} />
      )}

      {/* Deposit / Withdraw tabs */}
      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="deposit">
            <TabsList className="w-full">
              <TabsTrigger value="deposit" className="flex-1">Deposit</TabsTrigger>
              <TabsTrigger value="withdraw" className="flex-1">Withdraw</TabsTrigger>
            </TabsList>
            <div className="mt-6">
              <TabsContent value="deposit">
                <DepositTab address={address} />
              </TabsContent>
              <TabsContent value="withdraw">
                <WithdrawTab address={address} />
              </TabsContent>
            </div>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
