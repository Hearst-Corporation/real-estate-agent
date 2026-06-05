// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.24;

/// @title IERC734 — Key Holder (sous-ensemble ONCHAINID)
/// @notice Une identité ONCHAINID gère des clés (MANAGEMENT=1, ACTION=2, CLAIM=3).
///         On expose le strict nécessaire pour la vérification de claims.
interface IERC734 {
    event KeyAdded(bytes32 indexed key, uint256 indexed purpose, uint256 indexed keyType);
    event KeyRemoved(bytes32 indexed key, uint256 indexed purpose, uint256 indexed keyType);

    function getKey(bytes32 key)
        external
        view
        returns (uint256[] memory purposes, uint256 keyType, bytes32 keyAddr);

    function keyHasPurpose(bytes32 key, uint256 purpose) external view returns (bool exists);

    function getKeysByPurpose(uint256 purpose) external view returns (bytes32[] memory keys);

    function addKey(bytes32 key, uint256 purpose, uint256 keyType) external returns (bool success);

    function removeKey(bytes32 key, uint256 purpose) external returns (bool success);
}

/// @title IERC735 — Claim Holder (sous-ensemble ONCHAINID)
/// @notice Stocke les claims (KYC, accréditation, juridiction) signés par un
///         trusted issuer. Le security token interroge ces claims via
///         IdentityRegistry.isVerified().
interface IERC735 {
    event ClaimAdded(
        bytes32 indexed claimId,
        uint256 indexed topic,
        uint256 scheme,
        address indexed issuer,
        bytes signature,
        bytes data,
        string uri
    );
    event ClaimRemoved(
        bytes32 indexed claimId,
        uint256 indexed topic,
        uint256 scheme,
        address indexed issuer,
        bytes signature,
        bytes data,
        string uri
    );

    function getClaim(bytes32 claimId)
        external
        view
        returns (
            uint256 topic,
            uint256 scheme,
            address issuer,
            bytes memory signature,
            bytes memory data,
            string memory uri
        );

    function getClaimIdsByTopic(uint256 topic) external view returns (bytes32[] memory claimIds);

    function addClaim(
        uint256 topic,
        uint256 scheme,
        address issuer,
        bytes calldata signature,
        bytes calldata data,
        string calldata uri
    ) external returns (bytes32 claimRequestId);

    function removeClaim(bytes32 claimId) external returns (bool success);
}

/// @title IIdentity — ONCHAINID complète
/// @notice Agrège ERC-734 + ERC-735 + la vérification de signature de claim.
///         Référence : standard ONCHAINID (Tokeny). L'identité est *soulbound*
///         (liée à l'investisseur, non transférable), réutilisable entre deals.
interface IIdentity is IERC734, IERC735 {
    /// @notice Vérifie qu'une signature de claim est valide AU SENS DE CETTE
    ///         identité (la clé CLAIM ayant signé est autorisée). Utilisé par
    ///         IClaimIssuer.isClaimValid.
    function isClaimValid(
        IIdentity identity,
        uint256 claimTopic,
        bytes calldata sig,
        bytes calldata data
    ) external view returns (bool);
}

/// @title IClaimIssuer — émetteur de claims (prestataire KYC)
/// @notice Un trusted issuer (Sumsub/Onfido relay, ou l'agent de tokenisation)
///         signe les claims KYC. Il peut aussi révoquer un claim (KYC périmé,
///         sanction). Le token vérifie la non-révocation avant chaque transfert.
interface IClaimIssuer is IIdentity {
    event ClaimRevoked(bytes indexed signature);

    function revokeClaimBySignature(bytes calldata signature) external;

    function isClaimRevoked(bytes calldata sig) external view returns (bool);

    // NB : `isClaimValid(IIdentity, uint256, bytes, bytes)` est hérité d'IIdentity.
    //      Un trusted issuer DOIT en plus garantir la non-révocation (cf. impl).
}
