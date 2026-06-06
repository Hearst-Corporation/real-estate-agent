// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.24;

import { IIdentity, IClaimIssuer } from "../../src/identity/IIdentity.sol";

/// @title MockIdentity — ONCHAINID de test (ERC-734/735)
/// @notice Identité soulbound d'un investisseur. Porte des claims signés par un
///         MockClaimIssuer (trusted issuer). Reflète l'architecture réelle :
///         l'identité de l'investisseur et l'émetteur de claim sont SÉPARÉS.
contract MockIdentity is IIdentity {
    struct Claim {
        uint256 topic;
        uint256 scheme;
        address issuer;
        bytes signature;
        bytes data;
        string uri;
        bool exists;
    }

    address public owner;
    mapping(bytes32 => Claim) internal _claims;
    mapping(uint256 => bytes32[]) internal _claimsByTopic;

    constructor(address owner_) {
        owner = owner_;
    }

    // --- ERC-735 ---
    function addClaim(
        uint256 topic,
        uint256 scheme,
        address issuer,
        bytes calldata signature,
        bytes calldata data,
        string calldata uri
    ) external override returns (bytes32 claimId) {
        // claimId convention ONCHAINID : keccak(issuer, topic)
        claimId = keccak256(abi.encode(issuer, topic));
        if (!_claims[claimId].exists) {
            _claimsByTopic[topic].push(claimId);
        }
        _claims[claimId] = Claim(topic, scheme, issuer, signature, data, uri, true);
        emit ClaimAdded(claimId, topic, scheme, issuer, signature, data, uri);
    }

    function removeClaim(bytes32 claimId) external override returns (bool) {
        Claim memory c = _claims[claimId];
        if (!c.exists) return false;
        delete _claims[claimId];
        bytes32[] storage arr = _claimsByTopic[c.topic];
        for (uint256 i = 0; i < arr.length; i++) {
            if (arr[i] == claimId) {
                arr[i] = arr[arr.length - 1];
                arr.pop();
                break;
            }
        }
        emit ClaimRemoved(claimId, c.topic, c.scheme, c.issuer, c.signature, c.data, c.uri);
        return true;
    }

    function getClaim(bytes32 claimId)
        external
        view
        override
        returns (uint256, uint256, address, bytes memory, bytes memory, string memory)
    {
        Claim memory c = _claims[claimId];
        return (c.topic, c.scheme, c.issuer, c.signature, c.data, c.uri);
    }

    function getClaimIdsByTopic(uint256 topic)
        external
        view
        override
        returns (bytes32[] memory)
    {
        return _claimsByTopic[topic];
    }

    // --- ERC-734 (minimal) ---
    function getKey(bytes32)
        external
        pure
        override
        returns (uint256[] memory, uint256, bytes32)
    {
        uint256[] memory p;
        return (p, 0, bytes32(0));
    }

    function keyHasPurpose(bytes32, uint256) external pure override returns (bool) {
        return true;
    }

    function getKeysByPurpose(uint256) external pure override returns (bytes32[] memory) {
        bytes32[] memory k;
        return k;
    }

    function addKey(bytes32, uint256, uint256) external pure override returns (bool) {
        return true;
    }

    function removeKey(bytes32, uint256) external pure override returns (bool) {
        return true;
    }

    /// @inheritdoc IIdentity
    function isClaimValid(IIdentity, uint256, bytes calldata, bytes calldata)
        external
        pure
        override
        returns (bool)
    {
        // Délégué au ClaimIssuer dans l'archi réelle ; non utilisé directement.
        return true;
    }
}

/// @title MockClaimIssuer — trusted issuer de test (prestataire KYC)
/// @notice Émet et révoque des claims. Implémente `isClaimValid` consommé par
///         l'IdentityRegistry : un claim est valide s'il existe sur l'identité
///         interrogée (pour ce topic, émis par CET issuer) et n'est pas révoqué.
contract MockClaimIssuer is IClaimIssuer {
    address public owner;
    mapping(bytes => bool) internal _revoked;

    constructor(address owner_) {
        owner = owner_;
    }

    // --- IClaimIssuer ---
    function revokeClaimBySignature(bytes calldata signature) external override {
        _revoked[signature] = true;
        emit ClaimRevoked(signature);
    }

    function isClaimRevoked(bytes calldata sig) external view override returns (bool) {
        return _revoked[sig];
    }

    /// @notice Valide : claim présent sur `identity` pour `claimTopic`, émis par
    ///         cet issuer, non révoqué.
    function isClaimValid(
        IIdentity identity,
        uint256 claimTopic,
        bytes calldata sig,
        bytes calldata
    ) external view override returns (bool) {
        if (_revoked[sig]) return false;
        bytes32 claimId = keccak256(abi.encode(address(this), claimTopic));
        (uint256 topic,, address issuer,,,) = identity.getClaim(claimId);
        return topic == claimTopic && issuer == address(this);
    }

    // --- ERC-735/734 inutilisés sur l'issuer (stubs) ---
    function addClaim(uint256, uint256, address, bytes calldata, bytes calldata, string calldata)
        external
        pure
        override
        returns (bytes32)
    {
        return bytes32(0);
    }

    function removeClaim(bytes32) external pure override returns (bool) {
        return true;
    }

    function getClaim(bytes32)
        external
        pure
        override
        returns (uint256, uint256, address, bytes memory, bytes memory, string memory)
    {
        return (0, 0, address(0), "", "", "");
    }

    function getClaimIdsByTopic(uint256) external pure override returns (bytes32[] memory) {
        bytes32[] memory ids;
        return ids;
    }

    function getKey(bytes32)
        external
        pure
        override
        returns (uint256[] memory, uint256, bytes32)
    {
        uint256[] memory p;
        return (p, 0, bytes32(0));
    }

    function keyHasPurpose(bytes32, uint256) external pure override returns (bool) {
        return true;
    }

    function getKeysByPurpose(uint256) external pure override returns (bytes32[] memory) {
        bytes32[] memory k;
        return k;
    }

    function addKey(bytes32, uint256, uint256) external pure override returns (bool) {
        return true;
    }

    function removeKey(bytes32, uint256) external pure override returns (bool) {
        return true;
    }
}
