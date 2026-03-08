// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title MockUSDC
/// @notice Test-only mintable ERC-20 with 6 decimals, standing in for real USDC.
///         Never deploy to mainnet.
contract MockUSDC is ERC20, Ownable {
    constructor() ERC20("Mock USD Coin", "USDC") Ownable(msg.sender) {}

    /// @notice Returns 6, matching real USDC decimal precision.
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Mint tokens. Only callable by the owner (test deployer).
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
