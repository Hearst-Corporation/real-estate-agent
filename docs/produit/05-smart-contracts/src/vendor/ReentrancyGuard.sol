// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title ReentrancyGuard (vendoré)
/// @notice Protège les fonctions de distribution (pull de coupon/principal en
///         EURC) contre la réentrance. Indispensable car on transfère un ERC-20
///         externe (EURC) vers des wallets investisseurs.
abstract contract ReentrancyGuard {
    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;

    uint256 private _status;

    error ReentrancyGuardReentrantCall();

    constructor() {
        _status = NOT_ENTERED;
    }

    modifier nonReentrant() {
        if (_status == ENTERED) revert ReentrancyGuardReentrantCall();
        _status = ENTERED;
        _;
        _status = NOT_ENTERED;
    }
}
