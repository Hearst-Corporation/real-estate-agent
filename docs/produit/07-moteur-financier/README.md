# Moteur de calcul financier des deals

> Domaine `docs/produit/07-moteur-financier/` — TypeScript pur, testé, déterministe.
> Fondation : `docs/etude-immobilier-tokenise-2026.md` (étude sourcée AMF/ESMA/EUR-Lex).

Ce moteur transforme les **inputs bruts d'une opération immobilière** (coûts,
financement, frais, calendrier, hypothèse de revente) en une **fiche deal
complète** (étude P7) + les **données des 11 graphiques** (étude P8), sans aucun
recalcul côté UI.

## Cadre réglementaire encodé (contraintes VERROUILLÉES)

Le modèle financier découle directement des recadrages de l'étude. Il est
**structurellement anti-FIA** :

| Contrainte étude | Traduction dans le moteur |
|---|---|
| L'investisseur est **créancier obligataire**, pas co-investisseur d'un pool (P2, P3, P15) | Le rendement de l'investisseur = **coupon + remboursement du principal**. L'upside illimité va à l'**equity sponsor** (dernier servi). Aucun partage de résultat mutualisé. |
| **1 SPV = 1 opération** ; pas de NAV globale, pas de rebalancing (anti-FIA SAN-2025-08) | Le moteur calcule **un deal isolé** à la fois. Aucune notion de portefeuille, de pooling ou de NAV agrégée. |
| **Distribution variable**, jamais garantie (P6 : « interdit de promettre un taux ») | Tous les rendements sont des **CIBLES**. Le coupon est le coupon *contractuel cible* ; son versement reste **plafonné par le solde disponible** dans le waterfall. |
| **Dette senior bancaire** prêtée à la SAS, jamais au smart contract (P11) | Le senior est le **1er servi** dans le waterfall ; subordination des obligations (intercreditor). |
| **Règlement EUR** par défaut (P10) | Tous les montants sont en **euros** (champs `*_eur`). |

> Le moteur ne « sélectionne » jamais discrétionnairement à la place de
> l'investisseur : il **chiffre** un deal que l'investisseur choisit lui-même
> (choix deal-by-deal réel, P2).

## Architecture (fonctions pures, zéro IO)

> ⚠️ Implémentation vivante : [`lib/invest/finance/`](../../../lib/invest/finance/). Ce README reste la spec/blueprint ; le code (et ses tests, ramassés par vitest) vit désormais dans `lib/invest/finance/`.

```
types.ts                 ── data contracts (inputs + 11 graph contracts + DealSheet)
dates.ts                 ── utilitaires date ISO/UTC (year fraction ACT/365…)
irr.ts                   ── TRI/XIRR : Newton-Raphson + fallback bissection
waterfall.ts             ── cascade de distribution (senior → oblig → frais → carried → equity)
metrics.ts               ── LTV, LTC, DSCR, marge marchand, use of funds, skin
scenarios.ts             ── pess/central/opt + sensibilités prix & retard + point mort
cashflow-projection.ts   ── trésorerie mensuelle projet (J-curve, graph 8)
charts.ts                ── générateurs des 11 graphiques (P8)
deal-engine.ts           ── ORCHESTRATEUR : buildDealSheet() = point d'entrée unique
fixtures.ts              ── Résidence Haussmann (P7) + variantes locatif / dégradé
index.ts                 ── barrel d'export
*.test.ts                ── 89 tests unitaires (cas chiffrés vérifiables à la main)
```

Aucun fichier n'effectue d'accès réseau, de lecture disque ni d'appel LLM.
Tout est **100 % déterministe** : deux appels identiques produisent un résultat
strictement égal (testé).

## Usage

```ts
import { buildDealSheet, RESIDENCE_HAUSSMANN } from '@/lib/invest/finance';

const sheet = buildDealSheet(RESIDENCE_HAUSSMANN);

sheet.metrics.ltv;                       // 0.5794  (LTV ~58 %)
sheet.rendement_cible_irr;               // 0.0869  (TRI cible central, NON GARANTI)
sheet.charts.g3_waterfall.steps;         // cascade prête à tracer
sheet.charts.g6_sensibilite_prix.point_mort_x; // -0.1998 (le prix peut chuter ~20 %)
sheet.warnings;                          // [] si nominal, sinon alertes de cohérence
```

`DealSheet` contient : `metrics`, les 3 `scenarios`, `rendement_cible_irr`, les
11 `charts` et les `warnings`. C'est tout ce dont l'UI a besoin.

## Le waterfall de distribution (cœur du modèle)

Ordre de paiement à l'exit, **strictement** celui de l'étude P7 :

```
PRODUIT DE REVENTE
   1.   Remboursement principal dette senior          (1er rang, hypothèque)
   1bis. Intérêts dette senior
   2.   Remboursement principal obligataire           ← investisseurs token holders
   3.   Coupon obligataire (cible)                     ← investisseurs token holders
   4a.  Frais plateforme  (1 % entrée + 0,5 %/an admin)
   4b.  Frais opérateur   (2 % acquisition)
   5.   Carried opérateur (20 % de la sur-performance AU-DELÀ du hurdle 8 %)
   6.   Solde → equity sponsor                         (dernier servi, upside)
```

**Subordination réelle** : chaque étage est servi `min(dû, solde disponible)`.
Si le produit manque, l'étage subit un `shortfall` et les étages suivants
reçoivent 0. Le senior passe **avant** l'obligataire, l'obligataire **avant**
l'equity.

**Carried sur hurdle** (point subtil) : le carried n'est PAS prélevé sur tout le
résiduel, mais uniquement sur la sur-performance au-delà du return préférentiel
du sponsor :

```
seuil_hurdle = equity_sponsor × (1 + hurdle_annuel × durée/12)
surplus      = max(0, equity_value_avant_carried − seuil_hurdle)
carried      = carried_pct × surplus
```

## TRI / IRR

`computeIrr(flows)` résout le **XIRR daté** (flux à dates quelconques) :

```
NPV(r) = Σ_i  CF_i / (1 + r)^t_i = 0      (t_i en années depuis t0, ACT/365)
```

Stratégie de résolution :
1. **Newton-Raphson** (convergence quadratique) avec 4 amorces successives.
2. **Fallback bissection** sur `[-99,99 %, +1000 %]` — robuste, garantit la
   racine dès qu'il y a un changement de signe de la VAN (cas standard d'un
   investissement : décaissement initial négatif puis encaissements positifs).

Le résultat (`IrrResult`) porte la méthode utilisée, le nombre d'itérations, la
VAN résiduelle et un flag `converge`. `irr = null` si aucun TRI n'existe (perte
totale, flux tous de même signe…).

## Exemple chiffré de référence — « Résidence Haussmann » (étude P7)

Inputs (`fixtures.RESIDENCE_HAUSSMANN`) :

| Poste | Montant |
|---|---|
| Prix d'acquisition | 1 800 000 € |
| Frais de notaire | 130 000 € |
| Budget travaux | 420 000 € |
| Frais divers / portage | 90 000 € |
| **Coût total** | **2 440 000 €** |
| Dette senior (4,5 %/an) | 1 460 000 € |
| Equity sponsor | 240 000 € |
| Obligations (coupon cible 9 %/an) | 740 000 € |
| Valeur expertisée | 2 520 000 € |
| Prix de revente central | 2 900 000 € |
| Durée | 22 mois |

Sorties calculées par le moteur (vérifiées par les tests) :

| Indicateur | Valeur |
|---|---|
| LTV | **57,94 %** (≈ « ~58 % » de l'étude) |
| LTC | 59,84 % (≈ « ~60 % ») |
| Marge marchand | 460 000 € soit **18,85 %** |
| Skin in the game | 9,84 % (≈ « ~10 % ») |
| **TRI central (cible, NON GARANTI)** | **8,69 %** |
| TRI pessimiste (−8 % prix, +3 mois) | 8,59 % |
| TRI optimiste (+5 % prix) | 8,69 % (plafonné — créancier) |
| Point mort prix (TRI = 0) | **−19,98 %** |
| Multiple obligataire central | 1,165× (862 100 € / 740 000 €) |

### Deux comportements à comprendre (et testés)

1. **Le rendement obligataire est plafonné à la hausse.** Optimiste = central
   (8,69 %) : une fois le principal + le coupon intégralement servis, le surplus
   va à l'**equity sponsor**, pas à l'investisseur. C'est la signature
   économique d'une **créance** (vs une part d'equity), donc la traduction
   chiffrée du modèle anti-FIA.

2. **Retard ≠ baisse de prix.** Le scénario pessimiste a un rendement *total*
   (18,75 %) **supérieur** au central (16,50 %), car les 3 mois de retard
   accumulent plus de coupon en valeur absolue. Mais le **TRI annualisé** est
   **plus faible** (8,59 % < 8,69 %) : c'est le **coût du temps**. Le moteur
   distingue rigoureusement rendement total simple et TRI annualisé.

## Les 11 graphiques (étude P8)

Chaque contrat est *self-contained* (données + libellé + interprétation FR).
La couche UI (Cockpit / `<hearst-asset>`) n'a **aucune** logique financière.

| # | Champ `DealCharts` | Type | Source |
|---|---|---|---|
| 1 | `g1_dette_equity` | donut | répartition dette / obligations / equity |
| 2 | `g2_use_of_funds` | barres empilées | postes de coût |
| 3 | `g3_waterfall` | cascade | étages du waterfall central |
| 4 | `g4_gantt` | gantt | jalons opérationnels datés |
| 5 | `g5_scenarios` | barres groupées | TRI pess/central/opt |
| 6 | `g6_sensibilite_prix` | courbe | rendement = f(prix de revente) + point mort |
| 7 | `g7_sensibilite_retard` | courbe | rendement = f(retard travaux) |
| 8 | `g8_cashflow` | aires | trésorerie mensuelle projet (J-curve) |
| 9 | `g9_risque` | radar | 6 notes /5 dérivées des métriques |
| 10 | `g10_ltv` | jauge | LTV + seuils 60/70/80 % |
| 11 | `g11_marge_marchand` | barre + ligne | marge vs seuil de fragilité 10 % |

## Warnings de cohérence

`buildDealSheet` lève des avertissements **non bloquants** : financement
déséquilibré, LTV > 80 %, marge < 10 %, DSCR < 1,2 (locatif), perte en capital
obligataire au scénario pessimiste, skin in the game < 5 %. Ce sont des
garde-fous de saisie, pas un avis d'investissement.

## Tests

```bash
npx vitest run lib/invest/finance                 # 89 tests
npm test                                            # suite complète (sans régression)
```

Couverture : cas analytiques du TRI (doublement = 100 %, +10 % = 10 %, demi-année
≈ 21 %…), waterfall ligne par ligne sur Haussmann, subordination sous stress
(perte partielle / totale), carried sous/au-dessus du hurdle, sensibilités,
point mort, garde-fous division par zéro, déterminisme, variantes locatif et
dégradé.

## Limites & extensions documentées

- **Coupons in fine** : le modèle verse le coupon total à l'exit (conservateur
  pour le locatif, exact pour le marchand de biens / promotion — étude P6).
  Pour étaler des coupons périodiques locatifs, enrichir
  `scenarios.cashflowsInvestisseur` (les flux datés alimentent déjà le XIRR).
- **Intérêts simples** (senior + coupon) cohérents avec un horizon court (< 36
  mois) et un remboursement in fine. Passer en composé est trivial si besoin.
- **Aucun régime fiscal appliqué** : l'étude (P13) rappelle que la tokenisation
  ne crée aucun régime fiscal distinct ; le PFU/IFI relèvent de l'affichage
  investisseur, pas du moteur de structuration du deal.
- **Aucune garantie de rendement** : par construction réglementaire (P6).
