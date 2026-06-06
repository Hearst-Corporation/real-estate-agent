// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.24;

import { TREXSuite } from "./TREXSuite.t.sol";
import { SecurityToken } from "../src/token/SecurityToken.sol";

/// @title FuzzTest
/// @notice Tests à entrées aléatoires (fuzzing) renforçant les invariants clés.
contract FuzzTest is TREXSuite {
    /// @notice INVARIANT KYC sous fuzzing : pour TOUT montant non nul, un
    ///         transfert vers un wallet non enregistré (donc non vérifié) échoue.
    function testFuzz_TransferToNonKyc_AlwaysReverts(uint256 amount, address rando) public {
        // Exclure les wallets déjà KYC du setUp et l'adresse zéro.
        vm.assume(rando != alice && rando != bob && rando != carol);
        vm.assume(rando != address(0));
        vm.assume(!ir.contains(rando)); // rando n'est pas enregistré
        amount = bound(amount, 1, 1_000_000);

        vm.prank(agent);
        token.mint(alice, amount);
        _passLockup();

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(SecurityToken.TransferNotPossible_NotVerified.selector, rando)
        );
        token.transfer(rando, amount);
    }

    /// @notice Conservation comptable : après un transfert valide alice->bob de
    ///         `amount`, la somme des soldes et le totalSupply sont conservés.
    function testFuzz_Transfer_ConservesSupply(uint256 mintAmt, uint256 xfer) public {
        mintAmt = bound(mintAmt, 1, 1_000_000);
        xfer = bound(xfer, 0, mintAmt);

        vm.prank(agent);
        token.mint(alice, mintAmt);
        _passLockup();

        uint256 supplyBefore = token.totalSupply();
        uint256 sumBefore = token.balanceOf(alice) + token.balanceOf(bob);

        if (xfer == 0) {
            // Un transfert de 0 est permis (ERC-20) et ne change rien.
            vm.prank(alice);
            token.transfer(bob, 0);
        } else {
            vm.prank(alice);
            token.transfer(bob, xfer);
        }

        assertEq(token.totalSupply(), supplyBefore, "supply conserve");
        assertEq(
            token.balanceOf(alice) + token.balanceOf(bob), sumBefore, "somme des soldes conservee"
        );
        assertEq(token.balanceOf(bob), xfer);
    }

    /// @notice Le solde gelé ne peut JAMAIS dépasser le solde total (invariant
    ///         de sûreté du gel partiel).
    function testFuzz_FrozenNeverExceedsBalance(uint256 mintAmt, uint256 freezeAmt) public {
        mintAmt = bound(mintAmt, 1, 1_000_000);
        vm.prank(agent);
        token.mint(alice, mintAmt);

        freezeAmt = bound(freezeAmt, 0, mintAmt);
        if (freezeAmt > 0) {
            vm.prank(agent);
            token.freezePartialTokens(alice, freezeAmt);
        }
        assertLe(token.getFrozenTokens(alice), token.balanceOf(alice));
    }
}
