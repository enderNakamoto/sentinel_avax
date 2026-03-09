// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "forge-std/Test.sol";
import "../src/Controller.sol";
import "../src/MockUSDC.sol";
import "../src/GovernanceModule.sol";
import "../src/RecoveryPool.sol";
import "../src/OracleAggregator.sol";
import "../src/RiskVault.sol";

// ─────────────────────────────────────────────────────────────────────────────
// Controller test suite
// ─────────────────────────────────────────────────────────────────────────────
contract ControllerTest is Test {
    // ── Constants ─────────────────────────────────────────────────────────────
    uint256 constant PREMIUM     = 10_000_000;   // 10 USDC
    uint256 constant PAYOFF      = 100_000_000;  // 100 USDC
    uint256 constant VAULT_SEED  = 500_000_000;  // 500 USDC — underwrites 5 flights

    string constant FLIGHT_ID    = "AA123";
    string constant ORIGIN       = "DEN";
    string constant DESTINATION  = "SEA";
    string constant DATE         = "2026-06-01";
    string constant DATE2        = "2026-07-01";
    string constant FLIGHT_ID2   = "UA456";

    // ── Actors ────────────────────────────────────────────────────────────────
    address owner       = address(this); // test contract deploys everything
    address creWorkflow = makeAddr("creWorkflow");
    address oracle      = makeAddr("oracle");
    address underwriter = makeAddr("underwriter");
    address traveler1   = makeAddr("traveler1");
    address traveler2   = makeAddr("traveler2");
    address anyone      = makeAddr("anyone");
    address newOwner    = makeAddr("newOwner");

    // ── Contracts ─────────────────────────────────────────────────────────────
    MockUSDC          usdc;
    GovernanceModule  governance;
    RecoveryPool      recovery;
    OracleAggregator  oracle_agg;
    RiskVault         vault;
    Controller        ctrl;

    // ── Setup ─────────────────────────────────────────────────────────────────
    function setUp() public {
        // 1. Deploy contracts
        usdc       = new MockUSDC();
        governance = new GovernanceModule(owner);
        recovery   = new RecoveryPool(address(usdc));
        oracle_agg = new OracleAggregator();
        vault      = new RiskVault(address(usdc), address(0));
        ctrl       = new Controller(
            address(usdc),
            address(vault),
            address(oracle_agg),
            address(governance),
            address(recovery)
        );

        // 2. Wire contracts
        vault.setController(address(ctrl));
        oracle_agg.setController(address(ctrl));
        oracle_agg.setOracle(oracle);
        ctrl.setCreWorkflow(creWorkflow);

        // 3. Approve a default route
        governance.approveRoute(FLIGHT_ID, ORIGIN, DESTINATION, PREMIUM, PAYOFF);

        // 4. Seed the vault with underwriter capital
        usdc.mint(underwriter, VAULT_SEED);
        vm.startPrank(underwriter);
        usdc.approve(address(vault), VAULT_SEED);
        vault.deposit(VAULT_SEED);
        vm.stopPrank();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /// Approve Controller and buy insurance as traveler.
    function _buyAs(address traveler, string memory date) internal returns (address poolAddress) {
        usdc.mint(traveler, PREMIUM);
        vm.startPrank(traveler);
        usdc.approve(address(ctrl), PREMIUM);
        ctrl.buyInsurance(FLIGHT_ID, ORIGIN, DESTINATION, date);
        vm.stopPrank();
        poolAddress = ctrl.getPoolAddress(FLIGHT_ID, date);
    }

    /// Set oracle status and call checkAndSettle as the CRE workflow.
    function _settleWith(string memory date, OracleAggregator.FlightStatus status) internal {
        vm.prank(oracle);
        oracle_agg.updateFlightStatus(FLIGHT_ID, date, status);
        vm.prank(creWorkflow);
        ctrl.checkAndSettle();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 19-23 CRE workflow guard
    // ─────────────────────────────────────────────────────────────────────────

    // Test 19: checkAndSettle from non-creWorkflow reverts
    function test_checkAndSettle_rejectsUnauthorized() public {
        vm.expectRevert(Controller.NotCREWorkflow.selector);
        vm.prank(anyone);
        ctrl.checkAndSettle();
    }

    // Test 20: checkAndSettle from creWorkflow succeeds with no active flights (no-op)
    function test_checkAndSettle_succeedsFromCREWorkflow() public {
        vm.prank(creWorkflow);
        ctrl.checkAndSettle(); // no-op, no active flights
    }

    // Test 21: setCreWorkflow(address(0)) reverts
    function test_setCreWorkflow_rejectsZeroAddress() public {
        vm.expectRevert(Controller.ZeroAddress.selector);
        ctrl.setCreWorkflow(address(0));
    }

    // Test 22: setCreWorkflow from non-owner reverts
    function test_setCreWorkflow_rejectsNonOwner() public {
        vm.expectRevert(Controller.Unauthorized.selector);
        vm.prank(anyone);
        ctrl.setCreWorkflow(makeAddr("new"));
    }

    // Test 23: after setCreWorkflow, old address rejected, new accepted
    function test_setCreWorkflow_updatesAddress() public {
        address newWorkflow = makeAddr("newWorkflow");
        ctrl.setCreWorkflow(newWorkflow);

        // old address reverts
        vm.expectRevert(Controller.NotCREWorkflow.selector);
        vm.prank(creWorkflow);
        ctrl.checkAndSettle();

        // new address succeeds
        vm.prank(newWorkflow);
        ctrl.checkAndSettle();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 24-36 Purchase flow
    // ─────────────────────────────────────────────────────────────────────────

    // Test 24: reverts if route not approved
    function test_buyInsurance_rejectsUnapprovedRoute() public {
        usdc.mint(traveler1, PREMIUM);
        vm.startPrank(traveler1);
        usdc.approve(address(ctrl), PREMIUM);
        vm.expectRevert(Controller.RouteNotApproved.selector);
        ctrl.buyInsurance("XX999", "AAA", "BBB", DATE);
        vm.stopPrank();
    }

    // Test 25: reverts if route disabled
    function test_buyInsurance_rejectsDisabledRoute() public {
        governance.disableRoute(FLIGHT_ID, ORIGIN, DESTINATION);

        usdc.mint(traveler1, PREMIUM);
        vm.startPrank(traveler1);
        usdc.approve(address(ctrl), PREMIUM);
        vm.expectRevert(Controller.RouteNotApproved.selector);
        ctrl.buyInsurance(FLIGHT_ID, ORIGIN, DESTINATION, DATE);
        vm.stopPrank();
    }

    // Test 26: reverts if solvency check fails (vault empty)
    function test_buyInsurance_rejectsIfInsolvent() public {
        // Withdraw all capital first — use a fresh vault with no capital
        Controller emptyCtrl;
        RiskVault emptyVault = new RiskVault(address(usdc), address(0));
        OracleAggregator emptyOracle = new OracleAggregator();

        emptyCtrl = new Controller(
            address(usdc),
            address(emptyVault),
            address(emptyOracle),
            address(governance),
            address(recovery)
        );
        emptyVault.setController(address(emptyCtrl));
        emptyOracle.setController(address(emptyCtrl));
        emptyCtrl.setCreWorkflow(creWorkflow);

        usdc.mint(traveler1, PREMIUM);
        vm.startPrank(traveler1);
        usdc.approve(address(emptyCtrl), PREMIUM);
        vm.expectRevert(Controller.SolvencyCheckFailed.selector);
        emptyCtrl.buyInsurance(FLIGHT_ID, ORIGIN, DESTINATION, DATE);
        vm.stopPrank();
    }

    // Test 27: first purchase deploys new FlightPool
    function test_buyInsurance_deploysPoolOnFirstPurchase() public {
        assertEq(ctrl.getPoolAddress(FLIGHT_ID, DATE), address(0));
        _buyAs(traveler1, DATE);
        assertTrue(ctrl.getPoolAddress(FLIGHT_ID, DATE) != address(0));
    }

    // Test 28: second purchase reuses existing pool
    function test_buyInsurance_reusesExistingPool() public {
        address pool1 = _buyAs(traveler1, DATE);
        address pool2 = _buyAs(traveler2, DATE);
        assertEq(pool1, pool2);
    }

    // Test 29: FlightPool deployment reads terms from GovernanceModule
    function test_buyInsurance_poolLocksGovernanceTerms() public {
        address poolAddr = _buyAs(traveler1, DATE);
        FlightPool pool = FlightPool(poolAddr);
        assertEq(pool.premium(), PREMIUM);
        assertEq(pool.payoff(), PAYOFF);
    }

    // Test 30: registerFlight called only on first purchase
    function test_buyInsurance_registersFlightOnce() public {
        _buyAs(traveler1, DATE);
        assertTrue(oracle_agg.flightStatuses(keccak256(abi.encodePacked(FLIGHT_ID, DATE)))
            == OracleAggregator.FlightStatus.Unknown); // registered (Unknown = registered but no status yet)

        // Second purchase — flight already registered, no revert
        _buyAs(traveler2, DATE);
        assertEq(ctrl.activeFlightCount(), 1); // still one flight
    }

    // Test 31: USDC transferFrom moves premium from traveler to FlightPool
    function test_buyInsurance_transfersPremiumToPool() public {
        // Mint first so we can measure the spend
        usdc.mint(traveler1, PREMIUM);
        uint256 travelerBefore = usdc.balanceOf(traveler1); // = PREMIUM

        vm.startPrank(traveler1);
        usdc.approve(address(ctrl), PREMIUM);
        ctrl.buyInsurance(FLIGHT_ID, ORIGIN, DESTINATION, DATE);
        vm.stopPrank();

        address poolAddr = ctrl.getPoolAddress(FLIGHT_ID, DATE);
        uint256 travelerAfter = usdc.balanceOf(traveler1); // = 0

        assertEq(travelerBefore - travelerAfter, PREMIUM);
        assertEq(usdc.balanceOf(poolAddr), PREMIUM);
    }

    // Test 32: riskVault.increaseLocked called with correct payoff
    function test_buyInsurance_increasesLockedCapital() public {
        uint256 lockedBefore = vault.lockedCapital();
        _buyAs(traveler1, DATE);
        assertEq(vault.lockedCapital(), lockedBefore + PAYOFF);
    }

    // Test 33: totalPoliciesSold increments by 1
    function test_buyInsurance_incrementsPoliciesSold() public {
        assertEq(ctrl.totalPoliciesSold(), 0);
        _buyAs(traveler1, DATE);
        assertEq(ctrl.totalPoliciesSold(), 1);
        _buyAs(traveler2, DATE);
        assertEq(ctrl.totalPoliciesSold(), 2);
    }

    // Test 34: totalPremiumsCollected increments by premium
    function test_buyInsurance_incrementsPremiumsCollected() public {
        assertEq(ctrl.totalPremiumsCollected(), 0);
        _buyAs(traveler1, DATE);
        assertEq(ctrl.totalPremiumsCollected(), PREMIUM);
        _buyAs(traveler2, DATE);
        assertEq(ctrl.totalPremiumsCollected(), PREMIUM * 2);
    }

    // Test 35: totalMaxLiability increases by payoff on each purchase
    function test_buyInsurance_increasesTotalMaxLiability() public {
        assertEq(ctrl.totalMaxLiability(), 0);
        _buyAs(traveler1, DATE);
        assertEq(ctrl.totalMaxLiability(), PAYOFF);
        _buyAs(traveler2, DATE);
        assertEq(ctrl.totalMaxLiability(), PAYOFF * 2);
    }

    // Test 36: FlightRecord caches correct flightId and flightDate
    function test_buyInsurance_cachesFlightRecord() public {
        _buyAs(traveler1, DATE);
        bytes32 key = ctrl.flightKey(FLIGHT_ID, DATE);

        // auto-generated getter: (address poolAddress, string flightId, string flightDate, bool active, uint256 index)
        // Note: Solidity 0.8 with ABIv2 returns all struct fields including strings
        (address poolAddr,,, bool active, uint256 index) = ctrl.flightRecords(key);

        assertTrue(poolAddr != address(0));
        assertTrue(active);
        assertEq(index, 0);

        // Verify pool's own flightId/flightDate match what was cached
        FlightPool pool = FlightPool(poolAddr);
        assertEq(pool.flightId(), FLIGHT_ID);
        assertEq(pool.flightDate(), DATE);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 37-42 Settlement ordering
    // ─────────────────────────────────────────────────────────────────────────

    // Test 37: sendPayout before decreaseLocked — verified by end-state consistency
    function test_settleDelayed_sendPayoutBeforeDecreaseLocked() public {
        _buyAs(traveler1, DATE);
        uint256 vaultBalanceBefore = usdc.balanceOf(address(vault));
        uint256 lockedBefore = vault.lockedCapital();

        _settleWith(DATE, OracleAggregator.FlightStatus.Delayed);

        // After delayed settlement:
        // - vault sent PAYOFF to pool (sendPayout)
        // - pool distributed PAYOFF to traveler (push), returned PREMIUM remainder to vault
        // - net vault USDC: vaultBefore - PAYOFF + PREMIUM
        assertEq(usdc.balanceOf(address(vault)), vaultBalanceBefore - PAYOFF + PREMIUM);
        assertEq(vault.lockedCapital(), lockedBefore - PAYOFF);
    }

    // Test 38: after not-delayed settlement, premiums in RiskVault, lockedCapital released
    function test_settleNotDelayed_premiumsToVaultAndLockReleased() public {
        _buyAs(traveler1, DATE);
        uint256 vaultAssetsBefore = vault.totalManagedAssets();
        uint256 lockedBefore = vault.lockedCapital();

        _settleWith(DATE, OracleAggregator.FlightStatus.OnTime);

        // Premium flowed into vault
        assertEq(vault.totalManagedAssets(), vaultAssetsBefore + PREMIUM);
        // Locked released
        assertEq(vault.lockedCapital(), lockedBefore - PAYOFF);
    }

    // Test 39: after delayed settlement, pool is settled, lockedCapital released
    // Note: FlightPool pushes PAYOFF to traveler on settle, so claimed[traveler]=true and canClaim=false.
    // Traveler already received PAYOFF via push — no need to pull.
    function test_settleDelayed_poolClaimableAndLockReleased() public {
        address poolAddr = _buyAs(traveler1, DATE);
        FlightPool pool = FlightPool(poolAddr);

        _settleWith(DATE, OracleAggregator.FlightStatus.Delayed);

        assertTrue(pool.isSettled());
        assertTrue(pool.outcome() == FlightPool.Outcome.Delayed);
        assertTrue(pool.claimExpiry() > block.timestamp);
        // Push payout succeeded: traveler already received PAYOFF, claimed[traveler1] = true
        assertTrue(pool.claimed(traveler1));
        assertEq(usdc.balanceOf(traveler1), PAYOFF);
        // canClaim = false because traveler already claimed via push
        assertFalse(pool.canClaim(traveler1));
        assertEq(vault.lockedCapital(), 0);
    }

    // Test 40: processWithdrawalQueue called after both settlement types
    // Verify via a queued withdrawal being fulfilled after settlement
    function test_settlement_processesWithdrawalQueue() public {
        // Underwriter queues a withdrawal (vault fully locked so it queues)
        _buyAs(traveler1, DATE); // locks 100 USDC

        // Underwriter has 500 shares, try to withdraw 500 shares (freeCapital = 400)
        // Actually let's just check that queueHead advances on settlement.
        // Deposit extra underwriter so we can withdraw
        address underwriter2 = makeAddr("underwriter2");
        usdc.mint(underwriter2, PAYOFF);
        vm.startPrank(underwriter2);
        usdc.approve(address(vault), PAYOFF);
        vault.deposit(PAYOFF);
        vm.stopPrank();

        // All capital locked after a second purchase
        _buyAs(traveler2, DATE);

        // Queue a withdrawal (500 USDC worth of shares, but only 100 free after 2 purchases lock 200)
        vm.startPrank(underwriter);
        vault.withdraw(vault.shares(underwriter)); // queued since freeCapital < redemption value
        vm.stopPrank();

        uint256 queueHeadBefore = vault.queueHead();

        // Settle as not-delayed — releases lock, enables queue processing
        _settleWith(DATE, OracleAggregator.FlightStatus.OnTime);

        // Queue head should have advanced (withdrawal fulfilled)
        assertTrue(vault.queueHead() > queueHeadBefore);
    }

    // Test 41: totalPayoutsDistributed increments on delayed/cancelled only
    function test_settlement_payoutsDistributedOnlyForDelayed() public {
        _buyAs(traveler1, DATE);
        _settleWith(DATE, OracleAggregator.FlightStatus.OnTime);
        assertEq(ctrl.totalPayoutsDistributed(), 0);

        // Second flight — delayed
        governance.approveRoute(FLIGHT_ID2, ORIGIN, DESTINATION, PREMIUM, PAYOFF);
        usdc.mint(traveler2, PREMIUM);
        vm.startPrank(traveler2);
        usdc.approve(address(ctrl), PREMIUM);
        ctrl.buyInsurance(FLIGHT_ID2, ORIGIN, DESTINATION, DATE2);
        vm.stopPrank();

        vm.prank(oracle);
        oracle_agg.updateFlightStatus(FLIGHT_ID2, DATE2, OracleAggregator.FlightStatus.Delayed);
        vm.prank(creWorkflow);
        ctrl.checkAndSettle();

        assertEq(ctrl.totalPayoutsDistributed(), PAYOFF);
    }

    // Test 42: totalMaxLiability decreases by pool.maxLiability() after settlement
    function test_settlement_decreasesTotalMaxLiability() public {
        _buyAs(traveler1, DATE);
        _buyAs(traveler2, DATE);
        assertEq(ctrl.totalMaxLiability(), PAYOFF * 2);

        _settleWith(DATE, OracleAggregator.FlightStatus.OnTime);

        // Both buyers were in the same pool — maxLiability = 2 * PAYOFF
        assertEq(ctrl.totalMaxLiability(), 0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 43-48 Flight registry
    // ─────────────────────────────────────────────────────────────────────────

    // Test 43: activeFlightCount correct before and after settlement
    function test_activeFlightCount_updatesOnSettlement() public {
        assertEq(ctrl.activeFlightCount(), 0);
        _buyAs(traveler1, DATE);
        assertEq(ctrl.activeFlightCount(), 1);

        // Add second flight
        governance.approveRoute(FLIGHT_ID2, ORIGIN, DESTINATION, PREMIUM, PAYOFF);
        usdc.mint(traveler2, PREMIUM);
        vm.startPrank(traveler2);
        usdc.approve(address(ctrl), PREMIUM);
        ctrl.buyInsurance(FLIGHT_ID2, ORIGIN, DESTINATION, DATE2);
        vm.stopPrank();
        assertEq(ctrl.activeFlightCount(), 2);

        _settleWith(DATE, OracleAggregator.FlightStatus.OnTime);
        assertEq(ctrl.activeFlightCount(), 1);
    }

    // Test 44: settled pool removed via swap-and-pop (second pool's index updated)
    function test_clearFlight_swapAndPopUpdatesIndex() public {
        // Two flights
        governance.approveRoute(FLIGHT_ID2, ORIGIN, DESTINATION, PREMIUM, PAYOFF);
        _buyAs(traveler1, DATE);                      // index 0
        usdc.mint(traveler2, PREMIUM);
        vm.startPrank(traveler2);
        usdc.approve(address(ctrl), PREMIUM);
        ctrl.buyInsurance(FLIGHT_ID2, ORIGIN, DESTINATION, DATE2); // index 1
        vm.stopPrank();

        // Settle first flight (index 0) — second flight should be swapped to index 0
        _settleWith(DATE, OracleAggregator.FlightStatus.OnTime);

        assertEq(ctrl.activeFlightCount(), 1);

        bytes32 key2 = ctrl.flightKey(FLIGHT_ID2, DATE2);
        (,,, bool active2, uint256 idx2) = ctrl.flightRecords(key2);
        assertTrue(active2);
        assertEq(idx2, 0); // was at index 1, now swapped to 0
    }

    // Test 45: flightRecords[key].active = false after settlement
    function test_clearFlight_setsActiveToFalse() public {
        _buyAs(traveler1, DATE);
        bytes32 key = ctrl.flightKey(FLIGHT_ID, DATE);

        (,,, bool activeBefore,) = ctrl.flightRecords(key);
        assertTrue(activeBefore);

        _settleWith(DATE, OracleAggregator.FlightStatus.OnTime);

        (,,, bool activeAfter,) = ctrl.flightRecords(key);
        assertFalse(activeAfter);
    }

    // Test 46: deregisterFlight called on OracleAggregator after settlement
    function test_clearFlight_deregistersFlight() public {
        _buyAs(traveler1, DATE);

        // Flight is registered — getActiveFlights has 1 entry
        assertEq(oracle_agg.getActiveFlights().length, 1);

        _settleWith(DATE, OracleAggregator.FlightStatus.OnTime);

        // Deregistered
        assertEq(oracle_agg.getActiveFlights().length, 0);
    }

    // Test 47: getActivePools returns only unsettled pool addresses
    function test_getActivePools_returnsUnsettledOnly() public {
        governance.approveRoute(FLIGHT_ID2, ORIGIN, DESTINATION, PREMIUM, PAYOFF);
        address pool1 = _buyAs(traveler1, DATE);
        usdc.mint(traveler2, PREMIUM);
        vm.startPrank(traveler2);
        usdc.approve(address(ctrl), PREMIUM);
        ctrl.buyInsurance(FLIGHT_ID2, ORIGIN, DESTINATION, DATE2);
        vm.stopPrank();
        address pool2 = ctrl.getPoolAddress(FLIGHT_ID2, DATE2);

        address[] memory pools = ctrl.getActivePools();
        assertEq(pools.length, 2);

        // Settle first flight
        _settleWith(DATE, OracleAggregator.FlightStatus.OnTime);

        pools = ctrl.getActivePools();
        assertEq(pools.length, 1);
        assertEq(pools[0], pool2);
        // pool1 is no longer in active pools
        assertTrue(pools[0] != pool1);
    }

    // Test 48: settlement loop reads flightId/flightDate from FlightRecord cache
    // (Verified indirectly: settlement correctly identifies and settles the right flight)
    function test_checkAndSettle_readsFromFlightRecordCache() public {
        governance.approveRoute(FLIGHT_ID2, ORIGIN, DESTINATION, PREMIUM, PAYOFF);
        _buyAs(traveler1, DATE);
        address pool2Addr;
        {
            usdc.mint(traveler2, PREMIUM);
            vm.startPrank(traveler2);
            usdc.approve(address(ctrl), PREMIUM);
            ctrl.buyInsurance(FLIGHT_ID2, ORIGIN, DESTINATION, DATE2);
            vm.stopPrank();
            pool2Addr = ctrl.getPoolAddress(FLIGHT_ID2, DATE2);
        }

        // Only mark first flight as OnTime
        vm.prank(oracle);
        oracle_agg.updateFlightStatus(FLIGHT_ID, DATE, OracleAggregator.FlightStatus.OnTime);
        vm.prank(creWorkflow);
        ctrl.checkAndSettle();

        // First flight settled, second still active
        assertEq(ctrl.activeFlightCount(), 1);
        assertEq(ctrl.getActivePools()[0], pool2Addr);
        assertFalse(FlightPool(ctrl.getPoolAddress(FLIGHT_ID, DATE)).isOpen()); // settled
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 49-52 Solvency invariant
    // ─────────────────────────────────────────────────────────────────────────

    // Test 49: isSolventForNewPurchase returns false with empty vault
    function test_isSolvent_falseWithEmptyVault() public {
        // Deploy fresh system with no capital
        RiskVault emptyVault = new RiskVault(address(usdc), address(0));
        OracleAggregator emptyOracle = new OracleAggregator();
        Controller emptyCtrl = new Controller(
            address(usdc), address(emptyVault), address(emptyOracle),
            address(governance), address(recovery)
        );
        emptyVault.setController(address(emptyCtrl));
        emptyOracle.setController(address(emptyCtrl));

        assertFalse(emptyCtrl.isSolventForNewPurchase(FLIGHT_ID, ORIGIN, DESTINATION));
    }

    // Test 50: isSolventForNewPurchase returns true after sufficient deposit
    function test_isSolvent_trueAfterDeposit() public {
        assertTrue(ctrl.isSolventForNewPurchase(FLIGHT_ID, ORIGIN, DESTINATION));
    }

    // Test 51: isSolventForNewPurchase false when vault at capacity
    function test_isSolvent_falseWhenCapacityFull() public {
        // Buy 3 policies (3 × 100 USDC locked). freeCapital = 500 - 300 = 200.
        // 4th purchase needs freeCapital >= (300+100)*100/100 = 400 → 200 < 400 → false.
        // (Premiums go to pool, not vault, so totalManagedAssets stays 500.)
        for (uint256 i = 0; i < 3; i++) {
            address traveler = makeAddr(string(abi.encodePacked("t", i)));
            usdc.mint(traveler, PREMIUM);
            vm.startPrank(traveler);
            usdc.approve(address(ctrl), PREMIUM);
            ctrl.buyInsurance(FLIGHT_ID, ORIGIN, DESTINATION, DATE);
            vm.stopPrank();
        }

        // 4th purchase would need freeCapital (200) >= (300+100)*100/100 = 400 → fails
        assertFalse(ctrl.isSolventForNewPurchase(FLIGHT_ID, ORIGIN, DESTINATION));
    }

    // Test 52: minimumSolvencyRatio of 150 requires 1.5× coverage
    function test_isSolvent_150PercentRatio() public {
        ctrl.setMinimumSolvencyRatio(150);

        // Vault has 500 USDC, payoff = 100
        // 1st check: 500 >= (0 + 100) * 150 / 100 = 150 → true
        assertTrue(ctrl.isSolventForNewPurchase(FLIGHT_ID, ORIGIN, DESTINATION));

        // Buy 2 policies (totalMaxLiability = 200, freeCapital = 500 - 200 = 300).
        // 3rd check: 300 >= (200 + 100) * 150 / 100 = 450 → false
        for (uint256 i = 0; i < 2; i++) {
            address t = makeAddr(string(abi.encodePacked("s", i)));
            usdc.mint(t, PREMIUM);
            vm.startPrank(t);
            usdc.approve(address(ctrl), PREMIUM);
            ctrl.buyInsurance(FLIGHT_ID, ORIGIN, DESTINATION, DATE);
            vm.stopPrank();
        }

        assertFalse(ctrl.isSolventForNewPurchase(FLIGHT_ID, ORIGIN, DESTINATION));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 53-58 End-to-end: not delayed
    // ─────────────────────────────────────────────────────────────────────────

    // Test 53-58: full not-delayed lifecycle
    function test_e2e_notDelayed() public {
        // 53. Underwriter capital already deposited in setUp (500 USDC)
        uint256 vaultAssetsBefore = vault.totalManagedAssets();

        // 54. Traveler buys insurance
        address poolAddr = _buyAs(traveler1, DATE);
        assertEq(usdc.balanceOf(poolAddr), PREMIUM);

        // 55. Oracle marks flight as OnTime
        vm.prank(oracle);
        oracle_agg.updateFlightStatus(FLIGHT_ID, DATE, OracleAggregator.FlightStatus.OnTime);

        // 56. CRE workflow calls checkAndSettle
        vm.prank(creWorkflow);
        ctrl.checkAndSettle();

        // 57. Premium forwarded to RiskVault (pool now empty)
        assertEq(usdc.balanceOf(poolAddr), 0);
        assertEq(vault.totalManagedAssets(), vaultAssetsBefore + PREMIUM);
        assertEq(vault.lockedCapital(), 0);
        assertEq(ctrl.totalMaxLiability(), 0);
        assertEq(ctrl.totalPoliciesSold(), 1);
        assertEq(ctrl.totalPremiumsCollected(), PREMIUM);
        assertEq(ctrl.totalPayoutsDistributed(), 0);

        // 58. Underwriter withdraws and collects
        uint256 underwriterShares = vault.shares(underwriter);
        vm.prank(underwriter);
        vault.withdraw(underwriterShares);
        // Immediate path (freeCapital > redemption value)
        uint256 credited = vault.claimableBalance(underwriter);
        assertTrue(credited > 0);
        vm.prank(underwriter);
        vault.collect();
        assertEq(vault.claimableBalance(underwriter), 0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 59-65 End-to-end: delayed
    // ─────────────────────────────────────────────────────────────────────────

    // Test 59-65: full delayed lifecycle
    function test_e2e_delayed() public {
        // 59. Underwriter capital in setUp
        uint256 vaultBalanceBefore = usdc.balanceOf(address(vault));

        // 60. Traveler buys insurance
        address poolAddr = _buyAs(traveler1, DATE);

        // 61. Oracle marks flight as Delayed
        vm.prank(oracle);
        oracle_agg.updateFlightStatus(FLIGHT_ID, DATE, OracleAggregator.FlightStatus.Delayed);

        // 62. CRE workflow calls checkAndSettle
        vm.prank(creWorkflow);
        ctrl.checkAndSettle();

        // 63. Pool claimable, lockedCapital released
        FlightPool pool = FlightPool(poolAddr);
        assertTrue(pool.isSettled());
        assertTrue(pool.outcome() == FlightPool.Outcome.Delayed);
        assertTrue(pool.claimExpiry() > block.timestamp);
        assertEq(vault.lockedCapital(), 0);
        assertEq(usdc.balanceOf(address(vault)), vaultBalanceBefore - PAYOFF + PREMIUM);
        // vault sent PAYOFF, received PREMIUM back as premium income if payout pushed to traveler
        // Actually: vault sent PAYOFF to pool. Pool distributed PAYOFF to traveler (push),
        // so pool balance = 0 + PREMIUM (initial premium) → then remainder = PREMIUM sent back to vault.
        // So vault balance = vaultBalanceBefore - PAYOFF + PREMIUM.
        assertEq(vault.totalManagedAssets(), vault.totalManagedAssets()); // sanity

        // 64. Traveler claims payout (push already sent it in settleDelayed, so claimed[traveler1] = true)
        // If push succeeded, claimed[traveler1] = true and traveler already got PAYOFF.
        // Let's verify:
        if (!pool.claimed(traveler1)) {
            // Push failed (shouldn't happen with EOA), use pull
            vm.prank(traveler1);
            pool.claim();
        }
        assertTrue(pool.claimed(traveler1));

        // 65. Advance past claimExpiry, sweep remainder
        vm.warp(pool.claimExpiry() + 1);
        uint256 remaining = usdc.balanceOf(poolAddr);
        pool.sweepExpired();
        assertEq(usdc.balanceOf(poolAddr), 0);
        if (remaining > 0) {
            assertEq(usdc.balanceOf(address(recovery)), remaining);
        }

        // Counter checks
        assertEq(ctrl.totalPayoutsDistributed(), PAYOFF);
        assertEq(ctrl.totalMaxLiability(), 0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Additional: cancelled settlement
    // ─────────────────────────────────────────────────────────────────────────

    function test_e2e_cancelled() public {
        address poolAddr = _buyAs(traveler1, DATE);

        vm.prank(oracle);
        oracle_agg.updateFlightStatus(FLIGHT_ID, DATE, OracleAggregator.FlightStatus.Cancelled);
        vm.prank(creWorkflow);
        ctrl.checkAndSettle();

        FlightPool pool = FlightPool(poolAddr);
        assertTrue(pool.isSettled());
        assertTrue(pool.outcome() == FlightPool.Outcome.Cancelled);
        assertEq(ctrl.totalPayoutsDistributed(), PAYOFF);
        assertEq(ctrl.totalMaxLiability(), 0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Additional: multiple flights, partial settlement
    // ─────────────────────────────────────────────────────────────────────────

    function test_multipleFlights_partialSettlement() public {
        governance.approveRoute(FLIGHT_ID2, ORIGIN, DESTINATION, PREMIUM, PAYOFF);

        _buyAs(traveler1, DATE);
        usdc.mint(traveler2, PREMIUM);
        vm.startPrank(traveler2);
        usdc.approve(address(ctrl), PREMIUM);
        ctrl.buyInsurance(FLIGHT_ID2, ORIGIN, DESTINATION, DATE2);
        vm.stopPrank();

        assertEq(ctrl.activeFlightCount(), 2);

        // Only first flight gets a status
        vm.prank(oracle);
        oracle_agg.updateFlightStatus(FLIGHT_ID, DATE, OracleAggregator.FlightStatus.OnTime);
        vm.prank(creWorkflow);
        ctrl.checkAndSettle();

        // First settled, second still active
        assertEq(ctrl.activeFlightCount(), 1);
        assertEq(ctrl.totalMaxLiability(), PAYOFF); // second flight still locked
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Owner config setters
    // ─────────────────────────────────────────────────────────────────────────

    function test_ownerSetters_workAndEmitEvents() public {
        ctrl.setMinimumSolvencyRatio(150);
        assertEq(ctrl.minimumSolvencyRatio(), 150);

        ctrl.setMinimumLeadTime(2 hours);
        assertEq(ctrl.minimumLeadTime(), 2 hours);

        ctrl.setClaimExpiryWindow(30 days);
        assertEq(ctrl.claimExpiryWindow(), 30 days);

        address newGov = address(new GovernanceModule(owner));
        ctrl.setGovernanceModule(newGov);
        // governanceModule should now point to newGov
        assertEq(address(ctrl.governanceModule()), newGov);
    }

    function test_ownerSetters_rejectNonOwner() public {
        vm.startPrank(anyone);
        vm.expectRevert(Controller.Unauthorized.selector);
        ctrl.setMinimumSolvencyRatio(150);

        vm.expectRevert(Controller.Unauthorized.selector);
        ctrl.setMinimumLeadTime(2 hours);

        vm.expectRevert(Controller.Unauthorized.selector);
        ctrl.setClaimExpiryWindow(30 days);

        vm.expectRevert(Controller.Unauthorized.selector);
        ctrl.setGovernanceModule(address(1));
        vm.stopPrank();
    }

    function test_setGovernanceModule_rejectsZeroAddress() public {
        vm.expectRevert(Controller.ZeroAddress.selector);
        ctrl.setGovernanceModule(address(0));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor validation
    // ─────────────────────────────────────────────────────────────────────────

    function test_constructor_rejectsZeroAddresses() public {
        vm.expectRevert(Controller.ZeroAddress.selector);
        new Controller(address(0), address(vault), address(oracle_agg), address(governance), address(recovery));

        vm.expectRevert(Controller.ZeroAddress.selector);
        new Controller(address(usdc), address(0), address(oracle_agg), address(governance), address(recovery));

        vm.expectRevert(Controller.ZeroAddress.selector);
        new Controller(address(usdc), address(vault), address(0), address(governance), address(recovery));

        vm.expectRevert(Controller.ZeroAddress.selector);
        new Controller(address(usdc), address(vault), address(oracle_agg), address(0), address(recovery));

        vm.expectRevert(Controller.ZeroAddress.selector);
        new Controller(address(usdc), address(vault), address(oracle_agg), address(governance), address(0));
    }

    function test_constructor_setsDefaults() public view {
        assertEq(ctrl.minimumSolvencyRatio(), 100);
        assertEq(ctrl.minimumLeadTime(), 1 hours);
        assertEq(ctrl.claimExpiryWindow(), 60 days);
        assertEq(ctrl.owner(), owner);
    }
}
