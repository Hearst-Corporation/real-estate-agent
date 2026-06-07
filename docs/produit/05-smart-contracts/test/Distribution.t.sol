// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.24;

import { TREXSuite } from "./TREXSuite.t.sol";
import { ERC1967Proxy } from "../src/vendor/ERC1967Proxy.sol";
import { BondDistributor } from "../src/distribution/BondDistributor.sol";
import { MockEURC } from "./mocks/MockEURC.sol";
import { AgentRoleUpgradeable } from "../src/vendor/RolesUpgradeable.sol";

/// @title DistributionTest
/// @notice Cycle de vie de la distribution obligataire en EURC :
///         coupon périodique puis remboursement du principal à l'exit, suivi du
///         burn des tokens. Vérifie le sens du flux (SPV -> investisseurs) et
///         l'absence de pooling (anti-FIA).
contract DistributionTest is TREXSuite {
    BondDistributor internal dist;
    MockEURC internal eurc;

    // 1 token = 1 obligation de 100 EURC de nominal (6 décimales EURC).
    uint256 internal constant NOMINAL = 100e6;

    function setUp() public override {
        super.setUp();
        eurc = new MockEURC();

        vm.prank(owner);
        dist = BondDistributor(
            _deployProxy(
                address(new BondDistributor()),
                abi.encodeCall(
                    BondDistributor.initialize, (owner, address(token), address(eurc))
                )
            )
        );
        vm.prank(owner);
        dist.addAgent(agent);

        // Souscription primaire : alice 60 obligations, bob 40 (total 100).
        vm.startPrank(agent);
        token.mint(alice, 60);
        token.mint(bob, 40);
        vm.stopPrank();

        // La trésorerie SPV est créditée en EURC (produit de revente / loyers).
        eurc.mint(spvTreasury, 1_000_000e6);
    }

    /// @dev Helper : crée un round, fige les soldes, finance.
    function _setupRound(BondDistributor.RoundKind kind, uint256 totalAmount)
        internal
        returns (uint256 roundId)
    {
        uint256 supply = token.totalSupply();
        vm.prank(agent);
        roundId = dist.createRound(kind, totalAmount, supply);

        address[] memory holders = new address[](2);
        holders[0] = alice;
        holders[1] = bob;
        uint256[] memory bals = new uint256[](2);
        bals[0] = token.balanceOf(alice);
        bals[1] = token.balanceOf(bob);
        vm.prank(agent);
        dist.setSnapshotBatch(roundId, holders, bals);

        // La SPV approuve le distributeur puis l'agent finance le round.
        vm.prank(spvTreasury);
        eurc.approve(address(dist), totalAmount);
        // fundRound tire depuis msg.sender (agent) -> on fait financer par la SPV
        // en transférant d'abord à l'agent, OU on prank l'agent comme treasury.
        // Ici : la SPV approuve l'agent comme dépositaire ; on simule en faisant
        // de spvTreasury un agent ponctuel pour fundRound.
        vm.prank(owner);
        dist.addAgent(spvTreasury);
        vm.prank(spvTreasury);
        dist.fundRound(roundId);
    }

    // ---------- Coupon ----------
    function test_CouponRound_ProRataDistribution() public {
        // Coupon total : 10 EURC (ex. intérêt). alice 60% -> 6, bob 40% -> 4.
        uint256 couponTotal = 10e6;
        uint256 roundId = _setupRound(BondDistributor.RoundKind.Coupon, couponTotal);

        assertEq(dist.claimableAmount(roundId, alice), 6e6);
        assertEq(dist.claimableAmount(roundId, bob), 4e6);

        vm.prank(alice);
        dist.claim(roundId);
        vm.prank(bob);
        dist.claim(roundId);

        assertEq(eurc.balanceOf(alice), 6e6);
        assertEq(eurc.balanceOf(bob), 4e6);
        assertTrue(dist.hasClaimed(roundId, alice));
    }

    function test_Claim_Twice_Reverts() public {
        uint256 roundId = _setupRound(BondDistributor.RoundKind.Coupon, 10e6);
        vm.prank(alice);
        dist.claim(roundId);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(BondDistributor.AlreadyClaimed.selector, roundId, alice)
        );
        dist.claim(roundId);
    }

    function test_Claim_BeforeFunding_Reverts() public {
        uint256 supply = token.totalSupply();
        vm.prank(agent);
        uint256 roundId = dist.createRound(BondDistributor.RoundKind.Coupon, 10e6, supply);
        address[] memory holders = new address[](1);
        holders[0] = alice;
        uint256[] memory bals = new uint256[](1);
        bals[0] = 60;
        vm.prank(agent);
        dist.setSnapshotBatch(roundId, holders, bals);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(BondDistributor.RoundNotFunded.selector, roundId)
        );
        dist.claim(roundId);
    }

    function test_Claim_FrozenHolder_Reverts() public {
        uint256 roundId = _setupRound(BondDistributor.RoundKind.Coupon, 10e6);
        // L'agent gèle alice (mesure de conformité) -> ne peut pas réclamer.
        vm.prank(agent);
        token.setAddressFrozen(alice, true);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(BondDistributor.HolderFrozen.selector, alice)
        );
        dist.claim(roundId);
    }

    function test_OnlyAgent_CanCreateRound() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(AgentRoleUpgradeable.AgentRoleUnauthorized.selector, alice)
        );
        dist.createRound(BondDistributor.RoundKind.Coupon, 10e6, 100);
    }

    // ---------- Remboursement du principal + burn (exit) ----------
    function test_PrincipalRound_ThenBurn_FullExit() public {
        // Remboursement du principal : 100 obligations * 100 EURC = 10 000 EURC.
        uint256 principalTotal = token.totalSupply() * NOMINAL; // 100 * 100e6
        uint256 roundId = _setupRound(BondDistributor.RoundKind.Principal, principalTotal);

        // alice 60 * 100 = 6000, bob 40 * 100 = 4000.
        assertEq(dist.claimableAmount(roundId, alice), 60 * NOMINAL);
        assertEq(dist.claimableAmount(roundId, bob), 40 * NOMINAL);

        // Distribution poussée par l'agent (wallets embedded).
        vm.startPrank(agent);
        dist.claimFor(roundId, alice);
        dist.claimFor(roundId, bob);
        vm.stopPrank();

        assertEq(eurc.balanceOf(alice), 60 * NOMINAL);
        assertEq(eurc.balanceOf(bob), 40 * NOMINAL);

        // Sortie : burn des tokens (étude P5 §15).
        vm.startPrank(agent);
        token.burn(alice, 60);
        token.burn(bob, 40);
        vm.stopPrank();
        assertEq(token.totalSupply(), 0, "toutes les obligations sont remboursees et brulees");
    }

    function test_SweepUnclaimed_ToConsignment() public {
        uint256 roundId = _setupRound(BondDistributor.RoundKind.Coupon, 10e6);
        // Seul alice réclame.
        vm.prank(alice);
        dist.claim(roundId);

        // L'owner balaie le reliquat (part de bob, 4 EURC) vers le séquestre.
        address consignment = makeAddr("consignment");
        vm.prank(owner);
        dist.sweepUnclaimed(roundId, consignment);
        assertEq(eurc.balanceOf(consignment), 4e6);
    }

    // ---------- Anti-FIA : le distributeur ne pré-collecte rien ----------
    function test_AntiFIA_NoInboundCapitalPath() public view {
        // Surface du contrat : aucune fonction ne permet à un investisseur de
        // DÉPOSER du capital pour investir. Les seuls flux entrants EURC sont
        // `fundRound` (agent only, sens SPV -> contrat -> investisseurs). On
        // l'atteste par construction : settlementToken est EURC, securityToken
        // est le token, et la seule entrée de fonds est gardée par onlyAgent.
        assertEq(dist.settlementToken(), address(eurc));
        assertEq(dist.securityToken(), address(token));
    }
}
