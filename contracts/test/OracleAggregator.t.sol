// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/OracleAggregator.sol";

contract OracleAggregatorTest is Test {
    // Mirror events for vm.expectEmit
    event FlightRegistered(string flightId, string date);
    event FlightDeregistered(string flightId, string date);
    event FlightStatusUpdated(string flightId, string date, OracleAggregator.FlightStatus status);

    OracleAggregator oracle;

    address controller = makeAddr("controller");
    address oracleAddr = makeAddr("oracle");
    address stranger   = makeAddr("stranger");

    string constant FLIGHT_A = "AA100";
    string constant DATE_A   = "2026-03-08";
    string constant FLIGHT_B = "UA200";
    string constant DATE_B   = "2026-03-09";
    string constant FLIGHT_C = "DL300";
    string constant DATE_C   = "2026-03-10";
    string constant FLIGHT_D = "SW400";
    string constant DATE_D   = "2026-03-11";
    string constant FLIGHT_E = "BA500";
    string constant DATE_E   = "2026-03-12";

    function setUp() public {
        oracle = new OracleAggregator();
        oracle.setController(controller);
        oracle.setOracle(oracleAddr);
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    function _register(string memory flightId, string memory date) internal {
        vm.prank(controller);
        oracle.registerFlight(flightId, date);
    }

    function _deregister(string memory flightId, string memory date) internal {
        vm.prank(controller);
        oracle.deregisterFlight(flightId, date);
    }

    function _updateStatus(string memory flightId, string memory date, OracleAggregator.FlightStatus status) internal {
        vm.prank(oracleAddr);
        oracle.updateFlightStatus(flightId, date, status);
    }

    function _activeFlightIds() internal view returns (string[] memory) {
        OracleAggregator.Flight[] memory flights = oracle.getActiveFlights();
        string[] memory ids = new string[](flights.length);
        for (uint256 i = 0; i < flights.length; i++) {
            ids[i] = flights[i].flightId;
        }
        return ids;
    }

    function _contains(string memory needle, string[] memory haystack) internal pure returns (bool) {
        for (uint256 i = 0; i < haystack.length; i++) {
            if (keccak256(bytes(haystack[i])) == keccak256(bytes(needle))) return true;
        }
        return false;
    }

    // -------------------------------------------------------------------------
    // One-time setters (subtasks 13–18)
    // -------------------------------------------------------------------------

    // 13. setController succeeds on first call
    function test_setController_firstCallSucceeds() public {
        OracleAggregator fresh = new OracleAggregator();
        fresh.setController(controller);
        assertEq(fresh.authorizedController(), controller);
    }

    // 14. setController reverts on second call
    function test_setController_secondCallReverts() public {
        // controller already set in setUp()
        vm.expectRevert(OracleAggregator.ControllerAlreadySet.selector);
        oracle.setController(stranger);
    }

    // 15. setOracle succeeds on first call
    function test_setOracle_firstCallSucceeds() public {
        OracleAggregator fresh = new OracleAggregator();
        fresh.setOracle(oracleAddr);
        assertEq(fresh.authorizedOracle(), oracleAddr);
    }

    // 16. setOracle reverts on second call
    function test_setOracle_secondCallReverts() public {
        vm.expectRevert(OracleAggregator.OracleAlreadySet.selector);
        oracle.setOracle(stranger);
    }

    // 17. registerFlight reverts before setController
    function test_registerFlight_revertsBeforeControllerSet() public {
        OracleAggregator fresh = new OracleAggregator();
        vm.prank(controller);
        vm.expectRevert(OracleAggregator.Unauthorized.selector);
        fresh.registerFlight(FLIGHT_A, DATE_A);
    }

    // 18. updateFlightStatus reverts before setOracle
    function test_updateFlightStatus_revertsBeforeOracleSet() public {
        OracleAggregator fresh = new OracleAggregator();
        fresh.setController(controller);
        vm.prank(controller);
        fresh.registerFlight(FLIGHT_A, DATE_A);

        vm.prank(oracleAddr);
        vm.expectRevert(OracleAggregator.Unauthorized.selector);
        fresh.updateFlightStatus(FLIGHT_A, DATE_A, OracleAggregator.FlightStatus.OnTime);
    }

    // -------------------------------------------------------------------------
    // Registration (subtasks 19–24)
    // -------------------------------------------------------------------------

    // 19. registerFlight adds flight to active list, status initialised to Unknown
    function test_registerFlight_addsToListAndStatusIsUnknown() public {
        _register(FLIGHT_A, DATE_A);

        OracleAggregator.Flight[] memory flights = oracle.getActiveFlights();
        assertEq(flights.length, 1);
        assertEq(flights[0].flightId, FLIGHT_A);
        assertEq(flights[0].date, DATE_A);

        assertEq(
            uint8(oracle.getFlightStatus(FLIGHT_A, DATE_A)),
            uint8(OracleAggregator.FlightStatus.Unknown)
        );
    }

    // 20. registerFlight by non-controller reverts
    function test_registerFlight_nonControllerReverts() public {
        vm.prank(stranger);
        vm.expectRevert(OracleAggregator.Unauthorized.selector);
        oracle.registerFlight(FLIGHT_A, DATE_A);
    }

    // 21. deregisterFlight removes flight from active list
    function test_deregisterFlight_removesFromList() public {
        _register(FLIGHT_A, DATE_A);
        _register(FLIGHT_B, DATE_B);
        _deregister(FLIGHT_A, DATE_A);

        OracleAggregator.Flight[] memory flights = oracle.getActiveFlights();
        assertEq(flights.length, 1);
        assertEq(flights[0].flightId, FLIGHT_B);
    }

    // 22. deregisterFlight by non-controller reverts
    function test_deregisterFlight_nonControllerReverts() public {
        _register(FLIGHT_A, DATE_A);

        vm.prank(stranger);
        vm.expectRevert(OracleAggregator.Unauthorized.selector);
        oracle.deregisterFlight(FLIGHT_A, DATE_A);
    }

    // 23. getFlightStatus for unregistered flight returns Unknown without reverting
    function test_getFlightStatus_unregisteredReturnsUnknown() public view {
        OracleAggregator.FlightStatus status = oracle.getFlightStatus("XX999", "2099-01-01");
        assertEq(uint8(status), uint8(OracleAggregator.FlightStatus.Unknown));
    }

    // 24. getActiveFlights returns correct set after each register/deregister
    function test_getActiveFlights_correctSetAfterOperations() public {
        _register(FLIGHT_A, DATE_A);
        _register(FLIGHT_B, DATE_B);

        string[] memory ids = _activeFlightIds();
        assertEq(ids.length, 2);
        assertTrue(_contains(FLIGHT_A, ids));
        assertTrue(_contains(FLIGHT_B, ids));

        _deregister(FLIGHT_A, DATE_A);
        ids = _activeFlightIds();
        assertEq(ids.length, 1);
        assertFalse(_contains(FLIGHT_A, ids));
        assertTrue(_contains(FLIGHT_B, ids));
    }

    // -------------------------------------------------------------------------
    // Status transitions (subtasks 25–34)
    // -------------------------------------------------------------------------

    // 25. Unknown → OnTime accepted
    function test_status_unknownToOnTimeAccepted() public {
        _register(FLIGHT_A, DATE_A);
        _updateStatus(FLIGHT_A, DATE_A, OracleAggregator.FlightStatus.OnTime);
        assertEq(uint8(oracle.getFlightStatus(FLIGHT_A, DATE_A)), uint8(OracleAggregator.FlightStatus.OnTime));
    }

    // 26. Unknown → Delayed accepted
    function test_status_unknownToDelayedAccepted() public {
        _register(FLIGHT_A, DATE_A);
        _updateStatus(FLIGHT_A, DATE_A, OracleAggregator.FlightStatus.Delayed);
        assertEq(uint8(oracle.getFlightStatus(FLIGHT_A, DATE_A)), uint8(OracleAggregator.FlightStatus.Delayed));
    }

    // 27. Unknown → Cancelled accepted
    function test_status_unknownToCancelledAccepted() public {
        _register(FLIGHT_A, DATE_A);
        _updateStatus(FLIGHT_A, DATE_A, OracleAggregator.FlightStatus.Cancelled);
        assertEq(uint8(oracle.getFlightStatus(FLIGHT_A, DATE_A)), uint8(OracleAggregator.FlightStatus.Cancelled));
    }

    // 28. OnTime → Unknown reverts
    function test_status_onTimeToUnknownReverts() public {
        _register(FLIGHT_A, DATE_A);
        _updateStatus(FLIGHT_A, DATE_A, OracleAggregator.FlightStatus.OnTime);

        vm.prank(oracleAddr);
        vm.expectRevert(OracleAggregator.StatusNotProgressing.selector);
        oracle.updateFlightStatus(FLIGHT_A, DATE_A, OracleAggregator.FlightStatus.Unknown);
    }

    // 29. OnTime → Delayed reverts (Delayed(2) > OnTime(1) but OnTime is final)
    function test_status_onTimeToDelayedReverts() public {
        _register(FLIGHT_A, DATE_A);
        _updateStatus(FLIGHT_A, DATE_A, OracleAggregator.FlightStatus.OnTime);

        vm.prank(oracleAddr);
        vm.expectRevert(OracleAggregator.StatusNotProgressing.selector);
        oracle.updateFlightStatus(FLIGHT_A, DATE_A, OracleAggregator.FlightStatus.Delayed);
    }

    // 30. Delayed → Unknown reverts
    function test_status_delayedToUnknownReverts() public {
        _register(FLIGHT_A, DATE_A);
        _updateStatus(FLIGHT_A, DATE_A, OracleAggregator.FlightStatus.Delayed);

        vm.prank(oracleAddr);
        vm.expectRevert(OracleAggregator.StatusNotProgressing.selector);
        oracle.updateFlightStatus(FLIGHT_A, DATE_A, OracleAggregator.FlightStatus.Unknown);
    }

    // 31. Delayed → OnTime reverts
    function test_status_delayedToOnTimeReverts() public {
        _register(FLIGHT_A, DATE_A);
        _updateStatus(FLIGHT_A, DATE_A, OracleAggregator.FlightStatus.Delayed);

        vm.prank(oracleAddr);
        vm.expectRevert(OracleAggregator.StatusNotProgressing.selector);
        oracle.updateFlightStatus(FLIGHT_A, DATE_A, OracleAggregator.FlightStatus.OnTime);
    }

    // 32. Cancelled → anything reverts
    function test_status_cancelledToAnythingReverts() public {
        _register(FLIGHT_A, DATE_A);
        _updateStatus(FLIGHT_A, DATE_A, OracleAggregator.FlightStatus.Cancelled);

        vm.startPrank(oracleAddr);
        vm.expectRevert(OracleAggregator.StatusNotProgressing.selector);
        oracle.updateFlightStatus(FLIGHT_A, DATE_A, OracleAggregator.FlightStatus.Unknown);

        vm.expectRevert(OracleAggregator.StatusNotProgressing.selector);
        oracle.updateFlightStatus(FLIGHT_A, DATE_A, OracleAggregator.FlightStatus.OnTime);

        vm.expectRevert(OracleAggregator.StatusNotProgressing.selector);
        oracle.updateFlightStatus(FLIGHT_A, DATE_A, OracleAggregator.FlightStatus.Delayed);

        vm.expectRevert(OracleAggregator.StatusNotProgressing.selector);
        oracle.updateFlightStatus(FLIGHT_A, DATE_A, OracleAggregator.FlightStatus.Cancelled);
        vm.stopPrank();
    }

    // 33. Non-oracle cannot call updateFlightStatus
    function test_updateFlightStatus_nonOracleReverts() public {
        _register(FLIGHT_A, DATE_A);

        vm.prank(stranger);
        vm.expectRevert(OracleAggregator.Unauthorized.selector);
        oracle.updateFlightStatus(FLIGHT_A, DATE_A, OracleAggregator.FlightStatus.OnTime);
    }

    // 34. Update for unregistered flight reverts
    function test_updateFlightStatus_unregisteredReverts() public {
        vm.prank(oracleAddr);
        vm.expectRevert(OracleAggregator.FlightNotRegistered.selector);
        oracle.updateFlightStatus("XX999", "2099-01-01", OracleAggregator.FlightStatus.OnTime);
    }

    // -------------------------------------------------------------------------
    // Swap-and-pop deregistration (subtasks 35–38)
    // -------------------------------------------------------------------------

    // 35. Register 5 flights, deregister index 2 — remaining 4 have no gaps
    function test_swapAndPop_deregisterMiddle() public {
        _register(FLIGHT_A, DATE_A);
        _register(FLIGHT_B, DATE_B);
        _register(FLIGHT_C, DATE_C);
        _register(FLIGHT_D, DATE_D);
        _register(FLIGHT_E, DATE_E);

        _deregister(FLIGHT_C, DATE_C); // was at index 2

        OracleAggregator.Flight[] memory flights = oracle.getActiveFlights();
        assertEq(flights.length, 4);

        string[] memory ids = _activeFlightIds();
        assertFalse(_contains(FLIGHT_C, ids));
        assertTrue(_contains(FLIGHT_A, ids));
        assertTrue(_contains(FLIGHT_B, ids));
        assertTrue(_contains(FLIGHT_D, ids));
        assertTrue(_contains(FLIGHT_E, ids));
    }

    // 36. Register 3 flights, deregister the last — no out-of-bounds error
    function test_swapAndPop_deregisterLast() public {
        _register(FLIGHT_A, DATE_A);
        _register(FLIGHT_B, DATE_B);
        _register(FLIGHT_C, DATE_C);

        _deregister(FLIGHT_C, DATE_C); // last index

        OracleAggregator.Flight[] memory flights = oracle.getActiveFlights();
        assertEq(flights.length, 2);

        string[] memory ids = _activeFlightIds();
        assertTrue(_contains(FLIGHT_A, ids));
        assertTrue(_contains(FLIGHT_B, ids));
        assertFalse(_contains(FLIGHT_C, ids));
    }

    // 37. Register 1 flight, deregister it — array is empty
    function test_swapAndPop_deregisterOnly() public {
        _register(FLIGHT_A, DATE_A);
        _deregister(FLIGHT_A, DATE_A);

        OracleAggregator.Flight[] memory flights = oracle.getActiveFlights();
        assertEq(flights.length, 0);
    }

    // 38. flightIndex for swapped entry updated correctly after deregistration
    function test_swapAndPop_indexUpdatedForSwapped() public {
        // Register A(0), B(1), C(2)
        _register(FLIGHT_A, DATE_A);
        _register(FLIGHT_B, DATE_B);
        _register(FLIGHT_C, DATE_C);

        // Deregister A (index 0) — C should swap into index 0
        _deregister(FLIGHT_A, DATE_A);

        // Deregister C (now at index 0) — should succeed without error
        _deregister(FLIGHT_C, DATE_C);

        OracleAggregator.Flight[] memory flights = oracle.getActiveFlights();
        assertEq(flights.length, 1);
        assertEq(flights[0].flightId, FLIGHT_B);
    }

    // -------------------------------------------------------------------------
    // Deregister unregistered flight reverts
    // -------------------------------------------------------------------------

    function test_deregisterFlight_unregisteredReverts() public {
        vm.prank(controller);
        vm.expectRevert(OracleAggregator.FlightNotRegistered.selector);
        oracle.deregisterFlight("XX999", "2099-01-01");
    }

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    function test_events_emittedOnRegister() public {
        vm.prank(controller);
        vm.expectEmit(false, false, false, true);
        emit FlightRegistered(FLIGHT_A, DATE_A);
        oracle.registerFlight(FLIGHT_A, DATE_A);
    }

    function test_events_emittedOnDeregister() public {
        _register(FLIGHT_A, DATE_A);

        vm.prank(controller);
        vm.expectEmit(false, false, false, true);
        emit FlightDeregistered(FLIGHT_A, DATE_A);
        oracle.deregisterFlight(FLIGHT_A, DATE_A);
    }

    function test_events_emittedOnStatusUpdate() public {
        _register(FLIGHT_A, DATE_A);

        vm.prank(oracleAddr);
        vm.expectEmit(false, false, false, true);
        emit FlightStatusUpdated(FLIGHT_A, DATE_A, OracleAggregator.FlightStatus.Delayed);
        oracle.updateFlightStatus(FLIGHT_A, DATE_A, OracleAggregator.FlightStatus.Delayed);
    }
}
