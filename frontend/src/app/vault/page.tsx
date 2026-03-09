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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

  // Estimated shares: amount * totalShares / totalManagedAssets (or 1:1 if empty)
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
        <span className="text-muted-foreground">Your USDC balance</span>
        <span className="font-medium">${formatUsdc(usdcBalance)}</span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Your shares</span>
        <span className="font-medium">{formatUsdc(myShares)}</span>
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
          <p className="text-xs text-destructive">Insufficient USDC balance.</p>
        )}
      </div>

      {parsedAmount > 0n && (
        <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">You deposit</span>
            <span>${formatUsdc(parsedAmount)} USDC</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Estimated shares</span>
            <span>{formatUsdc(estimatedShares)}</span>
          </div>
        </div>
      )}

      {success ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          Deposit successful! Shares credited to your account.
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
        <p className="text-sm text-destructive rounded border border-destructive/20 bg-destructive/5 p-2">
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

  // Preview redeems for entered share amount
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
        <span className="text-muted-foreground">Your shares</span>
        <span className="font-medium">{formatUsdc(myShares)}</span>
      </div>
      {myQueuedShares !== undefined && myQueuedShares > 0n && (
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Queued shares</span>
          <span className="text-amber-600">{formatUsdc(myQueuedShares)} (pending withdrawal)</span>
        </div>
      )}
      {hasPendingWithdrawal && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
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
          <p className="text-xs text-destructive">
            Exceeds available shares ({formatUsdc(availableShares)}).
          </p>
        )}
      </div>

      {parsedShares > 0n && previewRedeem !== undefined && (
        <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total redemption value</span>
            <span>${formatUsdc(previewRedeem)} USDC</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Immediately available</span>
            <span>${formatUsdc(previewRedeemFree)} USDC</span>
          </div>
          {willBeQueued && (
            <div className="flex justify-between text-amber-600">
              <span>Queued (locked capital)</span>
              <span>${formatUsdc(lockedAmount)} USDC</span>
            </div>
          )}
          {willBeQueued && (
            <p className="text-xs text-amber-700 pt-1">
              Part of this withdrawal will be queued and processed after upcoming flight settlements.
            </p>
          )}
        </div>
      )}

      {success ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          {willBeQueued
            ? 'Withdrawal submitted. Queued portion will be credited after settlement.'
            : 'Withdrawal processed. Check your collectable balance below.'}
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
        <p className="text-sm text-destructive rounded border border-destructive/20 bg-destructive/5 p-2">
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
    <div className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-3">
      <div>
        <p className="font-semibold text-green-900">Funds ready to collect</p>
        <p className="text-2xl font-bold text-green-700 mt-1">
          ${formatUsdc(myClaimableBalance)} USDC
        </p>
        <p className="text-xs text-green-700 mt-0.5">
          Your withdrawal has been processed and is ready to receive.
        </p>
      </div>
      {success ? (
        <p className="text-sm text-green-800 font-medium">
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
          className="bg-green-700 hover:bg-green-800 text-white"
        >
          {isPending ? 'Confirm in wallet…' : isConfirming ? 'Processing…' : `Collect $${formatUsdc(myClaimableBalance)} USDC`}
        </Button>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
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
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Vault</h1>
        <div className="max-w-sm">
          <ConnectPrompt />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Vault</h1>
        <p className="text-muted-foreground mt-1">
          Deposit USDC to back flights and earn yield from on-time premiums.
        </p>
      </div>

      {/* Vault-level stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">TVL</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">${formatUsdc(totalManagedAssets)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Share Price</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">
              {totalManagedAssets !== undefined && totalShares !== undefined
                ? formatSharePrice(totalManagedAssets, totalShares)
                : '—'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Free Capital</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">${formatUsdc(freeCapital)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Locked</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">${formatUsdc(lockedCapital)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Per-user summary */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 rounded-xl border p-4 bg-muted/30">
        <div>
          <p className="text-xs text-muted-foreground">Your shares</p>
          <p className="text-lg font-semibold">{formatUsdc(myShares)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Estimated value</p>
          <p className="text-lg font-semibold">
            ${totalManagedAssets !== undefined && totalShares !== undefined && myShares !== undefined && totalShares > 0n
              ? formatUsdc((myShares * totalManagedAssets) / totalShares)
              : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Projected APY</p>
          <p className="text-lg font-semibold text-green-600">37%</p>
        </div>
      </div>

      {/* Collect section (shown when funds are ready) */}
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
