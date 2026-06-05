// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { IERC20, IERC20Metadata } from "../../src/vendor/IERC20.sol";

/// @title MockEURC
/// @notice ERC-20 minimal simulant EURC (Circle, 6 décimales) pour les tests de
///         distribution. En prod, le settlement token est l'EURC réel (EMT MiCA).
contract MockEURC is IERC20Metadata {
    mapping(address => uint256) public override balanceOf;
    mapping(address => mapping(address => uint256)) public override allowance;
    uint256 public override totalSupply;

    function name() external pure override returns (string memory) {
        return "Euro Coin (mock)";
    }

    function symbol() external pure override returns (string memory) {
        return "EURC";
    }

    function decimals() external pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 value) external override returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external override returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value)
        external
        override
        returns (bool)
    {
        uint256 a = allowance[from][msg.sender];
        require(a >= value, "EURC: allowance");
        allowance[from][msg.sender] = a - value;
        _transfer(from, to, value);
        return true;
    }

    function _transfer(address from, address to, uint256 value) internal {
        uint256 b = balanceOf[from];
        require(b >= value, "EURC: balance");
        balanceOf[from] = b - value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }
}
