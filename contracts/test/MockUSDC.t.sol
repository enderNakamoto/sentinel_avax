// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "forge-std/Test.sol";
import "../src/MockUSDC.sol";

contract MockUSDCTest is Test {
    MockUSDC usdc;

    address owner   = address(this);
    address alice   = makeAddr("alice");
    address bob     = makeAddr("bob");
    address controller = makeAddr("controller");
    address flightPool = makeAddr("flightPool");

    function setUp() public {
        usdc = new MockUSDC();
    }

    // ── Subtask 7: 6-decimal arithmetic ─────────────────────────────────────

    function test_decimals() public view {
        assertEq(usdc.decimals(), 6);
    }

    function test_sixDecimalUnits() public {
        uint256 oneUsdc   = 1_000_000;
        uint256 halfUsdc  = 500_000;

        usdc.mint(alice, oneUsdc);
        assertEq(usdc.balanceOf(alice), oneUsdc);

        vm.prank(alice);
        usdc.transfer(bob, halfUsdc);
        assertEq(usdc.balanceOf(alice), halfUsdc);
        assertEq(usdc.balanceOf(bob),   halfUsdc);
    }

    // ── Subtask 3: transfer ──────────────────────────────────────────────────

    function test_transfer() public {
        uint256 amount = 100_000_000; // 100 USDC
        usdc.mint(alice, amount);

        vm.prank(alice);
        usdc.transfer(bob, amount);

        assertEq(usdc.balanceOf(alice), 0);
        assertEq(usdc.balanceOf(bob),   amount);
    }

    // ── Subtask 6: balanceOf after transfer ──────────────────────────────────

    function test_balanceOf_updatesAfterTransfer() public {
        uint256 start = 50_000_000; // 50 USDC
        uint256 send  = 20_000_000; // 20 USDC

        usdc.mint(alice, start);
        assertEq(usdc.balanceOf(alice), start, "balance before transfer");

        vm.prank(alice);
        usdc.transfer(bob, send);

        assertEq(usdc.balanceOf(alice), start - send, "alice after");
        assertEq(usdc.balanceOf(bob),   send,          "bob after");
    }

    // ── Subtask 4: transferFrom ───────────────────────────────────────────────

    function test_transferFrom() public {
        uint256 premium = 10_000_000; // 10 USDC
        usdc.mint(alice, premium);

        vm.prank(alice);
        usdc.approve(controller, premium);

        vm.prank(controller);
        usdc.transferFrom(alice, flightPool, premium);

        assertEq(usdc.balanceOf(alice),      0);
        assertEq(usdc.balanceOf(flightPool), premium);
        assertEq(usdc.allowance(alice, controller), 0);
    }

    // ── Subtask 5: approve and allowance ─────────────────────────────────────

    function test_approveAndAllowance() public {
        uint256 allowance = 25_000_000; // 25 USDC
        uint256 spend     = 10_000_000; // 10 USDC

        usdc.mint(alice, allowance);

        vm.prank(alice);
        usdc.approve(controller, allowance);
        assertEq(usdc.allowance(alice, controller), allowance, "allowance set");

        vm.prank(controller);
        usdc.transferFrom(alice, bob, spend);
        assertEq(usdc.allowance(alice, controller), allowance - spend, "allowance decremented");
    }

    // ── Subtask 8: mint to zero address reverts ───────────────────────────────

    function test_mintToZeroReverts() public {
        vm.expectRevert();
        usdc.mint(address(0), 1_000_000);
    }

    // ── Access control: non-owner cannot mint ────────────────────────────────

    function test_mintOnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        usdc.mint(alice, 1_000_000);
    }
}
