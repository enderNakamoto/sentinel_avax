// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console2.sol";

import "../src/MockUSDC.sol";
import "../src/GovernanceModule.sol";
import "../src/RecoveryPool.sol";
import "../src/OracleAggregator.sol";
import "../src/RiskVault.sol";
import "../src/Controller.sol";

/// @notice Deploys all six Sentinel Protocol contracts to Avalanche Fuji (or mainnet).
///
/// Steps performed:
///   1. Deploy MockUSDC
///   2. Deploy GovernanceModule
///   3. Deploy RecoveryPool
///   4. Deploy OracleAggregator
///   5. Deploy RiskVault  (controller = address(0) placeholder)
///   6. Deploy Controller
///   7. Wire OracleAggregator.setController(controller)   — one-time setter, locks forever
///   8. Wire RiskVault.setController(controller)          — one-time setter, locks forever
///
/// After deploying the CRE workflow, run WireCRE.s.sol to complete wiring.
///
/// Usage (Fuji):
///   forge script script/Deploy.s.sol:DeployScript \
///     --rpc-url avax_fuji \
///     --chain-id 43113 \
///     --broadcast \
///     --verify \
///     --verifier etherscan \
///     --verifier-url https://api.routescan.io/v2/network/testnet/evm/43113/etherscan \
///     --etherscan-api-key $SNOWTRACE_API_KEY \
///     -vvvv
///
/// Add --slow if you encounter nonce errors on Fuji.
contract DeployScript is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer    = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        // ── 1. MockUSDC ───────────────────────────────────────────────────────
        MockUSDC usdc = new MockUSDC();

        // ── 2. GovernanceModule ───────────────────────────────────────────────
        GovernanceModule governance = new GovernanceModule(deployer);

        // ── 3. RecoveryPool ───────────────────────────────────────────────────
        RecoveryPool recoveryPool = new RecoveryPool(address(usdc));

        // ── 4. OracleAggregator ───────────────────────────────────────────────
        OracleAggregator oracleAgg = new OracleAggregator();

        // ── 5. RiskVault (controller wired in step 8) ─────────────────────────
        RiskVault riskVault = new RiskVault(address(usdc), address(0));

        // ── 6. Controller ─────────────────────────────────────────────────────
        Controller controller = new Controller(
            address(usdc),
            address(riskVault),
            address(oracleAgg),
            address(governance),
            address(recoveryPool)
        );

        // ── 7. Wire OracleAggregator → Controller ─────────────────────────────
        oracleAgg.setController(address(controller));

        // ── 8. Wire RiskVault → Controller ────────────────────────────────────
        riskVault.setController(address(controller));

        vm.stopBroadcast();

        // ── Print deployment summary ──────────────────────────────────────────
        console2.log("");
        console2.log("=================================================");
        console2.log(" Sentinel Protocol -- Deployment Summary");
        console2.log("=================================================");
        console2.log("Deployer:          ", deployer);
        console2.log("-------------------------------------------------");
        console2.log("MockUSDC:          ", address(usdc));
        console2.log("GovernanceModule:  ", address(governance));
        console2.log("RecoveryPool:      ", address(recoveryPool));
        console2.log("OracleAggregator:  ", address(oracleAgg));
        console2.log("RiskVault:         ", address(riskVault));
        console2.log("Controller:        ", address(controller));
        console2.log("-------------------------------------------------");
        console2.log("Wiring complete:");
        console2.log("  OracleAggregator.authorizedController =", address(controller));
        console2.log("  RiskVault.controller                  =", address(controller));
        console2.log("-------------------------------------------------");
        console2.log("Pending (run WireCRE.s.sol after CRE deploy):");
        console2.log("  OracleAggregator.setOracle(<cre_forwarder>)");
        console2.log("  Controller.setCreWorkflow(<cre_forwarder>)");
        console2.log("=================================================");
        console2.log("");
        console2.log("Add these to your .env before running WireCRE:");
        console2.log("  ORACLE_AGGREGATOR_ADDRESS=", address(oracleAgg));
        console2.log("  CONTROLLER_ADDRESS=       ", address(controller));
    }
}
