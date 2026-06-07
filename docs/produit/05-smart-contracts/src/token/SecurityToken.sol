// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.24;

import { IToken } from "../interfaces/IToken.sol";
import { IIdentityRegistry } from "../interfaces/IIdentityRegistry.sol";
import { IModularCompliance } from "../interfaces/IModularCompliance.sol";
import { AgentRoleUpgradeable } from "../vendor/RolesUpgradeable.sol";
import { PausableUpgradeable } from "../vendor/PausableUpgradeable.sol";
import { UUPSUpgradeable } from "../vendor/UUPSUpgradeable.sol";

/// @title SecurityToken (ERC-3643 / T-REX)
/// @notice Security token permissionné représentant les OBLIGATIONS d'une SPV
///         (SAS marchand de biens). MIROIR on-chain d'un registre légal DEEP
///         (Ord. 2017-1674), qui reste la SOURCE DE VÉRITÉ juridique.
///
///         ┌─ ARTICULATION RÉGLEMENTAIRE (étude P9, P13) ────────────────────┐
///         │ • Le token = instrument financier MiFID II => HORS MiCA          │
///         │   (art. 2(4)). MiCA ne régit que le stablecoin de règlement.     │
///         │ • L'inscription DEEP vaut inscription en compte-titres ; le token│
///         │   en est le reflet. En cas de divergence, le DEEP prime (le      │
///         │   `forcedTransfer`/`recoveryAddress` sert à RE-SYNCHRONISER le    │
///         │   on-chain sur le registre légal).                               │
///         │ • Permissionné : aucun transfert hors investisseurs KYC éligibles│
///         │   (anti offre au public non maîtrisée + LCB-FT).                 │
///         └─────────────────────────────────────────────────────────────────┘
///
///         Tout transfert (transfer/transferFrom) est gardé par :
///           1. token non en pause, wallets non gelés, solde libre suffisant ;
///           2. identityRegistry.isVerified(to)  -> KYC du destinataire ;
///           3. compliance.canTransfer(from,to,amount) -> lock-up, pays, plafond.
///         Les opérations d'AGENT (mint/burn/forcedTransfer/recovery) bypassent
///         la compliance "métier" mais JAMAIS la cohérence comptable.
contract SecurityToken is
    IToken,
    AgentRoleUpgradeable,
    PausableUpgradeable,
    UUPSUpgradeable
{
    /// @custom:storage-location erc7201:hearst.storage.SecurityToken
    struct TokenStorage {
        // --- ERC-20 ---
        mapping(address => uint256) balances;
        mapping(address => mapping(address => uint256)) allowances;
        uint256 totalSupply;
        string name;
        string symbol;
        uint8 decimals;
        // --- ERC-3643 ---
        string version;
        address onchainID; // ONCHAINID de l'ÉMETTEUR (la SPV)
        IIdentityRegistry identityRegistry;
        IModularCompliance compliance;
        // --- Gel ---
        mapping(address => bool) frozen; // gel total du wallet
        mapping(address => uint256) frozenTokens; // gel partiel (montant)
        // --- Lien registre légal DEEP ---
        string isin; // ISIN / identifiant de l'obligation au registre DEEP
        string legalRegistryURI; // pointeur vers le registre légal (greffe)
    }

    // ERC-7201: hearst.storage.SecurityToken
    bytes32 private constant TOKEN_STORAGE =
        0xc0084b39184e8f611f97e892286045c00f5e4fe5bbb4fc59a4feea8bac6d3500;

    string private constant TOKEN_VERSION = "1.0.0-erc3643-hearst";

    // --- Erreurs ---
    error TransferNotPossible_NotVerified(address to);
    error TransferNotPossible_Compliance(address from, address to, uint256 amount);
    error TransferNotPossible_Frozen(address account);
    error TransferNotPossible_InsufficientUnfrozen(address from, uint256 needed, uint256 free);
    error InsufficientBalance(address from, uint256 needed, uint256 has);
    error InsufficientAllowance(address owner, address spender, uint256 needed, uint256 has);
    error MintToNonVerified(address to);
    error ZeroAddress();
    error ArrayLengthMismatch();
    error InvalidRecovery();

    constructor() {
        _disableInitializers();
    }

    /// @param initialOwner   board légal (multisig SAS / agent Tokeny)
    /// @param identityRegistry_ IdentityRegistry (KYC)
    /// @param compliance_    ModularCompliance (lock-up, pays, plafond)
    /// @param name_/symbol_/decimals_ métadonnées (decimals 0 conseillé pour des
    ///        obligations indivisibles type "1 token = 1 obligation de 100 €")
    /// @param onchainID_     ONCHAINID de l'émetteur (la SPV)
    function initialize(
        address initialOwner,
        address identityRegistry_,
        address compliance_,
        string calldata name_,
        string calldata symbol_,
        uint8 decimals_,
        address onchainID_
    ) external initializer {
        if (identityRegistry_ == address(0) || compliance_ == address(0)) revert ZeroAddress();
        __Ownable_init(initialOwner);
        TokenStorage storage $ = _s();
        $.name = name_;
        $.symbol = symbol_;
        $.decimals = decimals_;
        $.version = TOKEN_VERSION;
        $.onchainID = onchainID_;
        $.identityRegistry = IIdentityRegistry(identityRegistry_);
        $.compliance = IModularCompliance(compliance_);
        emit IdentityRegistryAdded(identityRegistry_);
        emit ComplianceAdded(compliance_);
        emit UpdatedTokenInformation(name_, symbol_, decimals_, TOKEN_VERSION, onchainID_);
    }

    function _s() private pure returns (TokenStorage storage $) {
        assembly {
            $.slot := TOKEN_STORAGE
        }
    }

    // ====================================================================
    //                          ERC-20 (métadonnées)
    // ====================================================================
    function name() external view override returns (string memory) {
        return _s().name;
    }

    function symbol() external view override returns (string memory) {
        return _s().symbol;
    }

    function decimals() external view override returns (uint8) {
        return _s().decimals;
    }

    function totalSupply() external view override returns (uint256) {
        return _s().totalSupply;
    }

    function balanceOf(address account) external view override returns (uint256) {
        return _s().balances[account];
    }

    function allowance(address owner_, address spender)
        external
        view
        override
        returns (uint256)
    {
        return _s().allowances[owner_][spender];
    }

    function approve(address spender, uint256 value) external override returns (bool) {
        TokenStorage storage $ = _s();
        $.allowances[_msgSender()][spender] = value;
        emit Approval(_msgSender(), spender, value);
        return true;
    }

    // ====================================================================
    //                       Transferts gardés (ERC-3643)
    // ====================================================================
    function transfer(address to, uint256 amount)
        external
        override
        whenNotPaused
        returns (bool)
    {
        _transferChecked(_msgSender(), to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount)
        external
        override
        whenNotPaused
        returns (bool)
    {
        TokenStorage storage $ = _s();
        uint256 allowed = $.allowances[from][_msgSender()];
        if (allowed < amount) {
            revert InsufficientAllowance(from, _msgSender(), amount, allowed);
        }
        $.allowances[from][_msgSender()] = allowed - amount;
        _transferChecked(from, to, amount);
        return true;
    }

    /// @dev Cœur de la conformité. Applique les 3 gardes puis met à jour les
    ///      soldes et notifie la compliance (hook d'état).
    function _transferChecked(address from, address to, uint256 amount) internal {
        if (to == address(0) || from == address(0)) revert ZeroAddress();
        TokenStorage storage $ = _s();

        // Garde 1 : gel
        if ($.frozen[from]) revert TransferNotPossible_Frozen(from);
        if ($.frozen[to]) revert TransferNotPossible_Frozen(to);

        // Garde 1bis : solde libre (hors tokens gelés partiellement)
        uint256 bal = $.balances[from];
        if (bal < amount) revert InsufficientBalance(from, amount, bal);
        uint256 free = bal - $.frozenTokens[from];
        if (free < amount) {
            revert TransferNotPossible_InsufficientUnfrozen(from, amount, free);
        }

        // Garde 2 : KYC du destinataire (INVARIANT central testé en Foundry)
        if (!$.identityRegistry.isVerified(to)) {
            revert TransferNotPossible_NotVerified(to);
        }

        // Garde 3 : conformité métier (lock-up / pays / plafond)
        if (!$.compliance.canTransfer(from, to, amount)) {
            revert TransferNotPossible_Compliance(from, to, amount);
        }

        // Effets
        unchecked {
            $.balances[from] = bal - amount;
            $.balances[to] += amount;
        }
        $.compliance.transferred(from, to, amount);
        emit Transfer(from, to, amount);
    }

    // ====================================================================
    //                     Émission / destruction (AGENT)
    // ====================================================================
    /// @notice Mint primaire au closing (souscription). Le destinataire DOIT être
    ///         KYC (sinon on créerait un holder non éligible). Notifie la
    ///         compliance (hook created) pour mettre à jour le compteur holders.
    function mint(address to, uint256 amount) public override onlyAgent {
        if (to == address(0)) revert ZeroAddress();
        TokenStorage storage $ = _s();
        if (!$.identityRegistry.isVerified(to)) revert MintToNonVerified(to);
        $.totalSupply += amount;
        unchecked {
            $.balances[to] += amount;
        }
        $.compliance.created(to, amount);
        emit Transfer(address(0), to, amount);
    }

    /// @notice Burn à la sortie (remboursement du principal à l'exit) ou
    ///         correction. Brûle d'abord les tokens libres ; si nécessaire,
    ///         dégèle automatiquement la part gelée requise (cas remboursement
    ///         total à l'échéance malgré un gel partiel résiduel).
    function burn(address userAddress, uint256 amount) public override onlyAgent {
        if (userAddress == address(0)) revert ZeroAddress();
        TokenStorage storage $ = _s();
        uint256 bal = $.balances[userAddress];
        if (bal < amount) revert InsufficientBalance(userAddress, amount, bal);

        uint256 frozenAmt = $.frozenTokens[userAddress];
        uint256 free = bal - frozenAmt;
        if (free < amount) {
            // Dégel partiel automatique de la différence.
            uint256 toUnfreeze = amount - free;
            $.frozenTokens[userAddress] = frozenAmt - toUnfreeze;
            emit TokensUnfrozen(userAddress, toUnfreeze);
        }
        unchecked {
            $.balances[userAddress] = bal - amount;
            $.totalSupply -= amount;
        }
        $.compliance.destroyed(userAddress, amount);
        emit Transfer(userAddress, address(0), amount);
    }

    function batchMint(address[] calldata toList, uint256[] calldata amounts)
        external
        override
        onlyAgent
    {
        if (toList.length != amounts.length) revert ArrayLengthMismatch();
        for (uint256 i = 0; i < toList.length; i++) {
            mint(toList[i], amounts[i]);
        }
    }

    function batchBurn(address[] calldata userAddresses, uint256[] calldata amounts)
        external
        override
        onlyAgent
    {
        if (userAddresses.length != amounts.length) revert ArrayLengthMismatch();
        for (uint256 i = 0; i < userAddresses.length; i++) {
            burn(userAddresses[i], amounts[i]);
        }
    }

    // ====================================================================
    //                  Transfert forcé / clawback (AGENT)
    // ====================================================================
    /// @notice forcedTransfer : déplace des tokens SANS consentement du holder.
    ///         Usages LÉGITIMES et bornés (étude : miroir DEEP, sûretés) :
    ///           - exécution d'une décision de justice / saisie ;
    ///           - succession / transmission légale ;
    ///           - réalisation d'un nantissement (titres nantis au profit des
    ///             obligataires) ;
    ///           - RE-SYNCHRONISATION du on-chain sur le registre DEEP (source de
    ///             vérité) en cas de divergence.
    ///         Bypasse le lock-up/compliance (c'est le but) MAIS le destinataire
    ///         DOIT rester KYC (`isVerified`) : on ne clawback jamais vers un
    ///         wallet non éligible. Dégèle automatiquement si besoin.
    function forcedTransfer(address from, address to, uint256 amount)
        public
        override
        onlyAgent
        returns (bool)
    {
        if (from == address(0) || to == address(0)) revert ZeroAddress();
        TokenStorage storage $ = _s();
        if (!$.identityRegistry.isVerified(to)) revert TransferNotPossible_NotVerified(to);

        uint256 bal = $.balances[from];
        if (bal < amount) revert InsufficientBalance(from, amount, bal);

        uint256 frozenAmt = $.frozenTokens[from];
        uint256 free = bal - frozenAmt;
        if (free < amount) {
            uint256 toUnfreeze = amount - free;
            $.frozenTokens[from] = frozenAmt - toUnfreeze;
            emit TokensUnfrozen(from, toUnfreeze);
        }
        unchecked {
            $.balances[from] = bal - amount;
            $.balances[to] += amount;
        }
        // On notifie la compliance pour garder les compteurs (holders) cohérents.
        $.compliance.transferred(from, to, amount);
        emit Transfer(from, to, amount);
        return true;
    }

    function batchForcedTransfer(
        address[] calldata fromList,
        address[] calldata toList,
        uint256[] calldata amounts
    ) external override onlyAgent {
        uint256 len = fromList.length;
        if (len != toList.length || len != amounts.length) revert ArrayLengthMismatch();
        for (uint256 i = 0; i < len; i++) {
            forcedTransfer(fromList[i], toList[i], amounts[i]);
        }
    }

    // ====================================================================
    //                       Recouvrement de wallet (AGENT)
    // ====================================================================
    /// @notice Récupère les tokens d'un wallet perdu/compromis vers un nouveau
    ///         wallet du MÊME investisseur (même ONCHAINID). Vérifie que la
    ///         nouvelle adresse est rattachée à l'ONCHAINID fourni dans
    ///         l'IdentityRegistry. Transfère solde + reporte le gel.
    function recoveryAddress(address lostWallet, address newWallet, address investorOnchainID)
        external
        override
        onlyAgent
        returns (bool)
    {
        if (lostWallet == address(0) || newWallet == address(0)) revert ZeroAddress();
        TokenStorage storage $ = _s();
        uint256 bal = $.balances[lostWallet];
        if (bal == 0) revert InvalidRecovery();
        // Le nouveau wallet doit être enregistré ET rattaché à la même ONCHAINID.
        if (address($.identityRegistry.identity(newWallet)) != investorOnchainID) {
            revert InvalidRecovery();
        }
        if (!$.identityRegistry.isVerified(newWallet)) revert TransferNotPossible_NotVerified(newWallet);

        uint256 frozenAmt = $.frozenTokens[lostWallet];
        // Transfert intégral
        $.balances[lostWallet] = 0;
        unchecked {
            $.balances[newWallet] += bal;
        }
        // Report du gel partiel
        if (frozenAmt > 0) {
            $.frozenTokens[lostWallet] = 0;
            $.frozenTokens[newWallet] += frozenAmt;
            emit TokensFrozen(newWallet, frozenAmt);
        }
        // Report du gel total
        if ($.frozen[lostWallet]) {
            $.frozen[newWallet] = true;
            emit AddressFrozen(newWallet, true, _msgSender());
        }
        emit Transfer(lostWallet, newWallet, bal);
        emit RecoverySuccess(lostWallet, newWallet, investorOnchainID);
        return true;
    }

    // ====================================================================
    //                              Gel (AGENT)
    // ====================================================================
    function setAddressFrozen(address userAddress, bool freeze) public override onlyAgent {
        _s().frozen[userAddress] = freeze;
        emit AddressFrozen(userAddress, freeze, _msgSender());
    }

    function freezePartialTokens(address userAddress, uint256 amount)
        public
        override
        onlyAgent
    {
        TokenStorage storage $ = _s();
        uint256 bal = $.balances[userAddress];
        uint256 newFrozen = $.frozenTokens[userAddress] + amount;
        if (newFrozen > bal) revert InsufficientBalance(userAddress, newFrozen, bal);
        $.frozenTokens[userAddress] = newFrozen;
        emit TokensFrozen(userAddress, amount);
    }

    function unfreezePartialTokens(address userAddress, uint256 amount)
        public
        override
        onlyAgent
    {
        TokenStorage storage $ = _s();
        uint256 frozenAmt = $.frozenTokens[userAddress];
        if (amount > frozenAmt) revert InsufficientBalance(userAddress, amount, frozenAmt);
        $.frozenTokens[userAddress] = frozenAmt - amount;
        emit TokensUnfrozen(userAddress, amount);
    }

    function isFrozen(address userAddress) external view override returns (bool) {
        return _s().frozen[userAddress];
    }

    function getFrozenTokens(address userAddress) external view override returns (uint256) {
        return _s().frozenTokens[userAddress];
    }

    // ====================================================================
    //                          Pause (AGENT)
    // ====================================================================
    function pause() external override onlyAgent {
        _pause(); // émet Paused via le mixin Pausable
    }

    function unpause() external override onlyAgent {
        _unpause(); // émet Unpaused via le mixin Pausable
    }

    function paused()
        public
        view
        override(IToken, PausableUpgradeable)
        returns (bool)
    {
        return PausableUpgradeable.paused();
    }

    // ====================================================================
    //                  Métadonnées & registres (OWNER)
    // ====================================================================
    function setName(string calldata newName) external override onlyOwner {
        TokenStorage storage $ = _s();
        $.name = newName;
        emit UpdatedTokenInformation(newName, $.symbol, $.decimals, $.version, $.onchainID);
    }

    function setSymbol(string calldata newSymbol) external override onlyOwner {
        TokenStorage storage $ = _s();
        $.symbol = newSymbol;
        emit UpdatedTokenInformation($.name, newSymbol, $.decimals, $.version, $.onchainID);
    }

    function setOnchainID(address onchainID_) external override onlyOwner {
        TokenStorage storage $ = _s();
        $.onchainID = onchainID_;
        emit UpdatedTokenInformation($.name, $.symbol, $.decimals, $.version, onchainID_);
    }

    function setLegalRegistryReference(string calldata isin_, string calldata uri_)
        external
        override
        onlyOwner
    {
        TokenStorage storage $ = _s();
        $.isin = isin_;
        $.legalRegistryURI = uri_;
        emit LegalRegistryReferenceSet(isin_, uri_);
    }

    function setIdentityRegistry(address identityRegistry_) external override onlyOwner {
        if (identityRegistry_ == address(0)) revert ZeroAddress();
        _s().identityRegistry = IIdentityRegistry(identityRegistry_);
        emit IdentityRegistryAdded(identityRegistry_);
    }

    function setCompliance(address compliance_) external override onlyOwner {
        if (compliance_ == address(0)) revert ZeroAddress();
        _s().compliance = IModularCompliance(compliance_);
        emit ComplianceAdded(compliance_);
    }

    // --- Views ERC-3643 ---
    function version() external view override returns (string memory) {
        return _s().version;
    }

    function onchainID() external view override returns (address) {
        return _s().onchainID;
    }

    function identityRegistry() external view override returns (IIdentityRegistry) {
        return _s().identityRegistry;
    }

    function compliance() external view override returns (IModularCompliance) {
        return _s().compliance;
    }

    function isin() external view override returns (string memory) {
        return _s().isin;
    }

    function legalRegistryURI() external view override returns (string memory) {
        return _s().legalRegistryURI;
    }

    function _authorizeUpgrade(address) internal override onlyOwner { }
}
