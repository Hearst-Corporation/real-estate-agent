// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.24;

import { IClaimTopicsRegistry } from "../interfaces/IClaimTopicsRegistry.sol";
import { OwnableUpgradeable } from "../vendor/RolesUpgradeable.sol";
import { UUPSUpgradeable } from "../vendor/UUPSUpgradeable.sol";

/// @title ClaimTopicsRegistry
/// @notice Implémentation ERC-3643 du registre des topics de claim requis.
///         Topics conventionnels pour CE produit (cf. Topics.sol) :
///           1  = KYC/AML validé (LCB-FT)              -> OBLIGATOIRE
///           10 = Investisseur éligible (averti/test ECSP)
///           11 = Pays de résidence attesté (pour le module juridiction)
///         Borne dure : 15 topics max, pour garder `isVerified` à coût borné.
contract ClaimTopicsRegistry is IClaimTopicsRegistry, OwnableUpgradeable, UUPSUpgradeable {
    /// @custom:storage-location erc7201:hearst.storage.ClaimTopicsRegistry
    struct CTRStorage {
        uint256[] claimTopics;
    }

    // ERC-7201: hearst.storage.ClaimTopicsRegistry
    bytes32 private constant CTR_STORAGE =
        0x013a4075d093a136f87920b548af656427094906ab3c7c6ef9582c366a4c0a00;

    uint256 public constant MAX_CLAIM_TOPICS = 15;

    error ClaimTopicAlreadyExists(uint256 claimTopic);
    error ClaimTopicNotFound(uint256 claimTopic);
    error MaxClaimTopicsReached();

    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner) external initializer {
        __Ownable_init(initialOwner);
    }

    function _getCTRStorage() private pure returns (CTRStorage storage $) {
        assembly {
            $.slot := CTR_STORAGE
        }
    }

    function addClaimTopic(uint256 claimTopic) external override onlyOwner {
        CTRStorage storage $ = _getCTRStorage();
        uint256 len = $.claimTopics.length;
        if (len >= MAX_CLAIM_TOPICS) revert MaxClaimTopicsReached();
        for (uint256 i = 0; i < len; i++) {
            if ($.claimTopics[i] == claimTopic) revert ClaimTopicAlreadyExists(claimTopic);
        }
        $.claimTopics.push(claimTopic);
        emit ClaimTopicAdded(claimTopic);
    }

    function removeClaimTopic(uint256 claimTopic) external override onlyOwner {
        CTRStorage storage $ = _getCTRStorage();
        uint256 len = $.claimTopics.length;
        for (uint256 i = 0; i < len; i++) {
            if ($.claimTopics[i] == claimTopic) {
                $.claimTopics[i] = $.claimTopics[len - 1];
                $.claimTopics.pop();
                emit ClaimTopicRemoved(claimTopic);
                return;
            }
        }
        revert ClaimTopicNotFound(claimTopic);
    }

    function getClaimTopics() external view override returns (uint256[] memory) {
        return _getCTRStorage().claimTopics;
    }

    function _authorizeUpgrade(address) internal override onlyOwner { }
}
