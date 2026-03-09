// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "forge-std/Test.sol";
import "../src/RecoveryPool.sol";
import "../src/MockUSDC.sol";

contract RecoveryPoolTest is Test {
    RecoveryPool pool;
    MockUSDC     usdc;

    address owner     = address(this);
    address alice     = makeAddr("alice");
    address poolA     = makeAddr("poolA");
    address poolB     = makeAddr("poolB");

    uint256 constant ONE_USDC  = 1_000_000;
    uint256 constant FIFTY     = 50_000_000;
    uint256 constant HUNDRED   = 100_000_000;

    function setUp() public {
        usdc = new MockUSDC();
        pool = new RecoveryPool(address(usdc));
    }

    // Helper: put USDC directly in the RecoveryPool (simulates FlightPool transfer)
    function _fund(uint256 amount) internal {
        usdc.mint(address(pool), amount);
    }

    // ── Subtask 4: _recordDeposit from mock address records correctly ────────

    function test_recordDeposit_singleDeposit() public {
        vm.prank(poolA);
        pool._recordDeposit(poolA, FIFTY);

        assertEq(pool.depositsFrom(poolA), FIFTY);
    }

    // ── Subtask 5: second _recordDeposit from same pool accumulates ──────────

    function test_recordDeposit_accumulates() public {
        vm.prank(poolA);
        pool._recordDeposit(poolA, FIFTY);

        vm.prank(poolA);
        pool._recordDeposit(poolA, HUNDRED);

        assertEq(pool.depositsFrom(poolA), FIFTY + HUNDRED);
    }

    // ── Subtask 6: owner can withdraw full balance to any recipient ──────────

    function test_withdraw_ownerCanWithdrawToAnyRecipient() public {
        _fund(HUNDRED);

        pool.withdraw(HUNDRED, alice);

        assertEq(usdc.balanceOf(alice),          HUNDRED);
        assertEq(usdc.balanceOf(address(pool)),  0);
    }

    // ── Subtask 7: non-owner withdraw reverts ────────────────────────────────

    function test_withdraw_nonOwnerReverts() public {
        _fund(HUNDRED);

        vm.prank(alice);
        vm.expectRevert();
        pool.withdraw(HUNDRED, alice);
    }

    // ── Subtask 8: multiple pools tracked independently ──────────────────────

    function test_recordDeposit_multiplePoolsTrackedIndependently() public {
        vm.prank(poolA);
        pool._recordDeposit(poolA, FIFTY);

        vm.prank(poolB);
        pool._recordDeposit(poolB, HUNDRED);

        assertEq(pool.depositsFrom(poolA), FIFTY);
        assertEq(pool.depositsFrom(poolB), HUNDRED);
    }

    // ── Subtask 9: withdraw more than balance reverts ────────────────────────

    function test_withdraw_moreThanBalanceReverts() public {
        _fund(FIFTY);

        vm.expectRevert();
        pool.withdraw(HUNDRED, alice);
    }
}
