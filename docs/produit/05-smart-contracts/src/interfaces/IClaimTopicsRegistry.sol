// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.24;

/// @title IClaimTopicsRegistry (ERC-3643)
/// @notice Registre des "topics" de claim EXIGÉS pour détenir le token.
///         Ex : KYC (topic 1), accréditation investisseur (10), pays de
///         résidence (11). Une identité doit porter un claim valide pour CHAQUE
///         topic requis, signé par un trusted issuer, pour être `isVerified`.
interface IClaimTopicsRegistry {
    event ClaimTopicAdded(uint256 indexed claimTopic);
    event ClaimTopicRemoved(uint256 indexed claimTopic);

    function addClaimTopic(uint256 claimTopic) external;
    function removeClaimTopic(uint256 claimTopic) external;
    function getClaimTopics() external view returns (uint256[] memory);
}
