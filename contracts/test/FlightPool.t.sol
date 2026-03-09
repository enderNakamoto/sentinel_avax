// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "forge-std/Test.sol";
import "../src/FlightPool.sol";
import "../src/MockUSDC.sol";
import "../src/RecoveryPool.sol";

// ─────────────────────────────────────────────────────────────────────────────
// Minimal RiskVault stub — records calls without complex share logic
// ─────────────────────────────────────────────────────────────────────────────
contract MockRiskVault {
    uint256 public premiumIncomeRecorded;
    uint256 public premiumIncomeCallCount;

    function recordPremiumIncome(uint256 amount) external {
        premiumIncomeRecorded   += amount;
        premiumIncomeCallCount  += 1;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// FlightPool test suite
// ─────────────────────────────────────────────────────────────────────────────
contract FlightPoolTest is Test {
    // Re-declare event for vm.expectEmit
    event PayoutFailed(address indexed buyer, uint256 amount);

    // ── Constants ─────────────────────────────────────────────────────────────
    uint256 constant PREMIUM = 10_000_000;  // 10 USDC
    uint256 constant PAYOFF  = 100_000_000; // 100 USDC
    uint256 constant CLAIM_WINDOW = 60 days;

    // ── Actors ────────────────────────────────────────────────────────────────
    address controller   = makeAddr("controller");
    address buyer1       = makeAddr("buyer1");
    address buyer2       = makeAddr("buyer2");
    address buyer3       = makeAddr("buyer3");
    address nonBuyer     = makeAddr("nonBuyer");
    address anyone       = makeAddr("anyone");

    // ── Contracts ─────────────────────────────────────────────────────────────
    MockUSDC        usdc;
    MockRiskVault   vault;
    RecoveryPool    recovery;
    FlightPool      pool;

    // ── Setup ─────────────────────────────────────────────────────────────────
    function setUp() public {
        usdc     = new MockUSDC();
        vault    = new MockRiskVault();
        recovery = new RecoveryPool(address(usdc));

        pool = new FlightPool(
            "AA123",
            "2026-06-01",
            PREMIUM,
            PAYOFF,
            controller,
            address(vault),
            address(recovery),
            address(usdc)
        );
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /// Fund pool with N × PAYOFF USDC (simulates RiskVault.sendPayout).
    function _fundPoolForDelayed(uint256 buyerCount_) internal {
        uint256 total = PAYOFF * buyerCount_;
        usdc.mint(address(pool), total);
    }

    /// Register N buyers (mints premiums into pool as the test contract owner, then controller buys).
    function _addBuyers(address[] memory _buyers) internal {
        for (uint256 i = 0; i < _buyers.length; i++) {
            usdc.mint(address(pool), PREMIUM); // simulate premium transfer (test is MockUSDC owner)
            vm.prank(controller);
            pool.buyInsurance(_buyers[i]);
        }
    }

    /// Same as _addBuyers but for a specific pool.
    function _addBuyersTo(FlightPool p, address[] memory _buyers) internal {
        for (uint256 i = 0; i < _buyers.length; i++) {
            usdc.mint(address(p), PREMIUM);
            vm.prank(controller);
            p.buyInsurance(_buyers[i]);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor / deployment
    // ─────────────────────────────────────────────────────────────────────────

    function test_Constructor_SetsFields() public view {
        assertEq(pool.flightId(),    "AA123");
        assertEq(pool.flightDate(),  "2026-06-01");
        assertEq(pool.premium(),     PREMIUM);
        assertEq(pool.payoff(),      PAYOFF);
        assertEq(pool.controller(),  controller);
        assertEq(address(pool.usdc()), address(usdc));
        assertTrue(pool.isOpen());
        assertFalse(pool.isSettled());
        assertEq(uint8(pool.outcome()), uint8(FlightPool.Outcome.Pending));
    }

    function test_Constructor_RevertZeroController() public {
        vm.expectRevert(FlightPool.ZeroAddress.selector);
        new FlightPool("F", "D", PREMIUM, PAYOFF, address(0), address(vault), address(recovery), address(usdc));
    }

    function test_Constructor_RevertZeroRiskVault() public {
        vm.expectRevert(FlightPool.ZeroAddress.selector);
        new FlightPool("F", "D", PREMIUM, PAYOFF, controller, address(0), address(recovery), address(usdc));
    }

    function test_Constructor_RevertZeroRecoveryPool() public {
        vm.expectRevert(FlightPool.ZeroAddress.selector);
        new FlightPool("F", "D", PREMIUM, PAYOFF, controller, address(vault), address(0), address(usdc));
    }

    function test_Constructor_RevertZeroUsdc() public {
        vm.expectRevert(FlightPool.ZeroAddress.selector);
        new FlightPool("F", "D", PREMIUM, PAYOFF, controller, address(vault), address(recovery), address(0));
    }

    function test_Constructor_RevertPremiumGePayoff() public {
        vm.expectRevert(FlightPool.InvalidTerms.selector);
        new FlightPool("F", "D", PAYOFF, PAYOFF, controller, address(vault), address(recovery), address(usdc));
    }

    function test_Constructor_RevertPremiumGtPayoff() public {
        vm.expectRevert(FlightPool.InvalidTerms.selector);
        new FlightPool("F", "D", PAYOFF + 1, PAYOFF, controller, address(vault), address(recovery), address(usdc));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // buyInsurance — subtasks 13–18
    // ─────────────────────────────────────────────────────────────────────────

    // 13. buyInsurance records buyer in buyers array and hasBought mapping
    function test_BuyInsurance_RecordsBuyer() public {
        vm.prank(controller);
        pool.buyInsurance(buyer1);

        assertTrue(pool.hasBought(buyer1));
        assertEq(pool.buyers(0), buyer1);
    }

    // 14. buyerCount increments correctly
    function test_BuyInsurance_BuyerCountIncrements() public {
        assertEq(pool.buyerCount(), 0);
        vm.prank(controller);
        pool.buyInsurance(buyer1);
        assertEq(pool.buyerCount(), 1);
        vm.prank(controller);
        pool.buyInsurance(buyer2);
        assertEq(pool.buyerCount(), 2);
    }

    // 15. same address cannot buy twice
    function test_BuyInsurance_RevertDuplicate() public {
        vm.startPrank(controller);
        pool.buyInsurance(buyer1);
        vm.expectRevert(FlightPool.AlreadyBought.selector);
        pool.buyInsurance(buyer1);
        vm.stopPrank();
    }

    // 16. non-controller cannot call buyInsurance
    function test_BuyInsurance_RevertNonController() public {
        vm.prank(nonBuyer);
        vm.expectRevert(FlightPool.Unauthorized.selector);
        pool.buyInsurance(buyer1);
    }

    // 17. cannot buy after closePool
    function test_BuyInsurance_RevertAfterClose() public {
        vm.startPrank(controller);
        pool.closePool();
        vm.expectRevert(FlightPool.PoolNotOpen.selector);
        pool.buyInsurance(buyer1);
        vm.stopPrank();
    }

    // 18. cannot buy after settlement
    function test_BuyInsurance_RevertAfterSettlement() public {
        vm.startPrank(controller);
        pool.settleNotDelayed();
        vm.expectRevert(FlightPool.AlreadySettled.selector);
        pool.buyInsurance(buyer1);
        vm.stopPrank();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // settleNotDelayed — subtasks 19–23
    // ─────────────────────────────────────────────────────────────────────────

    // 19. settleNotDelayed transfers all USDC balance to RiskVault
    function test_SettleNotDelayed_TransfersBalance() public {
        address[] memory b = new address[](2);
        b[0] = buyer1; b[1] = buyer2;
        _addBuyers(b);

        uint256 poolBalance = usdc.balanceOf(address(pool));
        assertEq(poolBalance, 2 * PREMIUM);

        vm.prank(controller);
        pool.settleNotDelayed();

        assertEq(usdc.balanceOf(address(pool)), 0);
        assertEq(usdc.balanceOf(address(vault)), 2 * PREMIUM);
    }

    // 20. settleNotDelayed transfers all premiums to vault
    function test_SettleNotDelayed_TransfersPremiumToVault() public {
        usdc.mint(address(pool), 3 * PREMIUM);

        vm.prank(controller);
        pool.settleNotDelayed();

        assertEq(usdc.balanceOf(address(vault)), 3 * PREMIUM);
    }

    // 21. pool isSettled=true, outcome=NotDelayed
    function test_SettleNotDelayed_SetsState() public {
        vm.prank(controller);
        pool.settleNotDelayed();

        assertTrue(pool.isSettled());
        assertEq(uint8(pool.outcome()), uint8(FlightPool.Outcome.NotDelayed));
    }

    // 22. settleNotDelayed on already-settled pool reverts
    function test_SettleNotDelayed_RevertAlreadySettled() public {
        vm.startPrank(controller);
        pool.settleNotDelayed();
        vm.expectRevert(FlightPool.AlreadySettled.selector);
        pool.settleNotDelayed();
        vm.stopPrank();
    }

    // 23. zero buyers settles cleanly
    function test_SettleNotDelayed_ZeroBuyers() public {
        assertEq(pool.buyerCount(), 0);

        vm.prank(controller);
        pool.settleNotDelayed();

        assertTrue(pool.isSettled());
        assertEq(usdc.balanceOf(address(vault)), 0); // zero-balance pool transfers nothing
    }

    // ─────────────────────────────────────────────────────────────────────────
    // settleDelayed — subtasks 24–31
    // ─────────────────────────────────────────────────────────────────────────

    // 25. claimExpiry set correctly
    function test_SettleDelayed_SetsClaimExpiry() public {
        vm.warp(1_000_000);
        vm.prank(controller);
        pool.settleDelayed(CLAIM_WINDOW);

        assertEq(pool.claimExpiry(), 1_000_000 + CLAIM_WINDOW);
    }

    // 26. isSettled=true, outcome=Delayed
    function test_SettleDelayed_SetsState() public {
        vm.prank(controller);
        pool.settleDelayed(CLAIM_WINDOW);

        assertTrue(pool.isSettled());
        assertEq(uint8(pool.outcome()), uint8(FlightPool.Outcome.Delayed));
    }

    // 27. each buyer can claim exactly payoff USDC (pull path)
    function test_SettleDelayed_BuyersCanClaim() public {
        address[] memory b = new address[](2);
        b[0] = buyer1; b[1] = buyer2;
        _addBuyers(b);
        _fundPoolForDelayed(2);

        vm.prank(controller);
        pool.settleDelayed(CLAIM_WINDOW);

        // pool distributed in _distributePayout loop: buyer1 and buyer2 each got payoff
        // via low-level call (successful) — balances are now at buyers, not in pool
        assertEq(usdc.balanceOf(buyer1), PAYOFF);
        assertEq(usdc.balanceOf(buyer2), PAYOFF);
    }

    // 28. remainder returned to RiskVault via recordPremiumIncome
    function test_SettleDelayed_RemainderToVault() public {
        address[] memory b = new address[](1);
        b[0] = buyer1;
        _addBuyers(b); // 1 premium in pool

        // Fund pool for 1 buyer + extra (remainder)
        uint256 extra = 5_000_000;
        usdc.mint(address(pool), PAYOFF + extra);

        vm.prank(controller);
        pool.settleDelayed(CLAIM_WINDOW);

        // buyer1 got PAYOFF, remainder = PREMIUM + extra still in pool after payout
        // remainder = PREMIUM (from buy) + extra
        uint256 expectedRemainder = PREMIUM + extra;
        assertEq(usdc.balanceOf(address(vault)), expectedRemainder);
    }

    // 29 & 30. PayoutFailed emitted for buyer with insufficient balance, other buyers still receive
    function test_SettleDelayed_PayoutFailedEvent() public {
        // buyer1 is index 0 (gets paid first), buyer2 is index 1 (fails — no USDC left)
        vm.prank(controller);
        pool.buyInsurance(buyer1);
        vm.prank(controller);
        pool.buyInsurance(buyer2);

        // Fund only for 1 buyer — buyer1 gets PAYOFF, buyer2's transfer fails
        usdc.mint(address(pool), PAYOFF);

        vm.expectEmit(true, false, false, true, address(pool));
        emit PayoutFailed(buyer2, PAYOFF);

        vm.prank(controller);
        pool.settleDelayed(CLAIM_WINDOW);

        // buyer1 received payoff
        assertEq(usdc.balanceOf(buyer1), PAYOFF);
        // buyer2 received nothing from loop — can claim later
        assertEq(usdc.balanceOf(buyer2), 0);
    }

    // 31. settleDelayed on already-settled pool reverts
    function test_SettleDelayed_RevertAlreadySettled() public {
        vm.startPrank(controller);
        pool.settleDelayed(CLAIM_WINDOW);
        vm.expectRevert(FlightPool.AlreadySettled.selector);
        pool.settleDelayed(CLAIM_WINDOW);
        vm.stopPrank();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // settleCancelled — subtasks 32–34
    // ─────────────────────────────────────────────────────────────────────────

    // 32. settleCancelled sets outcome=Cancelled, isSettled=true
    function test_SettleCancelled_SetsState() public {
        vm.prank(controller);
        pool.settleCancelled(CLAIM_WINDOW);

        assertTrue(pool.isSettled());
        assertEq(uint8(pool.outcome()), uint8(FlightPool.Outcome.Cancelled));
    }

    // 33. buyers can claim() after settleCancelled
    function test_SettleCancelled_BuyersCanClaim() public {
        address[] memory b = new address[](1);
        b[0] = buyer1;
        _addBuyers(b);
        _fundPoolForDelayed(1);

        vm.prank(controller);
        pool.settleCancelled(CLAIM_WINDOW);

        assertEq(usdc.balanceOf(buyer1), PAYOFF);
    }

    // 34. settleCancelled on already-settled pool reverts
    function test_SettleCancelled_RevertAlreadySettled() public {
        vm.startPrank(controller);
        pool.settleCancelled(CLAIM_WINDOW);
        vm.expectRevert(FlightPool.AlreadySettled.selector);
        pool.settleCancelled(CLAIM_WINDOW);
        vm.stopPrank();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // claim() — subtasks 35–41
    // ─────────────────────────────────────────────────────────────────────────

    function _setupDelayedClaim() internal {
        address[] memory b = new address[](1);
        b[0] = buyer1;
        _addBuyers(b);
        _fundPoolForDelayed(1);
        vm.prank(controller);
        pool.settleDelayed(CLAIM_WINDOW);
    }

    // 35 & 36. Buyer whose loop transfer failed calls claim() before expiry — receives payoff,
    //          claimed[buyer] set to true.
    function test_Claim_BeforeExpiry_ReceivesPayoff() public {
        // Deploy pool, buyer1 fails in loop (no funds), then claims manually
        FlightPool p2 = new FlightPool(
            "CC789", "2026-06-03", PREMIUM, PAYOFF,
            controller, address(vault), address(recovery), address(usdc)
        );
        vm.prank(controller);
        p2.buyInsurance(buyer1);
        // No fund → loop fails, buyer1.claimed stays false
        vm.prank(controller);
        p2.settleDelayed(CLAIM_WINDOW);

        // Fund the pool so claim() transfer succeeds
        usdc.mint(address(p2), PAYOFF);

        uint256 before = usdc.balanceOf(buyer1);
        vm.prank(buyer1);
        p2.claim();

        assertEq(usdc.balanceOf(buyer1), before + PAYOFF);
        assertTrue(p2.claimed(buyer1));
    }

    // 37. second claim() by same buyer reverts
    function test_Claim_RevertAlreadyClaimed() public {
        FlightPool p3 = new FlightPool(
            "DD000", "2026-07-01", PREMIUM, PAYOFF,
            controller, address(vault), address(recovery), address(usdc)
        );
        vm.prank(controller);
        p3.buyInsurance(buyer1);
        // No funding → transfer in loop fails → claimed[buyer1] stays false
        vm.prank(controller);
        p3.settleDelayed(CLAIM_WINDOW);

        // Fund for first claim
        usdc.mint(address(p3), PAYOFF * 2);

        vm.prank(buyer1);
        p3.claim();

        vm.prank(buyer1);
        vm.expectRevert(FlightPool.AlreadyClaimed.selector);
        p3.claim();
    }

    // 38. non-buyer claim() reverts
    function test_Claim_RevertNonBuyer() public {
        vm.prank(controller);
        pool.settleDelayed(CLAIM_WINDOW);

        vm.prank(nonBuyer);
        vm.expectRevert(FlightPool.NotBuyer.selector);
        pool.claim();
    }

    // 39. claim() after expiry reverts
    function test_Claim_RevertAfterExpiry() public {
        vm.prank(controller);
        pool.buyInsurance(buyer1);
        // No fund — loop fails, buyer1 has no PAYOFF yet
        vm.prank(controller);
        pool.settleDelayed(CLAIM_WINDOW);

        vm.warp(block.timestamp + CLAIM_WINDOW + 1);

        vm.prank(buyer1);
        vm.expectRevert(FlightPool.ClaimExpired.selector);
        pool.claim();
    }

    // 40. claim() on not-delayed pool (outcome=NotDelayed) reverts
    function test_Claim_RevertNotClaimable() public {
        vm.prank(controller);
        pool.settleNotDelayed();

        vm.prank(buyer1);
        vm.expectRevert(FlightPool.NotClaimable.selector);
        pool.claim();
    }

    // 41. canClaim returns correct value for each state
    function test_CanClaim_StateMatrix() public {
        // Before settlement
        assertFalse(pool.canClaim(buyer1));

        vm.prank(controller);
        pool.buyInsurance(buyer1);
        // Still not settled
        assertFalse(pool.canClaim(buyer1));

        // Not funded → loop fails → buyer1 can claim
        vm.prank(controller);
        pool.settleDelayed(CLAIM_WINDOW);
        assertTrue(pool.canClaim(buyer1));

        // Non-buyer
        assertFalse(pool.canClaim(nonBuyer));

        // After claiming
        usdc.mint(address(pool), PAYOFF);
        vm.prank(buyer1);
        pool.claim();
        assertFalse(pool.canClaim(buyer1));
    }

    function test_CanClaim_AfterExpiry() public {
        vm.prank(controller);
        pool.buyInsurance(buyer1);
        vm.prank(controller);
        pool.settleDelayed(CLAIM_WINDOW);

        vm.warp(block.timestamp + CLAIM_WINDOW + 1);
        assertFalse(pool.canClaim(buyer1));
    }

    function test_CanClaim_NotDelayedPool() public {
        vm.prank(controller);
        pool.buyInsurance(buyer1);
        vm.prank(controller);
        pool.settleNotDelayed();
        assertFalse(pool.canClaim(buyer1));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // sweepExpired — subtasks 42–46
    // ─────────────────────────────────────────────────────────────────────────

    function _settleDelayedWithNoFund() internal {
        vm.prank(controller);
        pool.buyInsurance(buyer1);
        vm.prank(controller);
        pool.settleDelayed(CLAIM_WINDOW);
        // buyer1's transfer failed in loop, pool has 0 USDC
    }

    // 42. sweepExpired before expiry reverts
    function test_SweepExpired_RevertBeforeExpiry() public {
        _settleDelayedWithNoFund();

        vm.prank(anyone);
        vm.expectRevert(FlightPool.ClaimWindowOpen.selector);
        pool.sweepExpired();
    }

    // 43. sweepExpired after expiry transfers remaining USDC to RecoveryPool
    function test_SweepExpired_TransfersToRecovery() public {
        _settleDelayedWithNoFund();
        usdc.mint(address(pool), PAYOFF); // simulate unclaimed balance

        vm.warp(block.timestamp + CLAIM_WINDOW + 1);
        vm.prank(anyone);
        pool.sweepExpired();

        assertEq(usdc.balanceOf(address(recovery)), PAYOFF);
        assertEq(usdc.balanceOf(address(pool)), 0);
    }

    // 44. RecoveryPool records correct source and amount
    function test_SweepExpired_RecoveryPoolRecords() public {
        _settleDelayedWithNoFund();
        usdc.mint(address(pool), PAYOFF);

        vm.warp(block.timestamp + CLAIM_WINDOW + 1);
        vm.prank(anyone);
        pool.sweepExpired();

        assertEq(recovery.depositsFrom(address(pool)), PAYOFF);
    }

    // 45. claim() after sweep reverts (no USDC left in pool)
    // Note: claim() itself doesn't check balance — transfer will revert inside ERC20.
    // But the claim guard checks claimed/expiry first. After sweep, claimExpiry is passed → ClaimExpired.
    function test_SweepExpired_ClaimAfterSweepReverts() public {
        _settleDelayedWithNoFund();
        usdc.mint(address(pool), PAYOFF);

        vm.warp(block.timestamp + CLAIM_WINDOW + 1);
        vm.prank(anyone);
        pool.sweepExpired();

        // buyer1 tries to claim after expiry
        vm.prank(buyer1);
        vm.expectRevert(FlightPool.ClaimExpired.selector);
        pool.claim();
    }

    // 46. if all buyers claimed, sweep transfers zero
    function test_SweepExpired_AllClaimedTransfersZero() public {
        vm.prank(controller);
        pool.buyInsurance(buyer1);
        // Don't fund — loop fails, buyer1 can claim manually
        vm.prank(controller);
        pool.settleDelayed(CLAIM_WINDOW);

        // Fund and let buyer1 claim
        usdc.mint(address(pool), PAYOFF);
        vm.prank(buyer1);
        pool.claim();

        // Now pool has 0 USDC — warp past expiry
        vm.warp(block.timestamp + CLAIM_WINDOW + 1);
        vm.prank(anyone);
        pool.sweepExpired();

        assertEq(usdc.balanceOf(address(recovery)), 0);
        assertEq(recovery.depositsFrom(address(pool)), 0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // View functions
    // ─────────────────────────────────────────────────────────────────────────

    function test_MaxLiability() public {
        assertEq(pool.maxLiability(), 0);

        vm.prank(controller);
        pool.buyInsurance(buyer1);
        assertEq(pool.maxLiability(), PAYOFF);

        vm.prank(controller);
        pool.buyInsurance(buyer2);
        assertEq(pool.maxLiability(), 2 * PAYOFF);
    }

    function test_TotalPremiumsHeld() public {
        assertEq(pool.totalPremiumsHeld(), 0);
        usdc.mint(address(pool), PREMIUM);
        assertEq(pool.totalPremiumsHeld(), PREMIUM);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Additional edge cases
    // ─────────────────────────────────────────────────────────────────────────

    // Non-controller cannot call closePool, settleNotDelayed, settleDelayed, settleCancelled
    function test_OnlyController_ClosePool() public {
        vm.prank(anyone);
        vm.expectRevert(FlightPool.Unauthorized.selector);
        pool.closePool();
    }

    function test_OnlyController_SettleNotDelayed() public {
        vm.prank(anyone);
        vm.expectRevert(FlightPool.Unauthorized.selector);
        pool.settleNotDelayed();
    }

    function test_OnlyController_SettleDelayed() public {
        vm.prank(anyone);
        vm.expectRevert(FlightPool.Unauthorized.selector);
        pool.settleDelayed(CLAIM_WINDOW);
    }

    function test_OnlyController_SettleCancelled() public {
        vm.prank(anyone);
        vm.expectRevert(FlightPool.Unauthorized.selector);
        pool.settleCancelled(CLAIM_WINDOW);
    }

    // claim() reverts if pool not yet settled
    function test_Claim_RevertNotSettled() public {
        vm.prank(controller);
        pool.buyInsurance(buyer1);

        vm.prank(buyer1);
        vm.expectRevert(FlightPool.NotSettled.selector);
        pool.claim();
    }

    // sweepExpired reverts if pool not yet settled
    function test_SweepExpired_RevertNotSettled() public {
        vm.prank(anyone);
        vm.expectRevert(FlightPool.NotSettled.selector);
        pool.sweepExpired();
    }

    // settleDelayed with 3 buyers, all successful payouts, zero remainder
    function test_SettleDelayed_ThreeBuyersFullPayout() public {
        address[] memory b = new address[](3);
        b[0] = buyer1; b[1] = buyer2; b[2] = buyer3;
        _addBuyers(b);
        _fundPoolForDelayed(3);

        vm.prank(controller);
        pool.settleDelayed(CLAIM_WINDOW);

        assertEq(usdc.balanceOf(buyer1), PAYOFF);
        assertEq(usdc.balanceOf(buyer2), PAYOFF);
        assertEq(usdc.balanceOf(buyer3), PAYOFF);
        // premiums (3*PREMIUM) are remainder → vault
        assertEq(usdc.balanceOf(address(vault)), 3 * PREMIUM);
    }
}
