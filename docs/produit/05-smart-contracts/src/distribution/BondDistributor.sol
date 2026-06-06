// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.24;

import { IERC20 } from "../vendor/IERC20.sol";
import { SafeERC20 } from "../vendor/SafeERC20.sol";
import { IToken } from "../interfaces/IToken.sol";
import { AgentRoleUpgradeable } from "../vendor/RolesUpgradeable.sol";
import { PausableUpgradeable } from "../vendor/PausableUpgradeable.sol";
import { ReentrancyGuard } from "../vendor/ReentrancyGuard.sol";
import { UUPSUpgradeable } from "../vendor/UUPSUpgradeable.sol";

/// @title BondDistributor
/// @notice Distribution des flux obligataires (coupon périodique + remboursement
///         du principal à l'exit), réglée en EURC (EMT MiCA, agréé ACPR) — JAMAIS
///         en USDT (étude P9 §5, P10). Modèle PULL par "rounds" figés (snapshot).
///
///         ┌─ ANTI-FIA / SÉQUESTRE (étude §recadrages 2, P10) ────────────────┐
///         │ Ce contrat NE collecte PAS de capital investisseur et ne mutualise│
///         │ rien. Il ne fait que REDISTRIBUER, aux porteurs EXISTANTS d'un     │
///         │ token donné, des fonds versés par la SPV émettrice (remontée du    │
///         │ produit de revente / des loyers). Le sens du flux est SPV ->       │
///         │ investisseurs, jamais l'inverse. La pré-collecte/closing passe par │
///         │ le SÉQUESTRE TIERS off-chain (notaire/EMI), hors de ce contrat.    │
///         └───────────────────────────────────────────────────────────────────┘
///
///         Mécanique d'un round :
///           1. L'agent crée un round (snapshot des soldes du token figé en
///              fournissant la liste des holders + soldes au moment T, ou en
///              s'appuyant sur un montant total et les balances live — ici on
///              fige via `totalSupplyAtRound` + lecture `balanceOf` à la
///              réclamation, le token étant en lock-up donc immuable hors agent).
///           2. L'agent approuve + dépose le montant EURC du round.
///           3. Chaque holder `claim(roundId)` reçoit part = solde * montant /
///              supplyDuRound.
///           4. À l'exit : round de remboursement du principal, puis l'agent
///              `burn` les tokens (sortie). La distribution N'EXIGE PAS le KYC à
///              nouveau (déjà porté par le token), mais REFUSE de payer un wallet
///              gelé (cohérence avec une mesure de gel/conformité).
contract BondDistributor is
    AgentRoleUpgradeable,
    PausableUpgradeable,
    ReentrancyGuard,
    UUPSUpgradeable
{
    using SafeERC20 for IERC20;

    enum RoundKind {
        Coupon, // intérêt périodique
        Principal // remboursement du principal (exit)

    }

    struct Round {
        RoundKind kind;
        uint256 totalAmount; // EURC total à distribuer sur ce round
        uint256 supplySnapshot; // totalSupply du token figé pour le calcul
        uint256 claimedAmount; // EURC déjà réclamé
        uint64 createdAt;
        bool funded; // EURC déposé ?
        mapping(address => bool) claimed; // holder -> a réclamé ?
        mapping(address => uint256) balanceSnapshot; // solde figé du holder
        mapping(address => bool) hasSnapshot; // solde figé fourni ?
    }

    /// @custom:storage-location erc7201:hearst.storage.BondDistributor
    struct DistStorage {
        IToken securityToken; // token des obligations
        IERC20 settlementToken; // EURC
        uint256 roundCount;
        mapping(uint256 => Round) rounds;
    }

    // ERC-7201: hearst.storage.BondDistributor
    bytes32 private constant DIST_STORAGE =
        0xf392eb46b4e82cae73d65af09c03fd0656bf4eb3701a2d1eaf05f8f05a3a7d00;

    event RoundCreated(uint256 indexed roundId, RoundKind kind, uint256 totalAmount, uint256 supplySnapshot);
    event RoundFunded(uint256 indexed roundId, uint256 amount);
    event SnapshotSet(uint256 indexed roundId, address indexed holder, uint256 balance);
    event Claimed(uint256 indexed roundId, address indexed holder, uint256 amount);
    event Swept(uint256 indexed roundId, address indexed to, uint256 amount);

    error ZeroAddress();
    error ZeroAmount();
    error RoundNotFound(uint256 roundId);
    error RoundAlreadyFunded(uint256 roundId);
    error RoundNotFunded(uint256 roundId);
    error AlreadyClaimed(uint256 roundId, address holder);
    error NothingToClaim(uint256 roundId, address holder);
    error HolderFrozen(address holder);
    error ArrayLengthMismatch();
    error SupplyZero();
    error NoSnapshot(uint256 roundId, address holder);

    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner, address securityToken_, address settlementToken_)
        external
        initializer
    {
        if (securityToken_ == address(0) || settlementToken_ == address(0)) revert ZeroAddress();
        __Ownable_init(initialOwner);
        DistStorage storage $ = _s();
        $.securityToken = IToken(securityToken_);
        $.settlementToken = IERC20(settlementToken_);
    }

    function _s() private pure returns (DistStorage storage $) {
        assembly {
            $.slot := DIST_STORAGE
        }
    }

    // ====================================================================
    //                       Création & financement (AGENT)
    // ====================================================================
    /// @notice Crée un round avec un snapshot de supply figé. Les soldes
    ///         individuels sont fournis ensuite via setSnapshotBatch (off-chain
    ///         le back-office lit la cap table on-chain et fige T).
    /// @param kind        Coupon ou Principal
    /// @param totalAmount montant EURC total du round
    /// @param supplySnapshot totalSupply du token au moment du snapshot
    function createRound(RoundKind kind, uint256 totalAmount, uint256 supplySnapshot)
        external
        onlyAgent
        returns (uint256 roundId)
    {
        if (totalAmount == 0) revert ZeroAmount();
        if (supplySnapshot == 0) revert SupplyZero();
        DistStorage storage $ = _s();
        roundId = $.roundCount++;
        Round storage r = $.rounds[roundId];
        r.kind = kind;
        r.totalAmount = totalAmount;
        r.supplySnapshot = supplySnapshot;
        r.createdAt = uint64(block.timestamp);
        emit RoundCreated(roundId, kind, totalAmount, supplySnapshot);
    }

    /// @notice Fige le solde d'un lot de holders pour un round. Réservé à l'agent
    ///         (le back-office calcule la cap table figée). Idempotent par holder
    ///         (un seul snapshot par holder par round).
    function setSnapshotBatch(
        uint256 roundId,
        address[] calldata holders,
        uint256[] calldata balances
    ) external onlyAgent {
        DistStorage storage $ = _s();
        Round storage r = $.rounds[roundId];
        if (r.supplySnapshot == 0) revert RoundNotFound(roundId);
        if (holders.length != balances.length) revert ArrayLengthMismatch();
        for (uint256 i = 0; i < holders.length; i++) {
            if (!r.hasSnapshot[holders[i]]) {
                r.balanceSnapshot[holders[i]] = balances[i];
                r.hasSnapshot[holders[i]] = true;
                emit SnapshotSet(roundId, holders[i], balances[i]);
            }
        }
    }

    /// @notice Dépose les EURC du round (la SPV/agent a déjà approuvé ce contrat).
    ///         Les fonds restent ici uniquement le temps des réclamations ; ils
    ///         appartiennent économiquement aux porteurs (ce n'est pas du capital
    ///         de la plateforme).
    function fundRound(uint256 roundId) external onlyAgent nonReentrant {
        DistStorage storage $ = _s();
        Round storage r = $.rounds[roundId];
        if (r.supplySnapshot == 0) revert RoundNotFound(roundId);
        if (r.funded) revert RoundAlreadyFunded(roundId);
        r.funded = true;
        $.settlementToken.safeTransferFrom(_msgSender(), address(this), r.totalAmount);
        emit RoundFunded(roundId, r.totalAmount);
    }

    // ====================================================================
    //                          Réclamation (HOLDER)
    // ====================================================================
    /// @notice Le porteur réclame sa part du round. part = soldeFigé *
    ///         totalAmount / supplySnapshot. Refuse si wallet gelé sur le token
    ///         (mesure de conformité). Pull + nonReentrant + EURC en dernier.
    function claim(uint256 roundId) external nonReentrant whenNotPaused {
        _claimFor(roundId, _msgSender());
    }

    /// @notice Variante : l'agent peut "pousser" la distribution à un holder
    ///         (utile pour les wallets embedded / investisseurs non-crypto).
    function claimFor(uint256 roundId, address holder) external onlyAgent nonReentrant {
        _claimFor(roundId, holder);
    }

    function _claimFor(uint256 roundId, address holder) internal {
        DistStorage storage $ = _s();
        Round storage r = $.rounds[roundId];
        if (r.supplySnapshot == 0) revert RoundNotFound(roundId);
        if (!r.funded) revert RoundNotFunded(roundId);
        if (r.claimed[holder]) revert AlreadyClaimed(roundId, holder);
        if (!r.hasSnapshot[holder]) revert NoSnapshot(roundId, holder);

        // Refus de payer un wallet gelé (conformité).
        if ($.securityToken.isFrozen(holder)) revert HolderFrozen(holder);

        uint256 bal = r.balanceSnapshot[holder];
        if (bal == 0) revert NothingToClaim(roundId, holder);

        uint256 amount = (bal * r.totalAmount) / r.supplySnapshot;
        if (amount == 0) revert NothingToClaim(roundId, holder);

        r.claimed[holder] = true;
        r.claimedAmount += amount;
        $.settlementToken.safeTransfer(holder, amount);
        emit Claimed(roundId, holder, amount);
    }

    /// @notice Récupère les reliquats non réclamés d'un round (poussières
    ///         d'arrondi, holders introuvables) vers une adresse désignée par le
    ///         owner (ex : compte séquestre / consignation). À utiliser après un
    ///         délai raisonnable.
    function sweepUnclaimed(uint256 roundId, address to) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        DistStorage storage $ = _s();
        Round storage r = $.rounds[roundId];
        if (r.supplySnapshot == 0) revert RoundNotFound(roundId);
        if (!r.funded) revert RoundNotFunded(roundId);
        uint256 remaining = r.totalAmount - r.claimedAmount;
        if (remaining == 0) revert ZeroAmount();
        r.claimedAmount = r.totalAmount; // clôture
        $.settlementToken.safeTransfer(to, remaining);
        emit Swept(roundId, to, remaining);
    }

    // ====================================================================
    //                          Pause / Views
    // ====================================================================
    function pause() external onlyAgent {
        _pause();
    }

    function unpause() external onlyAgent {
        _unpause();
    }

    function claimableAmount(uint256 roundId, address holder) external view returns (uint256) {
        DistStorage storage $ = _s();
        Round storage r = $.rounds[roundId];
        if (r.supplySnapshot == 0 || !r.funded || r.claimed[holder] || !r.hasSnapshot[holder]) {
            return 0;
        }
        return (r.balanceSnapshot[holder] * r.totalAmount) / r.supplySnapshot;
    }

    function hasClaimed(uint256 roundId, address holder) external view returns (bool) {
        return _s().rounds[roundId].claimed[holder];
    }

    function snapshotBalance(uint256 roundId, address holder) external view returns (uint256) {
        return _s().rounds[roundId].balanceSnapshot[holder];
    }

    function roundInfo(uint256 roundId)
        external
        view
        returns (
            RoundKind kind,
            uint256 totalAmount,
            uint256 supplySnapshot,
            uint256 claimedAmount,
            uint64 createdAt,
            bool funded
        )
    {
        Round storage r = _s().rounds[roundId];
        return
            (r.kind, r.totalAmount, r.supplySnapshot, r.claimedAmount, r.createdAt, r.funded);
    }

    function roundCount() external view returns (uint256) {
        return _s().roundCount;
    }

    function securityToken() external view returns (address) {
        return address(_s().securityToken);
    }

    function settlementToken() external view returns (address) {
        return address(_s().settlementToken);
    }

    function _authorizeUpgrade(address) internal override onlyOwner { }
}
