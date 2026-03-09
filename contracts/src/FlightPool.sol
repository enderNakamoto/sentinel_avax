// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IRiskVault {
    function recordPremiumIncome(uint256 amount) external;
}

interface IRecoveryPool {
    function _recordDeposit(address sourcePool, uint256 amount) external;
}

/// @title FlightPool
/// @notice Per-flight insurance pool. Deployed once per (flightId, flightDate) by the
///         Controller on first purchase. Holds traveler premiums and settles in one of
///         two directions: NotDelayed (premiums → RiskVault yield) or Delayed/Cancelled
///         (payout per buyer, remainder → RiskVault, unclaimed funds swept to RecoveryPool).
contract FlightPool {
    // ── Enum ──────────────────────────────────────────────────────────────────

    enum Outcome { Pending, NotDelayed, Delayed, Cancelled }

    // ── Immutables ────────────────────────────────────────────────────────────

    string  public flightId;
    string  public flightDate;
    uint256 public immutable premium;
    uint256 public immutable payoff;
    address public immutable controller;
    address public immutable riskVault;
    address public immutable recoveryPool;
    IERC20  public immutable usdc;

    // ── State ─────────────────────────────────────────────────────────────────

    bool    public isOpen;
    bool    public isSettled;
    Outcome public outcome;
    uint256 public claimExpiry;

    address[] public buyers;
    mapping(address => bool) public hasBought;
    mapping(address => bool) public claimed;

    // ── Events ────────────────────────────────────────────────────────────────

    event InsurancePurchased(address indexed buyer);
    event PoolClosed();
    event SettledNotDelayed(uint256 premiumAmount);
    event SettledDelayed(uint256 totalPayout, uint256 claimExpiry);
    event SettledCancelled(uint256 totalPayout, uint256 claimExpiry);
    event PayoutFailed(address indexed buyer, uint256 amount);
    event Claimed(address indexed buyer, uint256 amount);
    event Swept(uint256 amount);

    // ── Errors ────────────────────────────────────────────────────────────────

    error Unauthorized();
    error ZeroAddress();
    error InvalidTerms();
    error PoolNotOpen();
    error AlreadySettled();
    error AlreadyBought();
    error NotSettled();
    error NotClaimable();
    error NotBuyer();
    error AlreadyClaimed();
    error ClaimExpired();
    error ClaimWindowOpen();

    // ── Modifier ──────────────────────────────────────────────────────────────

    modifier onlyController() {
        if (msg.sender != controller) revert Unauthorized();
        _;
    }

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor(
        string memory flightId_,
        string memory flightDate_,
        uint256       premium_,
        uint256       payoff_,
        address       controller_,
        address       riskVault_,
        address       recoveryPool_,
        address       usdc_
    ) {
        if (controller_   == address(0)) revert ZeroAddress();
        if (riskVault_    == address(0)) revert ZeroAddress();
        if (recoveryPool_ == address(0)) revert ZeroAddress();
        if (usdc_         == address(0)) revert ZeroAddress();
        if (premium_ >= payoff_)         revert InvalidTerms();

        flightId    = flightId_;
        flightDate  = flightDate_;
        premium     = premium_;
        payoff      = payoff_;
        controller  = controller_;
        riskVault   = riskVault_;
        recoveryPool = recoveryPool_;
        usdc        = IERC20(usdc_);

        isOpen  = true;
        outcome = Outcome.Pending;
    }

    // ── Controller-only functions ─────────────────────────────────────────────

    /// @notice Record a new buyer. Called by the Controller after transferring the
    ///         premium USDC from the traveler to this pool address.
    function buyInsurance(address buyer) external onlyController {
        if (!isOpen)          revert PoolNotOpen();
        if (isSettled)        revert AlreadySettled();
        if (hasBought[buyer]) revert AlreadyBought();

        buyers.push(buyer);
        hasBought[buyer] = true;

        emit InsurancePurchased(buyer);
    }

    /// @notice Close the pool — no further purchases allowed.
    function closePool() external onlyController {
        isOpen = false;
        emit PoolClosed();
    }

    /// @notice Settle as not-delayed. Transfers all USDC held to RiskVault as premium
    ///         income. No buyer payouts.
    function settleNotDelayed() external onlyController {
        if (isSettled) revert AlreadySettled();

        isSettled = true;
        outcome   = Outcome.NotDelayed;

        uint256 balance = usdc.balanceOf(address(this));
        if (balance > 0) {
            usdc.transfer(riskVault, balance);
        }
        IRiskVault(riskVault).recordPremiumIncome(balance);

        emit SettledNotDelayed(balance);
    }

    /// @notice Settle as delayed. Expects the Controller to have pre-funded this pool
    ///         via RiskVault.sendPayout before calling. Distributes payoff to each buyer
    ///         non-revertingly; any remainder is returned to RiskVault as premium income.
    /// @param claimExpiryWindow Seconds from now during which buyers may claim.
    function settleDelayed(uint256 claimExpiryWindow) external onlyController {
        if (isSettled) revert AlreadySettled();

        isSettled   = true;
        outcome     = Outcome.Delayed;
        claimExpiry = block.timestamp + claimExpiryWindow;

        uint256 totalPayout = _distributePayout();

        emit SettledDelayed(totalPayout, claimExpiry);
    }

    /// @notice Settle as cancelled. Identical payout mechanics to settleDelayed but
    ///         records outcome as Cancelled.
    /// @param claimExpiryWindow Seconds from now during which buyers may claim.
    function settleCancelled(uint256 claimExpiryWindow) external onlyController {
        if (isSettled) revert AlreadySettled();

        isSettled   = true;
        outcome     = Outcome.Cancelled;
        claimExpiry = block.timestamp + claimExpiryWindow;

        uint256 totalPayout = _distributePayout();

        emit SettledCancelled(totalPayout, claimExpiry);
    }

    // ── User-facing functions ─────────────────────────────────────────────────

    /// @notice Buyer claims their payoff after a delayed or cancelled settlement.
    function claim() external {
        if (!isSettled)                                           revert NotSettled();
        if (outcome != Outcome.Delayed && outcome != Outcome.Cancelled) revert NotClaimable();
        if (!hasBought[msg.sender])                               revert NotBuyer();
        if (claimed[msg.sender])                                  revert AlreadyClaimed();
        if (block.timestamp > claimExpiry)                        revert ClaimExpired();

        claimed[msg.sender] = true;
        usdc.transfer(msg.sender, payoff);

        emit Claimed(msg.sender, payoff);
    }

    /// @notice Sweep unclaimed USDC to the RecoveryPool after the claim window has closed.
    ///         Callable by anyone once claimExpiry has passed.
    function sweepExpired() external {
        if (!isSettled)                    revert NotSettled();
        if (block.timestamp <= claimExpiry) revert ClaimWindowOpen();

        uint256 balance = usdc.balanceOf(address(this));
        if (balance > 0) {
            usdc.transfer(recoveryPool, balance);
        }
        IRecoveryPool(recoveryPool)._recordDeposit(address(this), balance);

        emit Swept(balance);
    }

    // ── View functions ────────────────────────────────────────────────────────

    /// @notice Number of buyers in this pool.
    function buyerCount() external view returns (uint256) {
        return buyers.length;
    }

    /// @notice Maximum USDC liability if the flight is delayed: payoff × buyerCount.
    function maxLiability() external view returns (uint256) {
        return payoff * buyers.length;
    }

    /// @notice Whether addr is eligible to call claim() right now.
    function canClaim(address addr) external view returns (bool) {
        return isSettled
            && (outcome == Outcome.Delayed || outcome == Outcome.Cancelled)
            && hasBought[addr]
            && !claimed[addr]
            && block.timestamp <= claimExpiry;
    }

    /// @notice Current USDC balance held in this pool.
    function totalPremiumsHeld() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    /// @dev Attempt to transfer payoff to each buyer. Failures are non-reverting;
    ///      a PayoutFailed event is emitted per failure. Returns total payout attempted.
    ///      After the loop, any remaining balance is sent to RiskVault as premium income.
    function _distributePayout() internal returns (uint256 totalPayout) {
        uint256 len = buyers.length;
        for (uint256 i = 0; i < len; i++) {
            address buyer = buyers[i];
            // Use low-level call so a reverting receiver does not abort the loop
            (bool ok,) = address(usdc).call(
                abi.encodeWithSelector(IERC20.transfer.selector, buyer, payoff)
            );
            if (ok) {
                claimed[buyer] = true;
                totalPayout += payoff;
            } else {
                emit PayoutFailed(buyer, payoff);
            }
        }

        uint256 remainder = usdc.balanceOf(address(this));
        if (remainder > 0) {
            usdc.transfer(riskVault, remainder);
        }
        IRiskVault(riskVault).recordPremiumIncome(remainder);
    }
}
