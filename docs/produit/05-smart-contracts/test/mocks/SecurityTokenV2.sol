// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.24;

import { SecurityToken } from "../../src/token/SecurityToken.sol";

/// @title SecurityTokenV2
/// @notice Implémentation V2 de test : ajoute une fonction `tokenStandard()` pour
///         prouver qu'un upgrade UUPS conserve le storage (soldes, registres,
///         ISIN DEEP) tout en ajoutant du comportement. Aucune nouvelle variable
///         d'état (on resterait sinon contraint par le layout ERC-7201, déjà
///         compatible). Sert uniquement à valider le mécanisme d'upgrade.
contract SecurityTokenV2 is SecurityToken {
    function tokenStandard() external pure returns (string memory) {
        return "ERC-3643-v2";
    }
}
