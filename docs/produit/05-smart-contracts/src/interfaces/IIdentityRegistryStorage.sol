// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.24;

import { IIdentity } from "../identity/IIdentity.sol";

/// @title IIdentityRegistryStorage (ERC-3643)
/// @notice Stockage PARTAGEABLE wallet -> (ONCHAINID, pays). Séparé de la logique
///         de l'IdentityRegistry pour permettre à plusieurs tokens (plusieurs SPV)
///         de réutiliser le même socle d'identités KYC (mutualisation de la
///         vérification, pas du capital). Le pays est un code ISO-3166 numérique.
interface IIdentityRegistryStorage {
    event IdentityStored(address indexed investorAddress, IIdentity indexed identity);
    event IdentityUnstored(address indexed investorAddress, IIdentity indexed identity);
    event IdentityModified(IIdentity indexed oldIdentity, IIdentity indexed newIdentity);
    event CountryModified(address indexed investorAddress, uint16 indexed country);
    event IdentityRegistryBound(address indexed identityRegistry);
    event IdentityRegistryUnbound(address indexed identityRegistry);

    function addIdentityToStorage(address userAddress, IIdentity identity, uint16 country)
        external;
    function removeIdentityFromStorage(address userAddress) external;
    function modifyStoredIdentity(address userAddress, IIdentity identity) external;
    function modifyStoredInvestorCountry(address userAddress, uint16 country) external;

    function bindIdentityRegistry(address identityRegistry) external;
    function unbindIdentityRegistry(address identityRegistry) external;

    function storedIdentity(address userAddress) external view returns (IIdentity);
    function storedInvestorCountry(address userAddress) external view returns (uint16);
    function linkedIdentityRegistries() external view returns (address[] memory);
}
