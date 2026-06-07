// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.24;

import { IIdentity } from "../identity/IIdentity.sol";
import { IClaimTopicsRegistry } from "./IClaimTopicsRegistry.sol";
import { ITrustedIssuersRegistry } from "./ITrustedIssuersRegistry.sol";
import { IIdentityRegistryStorage } from "./IIdentityRegistryStorage.sol";

/// @title IIdentityRegistry (ERC-3643)
/// @notice Cœur de la conformité d'identité. Répond à la question :
///         "ce wallet est-il un investisseur éligible KYC ?" via `isVerified`,
///         qui croise IdentityRegistryStorage (qui est l'ONCHAINID du wallet) +
///         ClaimTopicsRegistry (quels claims sont requis) + TrustedIssuersRegistry
///         (qui peut signer ces claims). Le token appelle `isVerified` à chaque
///         transfert.
interface IIdentityRegistry {
    event ClaimTopicsRegistrySet(address indexed claimTopicsRegistry);
    event IdentityStorageSet(address indexed identityStorage);
    event TrustedIssuersRegistrySet(address indexed trustedIssuersRegistry);
    event IdentityRegistered(address indexed investorAddress, IIdentity indexed identity);
    event IdentityRemoved(address indexed investorAddress, IIdentity indexed identity);
    event IdentityUpdated(IIdentity indexed oldIdentity, IIdentity indexed newIdentity);
    event CountryUpdated(address indexed investorAddress, uint16 indexed country);

    function registerIdentity(address userAddress, IIdentity identity, uint16 country) external;
    function deleteIdentity(address userAddress) external;
    function updateIdentity(address userAddress, IIdentity identity) external;
    function updateCountry(address userAddress, uint16 country) external;
    function batchRegisterIdentity(
        address[] calldata userAddresses,
        IIdentity[] calldata identities,
        uint16[] calldata countries
    ) external;

    function contains(address userAddress) external view returns (bool);
    /// @notice LE point d'entrée conformité KYC : true ssi le wallet a une
    ///         ONCHAINID portant un claim valide non révoqué pour CHAQUE topic requis.
    function isVerified(address userAddress) external view returns (bool);

    function identity(address userAddress) external view returns (IIdentity);
    function investorCountry(address userAddress) external view returns (uint16);

    function identityStorage() external view returns (IIdentityRegistryStorage);
    function issuersRegistry() external view returns (ITrustedIssuersRegistry);
    function topicsRegistry() external view returns (IClaimTopicsRegistry);

    function setIdentityRegistryStorage(address identityRegistryStorage) external;
    function setClaimTopicsRegistry(address claimTopicsRegistry) external;
    function setTrustedIssuersRegistry(address trustedIssuersRegistry) external;
}
