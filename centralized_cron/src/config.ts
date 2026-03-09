import 'dotenv/config'
import { z } from 'zod'

const configSchema = z.object({
  AVAX_FUJI_RPC_URL: z.string().url(),
  WORKFLOW_PRIVATE_KEY: z
    .string()
    .regex(/^0x[0-9a-fA-F]+$/, 'WORKFLOW_PRIVATE_KEY must be a 0x-prefixed hex string'),
  ORACLE_AGGREGATOR_ADDRESS: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, 'ORACLE_AGGREGATOR_ADDRESS must be a 20-byte hex address'),
  CONTROLLER_ADDRESS: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, 'CONTROLLER_ADDRESS must be a 20-byte hex address'),
  AEROAPI_KEY: z.string().min(1, 'AEROAPI_KEY is required'),
  AEROAPI_BASE_URL: z.string().url(),
  CRON_SCHEDULE: z.string().default('*/10 * * * *'),
})

const parsed = configSchema.safeParse({
  AVAX_FUJI_RPC_URL: process.env.AVAX_FUJI_RPC_URL,
  WORKFLOW_PRIVATE_KEY: process.env.WORKFLOW_PRIVATE_KEY,
  ORACLE_AGGREGATOR_ADDRESS: process.env.ORACLE_AGGREGATOR_ADDRESS,
  CONTROLLER_ADDRESS: process.env.CONTROLLER_ADDRESS,
  AEROAPI_KEY: process.env.AEROAPI_KEY,
  AEROAPI_BASE_URL: process.env.AEROAPI_BASE_URL ?? 'https://aeroapi.flightaware.com/aeroapi',
  CRON_SCHEDULE: process.env.CRON_SCHEDULE ?? '*/10 * * * *',
})

if (!parsed.success) {
  console.error('Invalid centralized_cron configuration:')
  console.error(parsed.error.format())
  // Fail fast so misconfiguration is obvious.
  process.exit(1)
}

export const config = parsed.data

