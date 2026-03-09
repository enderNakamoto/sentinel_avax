// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title GovernanceModule
/// @notice Route authority — approves routes and sets fixed premium/payoff per route.
///         The Controller reads from this contract before every insurance purchase.
contract GovernanceModule is Ownable {
    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error Unauthorized();
    error InvalidTerms();
    error RouteAlreadyActive();
    error RouteDoesNotExist();

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event RouteApproved(bytes32 indexed key, string flightId, string origin, string destination, uint256 premium, uint256 payoff);
    event RouteDisabled(bytes32 indexed key, string flightId, string origin, string destination);
    event RouteTermsUpdated(bytes32 indexed key, uint256 newPremium, uint256 newPayoff);
    event AdminAdded(address indexed admin);
    event AdminRemoved(address indexed admin);

    // -------------------------------------------------------------------------
    // Types
    // -------------------------------------------------------------------------

    struct Route {
        string flightId;
        string origin;
        string destination;
        uint256 premium;
        uint256 payoff;
        bool active;
    }

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    mapping(bytes32 => Route) public routes;
    bytes32[] public routeKeys;
    mapping(bytes32 => bool) private routeExists;
    mapping(address => bool) public admins;

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    modifier onlyOwnerOrAdmin() {
        if (msg.sender != owner() && !admins[msg.sender]) revert Unauthorized();
        _;
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(address initialOwner) Ownable(initialOwner) {}

    // -------------------------------------------------------------------------
    // Admin management
    // -------------------------------------------------------------------------

    function addAdmin(address admin) external onlyOwner {
        admins[admin] = true;
        emit AdminAdded(admin);
    }

    function removeAdmin(address admin) external onlyOwner {
        admins[admin] = false;
        emit AdminRemoved(admin);
    }

    // -------------------------------------------------------------------------
    // Route lifecycle
    // -------------------------------------------------------------------------

    function approveRoute(
        string calldata flightId,
        string calldata origin,
        string calldata destination,
        uint256 premium,
        uint256 payoff
    ) external onlyOwnerOrAdmin {
        if (premium == 0 || payoff <= premium) revert InvalidTerms();

        bytes32 key = _routeKey(flightId, origin, destination);

        if (routes[key].active) revert RouteAlreadyActive();

        if (!routeExists[key]) {
            routeKeys.push(key);
            routeExists[key] = true;
            routes[key].flightId = flightId;
            routes[key].origin = origin;
            routes[key].destination = destination;
        }

        routes[key].premium = premium;
        routes[key].payoff = payoff;
        routes[key].active = true;

        emit RouteApproved(key, flightId, origin, destination, premium, payoff);
    }

    function disableRoute(
        string calldata flightId,
        string calldata origin,
        string calldata destination
    ) external onlyOwnerOrAdmin {
        bytes32 key = _routeKey(flightId, origin, destination);
        routes[key].active = false;
        emit RouteDisabled(key, flightId, origin, destination);
    }

    function updateRouteTerms(
        string calldata flightId,
        string calldata origin,
        string calldata destination,
        uint256 newPremium,
        uint256 newPayoff
    ) external onlyOwnerOrAdmin {
        bytes32 key = _routeKey(flightId, origin, destination);
        if (!routeExists[key]) revert RouteDoesNotExist();
        if (newPremium == 0 || newPayoff <= newPremium) revert InvalidTerms();

        routes[key].premium = newPremium;
        routes[key].payoff = newPayoff;

        emit RouteTermsUpdated(key, newPremium, newPayoff);
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    function isRouteApproved(
        string calldata flightId,
        string calldata origin,
        string calldata destination
    ) external view returns (bool) {
        return routes[_routeKey(flightId, origin, destination)].active;
    }

    function getRouteTerms(
        string calldata flightId,
        string calldata origin,
        string calldata destination
    ) external view returns (uint256 premium, uint256 payoff) {
        Route storage r = routes[_routeKey(flightId, origin, destination)];
        return (r.premium, r.payoff);
    }

    function getApprovedRoutes() external view returns (Route[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < routeKeys.length; i++) {
            if (routes[routeKeys[i]].active) count++;
        }

        Route[] memory result = new Route[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < routeKeys.length; i++) {
            if (routes[routeKeys[i]].active) {
                result[idx++] = routes[routeKeys[i]];
            }
        }
        return result;
    }

    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------

    function _routeKey(
        string calldata flightId,
        string calldata origin,
        string calldata destination
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(flightId, origin, destination));
    }
}
