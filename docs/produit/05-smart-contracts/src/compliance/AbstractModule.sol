// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.24;

import { IModule } from "../interfaces/IModularCompliance.sol";
import { Ownable2Step } from "../vendor/Roles.sol";

/// @title AbstractModule
/// @notice Base ERC-3643 pour les modules de conformité. Les modules ne sont pas
///         derrière un proxy (déployés une fois, branchables sur N compliances) :
///         ils utilisent un Ownable2Step classique. L'owner du module = équipe
///         conformité (peut paramétrer les règles globales du module).
///
///         Garde-fou clé : les hooks d'état (`module*Action`) ne peuvent être
///         appelés QUE par une compliance ayant branché ce module.
abstract contract AbstractModule is IModule, Ownable2Step {
    mapping(address => bool) internal _complianceBound;

    error OnlyBoundCompliance(address compliance);
    error ComplianceAlreadyBound(address compliance);
    error ComplianceNotBound(address compliance);
    error ZeroAddress();

    event ComplianceBound(address indexed compliance);
    event ComplianceUnbound(address indexed compliance);

    constructor(address initialOwner) Ownable2Step(initialOwner) { }

    modifier onlyBoundCompliance(address compliance) {
        if (!_complianceBound[compliance]) revert OnlyBoundCompliance(compliance);
        _;
    }

    /// @dev Restreint l'appelant : seule la compliance elle-même (msg.sender)
    ///      peut déclencher ses propres hooks d'état.
    modifier onlyComplianceCall() {
        if (!_complianceBound[msg.sender]) revert OnlyBoundCompliance(msg.sender);
        _;
    }

    /// @notice Appelé par la ModularCompliance lors de addModule (canComplianceBind
    ///         renvoie true), puis la compliance "s'auto-déclare" via bindCompliance.
    ///         Ici on autorise la compliance à s'enregistrer elle-même.
    function bindCompliance(address compliance) external {
        if (compliance == address(0)) revert ZeroAddress();
        // Seule la compliance peut se binder elle-même (msg.sender == compliance),
        // OU le owner du module (setup).
        if (msg.sender != compliance && msg.sender != owner()) {
            revert OnlyBoundCompliance(compliance);
        }
        if (_complianceBound[compliance]) revert ComplianceAlreadyBound(compliance);
        _complianceBound[compliance] = true;
        emit ComplianceBound(compliance);
    }

    function unbindCompliance(address compliance) external {
        if (msg.sender != compliance && msg.sender != owner()) {
            revert OnlyBoundCompliance(compliance);
        }
        if (!_complianceBound[compliance]) revert ComplianceNotBound(compliance);
        _complianceBound[compliance] = false;
        emit ComplianceUnbound(compliance);
    }

    function isComplianceBound(address compliance) external view returns (bool) {
        return _complianceBound[compliance];
    }

    /// @inheritdoc IModule
    /// @dev Par défaut un module est bindable s'il n'est pas déjà branché sur
    ///      cette compliance. Override possible.
    function canComplianceBind(address compliance) external view virtual override returns (bool) {
        return !_complianceBound[compliance];
    }
}
