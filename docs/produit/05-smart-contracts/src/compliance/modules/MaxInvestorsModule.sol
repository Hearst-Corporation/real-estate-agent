// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.24;

import { AbstractModule } from "../AbstractModule.sol";

/// @title MaxInvestorsModule
/// @notice Module de conformité : plafond du nombre d'investisseurs (holders).
///         Justification réglementaire (étude P13) :
///           - placement privé : < 150 personnes par État membre (L.411-2 CMF +
///             Règl. Prospectus 2017/1129) ;
///           - borne dure anti "offre au public" sans prospectus/DIS.
///         Maintient un compteur exact de holders via les hooks d'état.
///
///         Définition d'un "holder" : adresse de solde > 0. Le compteur est
///         incrémenté quand un solde passe de 0 à >0, décrémenté quand il
///         retombe à 0. Le module tient son propre miroir des soldes pour ne
///         pas dépendre de lectures externes pendant les hooks.
contract MaxInvestorsModule is AbstractModule {
    /// @dev compliance => plafond (0 = non configuré -> illimité).
    mapping(address => uint256) public maxInvestors;
    /// @dev compliance => nombre courant de holders.
    mapping(address => uint256) public currentInvestorCount;
    /// @dev compliance => (holder => solde miroir).
    mapping(address => mapping(address => uint256)) public mirroredBalance;

    event MaxInvestorsSet(address indexed compliance, uint256 max);

    error MaxInvestorsZero();
    error MaxBelowCurrent(uint256 requested, uint256 current);

    constructor(address initialOwner) AbstractModule(initialOwner) { }

    /// @notice Fixe le plafond pour la compliance appelante (callModuleFunction)
    ///         ou owner. Refuse de descendre sous le nombre courant de holders.
    function setMaxInvestors(address compliance, uint256 max) external {
        if (msg.sender != compliance && msg.sender != owner()) {
            revert OnlyBoundCompliance(compliance);
        }
        if (!_complianceBound[compliance]) revert OnlyBoundCompliance(compliance);
        if (max == 0) revert MaxInvestorsZero();
        if (max < currentInvestorCount[compliance]) {
            revert MaxBelowCurrent(max, currentInvestorCount[compliance]);
        }
        maxInvestors[compliance] = max;
        emit MaxInvestorsSet(compliance, max);
    }

    /// @notice Vérification AVANT transfert (cf. IModule.moduleCheck).
    /// @dev Refuse un transfert/mint qui ferait apparaître un NOUVEAU holder
    ///      au-delà du plafond. Un transfert vers un holder existant, ou qui ne
    ///      crée pas de nouveau holder, est autorisé.
    function moduleCheck(address from, address to, uint256 value, address compliance)
        external
        view
        override
        returns (bool)
    {
        uint256 cap = maxInvestors[compliance];
        if (cap == 0) {
            return true; // non configuré -> pas de plafond
        }
        if (to == address(0) || value == 0) {
            return true; // burn / no-op
        }
        bool createsNewHolder = mirroredBalance[compliance][to] == 0;
        if (!createsNewHolder) {
            return true; // le destinataire est déjà holder
        }
        // Cas où l'émetteur (from) sera vidé par ce transfert : il "libère" un
        // slot. On l'anticipe pour ne pas refuser à tort un transfert net-neutre.
        bool fromWillExit =
            from != address(0) && mirroredBalance[compliance][from] == value;
        uint256 projected = currentInvestorCount[compliance] + 1;
        if (fromWillExit) {
            projected -= 1;
        }
        return projected <= cap;
    }

    function moduleTransferAction(address from, address to, uint256 value)
        external
        override
        onlyComplianceCall
    {
        _decrease(msg.sender, from, value);
        _increase(msg.sender, to, value);
    }

    function moduleMintAction(address to, uint256 value)
        external
        override
        onlyComplianceCall
    {
        _increase(msg.sender, to, value);
    }

    function moduleBurnAction(address from, uint256 value)
        external
        override
        onlyComplianceCall
    {
        _decrease(msg.sender, from, value);
    }

    function _increase(address compliance, address holder, uint256 value) private {
        if (holder == address(0) || value == 0) return;
        uint256 prev = mirroredBalance[compliance][holder];
        if (prev == 0) {
            currentInvestorCount[compliance] += 1;
        }
        mirroredBalance[compliance][holder] = prev + value;
    }

    function _decrease(address compliance, address holder, uint256 value) private {
        if (holder == address(0) || value == 0) return;
        uint256 prev = mirroredBalance[compliance][holder];
        // Robustesse : ne pas underflow (forcedTransfer/clawback peut désynchro
        // en cas de mauvaise séquence ; on borne).
        uint256 newBal = prev > value ? prev - value : 0;
        mirroredBalance[compliance][holder] = newBal;
        if (prev != 0 && newBal == 0) {
            uint256 count = currentInvestorCount[compliance];
            if (count != 0) {
                currentInvestorCount[compliance] = count - 1;
            }
        }
    }

    function isPlugAndPlay() external pure override returns (bool) {
        return true;
    }

    function name() external pure override returns (string memory) {
        return "MaxInvestorsModule";
    }
}
