// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.24;

import { IIdentityRegistry } from "../interfaces/IIdentityRegistry.sol";
import { IClaimTopicsRegistry } from "../interfaces/IClaimTopicsRegistry.sol";
import { ITrustedIssuersRegistry } from "../interfaces/ITrustedIssuersRegistry.sol";
import { IIdentityRegistryStorage } from "../interfaces/IIdentityRegistryStorage.sol";
import { IIdentity, IClaimIssuer } from "../identity/IIdentity.sol";
import { AgentRoleUpgradeable } from "../vendor/RolesUpgradeable.sol";
import { UUPSUpgradeable } from "../vendor/UUPSUpgradeable.sol";

/// @title IdentityRegistry
/// @notice Cœur de la conformité d'identité ERC-3643. `isVerified(wallet)` =
///         pierre angulaire du KYC obligatoire : pour CHAQUE topic requis
///         (ClaimTopicsRegistry), le wallet doit porter sur son ONCHAINID au moins
///         un claim signé par un trusted issuer habilité (TrustedIssuersRegistry)
///         et NON révoqué. Si un seul topic manque -> non vérifié -> transfert
///         refusé par le token. C'est l'invariant testé en Foundry :
///         "transfert vers wallet non-KYC DOIT échouer".
contract IdentityRegistry is IIdentityRegistry, AgentRoleUpgradeable, UUPSUpgradeable {
    /// @custom:storage-location erc7201:hearst.storage.IdentityRegistry
    struct IRStorage {
        IClaimTopicsRegistry topicsRegistry;
        ITrustedIssuersRegistry issuersRegistry;
        IIdentityRegistryStorage identityStorage;
    }

    // ERC-7201: hearst.storage.IdentityRegistry
    bytes32 private constant IR_STORAGE =
        0xc1d73806c2972787114557c6a834eee0877e439dbebfaa6b516415a07b86d800;

    error ArrayLengthMismatch();
    error ZeroAddress();

    constructor() {
        _disableInitializers();
    }

    function initialize(
        address initialOwner,
        address trustedIssuersRegistry,
        address claimTopicsRegistry,
        address identityStorage_
    ) external initializer {
        if (
            trustedIssuersRegistry == address(0) || claimTopicsRegistry == address(0)
                || identityStorage_ == address(0)
        ) revert ZeroAddress();
        __Ownable_init(initialOwner);
        IRStorage storage $ = _s();
        $.issuersRegistry = ITrustedIssuersRegistry(trustedIssuersRegistry);
        $.topicsRegistry = IClaimTopicsRegistry(claimTopicsRegistry);
        $.identityStorage = IIdentityRegistryStorage(identityStorage_);
        emit TrustedIssuersRegistrySet(trustedIssuersRegistry);
        emit ClaimTopicsRegistrySet(claimTopicsRegistry);
        emit IdentityStorageSet(identityStorage_);
    }

    function _s() private pure returns (IRStorage storage $) {
        assembly {
            $.slot := IR_STORAGE
        }
    }

    // --- Enregistrement (agent : relais KYC / transfer agent) ---
    function registerIdentity(address userAddress, IIdentity identityContract, uint16 country)
        public
        override
        onlyAgent
    {
        _s().identityStorage.addIdentityToStorage(userAddress, identityContract, country);
        emit IdentityRegistered(userAddress, identityContract);
    }

    function deleteIdentity(address userAddress) external override onlyAgent {
        IIdentity old = _s().identityStorage.storedIdentity(userAddress);
        _s().identityStorage.removeIdentityFromStorage(userAddress);
        emit IdentityRemoved(userAddress, old);
    }

    function updateIdentity(address userAddress, IIdentity identityContract)
        external
        override
        onlyAgent
    {
        IIdentity old = _s().identityStorage.storedIdentity(userAddress);
        _s().identityStorage.modifyStoredIdentity(userAddress, identityContract);
        emit IdentityUpdated(old, identityContract);
    }

    function updateCountry(address userAddress, uint16 country) external override onlyAgent {
        _s().identityStorage.modifyStoredInvestorCountry(userAddress, country);
        emit CountryUpdated(userAddress, country);
    }

    function batchRegisterIdentity(
        address[] calldata userAddresses,
        IIdentity[] calldata identities,
        uint16[] calldata countries
    ) external override onlyAgent {
        uint256 len = userAddresses.length;
        if (len != identities.length || len != countries.length) revert ArrayLengthMismatch();
        for (uint256 i = 0; i < len; i++) {
            registerIdentity(userAddresses[i], identities[i], countries[i]);
        }
    }

    // --- LE point d'entrée KYC ---
    function isVerified(address userAddress) external view override returns (bool) {
        IRStorage storage $ = _s();
        IIdentity id = $.identityStorage.storedIdentity(userAddress);
        if (address(id) == address(0)) {
            return false; // pas d'ONCHAINID enregistrée -> jamais éligible
        }

        uint256[] memory requiredTopics = $.topicsRegistry.getClaimTopics();
        if (requiredTopics.length == 0) {
            // Aucun topic requis : la seule présence d'une ONCHAINID suffit.
            // (Config de placement privé "light" possible, mais en pratique on
            //  exige toujours au moins le topic KYC_AML.)
            return true;
        }

        for (uint256 t = 0; t < requiredTopics.length; t++) {
            if (!_hasValidClaimForTopic(id, requiredTopics[t])) {
                return false; // un topic manquant invalide tout
            }
        }
        return true;
    }

    /// @dev Pour un topic donné : parmi les claims de cette identité sur ce topic,
    ///      en existe-t-il un signé par un trusted issuer habilité ET non révoqué ?
    function _hasValidClaimForTopic(IIdentity id, uint256 topic) internal view returns (bool) {
        IRStorage storage $ = _s();
        bytes32[] memory claimIds = id.getClaimIdsByTopic(topic);
        for (uint256 c = 0; c < claimIds.length; c++) {
            (uint256 foundTopic,, address issuer, bytes memory sig, bytes memory data,) =
                id.getClaim(claimIds[c]);
            if (foundTopic != topic) continue;
            // L'émetteur doit être de confiance ET habilité pour ce topic.
            if (!$.issuersRegistry.isTrustedIssuer(issuer)) continue;
            if (!$.issuersRegistry.hasClaimTopic(issuer, topic)) continue;
            // La signature doit être valide et le claim non révoqué.
            try IClaimIssuer(issuer).isClaimValid(id, topic, sig, data) returns (bool valid) {
                if (valid) return true;
            } catch {
                continue;
            }
        }
        return false;
    }

    function contains(address userAddress) external view override returns (bool) {
        return address(_s().identityStorage.storedIdentity(userAddress)) != address(0);
    }

    function identity(address userAddress) external view override returns (IIdentity) {
        return _s().identityStorage.storedIdentity(userAddress);
    }

    function investorCountry(address userAddress) external view override returns (uint16) {
        return _s().identityStorage.storedInvestorCountry(userAddress);
    }

    function identityStorage() external view override returns (IIdentityRegistryStorage) {
        return _s().identityStorage;
    }

    function issuersRegistry() external view override returns (ITrustedIssuersRegistry) {
        return _s().issuersRegistry;
    }

    function topicsRegistry() external view override returns (IClaimTopicsRegistry) {
        return _s().topicsRegistry;
    }

    // --- Setters (owner) ---
    function setIdentityRegistryStorage(address identityRegistryStorage)
        external
        override
        onlyOwner
    {
        if (identityRegistryStorage == address(0)) revert ZeroAddress();
        _s().identityStorage = IIdentityRegistryStorage(identityRegistryStorage);
        emit IdentityStorageSet(identityRegistryStorage);
    }

    function setClaimTopicsRegistry(address claimTopicsRegistry) external override onlyOwner {
        if (claimTopicsRegistry == address(0)) revert ZeroAddress();
        _s().topicsRegistry = IClaimTopicsRegistry(claimTopicsRegistry);
        emit ClaimTopicsRegistrySet(claimTopicsRegistry);
    }

    function setTrustedIssuersRegistry(address trustedIssuersRegistry)
        external
        override
        onlyOwner
    {
        if (trustedIssuersRegistry == address(0)) revert ZeroAddress();
        _s().issuersRegistry = ITrustedIssuersRegistry(trustedIssuersRegistry);
        emit TrustedIssuersRegistrySet(trustedIssuersRegistry);
    }

    function _authorizeUpgrade(address) internal override onlyOwner { }
}
