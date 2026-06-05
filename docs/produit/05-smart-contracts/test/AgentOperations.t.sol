// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.24;

import { TREXSuite } from "./TREXSuite.t.sol";
import { SecurityToken } from "../src/token/SecurityToken.sol";
import { IIdentity } from "../src/identity/IIdentity.sol";
import { MockIdentity } from "./mocks/MockOnchainID.sol";
import { AgentRoleUpgradeable } from "../src/vendor/RolesUpgradeable.sol";
import { PausableUpgradeable } from "../src/vendor/PausableUpgradeable.sol";

/// @title AgentOperations
/// @notice Tests des pouvoirs d'AGENT/OWNER : mint/burn, forcedTransfer/clawback,
///         gel, pause, recovery. Ces pouvoirs servent le MIROIR DEEP (le registre
///         légal prime) et les sûretés (étude P11).
contract AgentOperationsTest is TREXSuite {
    // ---------- Contrôle d'accès ----------
    function test_OnlyAgent_CanMint() public {
        vm.prank(alice); // pas agent
        vm.expectRevert(
            abi.encodeWithSelector(AgentRoleUpgradeable.AgentRoleUnauthorized.selector, alice)
        );
        token.mint(alice, 100);
    }

    function test_OnlyAgent_CanForcedTransfer() public {
        vm.prank(agent);
        token.mint(alice, 100);
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(AgentRoleUpgradeable.AgentRoleUnauthorized.selector, bob)
        );
        token.forcedTransfer(alice, bob, 10);
    }

    // ---------- Mint / Burn ----------
    function test_Mint_IncreasesSupplyAndBalance() public {
        vm.prank(agent);
        token.mint(alice, 250);
        assertEq(token.totalSupply(), 250);
        assertEq(token.balanceOf(alice), 250);
    }

    function test_Burn_AtExit_DecreasesSupply() public {
        vm.prank(agent);
        token.mint(alice, 250);
        // Remboursement à l'exit : burn (étude P5 §15 "burn du token").
        vm.prank(agent);
        token.burn(alice, 250);
        assertEq(token.totalSupply(), 0);
        assertEq(token.balanceOf(alice), 0);
    }

    function test_Burn_AutoUnfreezesIfNeeded() public {
        vm.prank(agent);
        token.mint(alice, 100);
        // On gèle 60 tokens.
        vm.prank(agent);
        token.freezePartialTokens(alice, 60);
        assertEq(token.getFrozenTokens(alice), 60);

        // Burn de 100 (remboursement total à l'exit) : doit dégeler ce qu'il faut.
        vm.prank(agent);
        token.burn(alice, 100);
        assertEq(token.balanceOf(alice), 0);
        assertEq(token.getFrozenTokens(alice), 0);
    }

    // ---------- forcedTransfer / clawback ----------
    function test_ForcedTransfer_BypassesLockup() public {
        vm.prank(agent);
        token.mint(alice, 100);
        // Pendant le lock-up, un transfert normal est interdit, mais le
        // forcedTransfer (décision de justice / nantissement / sync DEEP) passe.
        assertGt(block.timestamp, 0);
        vm.prank(agent);
        bool ok = token.forcedTransfer(alice, bob, 30);
        assertTrue(ok);
        assertEq(token.balanceOf(alice), 70);
        assertEq(token.balanceOf(bob), 30);
    }

    function test_ForcedTransfer_StillRequiresRecipientKyc() public {
        vm.prank(agent);
        token.mint(alice, 100);
        // Clawback vers un wallet NON-KYC : interdit (on ne sort jamais hors du
        // périmètre éligible, même en forcé).
        vm.prank(agent);
        vm.expectRevert(
            abi.encodeWithSelector(SecurityToken.TransferNotPossible_NotVerified.selector, mallory)
        );
        token.forcedTransfer(alice, mallory, 10);
    }

    function test_ForcedTransfer_OverFrozenTokens_AutoUnfreezes() public {
        vm.prank(agent);
        token.mint(alice, 100);
        vm.prank(agent);
        token.freezePartialTokens(alice, 80); // 20 libres, 80 gelés
        // forcedTransfer de 90 : 20 libres + dégel auto de 70 = 90 ; reste gelé 10.
        vm.prank(agent);
        token.forcedTransfer(alice, bob, 90);
        assertEq(token.balanceOf(alice), 10);
        assertEq(token.balanceOf(bob), 90);
        assertEq(token.getFrozenTokens(alice), 10); // 80 - 70 dégelés
    }

    // ---------- Gel ----------
    function test_FrozenAddress_CannotSendOrReceive() public {
        vm.prank(agent);
        token.mint(alice, 100);
        _passLockup();

        // Gel total de bob (destinataire).
        vm.prank(agent);
        token.setAddressFrozen(bob, true);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(SecurityToken.TransferNotPossible_Frozen.selector, bob)
        );
        token.transfer(bob, 10);

        // Gel d'alice (émettrice).
        vm.prank(agent);
        token.setAddressFrozen(alice, true);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(SecurityToken.TransferNotPossible_Frozen.selector, alice)
        );
        token.transfer(carol, 10);
    }

    function test_PartialFreeze_BlocksOnlyFrozenPortion() public {
        vm.prank(agent);
        token.mint(alice, 100);
        _passLockup();
        vm.prank(agent);
        token.freezePartialTokens(alice, 70); // 30 libres

        // Transfert de 30 : OK.
        vm.prank(alice);
        assertTrue(token.transfer(bob, 30));

        // Transfert de 1 de plus : plus de tokens libres -> revert.
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                SecurityToken.TransferNotPossible_InsufficientUnfrozen.selector, alice, 1, 0
            )
        );
        token.transfer(bob, 1);
    }

    // ---------- Pause ----------
    function test_Pause_BlocksAllTransfers() public {
        vm.prank(agent);
        token.mint(alice, 100);
        _passLockup();

        vm.prank(agent);
        token.pause();
        assertTrue(token.paused());

        vm.prank(alice);
        vm.expectRevert(PausableUpgradeable.EnforcedPause.selector);
        token.transfer(bob, 10);

        // Unpause -> transfert de nouveau possible.
        vm.prank(agent);
        token.unpause();
        vm.prank(alice);
        assertTrue(token.transfer(bob, 10));
    }

    // ---------- Recovery (wallet perdu) ----------
    function test_RecoveryAddress_MovesBalanceToNewWalletSameOnchainID() public {
        vm.prank(agent);
        token.mint(alice, 100);
        vm.prank(agent);
        token.freezePartialTokens(alice, 40);

        // Nouveau wallet d'alice, rattaché à la MÊME ONCHAINID (aliceId).
        address aliceNew = makeAddr("aliceNew");
        vm.prank(agent);
        ir.registerIdentity(aliceNew, IIdentity(address(aliceId)), FR);

        vm.prank(agent);
        bool ok = token.recoveryAddress(alice, aliceNew, address(aliceId));
        assertTrue(ok);
        assertEq(token.balanceOf(alice), 0);
        assertEq(token.balanceOf(aliceNew), 100);
        // Le gel partiel est reporté.
        assertEq(token.getFrozenTokens(aliceNew), 40);
    }

    function test_RecoveryAddress_WrongOnchainID_Reverts() public {
        vm.prank(agent);
        token.mint(alice, 100);
        address attacker = makeAddr("attacker");
        // attacker a sa propre identité, PAS celle d'alice.
        MockIdentity attackerId = _provisionInvestor(attacker, FR, true);

        vm.prank(agent);
        vm.expectRevert(SecurityToken.InvalidRecovery.selector);
        // On tente de récupérer les fonds d'alice vers attacker en prétendant
        // l'ONCHAINID d'alice, mais attacker est rattaché à attackerId.
        token.recoveryAddress(alice, attacker, address(aliceId));
        // (silence unused) :
        attackerId;
    }

    // ---------- Ownership 2-step ----------
    function test_Ownership_TwoStepTransfer() public {
        address newOwner = makeAddr("newOwner");
        vm.prank(owner);
        token.transferOwnership(newOwner);
        assertEq(token.pendingOwner(), newOwner);
        assertEq(token.owner(), owner); // pas encore transféré

        vm.prank(newOwner);
        token.acceptOwnership();
        assertEq(token.owner(), newOwner);
        assertEq(token.pendingOwner(), address(0));
    }

    // ---------- Référence DEEP ----------
    function test_LegalRegistryReference_IsSet() public view {
        assertEq(token.isin(), "FR0000000001");
        assertEq(
            token.legalRegistryURI(), "https://deep.greffe.example/spv-haussmann-lyon6"
        );
    }
}
