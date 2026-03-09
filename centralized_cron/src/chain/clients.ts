import { createPublicClient, createWalletClient, http } from 'viem'
import { avalancheFuji } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { config } from '../config'

export const publicClient = createPublicClient({
  chain: avalancheFuji,
  transport: http(config.AVAX_FUJI_RPC_URL),
})

const account = privateKeyToAccount(config.WORKFLOW_PRIVATE_KEY as `0x${string}`)

export const walletClient = createWalletClient({
  chain: avalancheFuji,
  transport: http(config.AVAX_FUJI_RPC_URL),
  account,
})

export const workflowAddress = account.address

