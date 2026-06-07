// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.24;

import { TREXSuite } from "./TREXSuite.t.sol";
import { SecurityToken } from "../src/token/SecurityToken.sol";
import { MaxInvestorsModule } from "../src/compliance/modules/MaxInvestorsModule.sol";

/// @title ComplianceInvariants
/// @notice INVARIANTS DE CONFORMITÉ — c'est le cœur de la mission. Chaque test
///         encode une règle réglementaire de l'étude et prouve qu'elle est
///         appliquée on-chain.
contract ComplianceInvariantsTest is TREXSuite {
    // ================================================================
    // INVARIANT 1 — KYC OBLIGATOIRE : transfert vers wallet non-KYC ÉCHOUE
    // (étude P5 §2, P9 isVerified). C'est l'invariant explicitement demandé.
    // ================================================================
    function test_Invariant_TransferToNonKyc_Reverts() public {
        // Alice reçoit des tokens au mint (elle est KYC).
        vm.prank(agent);
        token.mint(alice, 100);
        _passLockup(); // on isole l'invariant KYC du lock-up

        // mallory n'a AUCUNE identité -> isVerified == false.
        assertFalse(ir.isVerified(mallory), "mallory ne doit pas etre verifiee");

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(SecurityToken.TransferNotPossible_NotVerified.selector, mallory)
        );
        token.transfer(mallory, 10);
    }

    function test_Invariant_MintToNonKyc_Reverts() public {
        vm.prank(agent);
        vm.expectRevert(
            abi.encodeWithSelector(SecurityToken.MintToNonVerified.selector, mallory)
        );
        token.mint(mallory, 100);
    }

    function test_Invariant_TransferBetweenKyc_Succeeds_AfterLockup() public {
        vm.prank(agent);
        token.mint(alice, 100);
        _passLockup();

        vm.prank(alice);
        bool ok = token.transfer(bob, 40);
        assertTrue(ok);
        assertEq(token.balanceOf(alice), 60);
        assertEq(token.balanceOf(bob), 40);
    }

    // ================================================================
    // INVARIANT 2 — LOCK-UP : aucun transfert secondaire avant l'échéance
    // (étude P6 badge lock-up 24m, P7). Mint/burn restent permis (primaire/exit).
    // ================================================================
    function test_Invariant_TransferDuringLockup_Reverts() public {
        vm.prank(agent);
        token.mint(alice, 100); // mint pendant lock-up : OK (souscription)

        assertEq(token.balanceOf(alice), 100, "le mint primaire doit passer");

        // transfert secondaire pendant le lock-up : refusé par la compliance.
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                SecurityToken.TransferNotPossible_Compliance.selector, alice, bob, 10
            )
        );
        token.transfer(bob, 10);
    }

    function test_Invariant_TransferAfterLockup_Succeeds() public {
        vm.prank(agent);
        token.mint(alice, 100);
        _passLockup();
        vm.prank(alice);
        assertTrue(token.transfer(bob, 10));
    }

    // ================================================================
    // INVARIANT 3 — RESTRICTION DE JURIDICTION : destinataire d'un pays
    // restreint (US sans Reg S) ÉCHOUE, même KYC, même après lock-up.
    // (étude P9, comparable RealT Reg D + Reg S)
    // ================================================================
    function test_Invariant_TransferToRestrictedCountry_Reverts() public {
        vm.prank(agent);
        token.mint(alice, 100);
        _passLockup();

        // carol est KYC mais résidente US (pays restreint dans setUp).
        assertTrue(ir.isVerified(carol), "carol est KYC");
        assertEq(ir.investorCountry(carol), US);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                SecurityToken.TransferNotPossible_Compliance.selector, alice, carol, 10
            )
        );
        token.transfer(carol, 10);
    }

    /// @dev Documentation d'un choix d'architecture : le MINT primaire ne passe
    ///      PAS par `canTransfer` (donc pas par le module pays). Le contrôle de
    ///      juridiction à la souscription est fait off-chain (back-office /
    ///      séquestre), AVANT le mint. La barrière pays on-chain s'applique aux
    ///      TRANSFERTS SECONDAIRES (test ci-dessus). Ce test fige ce comportement.
    function test_MintToRestrictedCountry_TechnicallySucceeds_ButSecondaryBlocked() public {
        // carol (US) est KYC : le mint réussit techniquement...
        vm.prank(agent);
        token.mint(carol, 10);
        assertEq(token.balanceOf(carol), 10);

        // ...mais elle ne peut RIEN recevoir d'un autre holder en secondaire.
        vm.prank(agent);
        token.mint(alice, 100);
        _passLockup();
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                SecurityToken.TransferNotPossible_Compliance.selector, alice, carol, 1
            )
        );
        token.transfer(carol, 1);
    }

    function test_CountryUnrestrict_AllowsTransfer() public {
        vm.prank(agent);
        token.mint(alice, 100);
        _passLockup();

        // On lève la restriction US.
        vm.prank(owner);
        mc.callModuleFunction(
            abi.encodeWithSignature("unrestrictCountry(address,uint16)", address(mc), US),
            address(country)
        );

        vm.prank(alice);
        assertTrue(token.transfer(carol, 10));
        assertEq(token.balanceOf(carol), 10);
    }

    // ================================================================
    // INVARIANT 4 — PLAFOND D'INVESTISSEURS : impossible de dépasser le cap
    // (étude P13 : < 150 par État en placement privé). On fixe cap=2.
    // ================================================================
    function test_Invariant_MaxInvestorsCap_Enforced() public {
        // Fixe le plafond à 2 holders.
        vm.prank(owner);
        mc.callModuleFunction(
            abi.encodeCall(MaxInvestorsModule.setMaxInvestors, (address(mc), 2)), address(maxInv)
        );

        // mint vers alice (1 holder) et bob (2 holders) : OK.
        vm.startPrank(agent);
        token.mint(alice, 100);
        token.mint(bob, 100);
        vm.stopPrank();
        assertEq(maxInv.currentInvestorCount(address(mc)), 2);

        _passLockup();

        // alice tente de transférer à un 3e holder (carol est US, prenons plutôt
        // un nouveau FR). On provisionne dave en FR.
        address dave = makeAddr("dave");
        _provisionInvestor(dave, FR, true);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                SecurityToken.TransferNotPossible_Compliance.selector, alice, dave, 10
            )
        );
        token.transfer(dave, 10);
    }

    function test_MaxInvestors_TransferToExistingHolder_OK() public {
        vm.prank(owner);
        mc.callModuleFunction(
            abi.encodeCall(MaxInvestorsModule.setMaxInvestors, (address(mc), 2)), address(maxInv)
        );
        vm.startPrank(agent);
        token.mint(alice, 100);
        token.mint(bob, 100);
        vm.stopPrank();
        _passLockup();

        // alice -> bob (holder existant) : pas de nouveau holder, OK même au cap.
        vm.prank(alice);
        assertTrue(token.transfer(bob, 10));
        assertEq(token.balanceOf(bob), 110);
    }

    function test_MaxInvestors_HolderCountDecrementsOnFullTransfer() public {
        vm.prank(owner);
        mc.callModuleFunction(
            abi.encodeCall(MaxInvestorsModule.setMaxInvestors, (address(mc), 3)), address(maxInv)
        );
        vm.startPrank(agent);
        token.mint(alice, 100);
        token.mint(bob, 50);
        vm.stopPrank();
        assertEq(maxInv.currentInvestorCount(address(mc)), 2);
        _passLockup();

        // alice transfère TOUT à bob -> alice sort, bob reste : count = 1.
        vm.prank(alice);
        token.transfer(bob, 100);
        assertEq(maxInv.currentInvestorCount(address(mc)), 1, "alice doit avoir quitte la cap table");
        assertEq(token.balanceOf(alice), 0);
    }

    // ================================================================
    // INVARIANT 5 — RÉVOCATION KYC : si le claim KYC d'alice est révoqué,
    // elle redevient non vérifiée et ne peut PLUS recevoir (LCB-FT, sanction).
    // ================================================================
    function test_Invariant_KycRevocation_BlocksReceiving() public {
        vm.prank(agent);
        token.mint(alice, 100);
        _passLockup();

        // bob est KYC, transfert OK initialement.
        vm.prank(alice);
        token.transfer(bob, 10);
        assertEq(token.balanceOf(bob), 10);

        // On révoque le claim KYC de bob.
        bytes memory bobSig = abi.encodePacked("kyc-sig-", bob);
        vm.prank(kycSigner);
        claimIssuer.revokeClaimBySignature(bobSig);

        assertFalse(ir.isVerified(bob), "bob doit etre non-verifie apres revocation");

        // Nouveau transfert vers bob : refusé (KYC invalide).
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(SecurityToken.TransferNotPossible_NotVerified.selector, bob)
        );
        token.transfer(bob, 5);
    }
}
