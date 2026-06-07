// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.24;

import { AbstractModule } from "../AbstractModule.sol";

/// @title LockUp24Module
/// @notice Module de conformité : inaliénabilité (lock-up) jusqu'à l'événement
///         de liquidité. Traduit on-chain la clause d'inaliénabilité du contrat
///         d'émission obligataire (étude P6 badge "Lock-up 24 mois", P7 §SMART
///         CONTRACT "lock-up 24 m").
///
///         Mécanique :
///           - Chaque compliance (= chaque SPV/token) a sa propre date de fin de
///             lock-up `releaseTimestamp` (configurée par l'émetteur).
///           - Tant que block.timestamp < releaseTimestamp : transferts entre
///             investisseurs INTERDITS.
///           - Le MINT (primaire, souscription) et le BURN (remboursement à
///             l'exit) ne sont PAS du transfert -> non bloqués (gérés par les
///             hooks mint/burn, vides ici).
///           - forcedTransfer du token BYPASSE la compliance (clawback judiciaire/
///             succession), ce qui est voulu : la justice/agent peut agir malgré
///             le lock-up.
contract LockUp24Module is AbstractModule {
    /// @notice Durée canonique du lock-up alignée sur la durée d'opération MdB
    ///         (étude P7 : "Durée cible 22 mois", badge 24 mois). Exposée comme
    ///         référence ; la date effective est fixée par compliance.
    uint256 public constant DEFAULT_LOCKUP_DURATION = 730 days; // 24 mois

    /// @dev compliance => timestamp de libération.
    mapping(address => uint256) public releaseTimestamp;

    event LockUpSet(address indexed compliance, uint256 releaseTimestamp);

    error ReleaseInPast();

    constructor(address initialOwner) AbstractModule(initialOwner) { }

    /// @notice Fixe la date de libération pour la compliance appelante.
    ///         Appelé via ModularCompliance.callModuleFunction (donc msg.sender =
    ///         la compliance), ou par le owner du module en setup.
    function setReleaseTimestamp(uint256 ts) external {
        // msg.sender DOIT être une compliance bindée (cas callModuleFunction) ;
        // on borne aussi à >= now pour éviter une config absurde.
        if (!_complianceBound[msg.sender]) revert OnlyBoundCompliance(msg.sender);
        if (ts < block.timestamp) revert ReleaseInPast();
        releaseTimestamp[msg.sender] = ts;
        emit LockUpSet(msg.sender, ts);
    }

    /// @notice Variante explicite pour cibler une compliance précise (owner only),
    ///         utile en script de déploiement.
    function setReleaseTimestampFor(address compliance, uint256 ts) external onlyOwner {
        if (!_complianceBound[compliance]) revert OnlyBoundCompliance(compliance);
        if (ts < block.timestamp) revert ReleaseInPast();
        releaseTimestamp[compliance] = ts;
        emit LockUpSet(compliance, ts);
    }

    /// @notice Vérification AVANT transfert (cf. IModule.moduleCheck).
    function moduleCheck(address from, address to, uint256, address compliance)
        external
        view
        override
        returns (bool)
    {
        // Mint (from == 0) et burn (to == 0) ne transitent pas par moduleCheck
        // côté token (ils passent par created/destroyed). Par sécurité, on
        // n'entrave jamais une opération impliquant l'adresse zéro ici.
        if (from == address(0) || to == address(0)) {
            return true;
        }
        uint256 release = releaseTimestamp[compliance];
        // Si aucun lock-up configuré -> pas de blocage par ce module.
        if (release == 0) {
            return true;
        }
        return block.timestamp >= release;
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
        return "LockUp24Module";
    }
}
