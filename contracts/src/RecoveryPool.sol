// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title RecoveryPool
/// @notice Custody-only holding pool for expired, unclaimed traveler payouts.
///         When a FlightPool's claim window expires, FlightPool.sweepExpired()
///         transfers remaining USDC here and calls _recordDeposit() to log the
///         source. The owner can withdraw for legitimate late-claim resolution.
contract RecoveryPool is Ownable {
    IERC20 public immutable usdc;

    /// @dev sourcePool => cumulative USDC recorded from that pool
    mapping(address => uint256) private deposits;

    event DepositRecorded(address indexed sourcePool, uint256 amount);
    event Withdrawn(address indexed recipient, uint256 amount);

    constructor(address usdc_) Ownable(msg.sender) {
        usdc = IERC20(usdc_);
    }

    /// @notice Records an incoming deposit from a FlightPool after USDC has
    ///         already been transferred to this contract.
    ///         Protocol-internal — called by FlightPool.sweepExpired().
    function _recordDeposit(address sourcePool, uint256 amount) external {
        deposits[sourcePool] += amount;
        emit DepositRecorded(sourcePool, amount);
    }

    /// @notice Transfers USDC to recipient. Owner only.
    ///         Intended for manual resolution of legitimate late claims.
    function withdraw(uint256 amount, address recipient) external onlyOwner {
        usdc.transfer(recipient, amount);
        emit Withdrawn(recipient, amount);
    }

    /// @notice Returns cumulative USDC recorded as received from a given pool address.
    function depositsFrom(address pool) external view returns (uint256) {
        return deposits[pool];
    }
}
