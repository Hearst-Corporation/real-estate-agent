// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Context } from "./Context.sol";
import { Initializable } from "./Initializable.sol";

/// @title PausableUpgradeable (vendoré, ERC-7201 storage)
abstract contract PausableUpgradeable is Initializable, Context {
    /// @custom:storage-location erc7201:hearst.storage.Pausable
    struct PausableStorage {
        bool _paused;
    }

    // ERC-7201: keccak256(abi.encode(uint256(keccak256("hearst.storage.Pausable")) - 1)) & ~0xff
    bytes32 private constant PAUSABLE_STORAGE =
        0xdc7b18e1c6eb21f580262d676a298a91eebc8df6789f8a16ef4b28e36aee0d00;

    event Paused(address account);
    event Unpaused(address account);

    error EnforcedPause();
    error ExpectedPause();

    function _getPausableStorage() private pure returns (PausableStorage storage $) {
        assembly {
            $.slot := PAUSABLE_STORAGE
        }
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
        return _getPausableStorage()._paused;
    }

    function _requireNotPaused() internal view virtual {
        if (paused()) revert EnforcedPause();
    }

    function _requirePaused() internal view virtual {
        if (!paused()) revert ExpectedPause();
    }

    function _pause() internal virtual whenNotPaused {
        _getPausableStorage()._paused = true;
        emit Paused(_msgSender());
    }

    function _unpause() internal virtual whenPaused {
        _getPausableStorage()._paused = false;
        emit Unpaused(_msgSender());
    }
}
