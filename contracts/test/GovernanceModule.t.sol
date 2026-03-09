// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/GovernanceModule.sol";

contract GovernanceModuleTest is Test {
    GovernanceModule gov;

    address owner = address(this);
    address admin = address(0x1);
    address stranger = address(0x2);

    string constant FLIGHT = "AA123";
    string constant ORIGIN = "DEN";
    string constant DEST = "SEA";

    uint256 constant PREMIUM = 10e6;  // 10 USDC
    uint256 constant PAYOFF  = 100e6; // 100 USDC

    function setUp() public {
        gov = new GovernanceModule(owner);
        gov.addAdmin(admin);
    }

    // -------------------------------------------------------------------------
    // Access control — non-owner/non-admin cannot call route functions
    // -------------------------------------------------------------------------

    function test_strangerCannotApproveRoute() public {
        vm.prank(stranger);
        vm.expectRevert(GovernanceModule.Unauthorized.selector);
        gov.approveRoute(FLIGHT, ORIGIN, DEST, PREMIUM, PAYOFF);
    }

    function test_strangerCannotDisableRoute() public {
        gov.approveRoute(FLIGHT, ORIGIN, DEST, PREMIUM, PAYOFF);
        vm.prank(stranger);
        vm.expectRevert(GovernanceModule.Unauthorized.selector);
        gov.disableRoute(FLIGHT, ORIGIN, DEST);
    }

    function test_strangerCannotUpdateRouteTerms() public {
        gov.approveRoute(FLIGHT, ORIGIN, DEST, PREMIUM, PAYOFF);
        vm.prank(stranger);
        vm.expectRevert(GovernanceModule.Unauthorized.selector);
        gov.updateRouteTerms(FLIGHT, ORIGIN, DEST, 20e6, 200e6);
    }

    // -------------------------------------------------------------------------
    // Access control — non-owner cannot manage admins
    // -------------------------------------------------------------------------

    function test_nonOwnerCannotAddAdmin() public {
        vm.prank(stranger);
        vm.expectRevert();
        gov.addAdmin(stranger);
    }

    function test_nonOwnerCannotRemoveAdmin() public {
        vm.prank(stranger);
        vm.expectRevert();
        gov.removeAdmin(admin);
    }

    function test_adminCannotAddAdmin() public {
        vm.prank(admin);
        vm.expectRevert();
        gov.addAdmin(stranger);
    }

    function test_adminCannotRemoveAdmin() public {
        vm.prank(admin);
        vm.expectRevert();
        gov.removeAdmin(admin);
    }

    // -------------------------------------------------------------------------
    // Admin can call route functions
    // -------------------------------------------------------------------------

    function test_adminCanApproveRoute() public {
        vm.prank(admin);
        gov.approveRoute(FLIGHT, ORIGIN, DEST, PREMIUM, PAYOFF);
        assertTrue(gov.isRouteApproved(FLIGHT, ORIGIN, DEST));
    }

    function test_adminCanDisableRoute() public {
        gov.approveRoute(FLIGHT, ORIGIN, DEST, PREMIUM, PAYOFF);
        vm.prank(admin);
        gov.disableRoute(FLIGHT, ORIGIN, DEST);
        assertFalse(gov.isRouteApproved(FLIGHT, ORIGIN, DEST));
    }

    function test_adminCanUpdateRouteTerms() public {
        gov.approveRoute(FLIGHT, ORIGIN, DEST, PREMIUM, PAYOFF);
        vm.prank(admin);
        gov.updateRouteTerms(FLIGHT, ORIGIN, DEST, 20e6, 200e6);
        (uint256 p, uint256 pay) = gov.getRouteTerms(FLIGHT, ORIGIN, DEST);
        assertEq(p, 20e6);
        assertEq(pay, 200e6);
    }

    // -------------------------------------------------------------------------
    // Revoked admin loses access immediately
    // -------------------------------------------------------------------------

    function test_revokedAdminLosesAccess() public {
        gov.removeAdmin(admin);
        vm.prank(admin);
        vm.expectRevert(GovernanceModule.Unauthorized.selector);
        gov.approveRoute(FLIGHT, ORIGIN, DEST, PREMIUM, PAYOFF);
    }

    // -------------------------------------------------------------------------
    // Route lifecycle
    // -------------------------------------------------------------------------

    function test_approveRouteIsVisible() public {
        gov.approveRoute(FLIGHT, ORIGIN, DEST, PREMIUM, PAYOFF);
        assertTrue(gov.isRouteApproved(FLIGHT, ORIGIN, DEST));
    }

    function test_disableRouteIsNotApproved() public {
        gov.approveRoute(FLIGHT, ORIGIN, DEST, PREMIUM, PAYOFF);
        gov.disableRoute(FLIGHT, ORIGIN, DEST);
        assertFalse(gov.isRouteApproved(FLIGHT, ORIGIN, DEST));
    }

    function test_reApproveDisabledRoute() public {
        gov.approveRoute(FLIGHT, ORIGIN, DEST, PREMIUM, PAYOFF);
        gov.disableRoute(FLIGHT, ORIGIN, DEST);
        gov.approveRoute(FLIGHT, ORIGIN, DEST, 15e6, 150e6);
        assertTrue(gov.isRouteApproved(FLIGHT, ORIGIN, DEST));
        (uint256 p, uint256 pay) = gov.getRouteTerms(FLIGHT, ORIGIN, DEST);
        assertEq(p, 15e6);
        assertEq(pay, 150e6);
    }

    // -------------------------------------------------------------------------
    // getRouteTerms
    // -------------------------------------------------------------------------

    function test_getRouteTermsAfterApproval() public {
        gov.approveRoute(FLIGHT, ORIGIN, DEST, PREMIUM, PAYOFF);
        (uint256 p, uint256 pay) = gov.getRouteTerms(FLIGHT, ORIGIN, DEST);
        assertEq(p, PREMIUM);
        assertEq(pay, PAYOFF);
    }

    function test_getRouteTermsAfterUpdate() public {
        gov.approveRoute(FLIGHT, ORIGIN, DEST, PREMIUM, PAYOFF);
        gov.updateRouteTerms(FLIGHT, ORIGIN, DEST, 25e6, 250e6);
        (uint256 p, uint256 pay) = gov.getRouteTerms(FLIGHT, ORIGIN, DEST);
        assertEq(p, 25e6);
        assertEq(pay, 250e6);
    }

    // -------------------------------------------------------------------------
    // getApprovedRoutes
    // -------------------------------------------------------------------------

    function test_getApprovedRoutesEmptyInitially() public view {
        GovernanceModule.Route[] memory result = gov.getApprovedRoutes();
        assertEq(result.length, 0);
    }

    function test_getApprovedRoutesFiltersDisabled() public {
        gov.approveRoute(FLIGHT, ORIGIN, DEST, PREMIUM, PAYOFF);
        gov.approveRoute("UA456", "LAX", "SFO", 5e6, 50e6);
        gov.disableRoute(FLIGHT, ORIGIN, DEST);

        GovernanceModule.Route[] memory result = gov.getApprovedRoutes();
        assertEq(result.length, 1);
        assertEq(keccak256(bytes(result[0].flightId)), keccak256(bytes("UA456")));
    }

    // -------------------------------------------------------------------------
    // approveRoute validation
    // -------------------------------------------------------------------------

    function test_approveRouteRevertsIfPremiumZero() public {
        vm.expectRevert(GovernanceModule.InvalidTerms.selector);
        gov.approveRoute(FLIGHT, ORIGIN, DEST, 0, PAYOFF);
    }

    function test_approveRouteRevertsIfPayoffEqualPremium() public {
        vm.expectRevert(GovernanceModule.InvalidTerms.selector);
        gov.approveRoute(FLIGHT, ORIGIN, DEST, PREMIUM, PREMIUM);
    }

    function test_approveRouteRevertsIfPayoffLessThanPremium() public {
        vm.expectRevert(GovernanceModule.InvalidTerms.selector);
        gov.approveRoute(FLIGHT, ORIGIN, DEST, PREMIUM, PREMIUM - 1);
    }

    function test_approveRouteRevertsIfAlreadyActive() public {
        gov.approveRoute(FLIGHT, ORIGIN, DEST, PREMIUM, PAYOFF);
        vm.expectRevert(GovernanceModule.RouteAlreadyActive.selector);
        gov.approveRoute(FLIGHT, ORIGIN, DEST, PREMIUM, PAYOFF);
    }

    // -------------------------------------------------------------------------
    // updateRouteTerms validation
    // -------------------------------------------------------------------------

    function test_updateRouteTermsRevertsIfNotExist() public {
        vm.expectRevert(GovernanceModule.RouteDoesNotExist.selector);
        gov.updateRouteTerms(FLIGHT, ORIGIN, DEST, 20e6, 200e6);
    }

    function test_updateRouteTermsRevertsIfPayoffEqualNewPremium() public {
        gov.approveRoute(FLIGHT, ORIGIN, DEST, PREMIUM, PAYOFF);
        vm.expectRevert(GovernanceModule.InvalidTerms.selector);
        gov.updateRouteTerms(FLIGHT, ORIGIN, DEST, 20e6, 20e6);
    }

    function test_updateRouteTermsSucceedsOnDisabledRoute() public {
        gov.approveRoute(FLIGHT, ORIGIN, DEST, PREMIUM, PAYOFF);
        gov.disableRoute(FLIGHT, ORIGIN, DEST);
        gov.updateRouteTerms(FLIGHT, ORIGIN, DEST, 20e6, 200e6);
        (uint256 p, uint256 pay) = gov.getRouteTerms(FLIGHT, ORIGIN, DEST);
        assertEq(p, 20e6);
        assertEq(pay, 200e6);
    }

    // -------------------------------------------------------------------------
    // routeKeys deduplication — re-approving should not push duplicate key
    // -------------------------------------------------------------------------

    function test_reApproveDoesNotDuplicateRouteKey() public {
        gov.approveRoute(FLIGHT, ORIGIN, DEST, PREMIUM, PAYOFF);
        gov.disableRoute(FLIGHT, ORIGIN, DEST);
        gov.approveRoute(FLIGHT, ORIGIN, DEST, 15e6, 150e6);

        // Only one active route should appear
        GovernanceModule.Route[] memory result = gov.getApprovedRoutes();
        assertEq(result.length, 1);
    }
}
