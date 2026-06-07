// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.24;

import { IERC20Metadata } from "../vendor/IERC20.sol";
import { IIdentityRegistry } from "./IIdentityRegistry.sol";
import { IModularCompliance } from "./IModularCompliance.sol";

/// @title IToken (ERC-3643)
/// @notice Security token permissionné. Surface = ERC-20 + couche conformité :
///         transferts gardés par IdentityRegistry.isVerified + ModularCompliance,
///         gestion d'agent (mint/burn/forcedTransfer/freeze), pause, métadonnées
///         on-chain (ISIN du registre DEEP, version).
///
///         ARTICULATION JURIDIQUE (cf. README) :
///         - Ce token est le MIROIR on-chain d'obligations inscrites en DEEP.
///         - Le DEEP (droit FR, Ord. 2017-1674) reste la SOURCE DE VÉRITÉ légale.
///         - `onchainID()` du token pointe vers l'identité de l'émetteur (la SPV).
///         - `onchainRegistryRef` / `legalRegistryURI` ancrent le lien token<->DEEP.
interface IToken is IERC20Metadata {
    event UpdatedTokenInformation(
        string newName,
        string newSymbol,
        uint8 newDecimals,
        string newVersion,
        address newOnchainID
    );
    event IdentityRegistryAdded(address indexed identityRegistry);
    event ComplianceAdded(address indexed compliance);
    event RecoverySuccess(
        address indexed lostWallet, address indexed newWallet, address indexed investorOnchainID
    );
    event AddressFrozen(address indexed userAddress, bool indexed isFrozen, address indexed owner);
    event TokensFrozen(address indexed userAddress, uint256 amount);
    event TokensUnfrozen(address indexed userAddress, uint256 amount);
    // NB : les événements Paused/Unpaused proviennent du mixin Pausable
    // (PausableUpgradeable) pour éviter une double déclaration.
    /// @notice Lien explicite token <-> registre légal DEEP (ISIN / réf greffe).
    event LegalRegistryReferenceSet(string isin, string legalRegistryURI);

    // --- Métadonnées & registres ---
    function setName(string calldata name) external;
    function setSymbol(string calldata symbol) external;
    function setOnchainID(address onchainID) external;
    function version() external view returns (string memory);
    function onchainID() external view returns (address);
    function identityRegistry() external view returns (IIdentityRegistry);
    function compliance() external view returns (IModularCompliance);
    function setIdentityRegistry(address identityRegistry) external;
    function setCompliance(address compliance) external;

    // --- Référence registre légal DEEP (miroir) ---
    function setLegalRegistryReference(string calldata isin, string calldata legalRegistryURI)
        external;
    function isin() external view returns (string memory);
    function legalRegistryURI() external view returns (string memory);

    // --- Pause (conformité) ---
    function pause() external;
    function unpause() external;
    function paused() external view returns (bool);

    // --- Gel ---
    function setAddressFrozen(address userAddress, bool freeze) external;
    function freezePartialTokens(address userAddress, uint256 amount) external;
    function unfreezePartialTokens(address userAddress, uint256 amount) external;
    function isFrozen(address userAddress) external view returns (bool);
    function getFrozenTokens(address userAddress) external view returns (uint256);

    // --- Émission / destruction (agent) ---
    function mint(address to, uint256 amount) external;
    function burn(address userAddress, uint256 amount) external;
    function batchMint(address[] calldata toList, uint256[] calldata amounts) external;
    function batchBurn(address[] calldata userAddresses, uint256[] calldata amounts) external;

    // --- Transfert forcé / clawback (agent) ---
    function forcedTransfer(address from, address to, uint256 amount) external returns (bool);
    function batchForcedTransfer(
        address[] calldata fromList,
        address[] calldata toList,
        uint256[] calldata amounts
    ) external;

    // --- Recouvrement de wallet perdu ---
    function recoveryAddress(address lostWallet, address newWallet, address investorOnchainID)
        external
        returns (bool);
}
