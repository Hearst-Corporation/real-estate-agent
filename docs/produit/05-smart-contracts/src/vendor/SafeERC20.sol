// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { IERC20 } from "./IERC20.sol";

/// @title SafeERC20 (vendoré)
/// @notice Wrappers de transferts tolérants aux ERC-20 non conformes (qui ne
///         renvoient pas de bool). EURC (Circle) renvoie bien un bool, mais on
///         reste défensif pour autoriser d'autres settlement tokens régulés.
library SafeERC20 {
    error SafeERC20FailedOperation(address token);

    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        _callOptionalReturn(token, abi.encodeWithSelector(token.transfer.selector, to, value));
    }

    function safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        _callOptionalReturn(
            token, abi.encodeWithSelector(token.transferFrom.selector, from, to, value)
        );
    }

    function _callOptionalReturn(IERC20 token, bytes memory data) private {
        (bool success, bytes memory returndata) = address(token).call(data);
        if (!success) revert SafeERC20FailedOperation(address(token));
        // Un retour vide est toléré (token non conforme) ; un retour non vide
        // doit décoder à `true`.
        if (returndata.length != 0 && !abi.decode(returndata, (bool))) {
            revert SafeERC20FailedOperation(address(token));
        }
    }
}
