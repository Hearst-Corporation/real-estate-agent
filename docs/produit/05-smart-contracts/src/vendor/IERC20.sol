// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IERC20 (vendoré, EIP-20)
/// @notice Interface standard. Utilisée pour (a) le settlement token EURC/EURe
///         côté distribution et (b) l'interface publique du security token lui-même
///         (le security token EST un ERC-20 enrichi de la couche conformité ERC-3643).
interface IERC20 {
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 value) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

/// @notice Métadonnées optionnelles EIP-20.
interface IERC20Metadata is IERC20 {
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
}
