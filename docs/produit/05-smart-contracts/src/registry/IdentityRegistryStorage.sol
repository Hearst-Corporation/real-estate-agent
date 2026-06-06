// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.24;

import { IIdentityRegistryStorage } from "../interfaces/IIdentityRegistryStorage.sol";
import { IIdentity } from "../identity/IIdentity.sol";
import { AgentRoleUpgradeable } from "../vendor/RolesUpgradeable.sol";
import { UUPSUpgradeable } from "../vendor/UUPSUpgradeable.sol";

/// @title IdentityRegistryStorage
/// @notice Stockage ERC-3643 partageable wallet -> (ONCHAINID, pays).
///         Plusieurs IdentityRegistry (un par SPV/token) peuvent être "bindés"
///         dessus pour réutiliser le socle KYC : la VÉRIFICATION d'identité est
///         mutualisée, JAMAIS le capital (anti-FIA : pas de pooling d'actifs,
///         cf. étude §recadrage 2 et SAN-2025-08).
contract IdentityRegistryStorage is
    IIdentityRegistryStorage,
    AgentRoleUpgradeable,
    UUPSUpgradeable
{
    struct Identity {
        IIdentity identityContract;
        uint16 investorCountry;
    }

    /// @custom:storage-location erc7201:hearst.storage.IdentityRegistryStorage
    struct IRSStorage {
        mapping(address => Identity) identities;
        address[] identityRegistries; // registries bindés (lecture/écriture)
        mapping(address => bool) isBound;
    }

    // ERC-7201: hearst.storage.IdentityRegistryStorage
    bytes32 private constant IRS_STORAGE =
        0xc1815591ebe45d25a0e9a499965f2861a571241ee4f39cfed6efab130b612a00;

    uint256 public constant MAX_BOUND_REGISTRIES = 300;

    error IdentityAlreadyStored(address userAddress);
    error IdentityNotStored(address userAddress);
    error IdentityZeroAddress();
    error RegistryAlreadyBound(address registry);
    error RegistryNotBound(address registry);
    error MaxRegistriesBound();

    /// @dev Seuls les registries bindés OU un agent peuvent écrire.
    modifier onlyBoundOrAgent() {
        if (!_s().isBound[_msgSender()] && !isAgent(_msgSender())) {
            revert AgentRoleUnauthorized(_msgSender());
        }
        _;
    }

    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner) external initializer {
        __Ownable_init(initialOwner);
    }

    function _s() private pure returns (IRSStorage storage $) {
        assembly {
            $.slot := IRS_STORAGE
        }
    }

    function addIdentityToStorage(address userAddress, IIdentity identity, uint16 country)
        external
        override
        onlyBoundOrAgent
    {
        if (userAddress == address(0) || address(identity) == address(0)) {
            revert IdentityZeroAddress();
        }
        IRSStorage storage $ = _s();
        if (address($.identities[userAddress].identityContract) != address(0)) {
            revert IdentityAlreadyStored(userAddress);
        }
        $.identities[userAddress] = Identity(identity, country);
        emit IdentityStored(userAddress, identity);
    }

    function removeIdentityFromStorage(address userAddress)
        external
        override
        onlyBoundOrAgent
    {
        IRSStorage storage $ = _s();
        IIdentity old = $.identities[userAddress].identityContract;
        if (address(old) == address(0)) revert IdentityNotStored(userAddress);
        delete $.identities[userAddress];
        emit IdentityUnstored(userAddress, old);
    }

    function modifyStoredIdentity(address userAddress, IIdentity identity)
        external
        override
        onlyBoundOrAgent
    {
        if (address(identity) == address(0)) revert IdentityZeroAddress();
        IRSStorage storage $ = _s();
        IIdentity old = $.identities[userAddress].identityContract;
        if (address(old) == address(0)) revert IdentityNotStored(userAddress);
        $.identities[userAddress].identityContract = identity;
        emit IdentityModified(old, identity);
    }

    function modifyStoredInvestorCountry(address userAddress, uint16 country)
        external
        override
        onlyBoundOrAgent
    {
        IRSStorage storage $ = _s();
        if (address($.identities[userAddress].identityContract) == address(0)) {
            revert IdentityNotStored(userAddress);
        }
        $.identities[userAddress].investorCountry = country;
        emit CountryModified(userAddress, country);
    }

    // --- Binding des registries (owner) ---
    function bindIdentityRegistry(address identityRegistry) external override onlyOwner {
        if (identityRegistry == address(0)) revert IdentityZeroAddress();
        IRSStorage storage $ = _s();
        if ($.isBound[identityRegistry]) revert RegistryAlreadyBound(identityRegistry);
        if ($.identityRegistries.length >= MAX_BOUND_REGISTRIES) revert MaxRegistriesBound();
        $.isBound[identityRegistry] = true;
        $.identityRegistries.push(identityRegistry);
        emit IdentityRegistryBound(identityRegistry);
    }

    function unbindIdentityRegistry(address identityRegistry) external override onlyOwner {
        IRSStorage storage $ = _s();
        if (!$.isBound[identityRegistry]) revert RegistryNotBound(identityRegistry);
        $.isBound[identityRegistry] = false;
        uint256 len = $.identityRegistries.length;
        for (uint256 i = 0; i < len; i++) {
            if ($.identityRegistries[i] == identityRegistry) {
                $.identityRegistries[i] = $.identityRegistries[len - 1];
                $.identityRegistries.pop();
                break;
            }
        }
        emit IdentityRegistryUnbound(identityRegistry);
    }

    // --- Views ---
    function storedIdentity(address userAddress) external view override returns (IIdentity) {
        return _s().identities[userAddress].identityContract;
    }

    function storedInvestorCountry(address userAddress)
        external
        view
        override
        returns (uint16)
    {
        return _s().identities[userAddress].investorCountry;
    }

    function linkedIdentityRegistries() external view override returns (address[] memory) {
        return _s().identityRegistries;
    }

    function _authorizeUpgrade(address) internal override onlyOwner { }
}
