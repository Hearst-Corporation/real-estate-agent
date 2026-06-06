// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.24;

import { IModularCompliance, IModule, IModuleBindable } from "../interfaces/IModularCompliance.sol";
import { OwnableUpgradeable } from "../vendor/RolesUpgradeable.sol";
import { UUPSUpgradeable } from "../vendor/UUPSUpgradeable.sol";

/// @title ModularCompliance
/// @notice Orchestrateur ERC-3643 des modules de conformité métier. Le token
///         appelle `canTransfer` (vue, AVANT) puis `transferred/created/destroyed`
///         (effets, APRÈS) pour que chaque module maintienne son état.
///
///         Modules de CE produit (cf. README) :
///           - CountryRestrictModule  : juridictions exclues (US sans Reg S, etc.)
///           - MaxInvestorsModule     : plafond d'investisseurs (< 150 par État
///                                      en placement privé ; borne anti offre au
///                                      public, étude P13)
///           - LockUp24Module         : inaliénabilité jusqu'à l'exit (24 mois)
///           - KycRequiredModule      : double sécurité KYC (en plus de l'IR)
contract ModularCompliance is IModularCompliance, OwnableUpgradeable, UUPSUpgradeable {
    /// @custom:storage-location erc7201:hearst.storage.ModularCompliance
    struct MCStorage {
        address tokenBound;
        address[] modules;
        mapping(address => bool) moduleBound;
    }

    // ERC-7201: hearst.storage.ModularCompliance
    bytes32 private constant MC_STORAGE =
        0xbc5c36f7e8a0946007f472721028c20c74cd1adb21ca92a120af82836cb95c00;

    uint256 public constant MAX_MODULES = 25;

    error OnlyTokenBound();
    error TokenAlreadyBound();
    error TokenNotBound();
    error ZeroAddress();
    error ModuleAlreadyBound(address module);
    error ModuleNotBound(address module);
    error MaxModulesReached();
    error ModuleCannotBind(address module);
    error ModuleCallFailed();

    modifier onlyToken() {
        if (_msgSender() != _s().tokenBound) revert OnlyTokenBound();
        _;
    }

    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner) external initializer {
        __Ownable_init(initialOwner);
    }

    function _s() private pure returns (MCStorage storage $) {
        assembly {
            $.slot := MC_STORAGE
        }
    }

    // --- Binding token (owner) ---
    function bindToken(address token) external override onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        MCStorage storage $ = _s();
        if ($.tokenBound != address(0)) revert TokenAlreadyBound();
        $.tokenBound = token;
        emit TokenBound(token);
    }

    function unbindToken(address token) external override onlyOwner {
        MCStorage storage $ = _s();
        if ($.tokenBound != token || token == address(0)) revert TokenNotBound();
        $.tokenBound = address(0);
        emit TokenUnbound(token);
    }

    // --- Gestion des modules (owner) ---
    function addModule(address module) external override onlyOwner {
        if (module == address(0)) revert ZeroAddress();
        MCStorage storage $ = _s();
        if ($.moduleBound[module]) revert ModuleAlreadyBound(module);
        if ($.modules.length >= MAX_MODULES) revert MaxModulesReached();
        if (!IModule(module).canComplianceBind(address(this))) revert ModuleCannotBind(module);
        $.moduleBound[module] = true;
        $.modules.push(module);
        // Le module enregistre cette compliance pour autoriser ses hooks d'état.
        IModuleBindable(module).bindCompliance(address(this));
        emit ModuleAdded(module);
    }

    function removeModule(address module) external override onlyOwner {
        MCStorage storage $ = _s();
        if (!$.moduleBound[module]) revert ModuleNotBound(module);
        $.moduleBound[module] = false;
        uint256 len = $.modules.length;
        for (uint256 i = 0; i < len; i++) {
            if ($.modules[i] == module) {
                $.modules[i] = $.modules[len - 1];
                $.modules.pop();
                break;
            }
        }
        IModuleBindable(module).unbindCompliance(address(this));
        emit ModuleRemoved(module);
    }

    /// @notice Configure un module (ex : fixer le plafond d'investisseurs). Seul
    ///         le owner peut appeler, et seulement sur un module déjà branché.
    function callModuleFunction(bytes calldata callData, address module)
        external
        override
        onlyOwner
    {
        if (!_s().moduleBound[module]) revert ModuleNotBound(module);
        (bool ok,) = module.call(callData);
        if (!ok) revert ModuleCallFailed();
        emit ModuleInteraction(module, _selector(callData));
    }

    function _selector(bytes calldata data) private pure returns (bytes4 sel) {
        if (data.length >= 4) {
            sel = bytes4(data[:4]);
        }
    }

    // --- Hooks d'état (token only) ---
    function transferred(address from, address to, uint256 amount) external override onlyToken {
        address[] memory mods = _s().modules;
        for (uint256 i = 0; i < mods.length; i++) {
            IModule(mods[i]).moduleTransferAction(from, to, amount);
        }
    }

    function created(address to, uint256 amount) external override onlyToken {
        address[] memory mods = _s().modules;
        for (uint256 i = 0; i < mods.length; i++) {
            IModule(mods[i]).moduleMintAction(to, amount);
        }
    }

    function destroyed(address from, uint256 amount) external override onlyToken {
        address[] memory mods = _s().modules;
        for (uint256 i = 0; i < mods.length; i++) {
            IModule(mods[i]).moduleBurnAction(from, amount);
        }
    }

    // --- Validation AVANT transfert (vue) ---
    function canTransfer(address from, address to, uint256 amount)
        external
        view
        override
        returns (bool)
    {
        address[] memory mods = _s().modules;
        for (uint256 i = 0; i < mods.length; i++) {
            if (!IModule(mods[i]).moduleCheck(from, to, amount, address(this))) {
                return false; // un seul module qui refuse bloque le transfert
            }
        }
        return true;
    }

    // --- Views ---
    function isModuleBound(address module) external view override returns (bool) {
        return _s().moduleBound[module];
    }

    function getModules() external view override returns (address[] memory) {
        return _s().modules;
    }

    function getTokenBound() external view override returns (address) {
        return _s().tokenBound;
    }

    function _authorizeUpgrade(address) internal override onlyOwner { }
}
