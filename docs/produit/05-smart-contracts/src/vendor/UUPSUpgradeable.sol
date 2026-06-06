// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title UUPSUpgradeable (vendoré, minimal)
/// @notice Logique d'upgrade UUPS : la fonction d'upgrade vit dans l'implémentation
///         (et non dans le proxy), gardée par `_authorizeUpgrade`. Le security token
///         et les registries héritent de ce mixin et restreignent l'upgrade au owner.
///
/// @dev Sécurité : `_authorizeUpgrade` DOIT être overridé avec un contrôle d'accès
///      (onlyOwner). On vérifie aussi un slot "rollback" pour empêcher de pointer
///      vers une implémentation incompatible UUPS (brique du proxy).
abstract contract UUPSUpgradeable {
    // bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1)
    bytes32 private constant _IMPLEMENTATION_SLOT =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    address private immutable __self = address(this);

    event Upgraded(address indexed implementation);

    error UUPSUnauthorizedCallContext();
    error UUPSInvalidImplementation(address implementation);

    /// @dev Garantit l'appel via delegatecall (donc via le proxy), pas en direct
    ///      sur l'implémentation.
    modifier onlyProxy() {
        if (address(this) == __self) revert UUPSUnauthorizedCallContext();
        _;
    }

    function proxiableUUID() external view virtual returns (bytes32) {
        return _IMPLEMENTATION_SLOT;
    }

    function upgradeToAndCall(address newImplementation, bytes calldata data)
        external
        payable
        virtual
        onlyProxy
    {
        _authorizeUpgrade(newImplementation);
        _upgradeToAndCallUUPS(newImplementation, data);
    }

    function _upgradeToAndCallUUPS(address newImplementation, bytes calldata data) private {
        if (newImplementation.code.length == 0) {
            revert UUPSInvalidImplementation(newImplementation);
        }
        // Vérifie que la nouvelle implémentation est bien UUPS-compatible.
        try UUPSUpgradeable(newImplementation).proxiableUUID() returns (bytes32 slot) {
            if (slot != _IMPLEMENTATION_SLOT) revert UUPSInvalidImplementation(newImplementation);
        } catch {
            revert UUPSInvalidImplementation(newImplementation);
        }
        assembly {
            sstore(_IMPLEMENTATION_SLOT, newImplementation)
        }
        emit Upgraded(newImplementation);
        if (data.length > 0) {
            (bool ok, bytes memory ret) = newImplementation.delegatecall(data);
            if (!ok) {
                assembly {
                    revert(add(32, ret), mload(ret))
                }
            }
        }
    }

    /// @dev À OVERRIDER avec un contrôle d'accès (ex. onlyOwner).
    function _authorizeUpgrade(address newImplementation) internal virtual;
}
