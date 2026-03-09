// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./FlightPool.sol";

// ── External contract interfaces ──────────────────────────────────────────────

interface IGovernanceModule {
    function isRouteApproved(
        string calldata flightId,
        string calldata origin,
        string calldata destination
    ) external view returns (bool);

    function getRouteTerms(
        string calldata flightId,
        string calldata origin,
        string calldata destination
    ) external view returns (uint256 premium, uint256 payoff);
}

/// @dev Separate name to avoid collision with FlightPool.sol's (now-removed) IRiskVault.
interface IRiskVaultCtrl {
    function freeCapital() external view returns (uint256);
    function increaseLocked(uint256 amount) external;
    function decreaseLocked(uint256 amount) external;
    function sendPayout(address flightPool, uint256 amount) external;
    function recordPremiumIncome(uint256 amount) external;
    function processWithdrawalQueue() external;
    function snapshot() external;
}

interface IOracleAggregator {
    enum FlightStatus { Unknown, OnTime, Delayed, Cancelled }
    function registerFlight(string calldata flightId, string calldata date) external;
    function deregisterFlight(string calldata flightId, string calldata date) external;
    function getFlightStatus(
        string calldata flightId,
        string calldata date
    ) external view returns (FlightStatus);
}

interface IFlightPool {
    function buyInsurance(address buyer) external;
    function closePool() external;
    function settleNotDelayed() external;
    function settleDelayed(uint256 claimExpiryWindow) external;
    function settleCancelled(uint256 claimExpiryWindow) external;
    function maxLiability() external view returns (uint256);
}

// ── Controller ────────────────────────────────────────────────────────────────

/// @title Controller
/// @notice System orchestrator for the Sentinel Protocol.
///         Validates routes, lazily deploys FlightPools, enforces solvency,
///         and drives settlement via checkAndSettle() called exclusively by
///         the registered CRE workflow address. Holds no funds itself.
contract Controller {
    // ── Types ─────────────────────────────────────────────────────────────────

    /// @notice Per-flight metadata cached in Controller storage.
    ///         `index` tracks the element's position in activeFlightKeys for
    ///         O(1) swap-and-pop in _clearFlight.
    struct FlightRecord {
        address poolAddress;
        string  flightId;   // cached to avoid external calls in settlement loop
        string  flightDate; // cached to avoid external calls in settlement loop
        bool    active;
        uint256 index;      // current position in activeFlightKeys
    }

    // ── State ─────────────────────────────────────────────────────────────────

    address public owner;

    IERC20            public immutable usdc;
    IRiskVaultCtrl    public immutable riskVault;
    IOracleAggregator public immutable oracleAggregator;
    IGovernanceModule public governanceModule;
    address           public immutable recoveryPool;

    address public creWorkflowAddress;

    uint256 public totalMaxLiability;
    uint256 public minimumSolvencyRatio;
    uint256 public minimumLeadTime;
    uint256 public claimExpiryWindow;

    uint256 public totalPoliciesSold;
    uint256 public totalPremiumsCollected;
    uint256 public totalPayoutsDistributed;

    mapping(bytes32 => FlightRecord) public flightRecords;
    bytes32[] public activeFlightKeys;

    // ── Events ────────────────────────────────────────────────────────────────

    event FlightPoolDeployed(
        bytes32 indexed key,
        address indexed poolAddress,
        string  flightId,
        string  flightDate
    );
    event InsurancePurchased(
        address indexed buyer,
        bytes32 indexed key,
        uint256 premium
    );
    event SettledNotDelayed(bytes32 indexed key, address indexed poolAddress);
    event SettledDelayed(
        bytes32 indexed key,
        address indexed poolAddress,
        uint256 totalPayout
    );
    event SettledCancelled(
        bytes32 indexed key,
        address indexed poolAddress,
        uint256 totalPayout
    );
    event CreWorkflowSet(address indexed newAddress);
    event MinimumSolvencyRatioSet(uint256 newRatio);
    event MinimumLeadTimeSet(uint256 newLeadTime);
    event ClaimExpiryWindowSet(uint256 newWindow);
    event GovernanceModuleSet(address indexed newModule);

    // ── Errors ────────────────────────────────────────────────────────────────

    error Unauthorized();
    error NotCREWorkflow();
    error ZeroAddress();
    error RouteNotApproved();
    error SolvencyCheckFailed();

    // ── Modifiers ─────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyCREWorkflow() {
        if (msg.sender != creWorkflowAddress) revert NotCREWorkflow();
        _;
    }

    // ── Constructor ───────────────────────────────────────────────────────────

    /// @param usdc_             USDC token address.
    /// @param riskVault_        RiskVault address.
    /// @param oracleAggregator_ OracleAggregator address.
    /// @param governanceModule_ GovernanceModule address.
    /// @param recoveryPool_     RecoveryPool address.
    constructor(
        address usdc_,
        address riskVault_,
        address oracleAggregator_,
        address governanceModule_,
        address recoveryPool_
    ) {
        if (usdc_             == address(0)) revert ZeroAddress();
        if (riskVault_        == address(0)) revert ZeroAddress();
        if (oracleAggregator_ == address(0)) revert ZeroAddress();
        if (governanceModule_ == address(0)) revert ZeroAddress();
        if (recoveryPool_     == address(0)) revert ZeroAddress();

        owner            = msg.sender;
        usdc             = IERC20(usdc_);
        riskVault        = IRiskVaultCtrl(riskVault_);
        oracleAggregator = IOracleAggregator(oracleAggregator_);
        governanceModule = IGovernanceModule(governanceModule_);
        recoveryPool     = recoveryPool_;

        minimumSolvencyRatio = 100;
        minimumLeadTime      = 1 hours;
        claimExpiryWindow    = 60 days;
    }

    // ── User-facing functions ─────────────────────────────────────────────────

    /// @notice Purchase insurance for a specific flight on an approved route.
    ///         Deploys a new FlightPool lazily on the first purchase for a
    ///         route+date. Requires USDC approval for the premium amount.
    /// @param flightId   Flight identifier (e.g. "AA123").
    /// @param origin     Origin IATA code (e.g. "DEN").
    /// @param destination Destination IATA code (e.g. "SEA").
    /// @param date       Flight date as a human-readable string (e.g. "2026-06-01").
    function buyInsurance(
        string calldata flightId,
        string calldata origin,
        string calldata destination,
        string calldata date
    ) external {
        if (!governanceModule.isRouteApproved(flightId, origin, destination)) {
            revert RouteNotApproved();
        }

        (uint256 premium, uint256 payoff) = governanceModule.getRouteTerms(
            flightId, origin, destination
        );

        bytes32 key = _flightKey(flightId, date);

        if (flightRecords[key].poolAddress == address(0)) {
            _deployPool(key, flightId, date, premium, payoff);
        }

        if (riskVault.freeCapital() < (totalMaxLiability + payoff) * minimumSolvencyRatio / 100) {
            revert SolvencyCheckFailed();
        }

        usdc.transferFrom(msg.sender, flightRecords[key].poolAddress, premium);
        riskVault.increaseLocked(payoff);
        IFlightPool(flightRecords[key].poolAddress).buyInsurance(msg.sender);

        totalPoliciesSold++;
        totalPremiumsCollected += premium;
        totalMaxLiability      += payoff;

        emit InsurancePurchased(msg.sender, key, premium);
    }

    // ── CRE workflow entry point ───────────────────────────────────────────────

    /// @notice Called exclusively by the registered CRE workflow address to
    ///         settle mature flights and take a share price snapshot.
    function checkAndSettle() external onlyCREWorkflow {
        _checkAndSettle();
        riskVault.snapshot();
    }

    // ── Owner functions ────────────────────────────────────────────────────────

    /// @notice Set or update the CRE workflow address. Updatable so the owner
    ///         can recover if the workflow is redeployed with a new address.
    function setCreWorkflow(address newAddress) external onlyOwner {
        if (newAddress == address(0)) revert ZeroAddress();
        creWorkflowAddress = newAddress;
        emit CreWorkflowSet(newAddress);
    }

    function setMinimumSolvencyRatio(uint256 newRatio) external onlyOwner {
        minimumSolvencyRatio = newRatio;
        emit MinimumSolvencyRatioSet(newRatio);
    }

    function setMinimumLeadTime(uint256 newLeadTime) external onlyOwner {
        minimumLeadTime = newLeadTime;
        emit MinimumLeadTimeSet(newLeadTime);
    }

    function setClaimExpiryWindow(uint256 newWindow) external onlyOwner {
        claimExpiryWindow = newWindow;
        emit ClaimExpiryWindowSet(newWindow);
    }

    function setGovernanceModule(address newModule) external onlyOwner {
        if (newModule == address(0)) revert ZeroAddress();
        governanceModule = IGovernanceModule(newModule);
        emit GovernanceModuleSet(newModule);
    }

    // ── View functions ─────────────────────────────────────────────────────────

    /// @notice Returns true if the vault is currently solvent for a new purchase
    ///         on the given route using GovernanceModule's current terms.
    function isSolventForNewPurchase(
        string calldata flightId,
        string calldata origin,
        string calldata destination
    ) external view returns (bool) {
        (, uint256 payoff) = governanceModule.getRouteTerms(flightId, origin, destination);
        return riskVault.freeCapital() >= (totalMaxLiability + payoff) * minimumSolvencyRatio / 100;
    }

    /// @notice Returns pool addresses for all currently active (unsettled) flights.
    function getActivePools() external view returns (address[] memory) {
        uint256 len = activeFlightKeys.length;
        address[] memory pools = new address[](len);
        for (uint256 i = 0; i < len; i++) {
            pools[i] = flightRecords[activeFlightKeys[i]].poolAddress;
        }
        return pools;
    }

    /// @notice Returns the FlightPool address for a specific flight+date.
    ///         Returns address(0) if no pool has been deployed.
    function getPoolAddress(
        string calldata flightId,
        string calldata date
    ) external view returns (address) {
        return flightRecords[_flightKey(flightId, date)].poolAddress;
    }

    /// @notice Number of currently active (unsettled) flights.
    function activeFlightCount() external view returns (uint256) {
        return activeFlightKeys.length;
    }

    /// @notice Compute the flight key for (flightId, date). Useful for off-chain callers
    ///         and tests to look up flightRecords entries.
    function flightKey(string calldata flightId, string calldata date) external pure returns (bytes32) {
        return _flightKey(flightId, date);
    }

    // ── Internal functions ─────────────────────────────────────────────────────

    /// @dev Compute the flight key used as the mapping key and in activeFlightKeys.
    function _flightKey(string memory flightId, string memory date)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(flightId, date));
    }

    /// @dev Deploy a new FlightPool for (flightId, date) using the given terms.
    ///      Registers the flight in OracleAggregator and records the FlightRecord.
    function _deployPool(
        bytes32 key,
        string memory flightId,
        string memory date,
        uint256 premium,
        uint256 payoff
    ) internal {
        FlightPool pool = new FlightPool(
            flightId,
            date,
            premium,
            payoff,
            address(this),
            address(riskVault),
            recoveryPool,
            address(usdc)
        );

        address poolAddress = address(pool);

        flightRecords[key] = FlightRecord({
            poolAddress: poolAddress,
            flightId:    flightId,
            flightDate:  date,
            active:      true,
            index:       activeFlightKeys.length
        });

        activeFlightKeys.push(key);
        oracleAggregator.registerFlight(flightId, date);

        emit FlightPoolDeployed(key, poolAddress, flightId, date);
    }

    /// @dev Settle a flight as not-delayed. Premiums flow to RiskVault as yield.
    ///      Releases locked capital and processes the withdrawal queue.
    function _settleNotDelayed(bytes32 key) internal {
        address poolAddr = flightRecords[key].poolAddress;
        IFlightPool pool = IFlightPool(poolAddr);

        uint256 liability = pool.maxLiability();

        // Read pool's premium balance before settling so we can record it as income.
        uint256 premiumAmount = usdc.balanceOf(poolAddr);

        pool.closePool();
        pool.settleNotDelayed(); // transfers premiumAmount to RiskVault

        // Controller notifies RiskVault that premium income arrived (FlightPool does not call this).
        if (premiumAmount > 0) {
            riskVault.recordPremiumIncome(premiumAmount);
        }

        riskVault.decreaseLocked(liability);
        totalMaxLiability -= liability;

        riskVault.processWithdrawalQueue();
        _clearFlight(key);

        emit SettledNotDelayed(key, poolAddr);
    }

    /// @dev Settle a flight as delayed or cancelled.
    ///      Sends payout from RiskVault to pool FIRST (conservative: decreases
    ///      balance before releasing lock), then decreases lock, closes and
    ///      settles pool, processes withdrawal queue.
    ///      Any USDC returned to the vault by the pool (failed payouts + original
    ///      premiums) is recorded via recordPremiumIncome.
    function _settleDelayedOrCancelled(bytes32 key, bool isCancelled) internal {
        address poolAddr = flightRecords[key].poolAddress;
        IFlightPool pool = IFlightPool(poolAddr);

        uint256 cachedLiability = pool.maxLiability(); // payoff × buyerCount
        uint256 totalPayout     = cachedLiability;

        // Track vault USDC before sendPayout to compute the remainder returned later.
        uint256 vaultUsdcBefore = usdc.balanceOf(address(riskVault));

        // sendPayout BEFORE decreaseLocked — keeps freeCapital conservative
        riskVault.sendPayout(poolAddr, totalPayout);
        riskVault.decreaseLocked(cachedLiability);

        pool.closePool();
        if (isCancelled) {
            pool.settleCancelled(claimExpiryWindow);
        } else {
            pool.settleDelayed(claimExpiryWindow);
        }

        // Compute how much the pool returned to vault (premiums + any failed-payout amounts).
        // vault balance after settle = vaultBefore - totalPayout + remainder
        // → remainder = vaultAfter - vaultBefore + totalPayout
        uint256 vaultUsdcAfter = usdc.balanceOf(address(riskVault));
        uint256 remainder = vaultUsdcAfter + totalPayout - vaultUsdcBefore;
        if (remainder > 0) {
            riskVault.recordPremiumIncome(remainder);
        }

        riskVault.processWithdrawalQueue();
        _clearFlight(key);

        totalPayoutsDistributed += totalPayout;
        totalMaxLiability       -= cachedLiability;

        if (isCancelled) {
            emit SettledCancelled(key, poolAddr, totalPayout);
        } else {
            emit SettledDelayed(key, poolAddr, totalPayout);
        }
    }

    /// @dev Remove a flight from the active registry via swap-and-pop.
    ///      Sets active = false, deregisters from OracleAggregator, and
    ///      updates the swapped element's index in flightRecords.
    function _clearFlight(bytes32 key) internal {
        flightRecords[key].active = false;

        // Deregister from oracle — reads flightId/flightDate from storage
        oracleAggregator.deregisterFlight(
            flightRecords[key].flightId,
            flightRecords[key].flightDate
        );

        uint256 idx     = flightRecords[key].index;
        uint256 lastIdx = activeFlightKeys.length - 1;

        if (idx != lastIdx) {
            bytes32 swappedKey = activeFlightKeys[lastIdx];
            activeFlightKeys[idx] = swappedKey;
            flightRecords[swappedKey].index = idx;
        }

        activeFlightKeys.pop();
    }

    /// @dev Iterate active flights in reverse (safe for swap-and-pop) and
    ///      settle any that have reached a final oracle status.
    ///      Reverse iteration ensures that the element swapped into a cleared
    ///      index was already visited in a prior iteration.
    function _checkAndSettle() internal {
        uint256 i = activeFlightKeys.length;
        while (i > 0) {
            i--;
            bytes32 key = activeFlightKeys[i];
            FlightRecord storage record = flightRecords[key];

            IOracleAggregator.FlightStatus status = oracleAggregator.getFlightStatus(
                record.flightId,
                record.flightDate
            );

            if (status == IOracleAggregator.FlightStatus.Unknown) {
                continue;
            } else if (status == IOracleAggregator.FlightStatus.OnTime) {
                _settleNotDelayed(key);
            } else if (status == IOracleAggregator.FlightStatus.Delayed) {
                _settleDelayedOrCancelled(key, false);
            } else if (status == IOracleAggregator.FlightStatus.Cancelled) {
                _settleDelayedOrCancelled(key, true);
            }
        }
    }
}
