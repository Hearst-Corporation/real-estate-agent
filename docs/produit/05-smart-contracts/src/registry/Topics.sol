// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.24;

/// @title Topics
/// @notice Constantes des topics de claim ONCHAINID utilisés par le produit.
///         Centralisées ici pour éviter les "magic numbers" (cf. CLAUDE.md :
///         "Pas de magic numbers"). Le topic est un uint256 conventionnel ;
///         on documente le mapping métier <-> réalité KYC.
library Topics {
    /// @notice KYC/AML complet (LCB-FT) — pièce d'identité + selfie + origine
    ///         des fonds vérifiés par le prestataire. OBLIGATOIRE pour tout
    ///         transfert (étude P5 §2, P10 LCB-FT renforcé).
    uint256 internal constant KYC_AML = 1;

    /// @notice Investisseur éligible : a passé le test de connaissance ECSP
    ///         (non-averti) OU est qualifié/professionnel (averti). Étude P5 §4.
    uint256 internal constant INVESTOR_ELIGIBILITY = 10;

    /// @notice Pays de résidence attesté (ISO-3166 numérique encodé dans le claim
    ///         data). Consommé par le module de restriction de juridiction.
    uint256 internal constant COUNTRY_OF_RESIDENCE = 11;
}
