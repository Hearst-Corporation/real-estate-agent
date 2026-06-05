// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Context } from "./Context.sol";

/// @title Ownable2Step (vendoré)
/// @notice Transfert de propriété en 2 étapes (propose puis accept) pour éviter
///         le transfert vers une adresse morte. Le owner est le "board" légal du
///         token (typiquement un multisig de la SAS émettrice / de l'agent de
///         tokenisation Tokeny). Distinct du rôle AGENT opérationnel.
abstract contract Ownable2Step is Context {
    address private _owner;
    address private _pendingOwner;

    error OwnableUnauthorizedAccount(address account);
    error OwnableInvalidOwner(address owner);

    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor(address initialOwner) {
        if (initialOwner == address(0)) revert OwnableInvalidOwner(address(0));
        _transferOwnership(initialOwner);
    }

    modifier onlyOwner() {
        if (owner() != _msgSender()) revert OwnableUnauthorizedAccount(_msgSender());
        _;
    }

    function owner() public view virtual returns (address) {
        return _owner;
    }

    function pendingOwner() public view virtual returns (address) {
        return _pendingOwner;
    }

    function transferOwnership(address newOwner) public virtual onlyOwner {
        _pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner(), newOwner);
    }

    function acceptOwnership() public virtual {
        address sender = _msgSender();
        if (_pendingOwner != sender) revert OwnableUnauthorizedAccount(sender);
        _transferOwnership(sender);
    }

    function _transferOwnership(address newOwner) internal virtual {
        delete _pendingOwner;
        address oldOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}

/// @title AgentRole (vendoré, inspiré T-REX)
/// @notice Couche de rôle "agent" : opérateurs habilités (KYC issuer relay,
///         transfer agent, registrar DEEP) autorisés à minter/burn/forcedTransfer,
///         freeze et piloter la conformité. L'owner gère la liste des agents.
abstract contract AgentRole is Ownable2Step {
    mapping(address => bool) private _agents;

    event AgentAdded(address indexed agent);
    event AgentRemoved(address indexed agent);

    error AgentRoleUnauthorized(address account);
    error AgentZeroAddress();

    modifier onlyAgent() {
        if (!_agents[_msgSender()]) revert AgentRoleUnauthorized(_msgSender());
        _;
    }

    function isAgent(address account) public view returns (bool) {
        return _agents[account];
    }

    function addAgent(address account) external onlyOwner {
        if (account == address(0)) revert AgentZeroAddress();
        _agents[account] = true;
        emit AgentAdded(account);
    }

    function removeAgent(address account) external onlyOwner {
        if (account == address(0)) revert AgentZeroAddress();
        _agents[account] = false;
        emit AgentRemoved(account);
    }
}
