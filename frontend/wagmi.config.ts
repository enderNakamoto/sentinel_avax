import { defineConfig } from '@wagmi/cli'
import { foundry } from '@wagmi/cli/plugins'

export default defineConfig({
  out: 'src/generated.ts',
  plugins: [
    foundry({
      project: '../contracts',
      include: [
        'GovernanceModule.json',
        'RiskVault.json',
        'FlightPool.json',
        'Controller.json',
        'OracleAggregator.json',
        'RecoveryPool.json',
        'MockUSDC.json',
      ],
    }),
  ],
})
