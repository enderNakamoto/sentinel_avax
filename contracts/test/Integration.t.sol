// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "forge-std/Test.sol";
import "../src/Controller.sol";
import "../src/MockUSDC.sol";
import "../src/GovernanceModule.sol";
import "../src/RecoveryPool.sol";
import "../src/OracleAggregator.sol";
import "../src/RiskVault.sol";
import "../src/FlightPool.sol";

// ─────────────────────────────────────────────────────────────────────────────
// Integration test suite — all six contracts deployed and wired together.
// Tests multi-flight scenarios, withdrawal queue FIFO, solvency ratio enforcement,
// claim expiry cycle, queueHead regression guard, and totalManagedAssets integrity.
// ─────────────────────────────────────────────────────────────────────────────
contract IntegrationTest is Test {
    // ── Constants ─────────────────────────────────────────────────────────────
    uint256 constant PREMIUM    = 10_000_000;    // 10 USDC
    uint256 constant PAYOFF     = 100_000_000;   // 100 USDC
    uint256 constant VAULT_SEED = 1_000_000_000; // 1000 USDC

    // Three concurrent flights
    string constant FL_A = "AA100"; string constant DATE_A = "2026-06-01";
    string constant FL_B = "AA200"; string constant DATE_B = "2026-06-02";
    string constant FL_C = "AA300"; string constant DATE_C = "2026-06-03";

    string constant ORIGIN = "DEN";
    string constant DEST   = "SEA";

    // ── Actors ────────────────────────────────────────────────────────────────
    // creWorkflow == oracle: same address writes statuses and calls checkAndSettle
    address creWorkflow = makeAddr("creWorkflow");

    address travelerA   = makeAddr("travelerA");
    address travelerB   = makeAddr("travelerB");
    address travelerC   = makeAddr("travelerC");

    address u1 = makeAddr("u1");
    address u2 = makeAddr("u2");
    address u3 = makeAddr("u3");
    address u4 = makeAddr("u4");
    address u5 = makeAddr("u5");

    // ── Contracts ─────────────────────────────────────────────────────────────
    MockUSDC         usdc;
    GovernanceModule governance;
    RecoveryPool     recovery;
    OracleAggregator oracleAgg;
    RiskVault        vault;
    Controller       ctrl;

    // ── Setup ─────────────────────────────────────────────────────────────────
    function setUp() public {
        // Deploy
        usdc       = new MockUSDC();
        governance = new GovernanceModule(address(this));
        recovery   = new RecoveryPool(address(usdc));
        oracleAgg  = new OracleAggregator();
        vault      = new RiskVault(address(usdc), address(0));
        ctrl       = new Controller(
            address(usdc),
            address(vault),
            address(oracleAgg),
            address(governance),
            address(recovery)
        );

        // Wire
        vault.setController(address(ctrl));
        oracleAgg.setController(address(ctrl));
        oracleAgg.setOracle(creWorkflow); // CRE workflow is also the authorized oracle
        ctrl.setCreWorkflow(creWorkflow);

        // Set minimumLeadTime = 0 so tests don't need future departure timestamps
        ctrl.setMinimumLeadTime(0);

        // Approve all three flight routes
        governance.approveRoute(FL_A, ORIGIN, DEST, PREMIUM, PAYOFF);
        governance.approveRoute(FL_B, ORIGIN, DEST, PREMIUM, PAYOFF);
        governance.approveRoute(FL_C, ORIGIN, DEST, PREMIUM, PAYOFF);

        // Seed vault with underwriter capital
        usdc.mint(address(this), VAULT_SEED);
        usdc.approve(address(vault), VAULT_SEED);
        vault.deposit(VAULT_SEED);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    function _buy(address traveler, string memory flightId, string memory date) internal returns (address pool) {
        usdc.mint(traveler, PREMIUM);
        vm.startPrank(traveler);
        usdc.approve(address(ctrl), PREMIUM);
        ctrl.buyInsurance(flightId, ORIGIN, DEST, date);
        vm.stopPrank();
        pool = ctrl.getPoolAddress(flightId, date);
    }

    function _setStatus(string memory flightId, string memory date, OracleAggregator.FlightStatus status) internal {
        vm.prank(creWorkflow);
        oracleAgg.updateFlightStatus(flightId, date, status);
    }

    function _checkAndSettle() internal {
        vm.prank(creWorkflow);
        ctrl.checkAndSettle();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 2 — 3 flights simultaneous: OnTime / Delayed / Cancelled
    // ─────────────────────────────────────────────────────────────────────────
    function test_ThreeFlightsSimultaneous_ReconcileAfterSettle() public {
        // Buy one policy per flight
        _buy(travelerA, FL_A, DATE_A);
        _buy(travelerB, FL_B, DATE_B);
        _buy(travelerC, FL_C, DATE_C);

        // After 3 purchases:
        // lockedCapital = 3 * PAYOFF = 300 USDC
        // totalManagedAssets = 1000 USDC (premiums sit in pools, not vault yet)
        assertEq(vault.lockedCapital(), 3 * PAYOFF);
        assertEq(vault.totalManagedAssets(), VAULT_SEED);
        assertEq(ctrl.activeFlightCount(), 3);

        // Write statuses: A=OnTime, B=Delayed, C=Cancelled
        _setStatus(FL_A, DATE_A, OracleAggregator.FlightStatus.OnTime);
        _setStatus(FL_B, DATE_B, OracleAggregator.FlightStatus.Delayed);
        _setStatus(FL_C, DATE_C, OracleAggregator.FlightStatus.Cancelled);

        // Settle all three in one call
        _checkAndSettle();

        // All pools cleared
        assertEq(ctrl.activeFlightCount(), 0);
        assertEq(vault.lockedCapital(), 0);
        assertEq(ctrl.totalMaxLiability(), 0);

        // OnTime: +10 premium income
        // Delayed: -100 payout to pool, pool has 110, distributes 100 to travelerB,
        //          returns 10 remainder → +10 income
        // Cancelled: same as Delayed → +10 income
        // Net: 1000 + 10 + 10 + 10 - 100 - 100 = 830
        uint256 expectedTMA = VAULT_SEED + PREMIUM * 3 - PAYOFF * 2;
        assertEq(vault.totalManagedAssets(), expectedTMA);

        // No drift
        assertEq(vault.balanceSanityCheck(), 0);

        // Delayed and Cancelled payouts were distributed
        assertEq(ctrl.totalPayoutsDistributed(), PAYOFF * 2);

        // travelerB can claim (push already succeeded in _distributePayout)
        FlightPool poolB = FlightPool(ctrl.getPoolAddress(FL_B, DATE_B));
        assertEq(poolB.claimed(travelerB), true);

        // travelerA has no claim (OnTime)
        FlightPool poolA = FlightPool(ctrl.getPoolAddress(FL_A, DATE_A));
        assertEq(poolA.isSettled(), true);
        assertEq(uint(poolA.outcome()), uint(FlightPool.Outcome.NotDelayed));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 3 — 5 underwriters queue, FIFO drain across settlements
    // ─────────────────────────────────────────────────────────────────────────
    function test_WithdrawalQueue_FIFODrain() public {
        // 5 underwriters each deposit 100 USDC on top of the 1000 USDC seed.
        // totalManagedAssets = 1500, totalShares = 1500 (1:1 price throughout deposits).
        address[5] memory us = [u1, u2, u3, u4, u5];
        uint256 eachDeposit = 100_000_000; // 100 USDC

        for (uint256 i = 0; i < 5; i++) {
            usdc.mint(us[i], eachDeposit);
            vm.startPrank(us[i]);
            usdc.approve(address(vault), eachDeposit);
            vault.deposit(eachDeposit);
            vm.stopPrank();
        }
        // totalManagedAssets = 1500 USDC, totalShares = 1500

        // Buy a policy that locks 1401 USDC → freeCapital = 99 USDC.
        // Using 1401 (not 1400) ensures freeCapital < 100 so all withdrawals queue.
        governance.approveRoute("BIG", ORIGIN, DEST, 1_000_000, 1_401_000_000);
        usdc.mint(address(this), 1_000_000);
        usdc.approve(address(ctrl), 1_000_000);
        ctrl.buyInsurance("BIG", ORIGIN, DEST, "2026-09-01");
        // freeCapital = 1500 - 1401 = 99 USDC

        assertEq(vault.freeCapital(), 99_000_000);

        // All 5 underwriters try to withdraw their 100-USDC worth of shares.
        // freeCapital (99) < each request (100) → all go to queue.
        for (uint256 i = 0; i < 5; i++) {
            uint256 sharesToWithdraw = vault.shares(us[i]); // 100 shares each
            vm.prank(us[i]);
            vault.withdraw(sharesToWithdraw);
        }
        assertEq(vault.queueHead(), 0);
        for (uint256 i = 0; i < 5; i++) {
            assertEq(vault.claimableBalance(us[i]), 0);
        }

        // Settle the BIG flight as OnTime — releases 1401 USDC locked capital.
        // Premium income = 1 USDC. totalManagedAssets ≈ 1501. freeCapital = 1501.
        _setStatus("BIG", "2026-09-01", OracleAggregator.FlightStatus.OnTime);
        _checkAndSettle();

        // All 5 processed — freeCapital >> 500 USDC after lock released.
        assertEq(vault.queueHead(), 5);
        for (uint256 i = 0; i < 5; i++) {
            assertGt(vault.claimableBalance(us[i]), 0);
        }

        // FIFO ordering: earlier entries are processed first. As shares are burned within
        // processWithdrawalQueue, totalShares decreases while totalManagedAssets stays constant
        // (collect() not called yet), so per-share price rises. Later entries (u5) receive
        // slightly more USDC than earlier entries (u1) at the same share count.
        assertGe(vault.claimableBalance(u5), vault.claimableBalance(u1));

        // No balance drift (collect() has not been called — TMA still counts credited balances)
        assertEq(vault.balanceSanityCheck(), 0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 4 — Route terms updated mid-lifecycle
    // ─────────────────────────────────────────────────────────────────────────
    function test_RouteTermsUpdated_ExistingPoolKeepsOldTerms() public {
        // Buy with old terms → deploys pool A at PREMIUM/PAYOFF
        address poolA = _buy(travelerA, FL_A, "2026-08-01");

        // Update route terms
        uint256 newPremium = 20_000_000;  // 20 USDC
        uint256 newPayoff  = 200_000_000; // 200 USDC
        governance.updateRouteTerms(FL_A, ORIGIN, DEST, newPremium, newPayoff);

        // Buy with new terms on a different date → deploys pool B at new terms
        usdc.mint(travelerB, newPremium);
        vm.startPrank(travelerB);
        usdc.approve(address(ctrl), newPremium);
        ctrl.buyInsurance(FL_A, ORIGIN, DEST, "2026-08-02");
        vm.stopPrank();
        address poolB = ctrl.getPoolAddress(FL_A, "2026-08-02");

        // Verify pool A locked old terms
        assertEq(FlightPool(poolA).premium(), PREMIUM);
        assertEq(FlightPool(poolA).payoff(),  PAYOFF);

        // Verify pool B locked new terms
        assertEq(FlightPool(poolB).premium(), newPremium);
        assertEq(FlightPool(poolB).payoff(),  newPayoff);

        // Settle pool A as OnTime
        _setStatus(FL_A, "2026-08-01", OracleAggregator.FlightStatus.OnTime);
        _checkAndSettle();

        // Pool A settled; pool B still active (status still Unknown)
        assertEq(ctrl.activeFlightCount(), 1);
        assertEq(FlightPool(poolA).isSettled(), true);
        assertEq(FlightPool(poolB).isSettled(), false);

        // Settle pool B as OnTime
        _setStatus(FL_A, "2026-08-02", OracleAggregator.FlightStatus.OnTime);
        _checkAndSettle();

        assertEq(ctrl.activeFlightCount(), 0);
        assertEq(FlightPool(poolB).isSettled(), true);

        // totalManagedAssets = seed + oldPremium + newPremium
        assertEq(vault.totalManagedAssets(), VAULT_SEED + PREMIUM + newPremium);
        assertEq(vault.balanceSanityCheck(), 0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 5 — Route disabled: existing pool settles, new purchase reverts
    // ─────────────────────────────────────────────────────────────────────────
    function test_RouteDisabled_ExistingPoolSettlesNormally() public {
        // Buy one policy
        _buy(travelerA, FL_A, DATE_A);

        // Disable the route
        governance.disableRoute(FL_A, ORIGIN, DEST);

        // Existing pool still active — settle it
        _setStatus(FL_A, DATE_A, OracleAggregator.FlightStatus.OnTime);
        _checkAndSettle();

        assertEq(ctrl.activeFlightCount(), 0);
        assertEq(vault.balanceSanityCheck(), 0);

        // New purchase on the disabled route must revert
        usdc.mint(travelerB, PREMIUM);
        vm.startPrank(travelerB);
        usdc.approve(address(ctrl), PREMIUM);
        vm.expectRevert(Controller.RouteNotApproved.selector);
        ctrl.buyInsurance(FL_A, ORIGIN, DEST, DATE_B);
        vm.stopPrank();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 6 — minimumSolvencyRatio at 150
    // ─────────────────────────────────────────────────────────────────────────
    function test_SolvencyRatio150_BlocksAt3rdPurchase() public {
        // With VAULT_SEED = 1000 and ratio = 150:
        // 1st: 1000 >= (0+100)*150/100 = 150 ✓ → lock 100. freeCapital = 900.
        // 2nd: 900 >= (100+100)*150/100 = 300 ✓ → lock 100. freeCapital = 800.
        // 3rd: 800 >= (200+100)*150/100 = 450 ✓ → lock 100. freeCapital = 700.
        // 4th: 700 >= (300+100)*150/100 = 600 ✓ → lock 100. freeCapital = 600.
        // 5th: 600 >= (400+100)*150/100 = 750 ✗ → REVERT
        ctrl.setMinimumSolvencyRatio(150);

        // 4 purchases succeed
        string[4] memory dates = ["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04"];
        address[4] memory travelers = [makeAddr("t1"), makeAddr("t2"), makeAddr("t3"), makeAddr("t4")];
        for (uint256 i = 0; i < 4; i++) {
            _buy(travelers[i], FL_A, dates[i]);
        }

        // 5th purchase reverts — freeCapital = 600, required = 750
        address t5 = makeAddr("t5");
        usdc.mint(t5, PREMIUM);
        vm.startPrank(t5);
        usdc.approve(address(ctrl), PREMIUM);
        vm.expectRevert(Controller.SolvencyCheckFailed.selector);
        ctrl.buyInsurance(FL_A, ORIGIN, DEST, "2026-07-05");
        vm.stopPrank();

        // Settle the first flight as OnTime — releases 100 USDC locked capital
        // premium income = 10 USDC → totalManagedAssets = 1010, lockedCapital = 300
        // freeCapital = 710. Required for next purchase: (300+100)*150/100 = 600. 710 >= 600 ✓
        _setStatus(FL_A, "2026-07-01", OracleAggregator.FlightStatus.OnTime);
        _checkAndSettle();

        // 5th purchase now succeeds
        _buy(t5, FL_A, "2026-07-05");

        assertEq(vault.balanceSanityCheck(), 0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 7 — Full claim expiry cycle
    // ─────────────────────────────────────────────────────────────────────────
    function test_ClaimExpiry_SweepToRecoveryPool() public {
        // Use a short claim window for test convenience.
        ctrl.setClaimExpiryWindow(7 days);

        address poolAddr = _buy(travelerA, FL_A, DATE_A);
        FlightPool pool = FlightPool(poolAddr);

        _setStatus(FL_A, DATE_A, OracleAggregator.FlightStatus.Delayed);
        _checkAndSettle();

        // _distributePayout pushes PAYOFF directly to travelerA (ERC20 transfer to EOA always
        // succeeds), so claimed[travelerA] = true immediately after settlement.
        assertTrue(pool.isSettled());
        assertTrue(pool.claimed(travelerA));

        // Before expiry: sweepExpired must revert.
        vm.expectRevert(FlightPool.ClaimWindowOpen.selector);
        pool.sweepExpired();

        // Before expiry: double-claim reverts with AlreadyClaimed (not ClaimExpired,
        // because the push already succeeded and claimed = true).
        vm.expectRevert(FlightPool.AlreadyClaimed.selector);
        vm.prank(travelerA);
        pool.claim();

        // canClaim reflects false for an already-claimed buyer.
        assertFalse(pool.canClaim(travelerA));

        // Warp past the 7-day claim window.
        vm.warp(block.timestamp + 8 days);

        // After expiry: sweepExpired succeeds. Pool balance is 0 because _distributePayout
        // already sent premiums + remainder to vault after the payout loop.
        pool.sweepExpired(); // permissionless, no revert

        // RecoveryPool records 0 USDC from this pool (nothing remained after settlement).
        assertEq(recovery.depositsFrom(poolAddr), 0);

        // canClaim also false post-expiry.
        assertFalse(pool.canClaim(travelerA));

        assertEq(vault.balanceSanityCheck(), 0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 8 — queueHead never regresses (20 cycles)
    // ─────────────────────────────────────────────────────────────────────────
    function test_QueueHead_NeverRegresses_20Cycles() public {
        // Each cycle: new underwriter deposits, immediately tries to withdraw,
        // capital is locked so it queues, then settlement releases it.
        // queueHead should advance by 1 each cycle.

        uint256 prevQueueHead = 0;

        for (uint256 cycle = 0; cycle < 20; cycle++) {
            string memory date = string(abi.encodePacked("2026-10-", _uint2str(cycle + 1)));

            // A new underwriter deposits 100 USDC
            address u = makeAddr(string(abi.encodePacked("cycleU", _uint2str(cycle))));
            usdc.mint(u, 100_000_000);
            vm.startPrank(u);
            usdc.approve(address(vault), 100_000_000);
            vault.deposit(100_000_000);
            vm.stopPrank();

            // Buy one policy — locks 100 USDC
            address traveler = makeAddr(string(abi.encodePacked("cycleT", _uint2str(cycle))));
            _buy(traveler, FL_A, date);

            // Underwriter tries to withdraw — may queue if freeCapital is tight
            uint256 uShares = vault.shares(u);
            vm.prank(u);
            vault.withdraw(uShares);

            // Settle flight → processWithdrawalQueue runs
            _setStatus(FL_A, date, OracleAggregator.FlightStatus.OnTime);
            _checkAndSettle();

            uint256 newQueueHead = vault.queueHead();
            assertGe(newQueueHead, prevQueueHead, "queueHead regressed");
            prevQueueHead = newQueueHead;
        }

        assertEq(vault.balanceSanityCheck(), 0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 9 — totalManagedAssets stress: 10 buy+settle cycles, no drift
    // ─────────────────────────────────────────────────────────────────────────
    function test_TotalManagedAssets_NoDrift_10Cycles() public {
        OracleAggregator.FlightStatus[10] memory outcomes = [
            OracleAggregator.FlightStatus.OnTime,
            OracleAggregator.FlightStatus.Delayed,
            OracleAggregator.FlightStatus.OnTime,
            OracleAggregator.FlightStatus.Cancelled,
            OracleAggregator.FlightStatus.OnTime,
            OracleAggregator.FlightStatus.Delayed,
            OracleAggregator.FlightStatus.OnTime,
            OracleAggregator.FlightStatus.OnTime,
            OracleAggregator.FlightStatus.Cancelled,
            OracleAggregator.FlightStatus.OnTime
        ];

        for (uint256 i = 0; i < 10; i++) {
            string memory date = string(abi.encodePacked("2026-11-", _uint2str(i + 1)));
            address traveler = makeAddr(string(abi.encodePacked("stressT", _uint2str(i))));
            _buy(traveler, FL_A, date);

            _setStatus(FL_A, date, outcomes[i]);
            _checkAndSettle();

            assertEq(vault.balanceSanityCheck(), 0, "drift detected after cycle");
            assertEq(vault.lockedCapital(), 0, "locked capital not cleared");
        }

        assertEq(ctrl.activeFlightCount(), 0);
        assertEq(ctrl.totalMaxLiability(), 0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helper — uint to decimal string (no padding)
    // ─────────────────────────────────────────────────────────────────────────
    function _uint2str(uint256 n) internal pure returns (string memory) {
        if (n == 0) return "0";
        uint256 tmp = n;
        uint256 digits;
        while (tmp != 0) { digits++; tmp /= 10; }
        bytes memory buf = new bytes(digits);
        while (n != 0) { digits--; buf[digits] = bytes1(uint8(48 + n % 10)); n /= 10; }
        return string(buf);
    }
}
