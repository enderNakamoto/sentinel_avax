// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console2.sol";

import "../src/OracleAggregator.sol";
import "../src/Controller.sol";

/// @notice Second-phase wiring script. Run AFTER the CRE workflow has been deployed
///         and its forwarder/signer address is known.
///
/// Performs two one-time calls:
///   1. OracleAggregator.setOracle(creForwarder)   — locks the CRE workflow as the sole
///                                                    status writer; cannot be changed.
///   2. Controller.setCreWorkflow(creForwarder)     — owner-updatable; gates checkAndSettle().
///
/// Required .env vars (in addition to PRIVATE_KEY):
///   CRE_WORKFLOW_ADDRESS       — forwarder/signer address from `cre workflow info <id>`
///   ORACLE_AGGREGATOR_ADDRESS  — address logged by Deploy.s.sol
///   CONTROLLER_ADDRESS         — address logged by Deploy.s.sol
///
/// Usage (Fuji):
///   forge script script/WireCRE.s.sol:WireCREScript \
///     --rpc-url avax_fuji \
///     --chain-id 43113 \
///     --broadcast \
///     -vvvv
contract WireCREScript is Script {
    function run() external {
        uint256 deployerKey  = vm.envUint("PRIVATE_KEY");
        address creForwarder = vm.envAddress("CRE_WORKFLOW_ADDRESS");
        address oracleAddr   = vm.envAddress("ORACLE_AGGREGATOR_ADDRESS");
        address ctrlAddr     = vm.envAddress("CONTROLLER_ADDRESS");

        vm.startBroadcast(deployerKey);

        // One-time setter — reverts if oracle is already set.
        OracleAggregator(oracleAddr).setOracle(creForwarder);

        // Owner-updatable — safe to re-run if workflow is redeployed.
        Controller(ctrlAddr).setCreWorkflow(creForwarder);

        vm.stopBroadcast();

        console2.log("");
        console2.log("=================================================");
        console2.log(" Sentinel Protocol -- CRE Wiring Summary");
        console2.log("=================================================");
        console2.log("OracleAggregator.authorizedOracle =", creForwarder);
        console2.log("Controller.creWorkflowAddress     =", creForwarder);
        console2.log("-------------------------------------------------");
        console2.log("System fully operational. The CRE workflow may");
        console2.log("now write statuses and call checkAndSettle().");
        console2.log("=================================================");
    }
}
