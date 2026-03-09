'use client'

import { useState, useEffect } from 'react'
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { fujiAddresses, mockUsdcAbi } from '@/contracts'
import type { Address } from 'viem'

export function useUsdcApprove(owner: Address | undefined, spender: Address) {
  const [approveTxHash, setApproveTxHash] = useState<`0x${string}` | undefined>()

  const { data: allowance, refetch } = useReadContract({
    address: fujiAddresses.mockUsdc,
    abi: mockUsdcAbi,
    functionName: 'allowance',
    args: owner ? [owner, spender] : undefined,
    query: { enabled: !!owner },
  })

  const { writeContractAsync, isPending: isWritePending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: approveTxHash })

  useEffect(() => {
    if (isSuccess) {
      refetch()
      setApproveTxHash(undefined)
    }
  }, [isSuccess, refetch])

  function needsApproval(amount: bigint): boolean {
    return allowance === undefined || allowance < amount
  }

  async function approve(amount: bigint) {
    const hash = await writeContractAsync({
      address: fujiAddresses.mockUsdc,
      abi: mockUsdcAbi,
      functionName: 'approve',
      args: [spender, amount],
    })
    setApproveTxHash(hash)
    return hash
  }

  return {
    allowance,
    needsApproval,
    approve,
    isApproving: isWritePending || isConfirming,
    refetch,
  }
}
