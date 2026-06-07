// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Context } from "./Context.sol";
import { Initializable } from "./Initializable.sol";

/// @title OwnableUpgradeable + AgentRoleUpgradeable (vendoré, ERC-7201 storage)
/// @notice Versions proxy-safe de la gouvernance T-REX. Stockage en slots
///         namespacés ERC-7201 pour survivre aux upgrades sans collision.
///
///         - OWNER  = board légal du token (multisig SAS émettrice / agent Tokeny).
///                    Gère agents, upgrades, bindings registries, pause.
///         - AGENT  = opérateurs (relais KYC, transfer agent, registrar DEEP).
///                    mint/burn/forcedTransfer/freeze.
abstract contract OwnableUpgradeable is Initializable, Context {
    /// @custom:storage-location erc7201:hearst.storage.Ownable
    struct OwnableStorage {
        address _owner;
        address _pendingOwner;
    }

    // ERC-7201: keccak256(abi.encode(uint256(keccak256("hearst.storage.Ownable")) - 1)) & ~0xff
    bytes32 private constant OWNABLE_STORAGE =
        0xf51f8cef2cf25da3cb0ac30713f3c25f9fbfc4248f25c1864ba5bb9eb76e1f00;

    error OwnableUnauthorizedAccount(address account);
    error OwnableInvalidOwner(address owner);

    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    function _getOwnableStorage() private pure returns (OwnableStorage storage $) {
        assembly {
            $.slot := OWNABLE_STORAGE
        }
    }

    function __Ownable_init(address initialOwner) internal onlyInitializing {
        if (initialOwner == address(0)) revert OwnableInvalidOwner(address(0));
        _transferOwnership(initialOwner);
    }

    modifier onlyOwner() {
        if (owner() != _msgSender()) revert OwnableUnauthorizedAccount(_msgSender());
        _;
    }

    function owner() public view virtual returns (address) {
        return _getOwnableStorage()._owner;
    }

    function pendingOwner() public view virtual returns (address) {
        return _getOwnableStorage()._pendingOwner;
    }

    function transferOwnership(address newOwner) public virtual onlyOwner {
        _getOwnableStorage()._pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner(), newOwner);
    }

    function acceptOwnership() public virtual {
        address sender = _msgSender();
        if (pendingOwner() != sender) revert OwnableUnauthorizedAccount(sender);
        _transferOwnership(sender);
    }

    function _transferOwnership(address newOwner) internal virtual {
        OwnableStorage storage $ = _getOwnableStorage();
        delete $._pendingOwner;
        address oldOwner = $._owner;
        $._owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}

abstract contract AgentRoleUpgradeable is OwnableUpgradeable {
    /// @custom:storage-location erc7201:hearst.storage.AgentRole
    struct AgentRoleStorage {
        mapping(address => bool) _agents;
    }

    // ERC-7201: keccak256(abi.encode(uint256(keccak256("hearst.storage.AgentRole")) - 1)) & ~0xff
    bytes32 private constant AGENTROLE_STORAGE =
        0x96bdceff8113c728087153a238a7fc50bc0fd36d1ec9616fa0c6e1da3d9ca800;

    event AgentAdded(address indexed agent);
    event AgentRemoved(address indexed agent);

    error AgentRoleUnauthorized(address account);
    error AgentZeroAddress();

    function _getAgentRoleStorage() private pure returns (AgentRoleStorage storage $) {
        assembly {
            $.slot := AGENTROLE_STORAGE
        }
    }

    modifier onlyAgent() {
        if (!isAgent(_msgSender())) revert AgentRoleUnauthorized(_msgSender());
        _;
    }

    function isAgent(address account) public view returns (bool) {
        return _getAgentRoleStorage()._agents[account];
    }

    function addAgent(address account) external onlyOwner {
        if (account == address(0)) revert AgentZeroAddress();
        _getAgentRoleStorage()._agents[account] = true;
        emit AgentAdded(account);
    }

    function removeAgent(address account) external onlyOwner {
        if (account == address(0)) revert AgentZeroAddress();
        _getAgentRoleStorage()._agents[account] = false;
        emit AgentRemoved(account);
    }
}
