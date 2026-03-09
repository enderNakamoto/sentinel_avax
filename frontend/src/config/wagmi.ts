import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { avalanche, avalancheFuji } from 'wagmi/chains'

export const config = getDefaultConfig({
  appName: 'Sentinel Protocol',
  projectId: process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ?? '',
  chains: [avalancheFuji, avalanche],
  ssr: true,
})
