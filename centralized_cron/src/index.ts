import { workflowAddress } from './chain/clients'
import { startScheduler } from './scheduler'

console.log('Sentinel Protocol centralized_cron service starting…')
console.log(`Workflow signer address: ${workflowAddress}`)

startScheduler()

