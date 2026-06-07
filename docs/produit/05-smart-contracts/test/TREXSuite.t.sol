// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";

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

import { IIdentity, IClaimIssuer } from "../src/identity/IIdentity.sol";
import { MockIdentity, MockClaimIssuer } from "./mocks/MockOnchainID.sol";

/// @title TREXSuite
/// @notice Fixture partagée : déploie l'INTÉGRALITÉ de la stack ERC-3643 derrière
///         des proxies ERC-1967 (comme T-REX en prod) et la câble pour une SPV
///         "obligations marchand de biens". Réutilisée par tous les tests.
///
///         Codes pays ISO-3166 utilisés :
///           FR = 250 (autorisé), US = 840 (restreint, pas de Reg S ici).
abstract contract TREXSuite is Test {
    // Acteurs
    address internal owner = makeAddr("owner"); // board légal (multisig SAS)
    address internal agent = makeAddr("agent"); // transfer agent / relais KYC
    address internal kycSigner = makeAddr("kycSigner");
    address internal spvTreasury = makeAddr("spvTreasury"); // trésorerie SPV (EURC)

    address internal alice = makeAddr("alice"); // investisseur FR, KYC OK
    address internal bob = makeAddr("bob"); // investisseur FR, KYC OK
    address internal carol = makeAddr("carol"); // investisseur US (restreint)
    address internal mallory = makeAddr("mallory"); // NON-KYC

    // Codes pays
    uint16 internal constant FR = 250;
    uint16 internal constant US = 840;

    // Contrats (proxies typés vers l'implémentation)
    ClaimTopicsRegistry internal ctr;
    TrustedIssuersRegistry internal tir;
    IdentityRegistryStorage internal irs;
    IdentityRegistry internal ir;
    ModularCompliance internal mc;
    SecurityToken internal token;

    LockUp24Module internal lockup;
    CountryRestrictModule internal country;
    MaxInvestorsModule internal maxInv;
    KycRequiredModule internal kyc;

    MockClaimIssuer internal claimIssuer;

    // Identités investisseurs
    MockIdentity internal aliceId;
    MockIdentity internal bobId;
    MockIdentity internal carolId;

    function _deployProxy(address impl, bytes memory initData) internal returns (address) {
        return address(new ERC1967Proxy(impl, initData));
    }

    function setUp() public virtual {
        vm.startPrank(owner);

        // 1. Registries (proxies)
        ctr = ClaimTopicsRegistry(
            _deployProxy(
                address(new ClaimTopicsRegistry()),
                abi.encodeCall(ClaimTopicsRegistry.initialize, (owner))
            )
        );
        tir = TrustedIssuersRegistry(
            _deployProxy(
                address(new TrustedIssuersRegistry()),
                abi.encodeCall(TrustedIssuersRegistry.initialize, (owner))
            )
        );
        irs = IdentityRegistryStorage(
            _deployProxy(
                address(new IdentityRegistryStorage()),
                abi.encodeCall(IdentityRegistryStorage.initialize, (owner))
            )
        );
        ir = IdentityRegistry(
            _deployProxy(
                address(new IdentityRegistry()),
                abi.encodeCall(
                    IdentityRegistry.initialize,
                    (owner, address(tir), address(ctr), address(irs))
                )
            )
        );

        // 2. Topics requis : KYC (obligatoire). On garde le set minimal pour les
        //    invariants ; les tests pays ajoutent le topic pays au besoin.
        ctr.addClaimTopic(Topics.KYC_AML);

        // 3. Trusted issuer (prestataire KYC) habilité KYC + pays
        claimIssuer = new MockClaimIssuer(kycSigner);
        uint256[] memory topics = new uint256[](2);
        topics[0] = Topics.KYC_AML;
        topics[1] = Topics.COUNTRY_OF_RESIDENCE;
        tir.addTrustedIssuer(IClaimIssuer(address(claimIssuer)), topics);

        // 4. Bind IR <-> IRS + agent
        irs.bindIdentityRegistry(address(ir));
        ir.addAgent(agent);
        irs.addAgent(agent);

        // 5. Compliance + modules
        mc = ModularCompliance(
            _deployProxy(
                address(new ModularCompliance()),
                abi.encodeCall(ModularCompliance.initialize, (owner))
            )
        );
        lockup = new LockUp24Module(owner);
        country = new CountryRestrictModule(owner);
        maxInv = new MaxInvestorsModule(owner);
        kyc = new KycRequiredModule(owner);

        // 6. Token (proxy) — 0 décimale : 1 token = 1 obligation
        token = SecurityToken(
            _deployProxy(
                address(new SecurityToken()),
                abi.encodeCall(
                    SecurityToken.initialize,
                    (
                        owner,
                        address(ir),
                        address(mc),
                        "SPV Haussmann Lyon6 Bond 2026",
                        "HSPV1",
                        0,
                        address(0)
                    )
                )
            )
        );

        // 7. Bind compliance -> token, puis modules -> compliance
        mc.bindToken(address(token));
        mc.addModule(address(lockup));
        mc.addModule(address(country));
        mc.addModule(address(maxInv));
        mc.addModule(address(kyc));

        // 8. Référence registre légal DEEP (miroir)
        token.setLegalRegistryReference(
            "FR0000000001", "https://deep.greffe.example/spv-haussmann-lyon6"
        );

        // 9. Agent sur le token (mint/burn/forcedTransfer/freeze)
        token.addAgent(agent);

        vm.stopPrank();

        // 10. Création des identités investisseurs + claims KYC (par le KYC signer)
        aliceId = _provisionInvestor(alice, FR, true);
        bobId = _provisionInvestor(bob, FR, true);
        carolId = _provisionInvestor(carol, US, true);
        // mallory : pas d'identité du tout -> non vérifiée

        // 11. Config modules par défaut (lock-up + pays + KYC pointant l'IR)
        vm.startPrank(owner);
        // Lock-up : 24 mois à partir de maintenant
        mc.callModuleFunction(
            abi.encodeCall(
                LockUp24Module.setReleaseTimestamp, (block.timestamp + lockup.DEFAULT_LOCKUP_DURATION())
            ),
            address(lockup)
        );
        // Pays : restreindre US, brancher l'IR sur le module pays
        mc.callModuleFunction(
            abi.encodeCall(CountryRestrictModule.setIdentityRegistry, (address(mc), address(ir))),
            address(country)
        );
        mc.callModuleFunction(
            abi.encodeCall(CountryRestrictModule.restrictCountry, (address(mc), US)),
            address(country)
        );
        // KYC module : pointer l'IR
        mc.callModuleFunction(
            abi.encodeCall(KycRequiredModule.setIdentityRegistry, (address(mc), address(ir))),
            address(kyc)
        );
        vm.stopPrank();
    }

    /// @dev Crée une ONCHAINID pour `wallet`, lui ajoute un claim KYC valide signé
    ///      par le trusted issuer, l'enregistre dans l'IdentityRegistry.
    function _provisionInvestor(address wallet, uint16 countryCode, bool withKyc)
        internal
        returns (MockIdentity id)
    {
        id = new MockIdentity(wallet);
        if (withKyc) {
            // Signature factice mais déterministe (le mock ne fait pas d'ECDSA).
            bytes memory sig = abi.encodePacked("kyc-sig-", wallet);
            vm.prank(kycSigner);
            id.addClaim(
                Topics.KYC_AML, 1, address(claimIssuer), sig, abi.encode(countryCode), "ipfs://kyc"
            );
        }
        vm.prank(agent);
        ir.registerIdentity(wallet, IIdentity(address(id)), countryCode);
    }

    /// @dev Helper : ajoute un claim PAYS (topic 11) à une identité existante.
    function _addCountryClaim(MockIdentity id, address wallet, uint16 countryCode) internal {
        bytes memory sig = abi.encodePacked("country-sig-", wallet);
        vm.prank(kycSigner);
        id.addClaim(
            Topics.COUNTRY_OF_RESIDENCE,
            1,
            address(claimIssuer),
            sig,
            abi.encode(countryCode),
            "ipfs://country"
        );
    }

    /// @dev Avance le temps au-delà du lock-up.
    function _passLockup() internal {
        vm.warp(block.timestamp + lockup.DEFAULT_LOCKUP_DURATION() + 1);
    }
}
