// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.24;

import { ITrustedIssuersRegistry } from "../interfaces/ITrustedIssuersRegistry.sol";
import { IClaimIssuer } from "../identity/IIdentity.sol";
import { OwnableUpgradeable } from "../vendor/RolesUpgradeable.sol";
import { UUPSUpgradeable } from "../vendor/UUPSUpgradeable.sol";

/// @title TrustedIssuersRegistry
/// @notice Implémentation ERC-3643. Liste blanche des émetteurs de claims
///         (prestataires KYC : Sumsub/Onfido via un relay signataire, agent
///         Tokeny). Chaque issuer est habilité pour un set de topics borné.
contract TrustedIssuersRegistry is ITrustedIssuersRegistry, OwnableUpgradeable, UUPSUpgradeable {
    /// @custom:storage-location erc7201:hearst.storage.TrustedIssuersRegistry
    struct TIRStorage {
        IClaimIssuer[] trustedIssuers;
        mapping(address => uint256[]) issuerClaimTopics; // issuer -> topics habilités
        mapping(address => bool) isTrusted;
        mapping(uint256 => IClaimIssuer[]) issuersByTopic; // topic -> issuers
    }

    // ERC-7201: hearst.storage.TrustedIssuersRegistry
    bytes32 private constant TIR_STORAGE =
        0xa2fa500950d182bf3eb264c3e8278d21d6434f29c8345ee0259b2bf7b279eb00;

    uint256 public constant MAX_TOPICS_PER_ISSUER = 15;
    uint256 public constant MAX_ISSUERS = 50;

    error IssuerZeroAddress();
    error NoClaimTopicsProvided();
    error TooManyClaimTopics();
    error IssuerAlreadyExists(address issuer);
    error IssuerDoesNotExist(address issuer);
    error MaxIssuersReached();

    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner) external initializer {
        __Ownable_init(initialOwner);
    }

    function _s() private pure returns (TIRStorage storage $) {
        assembly {
            $.slot := TIR_STORAGE
        }
    }

    function addTrustedIssuer(IClaimIssuer trustedIssuer, uint256[] calldata claimTopics)
        external
        override
        onlyOwner
    {
        if (address(trustedIssuer) == address(0)) revert IssuerZeroAddress();
        if (claimTopics.length == 0) revert NoClaimTopicsProvided();
        if (claimTopics.length > MAX_TOPICS_PER_ISSUER) revert TooManyClaimTopics();
        TIRStorage storage $ = _s();
        if ($.isTrusted[address(trustedIssuer)]) {
            revert IssuerAlreadyExists(address(trustedIssuer));
        }
        if ($.trustedIssuers.length >= MAX_ISSUERS) revert MaxIssuersReached();

        $.trustedIssuers.push(trustedIssuer);
        $.isTrusted[address(trustedIssuer)] = true;
        $.issuerClaimTopics[address(trustedIssuer)] = claimTopics;
        for (uint256 i = 0; i < claimTopics.length; i++) {
            $.issuersByTopic[claimTopics[i]].push(trustedIssuer);
        }
        emit TrustedIssuerAdded(trustedIssuer, claimTopics);
    }

    function removeTrustedIssuer(IClaimIssuer trustedIssuer) external override onlyOwner {
        TIRStorage storage $ = _s();
        address issuerAddr = address(trustedIssuer);
        if (!$.isTrusted[issuerAddr]) revert IssuerDoesNotExist(issuerAddr);

        // Retire des index par topic
        uint256[] memory topics = $.issuerClaimTopics[issuerAddr];
        for (uint256 t = 0; t < topics.length; t++) {
            _removeIssuerFromTopic(topics[t], trustedIssuer);
        }
        delete $.issuerClaimTopics[issuerAddr];
        $.isTrusted[issuerAddr] = false;

        // Retire de la liste globale (swap & pop)
        uint256 len = $.trustedIssuers.length;
        for (uint256 i = 0; i < len; i++) {
            if (address($.trustedIssuers[i]) == issuerAddr) {
                $.trustedIssuers[i] = $.trustedIssuers[len - 1];
                $.trustedIssuers.pop();
                break;
            }
        }
        emit TrustedIssuerRemoved(trustedIssuer);
    }

    function updateIssuerClaimTopics(IClaimIssuer trustedIssuer, uint256[] calldata claimTopics)
        external
        override
        onlyOwner
    {
        TIRStorage storage $ = _s();
        address issuerAddr = address(trustedIssuer);
        if (!$.isTrusted[issuerAddr]) revert IssuerDoesNotExist(issuerAddr);
        if (claimTopics.length == 0) revert NoClaimTopicsProvided();
        if (claimTopics.length > MAX_TOPICS_PER_ISSUER) revert TooManyClaimTopics();

        // Purge anciens index
        uint256[] memory oldTopics = $.issuerClaimTopics[issuerAddr];
        for (uint256 t = 0; t < oldTopics.length; t++) {
            _removeIssuerFromTopic(oldTopics[t], trustedIssuer);
        }
        // Réindexe
        $.issuerClaimTopics[issuerAddr] = claimTopics;
        for (uint256 i = 0; i < claimTopics.length; i++) {
            $.issuersByTopic[claimTopics[i]].push(trustedIssuer);
        }
        emit ClaimTopicsUpdated(trustedIssuer, claimTopics);
    }

    function _removeIssuerFromTopic(uint256 topic, IClaimIssuer issuer) private {
        IClaimIssuer[] storage arr = _s().issuersByTopic[topic];
        uint256 len = arr.length;
        for (uint256 i = 0; i < len; i++) {
            if (address(arr[i]) == address(issuer)) {
                arr[i] = arr[len - 1];
                arr.pop();
                return;
            }
        }
    }

    // --- Views ---
    function getTrustedIssuers() external view override returns (IClaimIssuer[] memory) {
        return _s().trustedIssuers;
    }

    function getTrustedIssuersForClaimTopic(uint256 claimTopic)
        external
        view
        override
        returns (IClaimIssuer[] memory)
    {
        return _s().issuersByTopic[claimTopic];
    }

    function isTrustedIssuer(address issuer) external view override returns (bool) {
        return _s().isTrusted[issuer];
    }

    function hasClaimTopic(address issuer, uint256 claimTopic)
        external
        view
        override
        returns (bool)
    {
        uint256[] memory topics = _s().issuerClaimTopics[issuer];
        for (uint256 i = 0; i < topics.length; i++) {
            if (topics[i] == claimTopic) return true;
        }
        return false;
    }

    function getTrustedIssuerClaimTopics(IClaimIssuer trustedIssuer)
        external
        view
        override
        returns (uint256[] memory)
    {
        TIRStorage storage $ = _s();
        if (!$.isTrusted[address(trustedIssuer)]) {
            revert IssuerDoesNotExist(address(trustedIssuer));
        }
        return $.issuerClaimTopics[address(trustedIssuer)];
    }

    function _authorizeUpgrade(address) internal override onlyOwner { }
}
