// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title Initializable (vendoré, pattern OZ-upgradeable)
/// @notice Remplace le constructeur pour les contrats déployés derrière un proxy.
///         Le security token et les registries ERC-3643 sont upgradeables (T-REX
///         déploie chaque composant en proxy). On utilise le storage slot ERC-7201
///         pour éviter toute collision.
abstract contract Initializable {
    /// @custom:storage-location erc7201:hearst.storage.Initializable
    struct InitializableStorage {
        uint64 _initialized;
        bool _initializing;
    }

    // ERC-7201: keccak256(abi.encode(uint256(keccak256("hearst.storage.Initializable")) - 1))
    //   & ~bytes32(uint256(0xff))
    bytes32 private constant INITIALIZABLE_STORAGE =
        0x6dad7d9d3c86348283975a78028a2d6e20895fe406deb7710a4e87496b175500;

    error InvalidInitialization();
    error NotInitializing();

    event Initialized(uint64 version);

    modifier initializer() {
        InitializableStorage storage $ = _getInitializableStorage();
        bool isTopLevelCall = !$._initializing;
        uint64 initialized = $._initialized;
        bool construction = initialized == 0 && address(this).code.length == 0;
        if (!construction && (isTopLevelCall ? initialized >= 1 : initialized != 1)) {
            revert InvalidInitialization();
        }
        $._initialized = 1;
        if (isTopLevelCall) {
            $._initializing = true;
        }
        _;
        if (isTopLevelCall) {
            $._initializing = false;
            emit Initialized(1);
        }
    }

    modifier reinitializer(uint64 version) {
        InitializableStorage storage $ = _getInitializableStorage();
        if ($._initializing || $._initialized >= version) revert InvalidInitialization();
        $._initialized = version;
        $._initializing = true;
        _;
        $._initializing = false;
        emit Initialized(version);
    }

    modifier onlyInitializing() {
        _checkInitializing();
        _;
    }

    function _checkInitializing() internal view virtual {
        if (!_isInitializing()) revert NotInitializing();
    }

    function _disableInitializers() internal virtual {
        InitializableStorage storage $ = _getInitializableStorage();
        if ($._initializing) revert InvalidInitialization();
        if ($._initialized != type(uint64).max) {
            $._initialized = type(uint64).max;
            emit Initialized(type(uint64).max);
        }
    }

    function _getInitializedVersion() internal view returns (uint64) {
        return _getInitializableStorage()._initialized;
    }

    function _isInitializing() internal view returns (bool) {
        return _getInitializableStorage()._initializing;
    }

    function _getInitializableStorage() private pure returns (InitializableStorage storage $) {
        assembly {
            $.slot := INITIALIZABLE_STORAGE
        }
    }
}
