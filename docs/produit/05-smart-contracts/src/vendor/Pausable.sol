// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Context } from "./Context.sol";

/// @title Pausable (vendoré)
/// @notice Circuit-breaker. En contexte security-token, la pause est un outil de
///         conformité : gel global des transferts sur instruction de l'émetteur,
///         de l'AMF, ou en cas d'incident. Le DEEP (registre légal) reste la
///         source de vérité ; la pause on-chain ne suspend PAS les droits légaux
///         du créancier obligataire, elle suspend seulement leur miroir on-chain.
abstract contract Pausable is Context {
    bool private _paused;

    event Paused(address account);
    event Unpaused(address account);

    error EnforcedPause();
    error ExpectedPause();

    constructor() {
        _paused = false;
    }

    modifier whenNotPaused() {
        _requireNotPaused();
        _;
    }

    modifier whenPaused() {
        _requirePaused();
        _;
    }

    function paused() public view virtual returns (bool) {
        return _paused;
    }

    function _requireNotPaused() internal view virtual {
        if (paused()) revert EnforcedPause();
    }

    function _requirePaused() internal view virtual {
        if (!paused()) revert ExpectedPause();
    }

    function _pause() internal virtual whenNotPaused {
        _paused = true;
        emit Paused(_msgSender());
    }

    function _unpause() internal virtual whenPaused {
        _paused = false;
        emit Unpaused(_msgSender());
    }
}
