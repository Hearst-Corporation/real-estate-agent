// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.24;

/// @title IModularCompliance (ERC-3643)
/// @notice Orchestrateur de modules de conformité "métier" (au-delà du KYC pur
///         géré par l'IdentityRegistry). Le token délègue à ce contrat :
///           - `canTransfer(from,to,amount)` : validation AVANT transfert ;
///           - `transferred / created / destroyed` : hooks APRÈS pour que les
///             modules maintiennent leur état (compteurs d'investisseurs, lock-up…).
///         Modules branchés ici : lock-up 24 mois, restriction juridiction,
///         plafond d'investisseurs, KYC obligatoire (déjà via IR mais doublé).
interface IModularCompliance {
    event TokenBound(address token);
    event TokenUnbound(address token);
    event ModuleAdded(address indexed module);
    event ModuleRemoved(address indexed module);
    event ModuleInteraction(address indexed target, bytes4 selector);

    function bindToken(address token) external;
    function unbindToken(address token) external;

    function addModule(address module) external;
    function removeModule(address module) external;

    /// @notice Appelé par le module via le token pour exécuter une action
    ///         paramétrable (ex : configurer un plafond). `delegatecall`-free :
    ///         exécution `call` sur un module déjà whitelisté.
    function callModuleFunction(bytes calldata callData, address module) external;

    function transferred(address from, address to, uint256 amount) external;
    function created(address to, uint256 amount) external;
    function destroyed(address from, uint256 amount) external;

    function canTransfer(address from, address to, uint256 amount) external view returns (bool);

    function isModuleBound(address module) external view returns (bool);
    function getModules() external view returns (address[] memory);
    function getTokenBound() external view returns (address);
}

/// @title IModule (ERC-3643)
/// @notice Interface d'un module de conformité. Chaque règle (lock-up, pays,
///         plafond) implémente cette interface et est branchée sur la
///         ModularCompliance.
interface IModule {
    /// @notice Hook post-transfert : le module met à jour son état.
    function moduleTransferAction(address from, address to, uint256 value) external;
    /// @notice Hook post-mint.
    function moduleMintAction(address to, uint256 value) external;
    /// @notice Hook post-burn.
    function moduleBurnAction(address from, uint256 value) external;

    /// @notice Le transfert est-il permis par CE module ? (view, pas d'effet)
    function moduleCheck(address from, address to, uint256 value, address compliance)
        external
        view
        returns (bool);

    /// @notice Le module peut-il être branché sur cette compliance ?
    function canComplianceBind(address compliance) external view returns (bool);
    /// @notice Module mono-compliance (plug une seule fois) ?
    function isPlugAndPlay() external pure returns (bool);
    function name() external pure returns (string memory);
}

/// @title IModuleBindable
/// @notice Surface de binding appelée par la ModularCompliance lors de
///         addModule/removeModule pour que le module enregistre/oublie la
///         compliance (condition d'autorisation de ses hooks d'état).
interface IModuleBindable {
    function bindCompliance(address compliance) external;
    function unbindCompliance(address compliance) external;
}
