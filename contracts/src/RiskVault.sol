// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title RiskVault
/// @notice Capital backing layer for the Sentinel Protocol.
///         Underwriters deposit USDC and receive shares. Share price rises as
///         on-time flight premiums flow in. Withdrawals that would breach locked
///         capital are queued FIFO and processed after each settlement.
contract RiskVault {
    // ── Immutable ─────────────────────────────────────────────────────────────

    IERC20 public immutable usdc;

    // ── State ─────────────────────────────────────────────────────────────────

    address public controller;

    uint256 public totalManagedAssets;
    uint256 public lockedCapital;
    uint256 public totalShares;

    mapping(address => uint256) public shares;
    mapping(address => uint256) public claimableBalance;
    mapping(address => bool)    public hasPendingWithdrawal;
    mapping(address => uint256) public queuedShares;

    struct WithdrawalRequest {
        address requester;
        uint256 shares;
        uint256 requestedAt;
        bool    cancelled;
    }

    struct PriceSnapshot {
        uint256 timestamp;
        uint256 pricePerShare; // scaled to 1e6 (same as USDC decimals)
    }

    WithdrawalRequest[] public withdrawalQueue;
    uint256 public queueHead;

    PriceSnapshot[] private priceHistory;
    uint256 public lastSnapshotTimestamp;

    // ── Events ────────────────────────────────────────────────────────────────

    event Deposited(address indexed underwriter, uint256 amount, uint256 sharesIssued);
    event WithdrawImmediate(address indexed underwriter, uint256 shares, uint256 usdcAmount);
    event WithdrawQueued(address indexed underwriter, uint256 shares, uint256 queueIndex);
    event WithdrawCancelled(address indexed underwriter, uint256 queueIndex);
    event Collected(address indexed underwriter, uint256 amount);
    event LockedIncreased(uint256 amount);
    event LockedDecreased(uint256 amount);
    event PayoutSent(address indexed flightPool, uint256 amount);
    event PremiumIncome(uint256 amount);
    event SnapshotTaken(uint256 timestamp, uint256 pricePerShare);
    event ControllerSet(address indexed newController);

    // ── Errors ────────────────────────────────────────────────────────────────

    error Unauthorized();
    error ControllerAlreadySet();
    error ZeroAmount();
    error ZeroShares();
    error InsufficientShares();
    error NothingToCollect();
    error PendingWithdrawalExists();
    error NotQueueOwner();
    error AlreadyCancelled();

    // ── Modifier ──────────────────────────────────────────────────────────────

    modifier onlyController() {
        if (msg.sender != controller) revert Unauthorized();
        _;
    }

    // ── Constructor ───────────────────────────────────────────────────────────

    /// @param usdc_       Address of the USDC token.
    /// @param controller_ Address of the Controller (pass address(0) on initial deploy,
    ///                    wire later via setController).
    constructor(address usdc_, address controller_) {
        usdc = IERC20(usdc_);
        controller = controller_;
    }

    // ── User-facing functions ─────────────────────────────────────────────────

    /// @notice Deposit USDC and receive proportional shares.
    ///         First deposit is 1:1; subsequent deposits use current share price.
    function deposit(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();

        uint256 newShares;
        if (totalShares == 0) {
            newShares = amount;
        } else {
            newShares = amount * totalShares / totalManagedAssets;
        }

        usdc.transferFrom(msg.sender, address(this), amount);
        totalManagedAssets += amount;
        totalShares += newShares;
        shares[msg.sender] += newShares;

        emit Deposited(msg.sender, amount, newShares);
    }

    /// @notice Request withdrawal of shares for USDC.
    ///         If freeCapital covers the redemption value, shares are burned immediately
    ///         and the USDC is credited to claimableBalance (pull via collect()).
    ///         Otherwise the request enters the FIFO queue.
    function withdraw(uint256 shares_) external {
        if (shares_ == 0) revert ZeroShares();
        // Shares available = owned minus already queued
        if (shares[msg.sender] - queuedShares[msg.sender] < shares_) revert InsufficientShares();

        uint256 usdcAmount = _sharesToUsdc(shares_);

        if (freeCapital() >= usdcAmount) {
            // Immediate path — burn shares now, credit claimableBalance
            shares[msg.sender] -= shares_;
            totalShares -= shares_;
            claimableBalance[msg.sender] += usdcAmount;
            emit WithdrawImmediate(msg.sender, shares_, usdcAmount);
        } else {
            // Queue path — reserve shares, block double-queuing
            if (hasPendingWithdrawal[msg.sender]) revert PendingWithdrawalExists();
            hasPendingWithdrawal[msg.sender] = true;
            queuedShares[msg.sender] += shares_;
            uint256 queueIndex = withdrawalQueue.length;
            withdrawalQueue.push(WithdrawalRequest({
                requester:   msg.sender,
                shares:      shares_,
                requestedAt: block.timestamp,
                cancelled:   false
            }));
            emit WithdrawQueued(msg.sender, shares_, queueIndex);
        }
    }

    /// @notice Collect credited USDC from a fulfilled (immediate or queued) withdrawal.
    ///         Decrements totalManagedAssets — this is the only collect-time decrement.
    function collect() external {
        uint256 amount = claimableBalance[msg.sender];
        if (amount == 0) revert NothingToCollect();
        claimableBalance[msg.sender] = 0;
        totalManagedAssets -= amount;
        usdc.transfer(msg.sender, amount);
        emit Collected(msg.sender, amount);
    }

    /// @notice Cancel a pending queued withdrawal. Releases the queued shares back
    ///         to the underwriter's free balance.
    function cancelWithdrawal(uint256 queueIndex) external {
        WithdrawalRequest storage req = withdrawalQueue[queueIndex];
        if (req.requester != msg.sender) revert NotQueueOwner();
        if (req.cancelled) revert AlreadyCancelled();
        req.cancelled = true;
        queuedShares[msg.sender] -= req.shares;
        hasPendingWithdrawal[msg.sender] = false;
        emit WithdrawCancelled(msg.sender, queueIndex);
    }

    // ── Protocol-internal functions (called by Controller) ────────────────────

    /// @notice Drain the FIFO withdrawal queue as far as free capital allows.
    ///         Stops at the first entry it cannot fully serve (no skipping).
    ///         Cancelled entries are skipped and queueHead is advanced past them.
    function processWithdrawalQueue() external onlyController {
        uint256 len = withdrawalQueue.length;
        // Snapshot available capital at entry — track allocation within this call
        // so that multiple entries crediting claimableBalance don't over-commit.
        uint256 available = freeCapital();

        while (queueHead < len) {
            WithdrawalRequest storage req = withdrawalQueue[queueHead];

            if (req.cancelled) {
                queueHead++;
                continue;
            }

            uint256 usdcAmount = _sharesToUsdc(req.shares);
            if (available < usdcAmount) break;

            available -= usdcAmount;

            // Burn shares and credit claimableBalance
            shares[req.requester]       -= req.shares;
            totalShares                 -= req.shares;
            queuedShares[req.requester] -= req.shares;
            hasPendingWithdrawal[req.requester] = false;
            claimableBalance[req.requester]     += usdcAmount;

            queueHead++;
        }
    }

    /// @notice Increase locked capital counter. onlyController.
    function increaseLocked(uint256 amount) external onlyController {
        lockedCapital += amount;
        emit LockedIncreased(amount);
    }

    /// @notice Decrease locked capital counter, flooring at zero. onlyController.
    function decreaseLocked(uint256 amount) external onlyController {
        if (amount >= lockedCapital) {
            lockedCapital = 0;
        } else {
            lockedCapital -= amount;
        }
        emit LockedDecreased(amount);
    }

    /// @notice Transfer USDC to a FlightPool as a delayed-flight payout. onlyController.
    ///         Decrements totalManagedAssets.
    function sendPayout(address flightPool, uint256 amount) external onlyController {
        totalManagedAssets -= amount;
        usdc.transfer(flightPool, amount);
        emit PayoutSent(flightPool, amount);
    }

    /// @notice Record that premium income has arrived (USDC already transferred to vault
    ///         by the FlightPool). Increments totalManagedAssets. onlyController.
    function recordPremiumIncome(uint256 amount) external onlyController {
        totalManagedAssets += amount;
        emit PremiumIncome(amount);
    }

    // ── Snapshot ──────────────────────────────────────────────────────────────

    /// @notice Attempt to write a price snapshot. No-op if within the same 24-hour window
    ///         or if totalShares == 0. Callable by anyone (CRE workflow calls this every tick).
    function snapshot() external {
        _maybeSnapshot();
    }

    // ── One-time admin wiring ─────────────────────────────────────────────────

    /// @notice Set the Controller address. One-time — reverts if already set.
    function setController(address controller_) external {
        if (controller != address(0)) revert ControllerAlreadySet();
        controller = controller_;
        emit ControllerSet(controller_);
    }

    // ── View functions ────────────────────────────────────────────────────────

    /// @notice USDC available for immediate withdrawal or new policy collateral.
    ///         = totalManagedAssets - lockedCapital (floored at 0).
    function freeCapital() public view returns (uint256) {
        if (lockedCapital >= totalManagedAssets) return 0;
        return totalManagedAssets - lockedCapital;
    }

    /// @notice Alias for totalManagedAssets.
    function totalAssets() external view returns (uint256) {
        return totalManagedAssets;
    }

    /// @notice Full USDC redemption value for shares_ at current share price.
    function previewRedeem(uint256 shares_) external view returns (uint256) {
        if (totalShares == 0) return 0;
        return _sharesToUsdc(shares_);
    }

    /// @notice Redemption value for shares_ capped at freeCapital.
    ///         Gives underwriters a realistic picture of immediate withdrawal capacity.
    function previewRedeemFree(uint256 shares_) external view returns (uint256) {
        if (totalShares == 0) return 0;
        uint256 full = _sharesToUsdc(shares_);
        uint256 free = freeCapital();
        return full > free ? free : full;
    }

    /// @notice Returns usdc.balanceOf(this) - totalManagedAssets.
    ///         Should be zero in normal operation. Positive value indicates
    ///         out-of-band USDC transfer directly to this contract address.
    function balanceSanityCheck() external view returns (uint256) {
        uint256 actual = usdc.balanceOf(address(this));
        if (actual <= totalManagedAssets) return 0;
        return actual - totalManagedAssets;
    }

    /// @notice Number of price snapshots recorded.
    function priceHistoryLength() external view returns (uint256) {
        return priceHistory.length;
    }

    /// @notice Return a specific price snapshot by index.
    function getPriceSnapshot(uint256 index) external view returns (PriceSnapshot memory) {
        return priceHistory[index];
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    /// @dev Convert shares to USDC at current share price.
    function _sharesToUsdc(uint256 shares_) internal view returns (uint256) {
        return shares_ * totalManagedAssets / totalShares;
    }

    /// @dev Write a price snapshot if 24 hours have elapsed since the last one.
    ///      No-op if totalShares == 0.
    function _maybeSnapshot() internal {
        if (totalShares == 0) return;
        if (block.timestamp < lastSnapshotTimestamp + 24 hours) return;
        uint256 price = totalManagedAssets * 1e6 / totalShares;
        priceHistory.push(PriceSnapshot({ timestamp: block.timestamp, pricePerShare: price }));
        lastSnapshotTimestamp = block.timestamp;
        emit SnapshotTaken(block.timestamp, price);
    }
}
