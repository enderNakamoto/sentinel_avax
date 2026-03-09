import type { Address } from 'viem'

export const FUJI_CHAIN_ID = 43113

export const addresses: Record<number, {
  mockUsdc: Address
  governanceModule: Address
  recoveryPool: Address
  oracleAggregator: Address
  riskVault: Address
  controller: Address
}> = {
  [FUJI_CHAIN_ID]: {
    mockUsdc: (process.env.NEXT_PUBLIC_MOCK_USDC_ADDRESS ?? '0x0') as Address,
    governanceModule: (process.env.NEXT_PUBLIC_GOVERNANCE_MODULE_ADDRESS ?? '0x0') as Address,
    recoveryPool: (process.env.NEXT_PUBLIC_RECOVERY_POOL_ADDRESS ?? '0x0') as Address,
    oracleAggregator: (process.env.NEXT_PUBLIC_ORACLE_AGGREGATOR_ADDRESS ?? '0x0') as Address,
    riskVault: (process.env.NEXT_PUBLIC_RISK_VAULT_ADDRESS ?? '0x0') as Address,
    controller: (process.env.NEXT_PUBLIC_CONTROLLER_ADDRESS ?? '0x0') as Address,
  },
}

export const fujiAddresses = addresses[FUJI_CHAIN_ID]
