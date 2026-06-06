// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.24;

import { IClaimIssuer } from "../identity/IIdentity.sol";

/// @title ITrustedIssuersRegistry (ERC-3643)
/// @notice Liste blanche des émetteurs de claims de confiance (prestataires KYC,
///         agent de tokenisation). Chaque issuer est habilité pour un sous-ensemble
///         de topics. Un claim n'est valable que s'il émane d'un issuer de
///         confiance habilité pour CE topic.
interface ITrustedIssuersRegistry {
    event TrustedIssuerAdded(IClaimIssuer indexed trustedIssuer, uint256[] claimTopics);
    event TrustedIssuerRemoved(IClaimIssuer indexed trustedIssuer);
    event ClaimTopicsUpdated(IClaimIssuer indexed trustedIssuer, uint256[] claimTopics);

    function addTrustedIssuer(IClaimIssuer trustedIssuer, uint256[] calldata claimTopics) external;
    function removeTrustedIssuer(IClaimIssuer trustedIssuer) external;
    function updateIssuerClaimTopics(IClaimIssuer trustedIssuer, uint256[] calldata claimTopics)
        external;

    function getTrustedIssuers() external view returns (IClaimIssuer[] memory);
    function getTrustedIssuersForClaimTopic(uint256 claimTopic)
        external
        view
        returns (IClaimIssuer[] memory);
    function isTrustedIssuer(address issuer) external view returns (bool);
    function hasClaimTopic(address issuer, uint256 claimTopic) external view returns (bool);
    function getTrustedIssuerClaimTopics(IClaimIssuer trustedIssuer)
        external
        view
        returns (uint256[] memory);
}
