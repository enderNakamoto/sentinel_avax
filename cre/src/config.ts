/**
 * Contract addresses and network configuration for the Sentinel Protocol CRE workflow.
 *
 * These placeholders are overridden at simulation time with local Anvil addresses,
 * and at deployment time with Fuji/mainnet addresses from Deploy.s.sol output.
 *
 * To update for local simulation:
 *   1. Run `forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast`
 *   2. Replace the PLACEHOLDER values below with the logged addresses.
 *
 * To update for Fuji testnet deployment: replace with the addresses from the Fuji broadcast.
 */

/** AeroAPI base URL. Override for local testing with a mock server if needed. */
export const AEROAPI_BASE_URL = "https://aeroapi.flightaware.com/aeroapi"

/** OracleAggregator contract address (deployed by Deploy.s.sol) */
export const ORACLE_AGGREGATOR_ADDRESS =
  "0x14cF0CD23B5A444f1e57765d12f21ee7F1e8a2c3" // Fuji testnet

/** Controller contract address (deployed by Deploy.s.sol) */
export const CONTROLLER_ADDRESS =
  "0xd67c1b05Cdfa20aa23C295a2c24310763fED4888" // Fuji testnet

/** RiskVault contract address (deployed by Deploy.s.sol) */
export const RISK_VAULT_ADDRESS =
  "0x3E65cABB59773a7D21132dAAa587E7Fc777d427C" // Fuji testnet

/**
 * CRE network selector name for Avalanche Fuji testnet.
 * Verify against `cre network list` output before deploying.
 * For local Anvil simulation, this is still required by the SDK (uses a local fork).
 */
export const CHAIN_SELECTOR_NAME = "avalanche-testnet-fuji"

/**
 * Whether this deployment is targeting a testnet.
 * Set to false for mainnet deployment.
 */
export const IS_TESTNET = true

/** Cron schedule: every 10 minutes */
export const CRON_SCHEDULE = "0 */10 * * * *"
