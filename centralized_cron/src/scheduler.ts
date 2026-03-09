import cron from 'node-cron'
import { config } from './config'
import { onCronTick } from './workflow'

export function startScheduler() {
  console.log(`Starting centralized_cron scheduler with CRON_SCHEDULE="${config.CRON_SCHEDULE}"`)

  // Run once on startup for faster feedback.
  void onCronTick().catch((err) => {
    console.error('Initial tick failed', err)
  })

  cron.schedule(config.CRON_SCHEDULE, () => {
    void onCronTick().catch((err) => {
      console.error('Scheduled tick failed', err)
    })
  })
}

