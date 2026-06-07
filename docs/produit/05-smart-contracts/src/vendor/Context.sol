// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title Context
/// @notice Variante minimale type-OpenZeppelin. Vendorée pour éviter toute
///         dépendance réseau (cf. README §"Pourquoi pas de remappings").
abstract contract Context {
    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }

    function _msgData() internal view virtual returns (bytes calldata) {
        return msg.data;
    }
}
