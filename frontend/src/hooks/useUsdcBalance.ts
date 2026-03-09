'use client'

import { useReadContract } from 'wagmi'
import { fujiAddresses, mockUsdcAbi } from '@/contracts'
import type { Address } from 'viem'

export function useUsdcBalance(address: Address | undefined) {
  return useReadContract({
    address: fujiAddresses.mockUsdc,
    abi: mockUsdcAbi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })
}
