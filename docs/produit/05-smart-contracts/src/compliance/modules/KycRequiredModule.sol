// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.24;

import { AbstractModule } from "../AbstractModule.sol";
import { IIdentityRegistry } from "../../interfaces/IIdentityRegistry.sol";

/// @title KycRequiredModule
/// @notice Module de conformité : KYC OBLIGATOIRE (ceinture + bretelles).
///         Le token vérifie déjà `identityRegistry.isVerified(to)` à chaque
///         transfert ; ce module ajoute une garantie redondante AU NIVEAU
///         COMPLIANCE et permet d'exiger aussi la vérification de l'émetteur
///         `from` (utile si une révocation KYC doit geler les SORTIES d'un
///         wallet, pas seulement les entrées).
///
///         Justification : étude P5 §2, P10 (LCB-FT renforcé). Défense en
///         profondeur : si une future modif désactivait par erreur le check
///         côté token, ce module continue de bloquer les non-KYC.
contract KycRequiredModule is AbstractModule {
    /// @dev compliance => IdentityRegistry.
    mapping(address => IIdentityRegistry) public identityRegistryOf;
    /// @dev compliance => exiger aussi le KYC de l'émetteur (from) ?
    mapping(address => bool) public requireSenderKyc;

    event IdentityRegistrySet(address indexed compliance, address indexed identityRegistry);
    event RequireSenderKycSet(address indexed compliance, bool required);

    error ZeroIdentityRegistry();

    constructor(address initialOwner) AbstractModule(initialOwner) { }

    function setIdentityRegistry(address compliance, address ir) external {
        if (msg.sender != compliance && msg.sender != owner()) {
            revert OnlyBoundCompliance(compliance);
        }
        if (!_complianceBound[compliance]) revert OnlyBoundCompliance(compliance);
        if (ir == address(0)) revert ZeroIdentityRegistry();
        identityRegistryOf[compliance] = IIdentityRegistry(ir);
        emit IdentityRegistrySet(compliance, ir);
    }

    function setRequireSenderKyc(address compliance, bool required) external {
        if (msg.sender != compliance && msg.sender != owner()) {
            revert OnlyBoundCompliance(compliance);
        }
        if (!_complianceBound[compliance]) revert OnlyBoundCompliance(compliance);
        requireSenderKyc[compliance] = required;
        emit RequireSenderKycSet(compliance, required);
    }

    /// @notice Vérification AVANT transfert (cf. IModule.moduleCheck).
    function moduleCheck(address from, address to, uint256, address compliance)
        external
        view
        override
        returns (bool)
    {
        IIdentityRegistry ir = identityRegistryOf[compliance];
        if (address(ir) == address(0)) {
            // Non configuré : ne pas bloquer ICI (le token applique déjà isVerified).
            return true;
        }
        // Destinataire : toujours KYC (sauf burn to==0, non routé ici).
        if (to != address(0) && !ir.isVerified(to)) {
            return false;
        }
        // Émetteur : optionnel (from==0 = mint, ignoré).
        if (requireSenderKyc[compliance] && from != address(0) && !ir.isVerified(from)) {
            return false;
        }
        return true;
    }

    function moduleTransferAction(address, address, uint256)
        external
        override
        onlyComplianceCall
    { }

    function moduleMintAction(address, uint256) external override onlyComplianceCall { }

    function moduleBurnAction(address, uint256) external override onlyComplianceCall { }

    function isPlugAndPlay() external pure override returns (bool) {
        return true;
    }

    function name() external pure override returns (string memory) {
        return "KycRequiredModule";
    }
}
