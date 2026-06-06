// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.24;

import { TREXSuite } from "./TREXSuite.t.sol";
import { SecurityToken } from "../src/token/SecurityToken.sol";
import { SecurityTokenV2 } from "./mocks/SecurityTokenV2.sol";
import { UUPSUpgradeable } from "../src/vendor/UUPSUpgradeable.sol";
import { OwnableUpgradeable } from "../src/vendor/RolesUpgradeable.sol";

/// @title UpgradeabilityTest
/// @notice Valide l'upgradeabilité UUPS : seul le owner peut upgrader, et le
///         storage (soldes, ISIN DEEP, registres) survit à l'upgrade. Critique
///         pour faire évoluer la conformité sans casser le miroir DEEP.
contract UpgradeabilityTest is TREXSuite {
    function test_Upgrade_PreservesState_AndAddsBehavior() public {
        // État pré-upgrade : on mint et on lit l'ISIN.
        vm.prank(agent);
        token.mint(alice, 123);
        assertEq(token.balanceOf(alice), 123);
        assertEq(token.isin(), "FR0000000001");

        // Upgrade vers V2 (owner).
        SecurityTokenV2 v2impl = new SecurityTokenV2();
        vm.prank(owner);
        UUPSUpgradeable(address(token)).upgradeToAndCall(address(v2impl), "");

        // Le storage est conservé.
        assertEq(token.balanceOf(alice), 123, "solde conserve apres upgrade");
        assertEq(token.isin(), "FR0000000001", "ISIN DEEP conserve");

        // Le nouveau comportement est disponible.
        assertEq(SecurityTokenV2(address(token)).tokenStandard(), "ERC-3643-v2");
    }

    function test_Upgrade_OnlyOwner() public {
        SecurityTokenV2 v2impl = new SecurityTokenV2();
        vm.prank(agent); // agent n'est pas owner
        vm.expectRevert(
            abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, agent)
        );
        UUPSUpgradeable(address(token)).upgradeToAndCall(address(v2impl), "");
    }

    function test_Upgrade_RejectsNonUUPSImplementation() public {
        // Une adresse qui n'implémente pas proxiableUUID() -> rejet.
        // On utilise le MockEURC-like : ici on prend l'IdentityRegistryStorage
        // qui EST UUPS, donc valide ; pour tester le rejet on prend un EOA-like
        // (adresse sans code valide) : on déploie un contrat trivial non-UUPS.
        NonUUPS bad = new NonUUPS();
        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(
                UUPSUpgradeable.UUPSInvalidImplementation.selector, address(bad)
            )
        );
        UUPSUpgradeable(address(token)).upgradeToAndCall(address(bad), "");
    }

    function test_Implementation_CannotBeInitializedDirectly() public {
        // L'implémentation (hors proxy) a ses initializers désactivés.
        SecurityToken impl = new SecurityToken();
        vm.expectRevert(); // InvalidInitialization
        impl.initialize(owner, address(ir), address(mc), "x", "x", 0, address(0));
    }
}

/// @dev Contrat trivial sans proxiableUUID -> doit être rejeté par l'upgrade UUPS.
contract NonUUPS {
    function foo() external pure returns (uint256) {
        return 42;
    }
}
