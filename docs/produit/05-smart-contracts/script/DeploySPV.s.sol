// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.24;

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";

import { ERC1967Proxy } from "../src/vendor/ERC1967Proxy.sol";

import { ClaimTopicsRegistry } from "../src/registry/ClaimTopicsRegistry.sol";
import { TrustedIssuersRegistry } from "../src/registry/TrustedIssuersRegistry.sol";
import { IdentityRegistryStorage } from "../src/registry/IdentityRegistryStorage.sol";
import { IdentityRegistry } from "../src/registry/IdentityRegistry.sol";
import { Topics } from "../src/registry/Topics.sol";

import { ModularCompliance } from "../src/compliance/ModularCompliance.sol";
import { LockUp24Module } from "../src/compliance/modules/LockUp24Module.sol";
import { CountryRestrictModule } from "../src/compliance/modules/CountryRestrictModule.sol";
import { MaxInvestorsModule } from "../src/compliance/modules/MaxInvestorsModule.sol";
import { KycRequiredModule } from "../src/compliance/modules/KycRequiredModule.sol";

import { SecurityToken } from "../src/token/SecurityToken.sol";
import { BondDistributor } from "../src/distribution/BondDistributor.sol";

import { IClaimIssuer } from "../src/identity/IIdentity.sol";

/// @title DeploySPV
/// @notice Déploie une émission obligataire complète pour UNE SPV (1 SPV = 1
///         opération). Tout est paramétré par variables d'environnement (aucun
///         magic number, cf. CLAUDE.md). Chaque composant ERC-3643 est déployé
///         derrière un proxy ERC-1967 (modèle T-REX) puis câblé.
///
///         Usage :
///           forge script script/DeploySPV.s.sol:DeploySPV \
///             --rpc-url $RPC_URL --broadcast --private-key $DEPLOYER_PK
///
///         Variables d'environnement : cf. .env.example.
contract DeploySPV is Script {
    /// @dev Paramètres groupés pour éviter "stack too deep".
    struct Params {
        address owner; // board légal (multisig SAS / agent Tokeny)
        address agent; // transfer agent / relais KYC
        address trustedIssuer; // contrat IClaimIssuer du prestataire KYC
        address settlementToken; // EURC (EMT MiCA)
        address issuerOnchainID; // ONCHAINID de la SPV (peut être 0 au début)
        string tokenName;
        string tokenSymbol;
        uint8 tokenDecimals;
        string deepIsin; // ISIN au registre DEEP
        string deepUri; // URI du registre légal DEEP
        uint256 lockupReleaseTs; // fin de lock-up (>= now)
        uint256 maxInvestors; // plafond holders (ex. 149)
        uint256[] restrictedCountries; // codes ISO-3166 exclus
    }

    struct Deployment {
        address claimTopicsRegistry;
        address trustedIssuersRegistry;
        address identityRegistryStorage;
        address identityRegistry;
        address modularCompliance;
        address lockUpModule;
        address countryModule;
        address maxInvestorsModule;
        address kycModule;
        address securityToken;
        address bondDistributor;
    }

    function run() external returns (Deployment memory d) {
        Params memory p = _readParams();
        vm.startBroadcast();
        d = _deployRegistries(p);
        _deployComplianceAndToken(p, d);
        _configureModules(p, d);
        _finalize(p, d);
        vm.stopBroadcast();
        _log(d);
    }

    function _readParams() internal view returns (Params memory p) {
        p.owner = vm.envAddress("OWNER_ADDRESS");
        p.agent = vm.envAddress("AGENT_ADDRESS");
        p.trustedIssuer = vm.envAddress("TRUSTED_ISSUER");
        p.settlementToken = vm.envAddress("SETTLEMENT_TOKEN");
        p.issuerOnchainID = vm.envOr("ISSUER_ONCHAINID", address(0));
        p.tokenName = vm.envString("TOKEN_NAME");
        p.tokenSymbol = vm.envString("TOKEN_SYMBOL");
        p.tokenDecimals = uint8(vm.envUint("TOKEN_DECIMALS"));
        p.deepIsin = vm.envString("DEEP_ISIN");
        p.deepUri = vm.envString("DEEP_URI");
        p.lockupReleaseTs = vm.envUint("LOCKUP_RELEASE_TS");
        p.maxInvestors = vm.envUint("MAX_INVESTORS");
        p.restrictedCountries = vm.envOr("RESTRICTED_COUNTRIES", ",", new uint256[](0));
    }

    function _deployRegistries(Params memory p) internal returns (Deployment memory d) {
        d.claimTopicsRegistry = _proxy(
            address(new ClaimTopicsRegistry()),
            abi.encodeCall(ClaimTopicsRegistry.initialize, (p.owner))
        );
        d.trustedIssuersRegistry = _proxy(
            address(new TrustedIssuersRegistry()),
            abi.encodeCall(TrustedIssuersRegistry.initialize, (p.owner))
        );
        d.identityRegistryStorage = _proxy(
            address(new IdentityRegistryStorage()),
            abi.encodeCall(IdentityRegistryStorage.initialize, (p.owner))
        );
        d.identityRegistry = _proxy(
            address(new IdentityRegistry()),
            abi.encodeCall(
                IdentityRegistry.initialize,
                (p.owner, d.trustedIssuersRegistry, d.claimTopicsRegistry, d.identityRegistryStorage)
            )
        );

        // Topics requis : KYC + pays
        ClaimTopicsRegistry(d.claimTopicsRegistry).addClaimTopic(Topics.KYC_AML);
        ClaimTopicsRegistry(d.claimTopicsRegistry).addClaimTopic(Topics.COUNTRY_OF_RESIDENCE);

        // Trusted issuer habilité KYC + pays
        uint256[] memory issuerTopics = new uint256[](2);
        issuerTopics[0] = Topics.KYC_AML;
        issuerTopics[1] = Topics.COUNTRY_OF_RESIDENCE;
        TrustedIssuersRegistry(d.trustedIssuersRegistry).addTrustedIssuer(
            IClaimIssuer(p.trustedIssuer), issuerTopics
        );

        // Bind IR<->IRS + agents
        IdentityRegistryStorage(d.identityRegistryStorage).bindIdentityRegistry(d.identityRegistry);
        IdentityRegistry(d.identityRegistry).addAgent(p.agent);
        IdentityRegistryStorage(d.identityRegistryStorage).addAgent(p.agent);
    }

    function _deployComplianceAndToken(Params memory p, Deployment memory d) internal {
        d.modularCompliance = _proxy(
            address(new ModularCompliance()),
            abi.encodeCall(ModularCompliance.initialize, (p.owner))
        );
        d.lockUpModule = address(new LockUp24Module(p.owner));
        d.countryModule = address(new CountryRestrictModule(p.owner));
        d.maxInvestorsModule = address(new MaxInvestorsModule(p.owner));
        d.kycModule = address(new KycRequiredModule(p.owner));

        d.securityToken = _proxy(
            address(new SecurityToken()),
            abi.encodeCall(
                SecurityToken.initialize,
                (
                    p.owner,
                    d.identityRegistry,
                    d.modularCompliance,
                    p.tokenName,
                    p.tokenSymbol,
                    p.tokenDecimals,
                    p.issuerOnchainID
                )
            )
        );

        ModularCompliance mc = ModularCompliance(d.modularCompliance);
        mc.bindToken(d.securityToken);
        mc.addModule(d.lockUpModule);
        mc.addModule(d.countryModule);
        mc.addModule(d.maxInvestorsModule);
        mc.addModule(d.kycModule);
    }

    function _configureModules(Params memory p, Deployment memory d) internal {
        ModularCompliance mc = ModularCompliance(d.modularCompliance);

        mc.callModuleFunction(
            abi.encodeCall(LockUp24Module.setReleaseTimestamp, (p.lockupReleaseTs)), d.lockUpModule
        );
        mc.callModuleFunction(
            abi.encodeCall(
                CountryRestrictModule.setIdentityRegistry, (d.modularCompliance, d.identityRegistry)
            ),
            d.countryModule
        );
        for (uint256 i = 0; i < p.restrictedCountries.length; i++) {
            mc.callModuleFunction(
                abi.encodeCall(
                    CountryRestrictModule.restrictCountry,
                    (d.modularCompliance, uint16(p.restrictedCountries[i]))
                ),
                d.countryModule
            );
        }
        mc.callModuleFunction(
            abi.encodeCall(MaxInvestorsModule.setMaxInvestors, (d.modularCompliance, p.maxInvestors)),
            d.maxInvestorsModule
        );
        mc.callModuleFunction(
            abi.encodeCall(
                KycRequiredModule.setIdentityRegistry, (d.modularCompliance, d.identityRegistry)
            ),
            d.kycModule
        );
    }

    function _finalize(Params memory p, Deployment memory d) internal {
        SecurityToken(d.securityToken).setLegalRegistryReference(p.deepIsin, p.deepUri);
        SecurityToken(d.securityToken).addAgent(p.agent);

        d.bondDistributor = _proxy(
            address(new BondDistributor()),
            abi.encodeCall(BondDistributor.initialize, (p.owner, d.securityToken, p.settlementToken))
        );
        BondDistributor(d.bondDistributor).addAgent(p.agent);
    }

    function _proxy(address impl, bytes memory initData) internal returns (address) {
        return address(new ERC1967Proxy(impl, initData));
    }

    function _log(Deployment memory d) internal pure {
        console2.log("=== Deploiement SPV ERC-3643 ===");
        console2.log("ClaimTopicsRegistry    :", d.claimTopicsRegistry);
        console2.log("TrustedIssuersRegistry :", d.trustedIssuersRegistry);
        console2.log("IdentityRegistryStorage:", d.identityRegistryStorage);
        console2.log("IdentityRegistry       :", d.identityRegistry);
        console2.log("ModularCompliance      :", d.modularCompliance);
        console2.log("LockUp24Module         :", d.lockUpModule);
        console2.log("CountryRestrictModule  :", d.countryModule);
        console2.log("MaxInvestorsModule     :", d.maxInvestorsModule);
        console2.log("KycRequiredModule      :", d.kycModule);
        console2.log("SecurityToken (proxy)  :", d.securityToken);
        console2.log("BondDistributor        :", d.bondDistributor);
    }
}
