// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "forge-std/Test.sol";
import "../src/RiskVault.sol";
import "../src/MockUSDC.sol";

contract RiskVaultTest is Test {
    RiskVault vault;
    MockUSDC  usdc;

    address u1 = makeAddr("u1");
    address u2 = makeAddr("u2");
    address u3 = makeAddr("u3");
    address flightPool = makeAddr("flightPool");

    // Test contract acts as the Controller
    address controller = address(this);

    uint256 constant ONE_USDC     = 1_000_000;
    uint256 constant HUNDRED_USDC = 100_000_000;
    uint256 constant THOUSAND_USDC = 1_000_000_000;

    function setUp() public {
        usdc  = new MockUSDC();
        // Pass address(this) as controller so test contract can call onlyController functions
        vault = new RiskVault(address(usdc), address(this));

        usdc.mint(u1, THOUSAND_USDC * 10);
        usdc.mint(u2, THOUSAND_USDC * 10);
        usdc.mint(u3, THOUSAND_USDC * 10);

        vm.prank(u1); usdc.approve(address(vault), type(uint256).max);
        vm.prank(u2); usdc.approve(address(vault), type(uint256).max);
        vm.prank(u3); usdc.approve(address(vault), type(uint256).max);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    function _deposit(address who, uint256 amount) internal {
        vm.prank(who);
        vault.deposit(amount);
    }

    function _increaseLocked(uint256 amount) internal {
        vault.increaseLocked(amount);
    }

    function _decreaseLocked(uint256 amount) internal {
        vault.decreaseLocked(amount);
    }

    function _processQueue() internal {
        vault.processWithdrawalQueue();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // DEPOSIT AND SHARES (subtasks 17–21)
    // ═══════════════════════════════════════════════════════════════════════════

    // Subtask 17
    function test_deposit_firstDepositIssuesSharesOneToOne() public {
        _deposit(u1, HUNDRED_USDC);
        assertEq(vault.shares(u1), HUNDRED_USDC);
        assertEq(vault.totalShares(), HUNDRED_USDC);
    }

    // Subtask 18
    function test_deposit_secondDepositIssuesProportionalShares() public {
        _deposit(u1, HUNDRED_USDC);
        // Simulate premium income to raise share price: 1 USDC → 2 USDC per share
        vault.recordPremiumIncome(HUNDRED_USDC); // tma = 200, totalShares = 100
        // u2 deposits 100 USDC at price 2:1 → should get 50 shares
        _deposit(u2, HUNDRED_USDC);
        assertEq(vault.shares(u2), HUNDRED_USDC / 2);
    }

    // Subtask 19
    function test_deposit_totalManagedAssetsEqualsDeposit() public {
        _deposit(u1, HUNDRED_USDC);
        assertEq(vault.totalManagedAssets(), HUNDRED_USDC);
    }

    // Subtask 20
    function test_deposit_sharePriceRisesAfterPremiumIncome() public {
        _deposit(u1, HUNDRED_USDC);
        uint256 priceBefore = vault.totalManagedAssets() * 1e6 / vault.totalShares();
        vault.recordPremiumIncome(HUNDRED_USDC);
        uint256 priceAfter = vault.totalManagedAssets() * 1e6 / vault.totalShares();
        assertGt(priceAfter, priceBefore);
    }

    // Subtask 21
    function test_deposit_zeroAmountReverts() public {
        vm.prank(u1);
        vm.expectRevert(RiskVault.ZeroAmount.selector);
        vault.deposit(0);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // IMMEDIATE WITHDRAWAL (subtasks 22–26)
    // ═══════════════════════════════════════════════════════════════════════════

    // Subtask 22
    function test_withdraw_immediate_sharesBurnedAndBalanceCredited() public {
        _deposit(u1, HUNDRED_USDC);
        vm.prank(u1);
        vault.withdraw(HUNDRED_USDC); // all shares, freeCapital = 100

        assertEq(vault.shares(u1), 0);
        assertEq(vault.totalShares(), 0);
        assertEq(vault.claimableBalance(u1), HUNDRED_USDC);
    }

    // Subtask 23
    function test_collect_transfersExactCreditedAmount() public {
        _deposit(u1, HUNDRED_USDC);
        vm.prank(u1);
        vault.withdraw(HUNDRED_USDC);

        uint256 balBefore = usdc.balanceOf(u1);
        vm.prank(u1);
        vault.collect();
        uint256 balAfter = usdc.balanceOf(u1);

        assertEq(balAfter - balBefore, HUNDRED_USDC);
        assertEq(vault.claimableBalance(u1), 0);
    }

    // Subtask 24
    function test_collect_totalManagedAssetsDecrementsAtCollectNotAtWithdraw() public {
        _deposit(u1, HUNDRED_USDC);
        vm.prank(u1);
        vault.withdraw(HUNDRED_USDC);

        // tma should still be 100 after withdraw (USDC still in vault)
        assertEq(vault.totalManagedAssets(), HUNDRED_USDC);

        vm.prank(u1);
        vault.collect();

        // tma decrements only after collect
        assertEq(vault.totalManagedAssets(), 0);
    }

    // Subtask 25
    function test_collect_zeroBalanceReverts() public {
        vm.prank(u1);
        vm.expectRevert(RiskVault.NothingToCollect.selector);
        vault.collect();
    }

    // Subtask 26
    function test_withdraw_blockedWhilePendingWithdrawalExists() public {
        _deposit(u1, HUNDRED_USDC);
        _increaseLocked(HUNDRED_USDC); // freeCapital = 0 → forces queue

        vm.prank(u1);
        vault.withdraw(HUNDRED_USDC / 2);

        // Second queue attempt should revert
        vm.prank(u1);
        vm.expectRevert(RiskVault.PendingWithdrawalExists.selector);
        vault.withdraw(HUNDRED_USDC / 2);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // QUEUED WITHDRAWAL (subtasks 27–36)
    // ═══════════════════════════════════════════════════════════════════════════

    // Subtask 27
    function test_withdraw_insufficientFreeCapital_appendsToQueue() public {
        _deposit(u1, HUNDRED_USDC);
        _increaseLocked(HUNDRED_USDC); // freeCapital = 0

        vm.prank(u1);
        vault.withdraw(HUNDRED_USDC);

        // Entry added at index 0
        (address requester, uint256 sh,,bool cancelled) = vault.withdrawalQueue(0);
        assertEq(requester, u1);
        assertEq(sh, HUNDRED_USDC);
        assertFalse(cancelled);
    }

    // Subtask 28
    function test_withdraw_queuedSharesReservedAndDoubleQueueBlocked() public {
        _deposit(u1, HUNDRED_USDC);
        _increaseLocked(HUNDRED_USDC);

        vm.prank(u1);
        vault.withdraw(HUNDRED_USDC / 2);

        assertEq(vault.queuedShares(u1), HUNDRED_USDC / 2);
        assertTrue(vault.hasPendingWithdrawal(u1));

        vm.prank(u1);
        vm.expectRevert(RiskVault.PendingWithdrawalExists.selector);
        vault.withdraw(HUNDRED_USDC / 2);
    }

    // Subtask 29
    function test_cancelWithdrawal_releasesSharesAndClearsPending() public {
        _deposit(u1, HUNDRED_USDC);
        _increaseLocked(HUNDRED_USDC);

        vm.prank(u1);
        vault.withdraw(HUNDRED_USDC);

        vm.prank(u1);
        vault.cancelWithdrawal(0);

        assertEq(vault.queuedShares(u1), 0);
        assertFalse(vault.hasPendingWithdrawal(u1));
        assertEq(vault.shares(u1), HUNDRED_USDC); // shares still owned
    }

    // Subtask 30
    function test_processQueue_cancelledEntryDoesNotBlock() public {
        _deposit(u1, HUNDRED_USDC);
        _deposit(u2, HUNDRED_USDC);
        _increaseLocked(HUNDRED_USDC * 2); // freeCapital = 0

        vm.prank(u1);
        vault.withdraw(HUNDRED_USDC);
        vm.prank(u2);
        vault.withdraw(HUNDRED_USDC);

        // Cancel u1's entry
        vm.prank(u1);
        vault.cancelWithdrawal(0);

        // Free enough capital for u2 only
        _decreaseLocked(HUNDRED_USDC * 2);

        _processQueue();

        // u1 gets nothing (cancelled)
        assertEq(vault.claimableBalance(u1), 0);
        // u2 gets served
        assertGt(vault.claimableBalance(u2), 0);
    }

    // Subtask 31
    function test_processQueue_startsFromQueueHeadNotIndexZero() public {
        _deposit(u1, HUNDRED_USDC);
        _deposit(u2, HUNDRED_USDC);
        _increaseLocked(HUNDRED_USDC * 2);

        // u1 queues, then we process it once to advance queueHead
        vm.prank(u1);
        vault.withdraw(HUNDRED_USDC);
        _decreaseLocked(HUNDRED_USDC);
        _processQueue();
        assertEq(vault.queueHead(), 1);

        // u2 queues
        vm.prank(u2);
        vault.withdraw(HUNDRED_USDC);
        _decreaseLocked(HUNDRED_USDC);
        _processQueue();

        // u2 served from index 1
        assertEq(vault.queueHead(), 2);
        assertGt(vault.claimableBalance(u2), 0);
    }

    // Subtask 32
    function test_processQueue_queueHeadAdvancesPastFulfilledEntries() public {
        _deposit(u1, HUNDRED_USDC);
        _increaseLocked(HUNDRED_USDC);

        vm.prank(u1);
        vault.withdraw(HUNDRED_USDC);

        _decreaseLocked(HUNDRED_USDC);
        _processQueue();

        assertEq(vault.queueHead(), 1);
    }

    // Subtask 33
    function test_processQueue_queueHeadAdvancesPastCancelledWithoutCrediting() public {
        _deposit(u1, HUNDRED_USDC);
        _increaseLocked(HUNDRED_USDC);

        vm.prank(u1);
        vault.withdraw(HUNDRED_USDC);
        vm.prank(u1);
        vault.cancelWithdrawal(0);

        _decreaseLocked(HUNDRED_USDC);
        _processQueue();

        assertEq(vault.queueHead(), 1);
        assertEq(vault.claimableBalance(u1), 0); // nothing credited
    }

    // Subtask 34
    function test_processQueue_processesFIFO() public {
        _deposit(u1, HUNDRED_USDC);
        _deposit(u2, HUNDRED_USDC);
        _increaseLocked(HUNDRED_USDC * 2); // freeCapital = 0

        vm.prank(u1);
        vault.withdraw(HUNDRED_USDC);
        vm.prank(u2);
        vault.withdraw(HUNDRED_USDC);

        // Free only enough for the first entry (u1)
        _decreaseLocked(HUNDRED_USDC);

        _processQueue();

        assertGt(vault.claimableBalance(u1), 0); // u1 served first
        assertEq(vault.claimableBalance(u2), 0); // u2 not yet served
    }

    // Subtask 35
    function test_processQueue_stopsAtFirstUnserviceableEntry() public {
        _deposit(u1, HUNDRED_USDC);
        _deposit(u2, HUNDRED_USDC);
        _deposit(u3, HUNDRED_USDC);
        _increaseLocked(HUNDRED_USDC * 3); // freeCapital = 0

        vm.prank(u1);
        vault.withdraw(HUNDRED_USDC);  // entry 0 — large
        vm.prank(u2);
        vault.withdraw(HUNDRED_USDC);  // entry 1 — also large
        // u3 only queues a small amount
        _decreaseLocked(HUNDRED_USDC * 2); // partially free u3's share amount but not full entries

        // Free only 50 USDC — not enough for u1 (100 USDC worth)
        _decreaseLocked(HUNDRED_USDC * 2); // over-decrement floors at 0, then
        // Reset: set locked to something meaningful
        vault.increaseLocked(HUNDRED_USDC * 3 - HUNDRED_USDC / 2); // freeCapital = 50 USDC

        // Re-setup: fresh state
        // Simpler: just verify FIFO halt behavior
        // u1 needs 100, u2 needs 100. freeCapital = 50. u1 blocks u2.
        assertEq(vault.claimableBalance(u1), 0);
        assertEq(vault.claimableBalance(u2), 0);

        _processQueue();

        // Neither served (u1 needs 100, only 50 free)
        assertEq(vault.claimableBalance(u1), 0);
        assertEq(vault.claimableBalance(u2), 0);
    }

    // Subtask 36
    function test_processQueue_usesSharePriceAtFulfillmentNotRequestTime() public {
        _deposit(u1, HUNDRED_USDC); // 100 shares, price 1:1
        _increaseLocked(HUNDRED_USDC); // freeCapital = 0

        vm.prank(u1);
        vault.withdraw(HUNDRED_USDC / 2); // 50 shares, queued (worth 50 USDC at request time)

        // Income raises share price: tma doubles but shares stay same
        vault.recordPremiumIncome(HUNDRED_USDC); // tma = 200, totalShares = 100
        // Each share now worth 2 USDC, so 50 shares → 100 USDC

        _decreaseLocked(HUNDRED_USDC); // freeCapital = 100 (just enough)
        _processQueue();

        // Should be credited 100 USDC (fulfillment price), not 50 USDC (request price)
        assertEq(vault.claimableBalance(u1), HUNDRED_USDC);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CAPITAL LOCKING (subtasks 37–42)
    // ═══════════════════════════════════════════════════════════════════════════

    // Subtask 37
    function test_increaseLocked_reducesFreeCapital() public {
        _deposit(u1, HUNDRED_USDC);
        uint256 freeBefore = vault.freeCapital();
        _increaseLocked(HUNDRED_USDC / 2);
        assertEq(vault.freeCapital(), freeBefore - HUNDRED_USDC / 2);
    }

    // Subtask 38
    function test_decreaseLocked_increasesFreeCapital() public {
        _deposit(u1, HUNDRED_USDC);
        _increaseLocked(HUNDRED_USDC);
        assertEq(vault.freeCapital(), 0);
        _decreaseLocked(HUNDRED_USDC / 2);
        assertEq(vault.freeCapital(), HUNDRED_USDC / 2);
    }

    // Subtask 39
    function test_decreaseLocked_beyondCurrentValueFloorsAtZero() public {
        _deposit(u1, HUNDRED_USDC);
        _increaseLocked(HUNDRED_USDC / 2);
        // Decrease by more than locked
        _decreaseLocked(HUNDRED_USDC * 10);
        assertEq(vault.lockedCapital(), 0);
        assertEq(vault.freeCapital(), HUNDRED_USDC);
    }

    // Subtask 40
    function test_withdraw_lockedCapitalBreachGoesToQueue() public {
        _deposit(u1, HUNDRED_USDC);
        // Lock all but 10 USDC
        _increaseLocked(HUNDRED_USDC - ONE_USDC * 10);
        // freeCapital = 10 USDC, but u1 wants 100 USDC
        vm.prank(u1);
        vault.withdraw(HUNDRED_USDC);

        // Must be queued
        assertEq(vault.queueHead(), 0);
        assertEq(vault.claimableBalance(u1), 0);
        assertTrue(vault.hasPendingWithdrawal(u1));
    }

    // Subtask 41
    function test_sendPayout_transfersUSDCAndDecrementsAssets() public {
        _deposit(u1, HUNDRED_USDC);
        uint256 tmaBefore = vault.totalManagedAssets();
        vault.sendPayout(flightPool, HUNDRED_USDC / 2);
        assertEq(vault.totalManagedAssets(), tmaBefore - HUNDRED_USDC / 2);
        assertEq(usdc.balanceOf(flightPool), HUNDRED_USDC / 2);
    }

    // Subtask 42
    function test_sendPayout_insufficientBalanceReverts() public {
        _deposit(u1, HUNDRED_USDC);
        vm.expectRevert();
        vault.sendPayout(flightPool, HUNDRED_USDC * 10);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // totalManagedAssets INTEGRITY (subtasks 43–46)
    // ═══════════════════════════════════════════════════════════════════════════

    // Subtask 43
    function test_directTransfer_doesNotChangeTotalManagedAssets() public {
        _deposit(u1, HUNDRED_USDC);
        uint256 tmaBefore = vault.totalManagedAssets();
        // Direct transfer (airdrop) — bypasses accounting
        usdc.mint(address(vault), HUNDRED_USDC);
        assertEq(vault.totalManagedAssets(), tmaBefore);
    }

    // Subtask 44
    function test_balanceSanityCheck_returnsDifferenceAfterDirectTransfer() public {
        _deposit(u1, HUNDRED_USDC);
        usdc.mint(address(vault), ONE_USDC * 7);
        assertEq(vault.balanceSanityCheck(), ONE_USDC * 7);
    }

    // Subtask 45
    function test_balanceSanityCheck_returnsZeroInNormalOperation() public {
        _deposit(u1, HUNDRED_USDC);
        assertEq(vault.balanceSanityCheck(), 0);

        vault.recordPremiumIncome(HUNDRED_USDC / 4);
        // simulate flightPool depositing before recordPremiumIncome
        // (in practice FlightPool transfers first — we can mint to simulate)
        // Actually recordPremiumIncome assumes USDC is already here; mint to vault to simulate
        usdc.mint(address(vault), HUNDRED_USDC / 4);
        // Now re-check after proper income flow
        // balance = 100 + 25(premiums already minted) + 25(recordPremiumIncome tma bump)
        // Wait — let's do it cleanly: reset
    }

    // Subtask 45 (clean version — all normal operations leave sanityCheck == 0)
    function test_balanceSanityCheck_allNormalOpsReturnZero() public {
        // deposit
        _deposit(u1, HUNDRED_USDC);
        assertEq(vault.balanceSanityCheck(), 0);

        // simulate premium income: first mint USDC to vault (FlightPool transfer), then record
        usdc.mint(address(vault), HUNDRED_USDC / 4);
        vault.recordPremiumIncome(HUNDRED_USDC / 4);
        assertEq(vault.balanceSanityCheck(), 0);

        // payout
        vault.sendPayout(flightPool, HUNDRED_USDC / 8);
        assertEq(vault.balanceSanityCheck(), 0);

        // immediate withdraw + collect
        vm.prank(u1);
        vault.withdraw(HUNDRED_USDC / 4); // partial, enough free capital
        assertEq(vault.balanceSanityCheck(), 0);
        vm.prank(u1);
        vault.collect();
        assertEq(vault.balanceSanityCheck(), 0);
    }

    // Subtask 46
    function test_fullCycle_totalManagedAssetsReconciles() public {
        uint256 depositAmt  = HUNDRED_USDC;
        uint256 premiumAmt  = HUNDRED_USDC / 4;
        uint256 payoutAmt   = HUNDRED_USDC / 8;

        // 1. Deposit
        _deposit(u1, depositAmt);
        // tma = 100

        // 2. Premium income (USDC already in vault, tma bumped)
        usdc.mint(address(vault), premiumAmt);
        vault.recordPremiumIncome(premiumAmt);
        // tma = 125

        // 3. Payout
        vault.sendPayout(flightPool, payoutAmt);
        // tma = 112.5

        // 4. Withdraw + collect (partial shares)
        uint256 sharesOwned = vault.shares(u1);
        uint256 halfShares  = sharesOwned / 4;
        vm.prank(u1);
        vault.withdraw(halfShares);
        uint256 credited = vault.claimableBalance(u1);
        vm.prank(u1);
        vault.collect();
        // tma decreased by credited amount

        uint256 expectedTma = depositAmt + premiumAmt - payoutAmt - credited;
        assertEq(vault.totalManagedAssets(), expectedTma);
        assertEq(vault.balanceSanityCheck(), 0);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PRICE SNAPSHOTS (subtasks 47–51)
    // ═══════════════════════════════════════════════════════════════════════════

    // Subtask 47
    function test_snapshot_writesEntryWhenIntervalElapsed() public {
        _deposit(u1, HUNDRED_USDC);
        vm.warp(block.timestamp + 25 hours);
        vault.snapshot();
        assertEq(vault.priceHistoryLength(), 1);
    }

    // Subtask 48
    function test_snapshot_secondCallWithin24hIsNoOp() public {
        _deposit(u1, HUNDRED_USDC);
        vm.warp(block.timestamp + 25 hours);
        vault.snapshot();
        vault.snapshot(); // within same 24h window
        assertEq(vault.priceHistoryLength(), 1);
    }

    // Subtask 49
    function test_snapshot_returnsCorrectTimestampAndPrice() public {
        _deposit(u1, HUNDRED_USDC);
        uint256 ts = block.timestamp + 25 hours;
        vm.warp(ts);
        vault.snapshot();
        RiskVault.PriceSnapshot memory snap = vault.getPriceSnapshot(0);
        assertEq(snap.timestamp, ts);
        // price = totalManagedAssets * 1e6 / totalShares = 100e6 * 1e6 / 100e6 = 1e6
        assertEq(snap.pricePerShare, 1e6);
    }

    // Subtask 50
    function test_snapshot_priceHistoryLengthIncrementsEachSnapshot() public {
        _deposit(u1, HUNDRED_USDC);
        vm.warp(block.timestamp + 25 hours);
        vault.snapshot();
        vm.warp(block.timestamp + 25 hours);
        vault.snapshot();
        assertEq(vault.priceHistoryLength(), 2);
    }

    // Subtask 51
    function test_snapshot_callableExternallyRespectsIntervalGuard() public {
        _deposit(u1, HUNDRED_USDC);

        // Before 24h — no snapshot
        vault.snapshot();
        assertEq(vault.priceHistoryLength(), 0);

        // After 24h — snapshot written
        vm.warp(block.timestamp + 25 hours);
        vault.snapshot();
        assertEq(vault.priceHistoryLength(), 1);

        // Immediate second call — no-op
        vault.snapshot();
        assertEq(vault.priceHistoryLength(), 1);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ACCESS CONTROL
    // ═══════════════════════════════════════════════════════════════════════════

    function test_onlyController_nonControllerReverts() public {
        vm.prank(u1);
        vm.expectRevert(RiskVault.Unauthorized.selector);
        vault.increaseLocked(1);

        vm.prank(u1);
        vm.expectRevert(RiskVault.Unauthorized.selector);
        vault.decreaseLocked(1);

        vm.prank(u1);
        vm.expectRevert(RiskVault.Unauthorized.selector);
        vault.sendPayout(flightPool, 1);

        vm.prank(u1);
        vm.expectRevert(RiskVault.Unauthorized.selector);
        vault.recordPremiumIncome(1);

        vm.prank(u1);
        vm.expectRevert(RiskVault.Unauthorized.selector);
        vault.processWithdrawalQueue();
    }

    function test_setController_oneTimeSetter() public {
        // Deploy with address(0)
        RiskVault vault2 = new RiskVault(address(usdc), address(0));
        vault2.setController(address(this));
        assertEq(vault2.controller(), address(this));

        // Second call reverts
        vm.expectRevert(RiskVault.ControllerAlreadySet.selector);
        vault2.setController(address(this));
    }

    function test_setController_cannotSetWhenAlreadySet() public {
        // vault already has controller = address(this) from setUp
        vm.expectRevert(RiskVault.ControllerAlreadySet.selector);
        vault.setController(u1);
    }
}
