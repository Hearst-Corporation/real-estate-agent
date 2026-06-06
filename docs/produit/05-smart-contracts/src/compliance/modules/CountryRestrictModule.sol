// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.24;

import { AbstractModule } from "../AbstractModule.sol";
import { IIdentityRegistry } from "../../interfaces/IIdentityRegistry.sol";

/// @title CountryRestrictModule
/// @notice Module de conformité : restriction par juridiction. Bloque la
///         détention par des résidents de pays exclus. Justification (étude) :
///           - placement réservé UE / pays autorisés (passeport PSFP) ;
///           - exclusion des US sans exemption Reg S (cf. comparable RealT qui
///             combine Reg D + Reg S) ;
///           - exclusion des juridictions sanctionnées (LCB-FT, Travel Rule).
///
///         Le pays du destinataire est lu sur l'IdentityRegistry (ONCHAINID).
///         Le code pays est ISO-3166 numérique (ex : 250 = France, 840 = US).
contract CountryRestrictModule is AbstractModule {
    /// @dev compliance => IdentityRegistry source des pays.
    mapping(address => IIdentityRegistry) public identityRegistryOf;
    /// @dev compliance => (country => interdit).
    mapping(address => mapping(uint16 => bool)) public isCountryRestricted;

    event IdentityRegistrySet(address indexed compliance, address indexed identityRegistry);
    event CountryRestricted(address indexed compliance, uint16 indexed country);
    event CountryUnrestricted(address indexed compliance, uint16 indexed country);

    error ZeroIdentityRegistry();

    constructor(address initialOwner) AbstractModule(initialOwner) { }

    /// @notice Lie l'IdentityRegistry à la compliance appelante (via
    ///         callModuleFunction) ou owner.
    function setIdentityRegistry(address compliance, address ir) external {
        if (msg.sender != compliance && msg.sender != owner()) {
            revert OnlyBoundCompliance(compliance);
        }
        if (!_complianceBound[compliance]) revert OnlyBoundCompliance(compliance);
        if (ir == address(0)) revert ZeroIdentityRegistry();
        identityRegistryOf[compliance] = IIdentityRegistry(ir);
        emit IdentityRegistrySet(compliance, ir);
    }

    function restrictCountry(address compliance, uint16 country) external {
        if (msg.sender != compliance && msg.sender != owner()) {
            revert OnlyBoundCompliance(compliance);
        }
        if (!_complianceBound[compliance]) revert OnlyBoundCompliance(compliance);
        isCountryRestricted[compliance][country] = true;
        emit CountryRestricted(compliance, country);
    }

    function unrestrictCountry(address compliance, uint16 country) external {
        if (msg.sender != compliance && msg.sender != owner()) {
            revert OnlyBoundCompliance(compliance);
        }
        if (!_complianceBound[compliance]) revert OnlyBoundCompliance(compliance);
        isCountryRestricted[compliance][country] = false;
        emit CountryUnrestricted(compliance, country);
    }

    function batchRestrictCountries(address compliance, uint16[] calldata countries) external {
        if (msg.sender != compliance && msg.sender != owner()) {
            revert OnlyBoundCompliance(compliance);
        }
        if (!_complianceBound[compliance]) revert OnlyBoundCompliance(compliance);
        for (uint256 i = 0; i < countries.length; i++) {
            isCountryRestricted[compliance][countries[i]] = true;
            emit CountryRestricted(compliance, countries[i]);
        }
    }

    /// @notice Vérification AVANT transfert (cf. IModule.moduleCheck).
    /// @dev `from` n'est pas contrôlé : seul le pays du DESTINATAIRE qui entre
    ///      dans la cap table compte.
    function moduleCheck(address, /* from */ address to, uint256, address compliance)
        external
        view
        override
        returns (bool)
    {
        if (to == address(0)) {
            return true; // burn : pas de contrôle de destination
        }
        IIdentityRegistry ir = identityRegistryOf[compliance];
        if (address(ir) == address(0)) {
            // Pas d'IR configuré : ce module ne contraint pas (fail-open propre à
            // CE module ; le KYC reste assuré par l'IdentityRegistry du token).
            return true;
        }
        // Contrôle du destinataire (entrée dans la cap table).
        uint16 toCountry = ir.investorCountry(to);
        if (isCountryRestricted[compliance][toCountry]) {
            return false;
        }
        // from == 0 (mint) : pas de contrôle d'émetteur.
        return true;
    }

    function moduleTransferAction(address, address, uint256)
        external
        override
        onlyComplianceCall
    { }

    function moduleMintAction(address, uint256) external override onlyComplianceCall { }

    function moduleBurnAction(address, uint256) external override onlyComplianceCall { }

    function isPlugAndPlay() external pure override returns (bool) {
        return true;
    }

    function name() external pure override returns (string memory) {
        return "CountryRestrictModule";
    }
}
