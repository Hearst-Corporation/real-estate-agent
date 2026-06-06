// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title ERC1967Proxy (vendoré, minimal)
/// @notice Proxy ERC-1967 minimal pour rendre les composants ERC-3643 upgradeables
///         (modèle T-REX : chaque registry + le token sont déployés en proxy).
///         L'implémentation logique est gérée via UUPS (cf. UUPSUpgradeable) :
///         la fonction `upgradeToAndCall` vit dans l'implémentation, gardée par
///         `onlyOwner`. L'admin du proxy = l'owner du token (board légal).
contract ERC1967Proxy {
    // bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1)
    bytes32 private constant _IMPLEMENTATION_SLOT =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    event Upgraded(address indexed implementation);

    error ERC1967InvalidImplementation(address implementation);
    error ERC1967NonPayable();

    constructor(address implementation, bytes memory data) payable {
        _setImplementation(implementation);
        if (data.length > 0) {
            (bool ok, bytes memory ret) = implementation.delegatecall(data);
            if (!ok) {
                _revert(ret);
            }
        } else if (msg.value > 0) {
            revert ERC1967NonPayable();
        }
        emit Upgraded(implementation);
    }

    function _setImplementation(address newImplementation) private {
        if (newImplementation.code.length == 0) {
            revert ERC1967InvalidImplementation(newImplementation);
        }
        assembly {
            sstore(_IMPLEMENTATION_SLOT, newImplementation)
        }
    }

    function _implementation() internal view returns (address impl) {
        assembly {
            impl := sload(_IMPLEMENTATION_SLOT)
        }
    }

    fallback() external payable {
        address impl = _implementation();
        assembly {
            calldatacopy(0, 0, calldatasize())
            let result := delegatecall(gas(), impl, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch result
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }

    function _revert(bytes memory returndata) private pure {
        if (returndata.length > 0) {
            assembly {
                revert(add(32, returndata), mload(returndata))
            }
        } else {
            revert ERC1967InvalidImplementation(address(0));
        }
    }
}
