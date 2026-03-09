// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title OracleAggregator
/// @notice On-chain registry of flight statuses. Single source of truth for settlement decisions.
///         The CRE workflow writes final statuses here; the Controller reads them.
///         Status transitions are append-only toward finality.
contract OracleAggregator {
    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error ControllerAlreadySet();
    error OracleAlreadySet();
    error Unauthorized();
    error FlightNotRegistered();
    error StatusNotProgressing();

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event ControllerSet(address indexed controller);
    event OracleSet(address indexed oracle);
    event FlightRegistered(string flightId, string date);
    event FlightDeregistered(string flightId, string date);
    event FlightStatusUpdated(string flightId, string date, FlightStatus status);

    // -------------------------------------------------------------------------
    // Types
    // -------------------------------------------------------------------------

    /// @notice Status progresses only forward: Unknown → OnTime | Delayed | Cancelled
    enum FlightStatus { Unknown, OnTime, Delayed, Cancelled }

    struct Flight {
        string flightId;
        string date;
    }

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    address public authorizedController;
    address public authorizedOracle;

    /// @dev bytes32 key → current status (Unknown for unregistered flights)
    mapping(bytes32 => FlightStatus) public flightStatuses;

    /// @dev tracks which keys are registered (separate from status, which defaults to Unknown)
    mapping(bytes32 => bool) private flightRegistered;

    /// @dev ordered list of currently-tracked flights
    Flight[] public registeredFlights;

    /// @dev bytes32 key → index in registeredFlights (for O(1) swap-and-pop)
    mapping(bytes32 => uint256) private flightIndex;

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    modifier onlyController() {
        if (msg.sender != authorizedController) revert Unauthorized();
        _;
    }

    modifier onlyOracle() {
        if (msg.sender != authorizedOracle) revert Unauthorized();
        _;
    }

    // -------------------------------------------------------------------------
    // One-time setters
    // -------------------------------------------------------------------------

    function setController(address controller) external {
        if (authorizedController != address(0)) revert ControllerAlreadySet();
        authorizedController = controller;
        emit ControllerSet(controller);
    }

    function setOracle(address oracle) external {
        if (authorizedOracle != address(0)) revert OracleAlreadySet();
        authorizedOracle = oracle;
        emit OracleSet(oracle);
    }

    // -------------------------------------------------------------------------
    // Flight registration (onlyController)
    // -------------------------------------------------------------------------

    function registerFlight(string calldata flightId, string calldata date) external onlyController {
        bytes32 key = _flightKey(flightId, date);
        flightIndex[key] = registeredFlights.length;
        registeredFlights.push(Flight({ flightId: flightId, date: date }));
        flightRegistered[key] = true;
        // flightStatuses[key] defaults to Unknown (zero value)
        emit FlightRegistered(flightId, date);
    }

    function deregisterFlight(string calldata flightId, string calldata date) external onlyController {
        bytes32 key = _flightKey(flightId, date);
        if (!flightRegistered[key]) revert FlightNotRegistered();

        uint256 idx = flightIndex[key];
        uint256 lastIdx = registeredFlights.length - 1;

        if (idx != lastIdx) {
            // Swap with last element
            Flight memory lastFlight = registeredFlights[lastIdx];
            registeredFlights[idx] = lastFlight;
            bytes32 lastKey = _flightKey(lastFlight.flightId, lastFlight.date);
            flightIndex[lastKey] = idx;
        }

        registeredFlights.pop();
        delete flightIndex[key];
        delete flightRegistered[key];

        emit FlightDeregistered(flightId, date);
    }

    // -------------------------------------------------------------------------
    // Status updates (onlyOracle)
    // -------------------------------------------------------------------------

    function updateFlightStatus(
        string calldata flightId,
        string calldata date,
        FlightStatus status
    ) external onlyOracle {
        bytes32 key = _flightKey(flightId, date);
        if (!flightRegistered[key]) revert FlightNotRegistered();

        FlightStatus current = flightStatuses[key];
        // Only Unknown → final (OnTime | Delayed | Cancelled) is allowed.
        // Once any final status is written it cannot change.
        if (current != FlightStatus.Unknown || status == FlightStatus.Unknown) revert StatusNotProgressing();

        flightStatuses[key] = status;
        emit FlightStatusUpdated(flightId, date, status);
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    /// @notice Returns the status for a flight. Never reverts — returns Unknown for unregistered flights.
    function getFlightStatus(string calldata flightId, string calldata date)
        external
        view
        returns (FlightStatus)
    {
        return flightStatuses[_flightKey(flightId, date)];
    }

    /// @notice Returns the full list of currently registered flights.
    function getActiveFlights() external view returns (Flight[] memory) {
        return registeredFlights;
    }

    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------

    function _flightKey(string memory flightId, string memory date)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(flightId, date));
    }
}
