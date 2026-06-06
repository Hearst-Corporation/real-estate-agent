# 00 — BLUEPRINT PRODUIT UNIFIÉ

## Plateforme Web3 d'investissement immobilier tokenisé sans licence de gestion de fonds — FR / UE

> **Statut.** Document maître. Réconcilie les 10 livrables de domaine (`01`→`10`) en un produit unique, cohérent et **construisible**. Source de vérité amont unique : [`docs/etude-immobilier-tokenise-2026.md`](../etude-immobilier-tokenise-2026.md). Tout en découle.
> **Convention de tags juridiques.** `[FAIT]` = norme/décision citée dans l'étude · `[ANALYSE]` = raisonnement · `[HYPOTHÈSE]` = zone grise / chiffre à valider. **Aucun rendement garanti.** Ceci n'est PAS un conseil juridique : la frontière FIA est casuistique (approche économique AMF) — validation avocat AIFM indispensable avant toute mise en production.
> **Marque de travail.** **TITRO** (retenue par le domaine Vision ; réserve : PIERVAL pour une gamme patrimoniale FR future). Disponibilité INPI/EUIPO + domaines à vérifier (décision ouverte D-12).
> **Non-régression.** Tout le produit d'investissement vit dans des **bounded contexts isolés** (`lib/invest/*`, `app/(invest)/*` ou `app/(dashboard)/invest/*`, `app/api/invest/*`, tables préfixées `inv_*`). L'app d'estimation/CRM existante (`estimations`, `leads`, `mandates`, `properties`, `visits`, `agenda`, `swarms`) n'est **jamais** touchée.

---

## 1. Executive summary

**Ce qu'on construit.** Le **marché obligataire tokenisé de l'immobilier européen** : une marketplace deal-by-deal où un investisseur choisit, **opération par opération**, de prêter à une **SAS opérationnelle** (marchand de biens / promotion) via des **obligations** émises par une **SPV dédiée (1 SPV = 1 opération)**. Ces obligations sont des **security tokens ERC-3643** (permissionnés, KYC embarqué via ONCHAINID) en **miroir d'un registre légal DEEP** qui reste la **source de vérité juridique**. Le règlement se fait en **EUR via séquestre tiers** (notaire/EMI) par défaut, **EURC/EURe via un CASP régulé** en option, **jamais en USDT**. La distribution se fait sous statut **PSFP/ECSP** (le sien ou celui d'un partenaire agréé). [FAIT — étude P1, P3, P9, P14 Version B]

**Le white space, vide et réel.** Personne ne combine aujourd'hui les quatre briques simultanément : (a) cadre PSFP prouvé et **passeporté UE**, (b) tokenisation réellement conforme (security token hors MiCA + KYC on-chain), (c) **liquidité secondaire native**, (d) **règlement euro-natif**. Les Français (ClubFunding, leader >1,2 Md€) ne tokenisent pas ; les tokeniseurs (RealT/Lofty) sont en zone grise *securities* et font de l'equity ERC-20 « libre ». TITRO = « ClubFunding tokenisé + RealT juridiquement propre » — la seule colonne complète du tableau concurrentiel (Vision §4.8).

**Pourquoi on ne dérive jamais vers le FIA.** Le risque n°1 (sanction AMF SAN-2025-08, requalification, nullité du montage) est neutralisé **par construction**, à tous les étages : pas de pré-collecte, pas de pooling, pas de NAV globale, pas de rebalancing, choix deal-by-deal **réel**, séquestre tiers obligatoire, instrument = **créance** (rendement plafonné, upside à l'equity sponsor), **jamais d'ERC-4626** (signal FIA pour l'ESMA). Ces invariants sont gravés dans le code (interface `ITokenAdapter` modélisée sur T-REX), dans la base (contraintes SQL `CHECK`, `UNIQUE`, triggers), dans l'UI (lint juridique du wording), et dans le GTM (gate compliance marketing). La discipline est mesurée par des KPIs binaires (« 0 pré-collecte », « 0 pooling », « 0 NAV », « 0 USDT » doivent rester à zéro).

**État d'avancement réel des artefacts (livrés, pas du blabla) :**

| Domaine | Artefact concret livré | État |
|---|---|---|
| **01 Vision** | 447 lignes : positionnement, P&L unitaire MdB (~20,4 k€ marge/deal) & locatif (~44,5 k€), 4 segments, 4-6 lignes de revenus, flywheel, moat, NSM | Spéc validée |
| **02 UX** | 1024 lignes : 7 lois UX, sitemap 3 espaces, 16 écrans investisseur + face opérateur (wizard 9 étapes) en wireframes ASCII, machine à états souscription, lint juridique copywriting | Spéc validée |
| **03 UI** | `prototype-ui.html` (1312 lignes, **0 erreur console** Playwright) : marketplace + fiche deal (11 charts) + portefeuille + flux souscription 5 étapes, DS Cockpit `data-product="gold"` | **Prototype fonctionnel** |
| **04 Archi** | 576 lignes : 10 invariants exécutoires, 9 bounded contexts DDD, C4 (3 niveaux), ~35 routes API + 5 webhooks + 3 Edge Functions, 8 ADRs, algo réconciliation | Spéc validée |
| **05 Smart contracts** | **32 fichiers Solidity, ~3200 lignes, 42 tests Foundry passants**, ERC-3643/T-REX complet + 4 modules compliance + BondDistributor, upgradeable UUPS, script de déploiement validé en simulation | **Code compilable & testé** |
| **06 Data** | **6 migrations SQL (0100→0105), 16 tables + 2 enfants, 84 index, 19 RLS**, validées en `BEGIN…ROLLBACK` sur Postgres prod, audit hash-chaîné testé | **SQL exécutable & testé** |
| **07 Finance** | **TypeScript pur, 89 tests Vitest passants** : waterfall ordonné, XIRR Newton+bissection, LTV/DSCR/marge, 3 scénarios, sensibilités, 11 data-contracts de charts, `buildDealSheet()` | **Code testé & déterministe** |
| **08 Conformité** | 1152 lignes : 10 workflows (machines à états + RACI), saga DvP closing, job refund auto, migration SQL 16 tables | Spéc validée + SQL |
| **09 Sécurité** | STRIDE 8 zones, custody 2 mondes, 12 invariants smart-contract, **matrice 24 risques** (P0/P1/P2), 5 runbooks, DORA | Plan de sécurité |
| **10 GTM** | 15 sections : TAM/SAM/SOM, flywheel 2 faces, funnel 16 étapes, roadmap 12 mois trimestrielle, 7 preuves de confiance, gate do/don't, KPIs | Stratégie validée |

**La thèse de domination.** Devenir **le standard de l'émission obligataire immobilière tokenisée en Europe** : la place de marché que les opérateurs utilisent par défaut pour lever leur junior/mezzanine, et que les investisseurs UE utilisent par défaut pour s'exposer à de la dette immobilière liquide. Le passeport PSFP (un agrément AMF → 27 marchés) est le cheat-code de distribution ; le moat composé (conformité-produit + réseau two-sided + techno d'intégration + marque de confiance) verrouille la catégorie pour le premier à atteindre la masse critique de liquidité + agrément + track-record de remboursement.

**North Star Metric (NSM) :** **€ de capital investisseur DÉPLOYÉ dans des deals réellement closés (financés), par cohorte trimestrielle.** Anti-vanity (ne compte ni les inscrits, ni les soft-commits, ni le séquestre non débloqué) ET anti-FIA par construction (on ne récompense que le capital qui finance un deal *déjà choisi* au closing — étude P5 étape 11).

---

## 2. Réconciliation des 10 domaines — conflits signalés ET résolus

Les 10 livrables ont été produits en parallèle. Ils sont massivement cohérents sur la doctrine (anti-FIA, DEEP=vérité, ERC-3643, séquestre tiers, EUR, Cockpit `gold`). Mais **six conflits/incohérences réels** existent entre artefacts. Les voici, chacun **tranché** par une décision d'architecte en chef qui devient contraignante pour le build.

### Conflit C1 — Schéma de nommage des tables : TROIS conventions incompatibles ⚠️ BLOQUANT

C'est le conflit le plus grave. Trois domaines ont modélisé la même réalité avec trois schémas de tables différents :

| Domaine | Convention | Migrations | Exemples |
|---|---|---|---|
| **04 Archi** | préfixe `inv_*` | `0015_invest_core.sql` (un seul fichier) | `inv_deals`, `inv_subscriptions`, `inv_holdings`, `inv_escrow_accounts`, `inv_ledger_entries` |
| **06 Data** | **noms nus** | `0100`→`0105` (6 fichiers, **testés en prod ROLLBACK**) | `deals`, `spvs`, `subscriptions`, `cap_table_entries`, `escrow_movements`, `audit_log` |
| **08 Conformité** | noms nus, **autre découpage** | « après 0014 » | `kyc_cases`, `bond_register`, `kiis_documents`, `deal_closing_conditions`, `compliance_audit_log` |

**Pourquoi c'est un problème.** (a) Risque de **collision** avec l'app existante : `documents`, `deals`, `audit_log` en noms nus peuvent entrer en conflit avec des tables CRM/estimation présentes ou futures. (b) Le code (04) référence `inv_deals` ; la migration testée (06) crée `deals`. Sans réconciliation, **les routes API ne trouveront pas leurs tables**. (c) Le doc conformité (08) introduit un 3ᵉ jeu (`kyc_cases` vs `kyc_records` de 06, `compliance_audit_log` vs `audit_log` de 06) → deux pistes d'audit, deux tables KYC.

**DÉCISION D'ARCHITECTE (contraignante) :**

1. **Préfixe `inv_` OBLIGATOIRE sur TOUTES les tables du domaine investissement.** L'invariant I9 de l'archi (isolation multi-tenant + ring-fencing) et la règle de non-régression l'imposent. Les noms nus de 06/08 sont **renommés** avec le préfixe `inv_`.
2. **Le contenu/structure des tables = celui de 06 (data),** car c'est le seul jeu **réellement testé** sur Postgres prod (DDL, FK, CHECK, FK circulaire, RLS, triggers, fonctions `recompute_deal_raised`, `append_audit_log`). On garde sa granularité (16 tables + 2 enfants), ses contraintes anti-FIA structurelles, son audit hash-chaîné.
3. **Mapping de renommage canonique** (06 → cible) :

   | 06 (testé) | → Cible canonique | Remplace aussi (04) |
   |---|---|---|
   | `tenants` | *(réutilise l'existant)* | — |
   | `operators` | `inv_operators` | — |
   | `investor_profiles` | `inv_investor_profiles` | `inv_investor_profiles` ✓ |
   | `kyc_records` | `inv_kyc_cases` | `inv_kyc_cases` ✓ (nom de 04 retenu, structure de 06) |
   | `spvs` | `inv_spvs` | `inv_spvs` ✓ |
   | `deals` | `inv_deals` | `inv_deals` ✓ |
   | `bond_tranches` | `inv_bond_tranches` | `inv_deal_terms` + `inv_securities` (fusion conceptuelle) |
   | `subscriptions` | `inv_subscriptions` | `inv_subscriptions` ✓ |
   | `escrow_movements` | `inv_escrow_movements` | `inv_settlements` + `inv_escrow_accounts` |
   | `cap_table_entries` | `inv_cap_table_entries` | `inv_holdings` + `inv_ledger_entries` (registre DEEP) |
   | `token_mints` | `inv_token_mints` | `inv_token_ops` + `inv_chain_events` |
   | `distributions` | `inv_distributions` | `inv_payouts` |
   | `distribution_payouts` | `inv_distribution_payouts` | — |
   | `secondary_orders` | `inv_secondary_orders` | `inv_listings` + `inv_transfers` |
   | `documents` | `inv_documents` | `inv_deal_documents` + `inv_tax_documents` |
   | `audit_log` | `inv_audit_log` | `inv_audit_log` ✓ (UNE seule piste d'audit) |

4. **Le découpage en 6 fichiers de migration de 06 est conservé,** mais **renuméroté `0015`→`0020`** dans `supabase/migrations/` pour suivre la séquence réelle de l'app (dernière = `0014_swarms.sql`). Le préfixe `01xx` de 06 était volontairement « hors-prod » (livrable, non appliqué) ; à l'intégration on bascule en `0015_invest_foundation.sql` … `0020_invest_documents_audit.sql`.
5. **Tables d'infrastructure de l'archi (04) ajoutées** car absentes de 06 et nécessaires aux patterns de robustesse : `inv_idempotency_keys`, `inv_webhook_events`, `inv_reconciliation_runs`, `inv_approvals` (4-eyes), `inv_failed_operations` (DLQ), `inv_deal_milestones`, `inv_reports`. → migration `0021_invest_infra.sql`.
6. **Tables conformité de 08 fusionnées :** `inv_kiis_documents`/`inv_kiis_versions` (KIIS versionné, distinct des `inv_documents` GED), `inv_investor_assessments` (test ECSP), `inv_deal_closing_conditions`, `inv_travel_rule_records`, `inv_signature_envelopes`, `inv_deep_inscriptions`, `inv_bond_register`/`inv_bondholder_mass`, `inv_regulatory_reports`. La piste d'audit `compliance_audit_log` de 08 est **supprimée au profit de `inv_audit_log` unique** (06). → migration `0022_invest_compliance.sql`.

> **Conséquence build :** le domaine 04 doit aligner ses références de code sur les noms canoniques ci-dessus ; le domaine 06 fournit le DDL de référence à préfixer ; le domaine 08 apporte les tables conformité manquantes. **Une seule source de vérité de schéma à l'arrivée.**

### Conflit C2 — Cardinalité tranche/security : `bond_tranches` (06) vs `inv_securities`+`inv_holdings` (04)

- **06** modélise une `bond_tranches` (la tranche obligataire) dont les positions vivent dans `cap_table_entries` (registre DEEP). Une `subscription` cible une `bond_tranche`.
- **04** sépare `inv_securities` (l'émission) de `inv_holdings` (la cap table) et `inv_ledger_entries` (journal append-only).

**DÉCISION :** garder la granularité **plus fine de 06** mais **ajouter le ledger hash-chaîné de 04**. Structure canonique :
- `inv_bond_tranches` = l'instrument (nominal, seniority, coupon, lock-up, `token_standard ∈ {ERC-3643, ERC-1400}`, `deep_register_ref`). Une `inv_deal` peut avoir N tranches (senior secured / mezzanine — étude P6), résolvant un manque de 04 qui ne gérait qu'une émission par deal.
- `inv_cap_table_entries` = registre DEEP **source de vérité**, append-only (= fusionne `inv_holdings` + `inv_ledger_entries`). Porte déjà `balance_units_after` + chaînage implicite par `entry_type`.
- `inv_token_mints` = miroir on-chain (= fusionne `inv_token_ops` + `inv_chain_events`).
- **Ajout :** le pattern hash-chaîné de 04 (`prev_hash`/`entry_hash`) est appliqué à `inv_audit_log` (déjà le cas dans 06 via `append_audit_log`) **et** recommandé sur `inv_cap_table_entries` pour une opposabilité maximale du registre [ANALYSE]. La somme `balance_units_after = units_issued = mint−burn on-chain` reste maintenue **applicativement** + job de réconciliation (06 §risques), pas par contrainte SQL — assumé, avec garde-fou de réconciliation 5 min (04 §5.2).

### Conflit C3 — Saga de closing : ordre escrow / DEEP / mint divergent

- **04 ADR-005** : `escrow.release → DEEP → mint → reconcile`, avec une note d'auto-correction : « plus sûr, on inscrit DEEP + mint **avant** le release final ».
- **08 §6.2** : saga DvP en 6 étapes avec compensation, le déblocage notaire en cœur.
- **09 §2.2** : exige la **concomitance fonds/titres (DvP)** — mint déclenché uniquement sur preuve de closing.

**DÉCISION (ordre canonique de la saga `inv-closing-saga`) :**
```
Pré-condition (garde dure) : levée_atteinte ∧ prêt_bancaire_accordé ∧ délai_réflexion_4j_expiré (non-avertis)
  step 1  Lock des fonds en séquestre confirmé (inv_escrow_movements, déjà déposés)
  step 2  LedgerService.inscribeDEEP()         [SOURCE DE VÉRITÉ — d'abord, I1]
  step 3  TokenizationPort.mint(ERC-3643)      [MIROIR, idempotent par mint:{subscription_id}]
  step 4  reconcile(DEEP ↔ chain)              [doit être in_sync avant de continuer]
  step 5  EscrowPort.release(deal) → SPV       [DvP : argent libéré APRÈS titres établis]
  COMPENSATION si échec avant step 5 : EscrowPort.refund() intégral, sans pénalité (ECSP)
  COMPENSATION si échec APRÈS step 5 : régularisation DEEP manuelle + alerte compliance (pas de rollback technique du release notaire — limite assumée, D-07)
```
Justification : on **établit le titre (DEEP+mint réconcilié) AVANT de libérer l'argent**. C'est la lecture DvP de 09 et la version « plus sûre » que 04 reconnaissait lui-même. Le risque résiduel (release notaire irréversible) est borné à l'après-step-5 et traité par compensation administrative (décision ouverte D-07 : caler avec le contrat EMI/notaire réel — release en 1 ou 2 temps ?).

### Conflit C4 — `<hearst-asset>` (catalog) vs charts SVG/CSS custom du prototype

- **03 UI** : les 11 charts sont en SVG/CSS pur tokenisé dans `prototype-ui.html` (contrainte `file://`), avec un tag indiquant l'asset catalog cible. Mais les classes `.waterfall/.gantt/.gauge/.radar/.scenario` **n'existent pas** dans `cockpit.css`/catalog.
- **04/07** : attendent des `<hearst-asset>` consommant les data-contracts du moteur financier.

**DÉCISION :** en production React, **deux pistes coexistent** :
1. Charts **déjà dans le catalog** (`progress-circle`→donut, `dashed-bars`→use-of-funds/marge, `sparkline-area`→sensibilités/cashflow, `radar-hexagon`→risque, `histogram`→scénarios) → utiliser `<hearst-asset>`.
2. Charts **absents du catalog** (waterfall rankée, gantt, jauge LTV demi-arc) → **porter les classes du prototype vers `cockpit.css`** (recommandé) OU créer de nouveaux assets catalog (`chart:waterfall`, `chart:gantt`, `chart:gauge`). **Recommandation : porter au DS** pour rester source-of-truth et réutilisable hors invest. Toute la logique de calcul reste dans le moteur 07 ; le front ne fait que rendre les data-contracts `DealCharts`. Décision ouverte D-09 (port DS vs nouveaux assets).

### Conflit C5 — Self-signup public vs `disable_signup=true` du projet

- **02 UX** : l'espace investisseur public exige un **self-signup** (`/auth/inscription`, vérification email).
- **CLAUDE.md projet** : `disable_signup=true` → seul l'admin API crée des users. Signalé comme `[HYPOTHÈSE]` non tranché par l'UX.

**DÉCISION :** **séquencée par phase**, alignée sur le GTM.
- **Phase 1 (pilote, placement privé averti) :** on **garde `disable_signup=true`** + mode **code d'invitation** (waitlist fermée, club privé sur invitation — GTM §3.1). Cohérent avec « pas de sollicitation publique avant PSFP ». L'admin/back-office provisionne les comptes avertis.
- **Phase 2 (PSFP partenaire, retail) :** **bascule vers self-signup contrôlé** (vérification email + KYC bloquant avant toute action sensible) — requis pour scaler le funnel. À implémenter avec un flux d'inscription gardé (rate-limit, anti-bot, ONCHAINID au pass KYC). Décision sécu/produit D-05 à acter avant T2.

### Conflit C6 — Carried / performance fee (R4) : moteur vs garde-fou anti-FIA

- **01 Vision** & **07 Finance** : le waterfall inclut un **carried opérateur** (20 % au-delà du hurdle 8 %) ET une **performance fee plateforme** (R4, part minoritaire du carried).
- **01 Vision §6 / §12** & **08** : alertent que R4 « façon société de gestion » **rapproche du FIA** ; recommandent un fee de succès/arrangement ou la suppression.

**DÉCISION :** **le carried OPÉRATEUR reste** dans le waterfall (c'est l'alignement du sponsor = objet commercial réel, pilier anti-FIA). **La performance fee PLATEFORME (R4) est mise en réserve** : par défaut **désactivée** dans le pricing de lancement ; la marge tient sans elle (R1 1% entrée + R3 2,5% structuration = moteur non conditionnel, ~25,9 k€/deal MdB). Si réactivée plus tard, **uniquement** sous forme de **fee de succès/arrangement** (one-shot, lié à un service de structuration), jamais un carried récurrent « façon ManCo ». Décision juridique D-03 (memo avocat) requise avant toute activation de R4.

### Cohérences notables (pas de conflit, à préserver)

- **Accent Cockpit `data-product="gold"` (#d4af37)** : unanime (02, 03). Token existant ligne 63 de `cockpit.css`. Aucun hex inventé.
- **Machine à états de souscription** : 02 (`reserved→signed→payment_pending→escrowed→reflexion→minted/refunded`), 04 (`soft_commit→signed→funded→allocated→minted`), 06 (`reserved→signed→funded→allocated→minted`), 09 (`soft_commit→signed→funds_in_escrow→closing→minted|refunded`). **Quasi-identiques.** Canon retenu (06, le plus testé) : `reserved → signed → funded → allocated → minted` (+ `refunded`/`cancelled`/`withdrawn`), avec `cooling_off_ends_at` pour le délai 4j et un état logique `reflexion` exposé en UI entre `funded` et `allocated`.
- **DEEP = source de vérité, token = miroir, DEEP gagne en cas de divergence** : unanime (04, 05, 06, 08, 09). Réconciliation 5 min ; `chaîne > DEEP` = anomalie de sécurité → `pause()`.
- **Réconciliation 3-way** (souscrit ↔ séquestre ↔ tokenisé) avant mint : 09 l'exige, 04 l'implémente dans la saga, 06 fournit `recompute_deal_raised` + `reconciliation_status`.

---

## 3. Matrice de cohérence & dépendances (qui dépend de qui)

### 3.1 Graphe de dépendances (amont → aval)

```
                         ┌──────────────────────────────────────────┐
                         │  ÉTUDE JURIDIQUE (etude-immobilier-2026)  │  ← racine, gouverne TOUT
                         └───────────────────┬──────────────────────┘
                                             │
                         ┌───────────────────▼──────────────────────┐
                         │  01 VISION / BUSINESS MODEL                │  ← commande aux autres
                         │  (positionnement, NSM, revenus, segments)  │
                         └──┬───────────┬───────────┬─────────────┬──┘
              ┌─────────────┘           │           │             └─────────────┐
              ▼                         ▼           ▼                           ▼
   ┌──────────────────┐   ┌────────────────────┐  ┌────────────────┐  ┌─────────────────┐
   │ 02 UX (parcours) │   │ 10 GTM (go-market) │  │ 08 CONFORMITÉ  │  │ 09 SÉCURITÉ     │
   │ 7 lois, 16 écrans│   │ funnel, roadmap    │  │ 10 workflows   │  │ STRIDE, risques │
   └────────┬─────────┘   └─────────┬──────────┘  └───────┬────────┘  └────────┬────────┘
            │ flows                  │ besoins             │ règles            │ exigences
            ▼                        ▼                     ▼                   ▼
   ┌──────────────────┐                          ┌───────────────────────────────────────┐
   │ 03 UI (Cockpit)  │◄─────── data-contracts ──│  04 ARCHITECTURE TECHNIQUE             │
   │ prototype 4 écr. │                          │  9 bounded contexts, 35 routes, sagas  │
   └────────┬─────────┘                          └──┬───────────────┬────────────────┬───┘
            │ charts                                 │ ports          │ schéma         │ orchestration
            │                                        ▼                ▼                ▼
            │                          ┌──────────────────┐ ┌─────────────────┐ ┌──────────────────┐
            └──── consomme ───────────►│ 07 MOTEUR FINANC.│ │ 06 DATA (SQL)   │ │ 05 SMART CONTRACTS│
                                       │ waterfall, 11    │ │ 16 tables, RLS  │ │ ERC-3643, 42 tests│
                                       │ charts, 89 tests │ │ DEEP=vérité     │ │ T-REX, EURC dist. │
                                       └──────────────────┘ └─────────────────┘ └──────────────────┘
                                                ▲                  ▲                    ▲
                                                └──────────────────┴────────────────────┘
                                                  réconciliation DEEP↔on-chain (le cœur)
```

### 3.2 Matrice détaillée des dépendances inter-domaines

| Domaine | Dépend de (consomme) | Est consommé par (fournit) |
|---|---|---|
| **Étude** | — | TOUS |
| **01 Vision** | Étude | 02, 03, 04, 06, 07, 08, 09, 10 (commande les specs) |
| **02 UX** | Étude, 01 | 03 (écrans→proto), 04 (machines à états), 06 (états souscription) |
| **03 UI** | 02 (parcours), 04 (API/états), 07 (data-contracts charts), 05 (état mint/whitelist), 06 (tables marketplace/portfolio), DS Cockpit | implémentation front React |
| **04 Archi** | Étude, 01, 02, 05 (spec contrats), 06 (DDL), 07 (waterfall hooks), 09 (exigences sécu) | 03 (contrats API), 06 (invariants SQL), tout le build serveur |
| **05 Contrats** | Étude (P9/P13), registrar DEEP, KYC issuer, CASP (EURC) | 04 (`TokenizationPort`/`ChainPort`), 06 (adresses/events), 03 (panneau token), 08 (mint/burn/canTransfer/freeze) |
| **06 Data** | Étude, 04 (modèle cible), 05 (adresses/events on-chain), 07 (waterfall jsonb), `set_updated_at`/`current_tenant_id` existants | 04 (persistance), 03 (alimente UI), 08 (tables conformité), 10 (events funnel) |
| **07 Finance** | Étude (P7/P8), aucun IO | 03 (11 charts + waterfall + projections), 04 (`inv-distribution-run`), 06 (`deal_terms.waterfall jsonb`), 08 (cohérence KIIS), 10 (grille fees) |
| **08 Conformité** | Étude, 07 (valeurs KIIS), 05 (mint/freeze), 06 (numérotation migration), auth/JWT existant | 04 (gardes compliance), workflows opérationnels, reporting AMF |
| **09 Sécurité** | stack repo (proxy.ts, auth, supabase, ratelimit), 05 (invariants à implémenter), 06 (tables audit/RLS), 07 (réconciliation 3-way) | 04/05/06 (exigences), gate go-live |
| **10 GTM** | Étude, 01 (pricing), 05 (transfer restrictions), 06 (events analytics), 07 (fees/waterfall), 02/03 (parcours/UI), infra obs. | besoins marketing, séquençage des phases |

### 3.3 Chemins critiques (les frontières à ne jamais casser)

1. **④ Ledger (DEEP, off-chain, vérité) ↔ ⑥ Tokenization (on-chain, miroir).** Le contexte miroir n'a **aucun** droit d'écriture sur les tables du ledger. Matérialise l'invariant I1.
2. **③ Subscription (acte explicite) → ⑤ Settlement (fonds).** Le flux de fonds est **toujours** subordonné à un acte de souscription explicite (I2/I3). Pas d'endpoint « deposit balance ».
3. **Saga de closing (⑤+④+⑥).** Seul endroit qui touche 3 systèmes externes irréversibles. Orchestrée, idempotente, compensable (C3).
4. **07 Finance (vérité économique) → 05 Contrats / 06 Data.** Le `DealSheet` est la source des montants à minter/inscrire. Le moteur ne « sélectionne » jamais à la place de l'investisseur (anti-FIA).

---

## 4. Spécification produit consolidée (vision → GTM)

> Chaque couche pointe vers son livrable de domaine. Le blueprint en donne la synthèse exécutable et les points de jonction.

### 4.1 Vision & business model → [`01-vision-business-model.md`](01-vision-business-model.md)

- **UVP :** « Prêtez à l'immobilier, deal par deal, avec la liquidité d'un titre et la conformité d'une banque. »
- **Instrument unique :** obligations de SAS opérationnelle (jamais d'equity géré, jamais de vault).
- **4 segments (ordre d'attaque) :** Averti FR (pilote, placement privé) → Retail UE (PSFP, cœur scalé) → Pro/institutionnel → International (Reg S).
- **Revenus :** R1 entrée 1% + R3 structuration opérateur 2,5% (**moteur non conditionnel**, ~25,9 k€/deal MdB) ; R2 admin 0,5%/an (récurrence/AUA) ; R4 performance (**en réserve**, cf. C6) ; R5 secondaire, R6 white-label (scale). Mix cible **~70% MdB / 30% locatif**.
- **Unit economics :** marge contribution ~20,4 k€/deal MdB (58%), ~44,5 k€/deal locatif (72%). À l'échelle (120 deals/an, 96 M€) : ~4,2 M€ revenu, ~2,6 M€ marge contribution. [HYPOTHÈSE — paramètres de modélisation à valider].
- **Moat :** conformité-produit (le plus profond) + réseau two-sided/liquidité + techno d'intégration + marque.

### 4.2 UX & parcours → [`02-ux-parcours.md`](02-ux-parcours.md)

- **7 lois UX non négociables (L1-L7)** = constitution. Chaque écran justifiable par l'une d'elles. Encodent anti-FIA (L1/L2), soft-commit d'abord (L3), créancier≠propriétaire (L4), rendement variable non garanti (L5), séquestre tiers (L6), EUR/jamais USDT (L7).
- **Sitemap 3 espaces :** public (marketing/légal) · `/invest/*` (investisseur) · `/operateur/*` (opérateur) · `/admin/*` (back-office PSFP). Namespace séparé pour ne pas toucher le CRM.
- **16 écrans investisseur** (wireframes ASCII complets, 6 états chacun) calqués sur le parcours P5 : inscription → KYC → wallet+ONCHAINID → profil ECSP → découverte → fiche deal → montant/réservation → signature eIDAS → versement séquestre + délai 4j → closing/mint → portefeuille → documents → distributions → sortie/burn → secondaire.
- **Face opérateur :** wizard de soumission 9 étapes (garde-fous de saisie : suffixe « non garanti » forcé, scénario pessimiste obligatoire, séquestre tiers imposé) + pilotage levée/closing/distributions.
- **Section « Ce qui N'EXISTE PAS »** (10 patterns interdits) + **lint juridique du copywriting** (regex CI : mots interdits/obligatoires) = garde-fous de conception réutilisables.
- **15 nouvelles primitives front** à créer : `Stepper, Skeleton, Toast, Banner, Gate, Timeline, Waterfall, Gauge, LegalNatureBadge, RiskRadar, ScenarioBars, SensitivityCurve, DealCard, StatusPill, ProductBadges`.

### 4.3 UI / Design System → [`03-ui-design-system.md`](03-ui-design-system.md) + [`prototype-ui.html`](prototype-ui.html)

- **Prototype HTML autonome (0 erreur console)** : 4 écrans (marketplace, fiche deal avec 11 charts + waterfall rankée, portefeuille, flux souscription 5 étapes), shell Cockpit complet + chat Kimi.
- **DS strict :** tokens `--ct-*` uniquement, `data-product="gold"` seul switch d'accent, shell bordeaux verre dépoli, rail droit chat repliable partout, bottom-bar pilule.
- **Badges produit (P6) → tokens sémantiques :** `.nat` (or/nature), `.fin` (text-strong/financier), `.secured` (success/sûreté), `.risk` (warning), `.conf` (muted/conformité-géo). Un badge = une réalité juridique, jamais du marketing.
- **8 garde-fous anti-FIA rendus visibles dans l'UI** (callout « créancier pas propriétaire », « pas de NAV/pré-collecte/pooling », schéma séquestre, EUR défaut + « jamais USDT », astérisque « non garanti » systématique).

### 4.4 Architecture technique → [`04-architecture-technique.md`](04-architecture-technique.md)

- **10 invariants exécutoires** (I1 DEEP=vérité … I10 audit append-only), chacun avec son enforcement technique (contrainte SQL, trigger, lint CI, structure de code).
- **9 bounded contexts DDD** (`lib/invest/<context>/`) : ① Investor & Identity, ② Deal & Offering, ③ Subscription & Order, ④ Securities Ledger (DEEP), ⑤ Settlement & Funds, ⑥ Tokenization (miroir), ⑦ Distribution & Lifecycle, ⑧ Compliance & Reporting, ⑨ Secondary Market. Communication par events Inngest + ports/adaptateurs.
- **7 ports** : `KycPort, IdentityRegistryPort, EscrowPort, StablecoinPort, TokenizationPort, ChainPort, ESignaturePort`. **4 patterns de robustesse** : idempotence de commande, webhooks signés+dédup, retries+DLQ, circuit breaker fail-soft.
- **~35 routes `/api/invest/*`** + 5 webhooks HMAC + 3 Edge Functions Supabase (`inv-chain-indexer`, `inv-reconciliation-tick`, trigger DB hash-chain).
- **8 ADRs** (DEEP=vérité, ERC-3643 only, séquestre par-deal, bounded contexts, saga closing, custody KMS, bulletin board, EURC/EURe only).

### 4.5 Smart contracts → [`05-smart-contracts/`](05-smart-contracts/) (README : [`05-smart-contracts/README.md`](05-smart-contracts/README.md))

- **ERC-3643/T-REX complet, compilable, 42 tests Foundry passants.** `SecurityToken` (ERC-20 + transferts gardés KYC+compliance, mint/burn, forcedTransfer/clawback, freeze, pause, recovery, ancrage DEEP via `isin()`/`legalRegistryURI()`).
- Stack identité : `IdentityRegistry` (`isVerified` = KYC obligatoire) + Storage + ClaimTopics + TrustedIssuers + ONCHAINID (ERC-734/735).
- `ModularCompliance` + **4 modules** : `LockUp24Module` (730j), `CountryRestrictModule` (ISO-3166), `MaxInvestorsModule` (<150/État), `KycRequiredModule`.
- `BondDistributor` : coupon + principal réglés en **EURC**, pull par rounds snapshot, burn à l'exit, refus de payer un wallet gelé, **aucun chemin de pré-collecte** (anti-FIA).
- Upgradeable UUPS + storage ERC-7201. Gouvernance owner (board légal/multisig) / agent. **Jamais ERC-4626.**

### 4.6 Données → [`06-modele-donnees.md`](06-modele-donnees.md) + [`06-migrations/`](06-migrations/)

- **6 migrations SQL testées en prod ROLLBACK**, 16 tables + 2 enfants, 84 index, 19 RLS. **À préfixer `inv_` à l'intégration (C1).**
- Invariants **structurels** : aucune table fund/vault/portfolio ; `UNIQUE` 1 SPV = 1 deal ; `token_standard CHECK` exclut ERC-4626 ; `settlement_currency CHECK` exclut USDT ; `escrow_provider CHECK` impose un tiers ; soft-commit (`reserved`) exclu de `raised_eur`.
- **Cap table duale :** `cap_table_entries` (DEEP, source de vérité, append-only) ↔ `token_mints` (miroir on-chain) avec `reconciliation_status` (le DEEP prime).
- **`audit_log` immuable** : append-only via `append_audit_log()` (SECURITY DEFINER, advisory lock/tenant) + triggers bloquant UPDATE/DELETE + chaîne de hash par tenant.

### 4.7 Moteur financier → [`07-moteur-financier/`](07-moteur-financier/) (README : [`07-moteur-financier/README.md`](07-moteur-financier/README.md))

- **TypeScript pur, 89 tests Vitest, 100% déterministe, zéro IO/LLM.**
- `buildDealSheet(input)` = point d'entrée unique → `DealSheet` (metrics, 3 scénarios, TRI cible, 11 charts, warnings).
- **Waterfall ordonné P7** (senior principal → senior intérêts → principal obligataire → coupon → frais plateforme/opérateur → carried au-delà du hurdle → equity sponsor) avec subordination réelle (`min(dû, solde)` + shortfall).
- **Rendement obligataire plafonné** par construction (créance : optimiste = central, surplus à l'equity) = traduction chiffrée de l'anti-FIA.
- XIRR Newton+bissection ; LTV/LTC/DSCR/marge/skin ; sensibilités prix-exit & retard + point mort ; J-curve ; 11 data-contracts de charts. Calibré sur Résidence Haussmann (LTV 57,94%, TRI central 8,69%, point mort prix −19,98%).

### 4.8 Conformité opérationnelle → [`08-conformite-operationnelle.md`](08-conformite-operationnelle.md)

- **10 workflows (WF-1→WF-10)** du légal au code, chacun en machine à états + checklist + RACI : KIIS/DIS versionné, KYC/AML+ONCHAINID, test investisseur + classification + plafond `max(1000€, 5% patrimoine)`, délai 4j, séquestre + conditions suspensives + **refund automatique**, Travel Rule (TFR 2023/1113), audit WORM hash-chaîné, signature eIDAS, registres légaux (masse obligataire L.228-46 + DEEP miroir ERC-3643), reporting PSFP/AMF.
- **Saga DvP de closing** (6 étapes + compensation) — réconciliée avec C3.
- **8 invariants verrouillés** → workflow implémenteur → point de contrôle code (matrice de cohérence inter-workflows).

### 4.9 Sécurité, custody & risk → [`09-securite-custody-risk.md`](09-securite-custody-risk.md)

- **Threat model STRIDE** sur 8 zones (web, API, Supabase, on-chain, séquestre, intégrations+LLM, Electron, CI/CD).
- **Custody 2 mondes étanches** : clés plateforme (owner/agent ERC-3643) en MPC/HSM + multisig (Fireblocks/Tangany BaFin/Safe) ; clés investisseur en self-custody pur (embedded MPC Privy/Turnkey ou wallet externe). **La plateforme ne détient jamais la clé ni les fonds d'un client.**
- **Risque applicatif n°1 = service-role Supabase qui bypass la RLS** : règle d'or `assertOwnership()` (filtre `tenant_id`+`user_id`), gitleaks + `get_advisors` en gate CI.
- **DORA** 5 piliers + registre des prestataires TIC critiques. **Matrice 24 risques** (P0/P1/P2) : top bruts P0 = R-23 Phishing investisseur (16), R-01 Requalification FIA (15), R-05 Fraude virement/BEC (15). 5 runbooks incident.
- **12 invariants smart-contract testables** + 2 audits tiers + bug bounty avant mainnet.

### 4.10 GTM & growth → [`10-gtm-growth.md`](10-gtm-growth.md)

- **Goulot = l'OFFRE** (sourcing opérateurs de qualité), pas la demande → 60% de l'énergie GTM sur le sourcing.
- **Séquençage demande verrouillé anti-sollicitation :** averti FR placement privé (prouver, 2-3 pilotes) → retail FR sous PSFP partenaire (scaler) → UE passeporté + Reg S.
- **Conformité + transparence on-chain = arme marketing n°1** : 7 preuves de confiance affichées ; gate do/don't obligatoire (jamais « rendement garanti », jamais « propriété », jamais USDT, jamais sollicitation avant PSFP).
- **Build-vs-buy :** on achète l'infra réglementée (Tokeny/Securitize, séquestre, CASP, KYC), on construit le front marketplace + le scoring/due diligence (actif différenciant).
- **Roadmap 12 mois :** T1 Pilote (1-3 M€) → T2 PSFP partenaire (3-6 M€) → T3 Scale FR (6-10 M€) → T4 International (8-15 M€).

---

## 5. Plan de build priorisé — jalons, epics, tickets

> Découpage en 3 jalons calés sur les Versions A→B→C de l'étude (P14) et la roadmap GTM. Chaque epic regroupe des tickets actionnables. **Légende priorité :** `P0` bloquant go-live du jalon · `P1` important · `P2` confort/scale. **Légende statut :** `[FAIT]` artefact déjà livré · `[À INTÉGRER]` livré en `docs/produit/`, à porter dans l'app · `[À FAIRE]` à construire.

### JALON 0 — Fondations & intégration (pré-pilote) — *parallélisable, ~2-4 sem.*

**Objectif :** porter les artefacts livrés dans l'app, sans casser l'existant. Tout est isolé sous `inv_*` / `/api/invest/*` / `app/(dashboard)/invest/*`.

**Epic 0.1 — Schéma de données unifié (résout C1)** `P0`
- `T0.1.1` Renommer les 6 migrations 06 (`0100→0105`) en `0015→0020`, **préfixer toutes les tables `inv_`** (mapping C1). `[À INTÉGRER]`
- `T0.1.2` Ajouter migration `0021_invest_infra.sql` : `inv_idempotency_keys`, `inv_webhook_events`, `inv_reconciliation_runs`, `inv_approvals`, `inv_failed_operations`, `inv_deal_milestones`, `inv_reports`. `[À FAIRE]`
- `T0.1.3` Ajouter migration `0022_invest_compliance.sql` : `inv_kiis_documents/versions`, `inv_investor_assessments`, `inv_deal_closing_conditions`, `inv_travel_rule_records`, `inv_signature_envelopes`, `inv_deep_inscriptions`, `inv_bond_register/bondholder_mass`, `inv_regulatory_reports`. `[À FAIRE]`
- `T0.1.4` Appliquer via `mcp__supabase__apply_migration` (un par un, jamais `db push`), puis `generate_typescript_types` → `lib/supabase/database.types.ts`. `[À FAIRE]`
- `T0.1.5` `mcp__supabase__get_advisors` (RLS, index, policies) — gate. `[À FAIRE]`

**Epic 0.2 — Squelette des bounded contexts** `P0`
- `T0.2.1` Créer `lib/invest/{ports,adapters,investor,deal,subscription,ledger,settlement,tokenization,distribution,compliance,secondary}/`. `[À FAIRE]`
- `T0.2.2` Définir les 7 ports (interfaces TS) : `KycPort, IdentityRegistryPort, EscrowPort, StablecoinPort, TokenizationPort, ChainPort, ESignaturePort`. `[À FAIRE]`
- `T0.2.3` Adaptateurs **fail-soft stub** (`xxxIsConfigured()=false`) pour chaque port — permet de développer l'UI sans clés. `[À FAIRE]`
- `T0.2.4` Porter le **moteur financier 07** dans `lib/invest/finance/` (ou garder `docs/produit/07-*` importé) ; brancher `buildDealSheet` aux routes deal. `[FAIT]` (code+tests) → `[À INTÉGRER]`

**Epic 0.3 — Patterns de robustesse transverses** `P0`
- `T0.3.1` Helper `assertOwnership(tenant_id, user_id)` + middleware service-role (résout risque sécu n°1). `[À FAIRE]`
- `T0.3.2` Idempotence de commande (`inv_idempotency_keys`, `INSERT ON CONFLICT`). `[À FAIRE]`
- `T0.3.3` Vérif webhook HMAC + dédup (`inv_webhook_events`) + exemption JWT dans `proxy.ts` pour `/api/invest/webhooks/*`. `[À FAIRE]`
- `T0.3.4` Circuit breaker Redis (pattern cost-guard existant) + `ProviderUnavailableError` (502). `[À FAIRE]`

**Epic 0.4 — Front : shell, accent, primitives** `P1`
- `T0.4.1` Layout section invest avec `data-product="gold"` ; routes `app/(dashboard)/invest/`, `invest/[deal]/`, `portfolio/`. `[À FAIRE]`
- `T0.4.2` Porter les classes chart du prototype (`.waterfall/.gantt/.gauge/.radar/.scenario`) vers `cockpit.css` (résout C4). `[À INTÉGRER]`
- `T0.4.3` Créer les 15 primitives front (02 §liste) : `Stepper, Skeleton, Toast, Banner, Gate, Timeline, Waterfall, Gauge, LegalNatureBadge, RiskRadar, ScenarioBars, SensitivityCurve, DealCard, StatusPill, ProductBadges`. `[À FAIRE]`
- `T0.4.4` Lint juridique copywriting en CI (regex mots interdits/obligatoires, 02 §16). `[À FAIRE]`

### JALON 1 — MVP PILOTE (Version A : placement privé averti) — *cœur, GTM T1, ~8-12 sem.*

**Objectif (KPI de sortie) :** **1ᵉʳ closing réussi** sur un deal pilote placement privé — soft-commit → e-sign → séquestre → DEEP+mint réconcilié → distribution. 1-3 M€ collectés, 20-50 investisseurs avertis. `disable_signup=true` + invitation (C5 phase 1).

**Epic 1.1 — Onboarding investisseur averti** `P0`
- `T1.1.1` `/invest/onboarding` (stepper profil→KYC→wallet→test). Mode invitation/code. `[À FAIRE]`
- `T1.1.2` `KycPort` → adaptateur Sumsub réel + webhook `/api/invest/webhooks/kyc` ; origine des fonds obligatoire (WF-2). `[À FAIRE]`
- `T1.1.3` `IdentityRegistryPort` → claim ONCHAINID au pass KYC ; lier wallet (`/api/invest/wallets`). `[À FAIRE]`
- `T1.1.4` Profil & classification ECSP : test connaissances + capacité de perte → `inv_investor_assessments` + plafond `max(1000€, 5%)` (WF-3). `[À FAIRE]`
- `T1.1.5` Proof-of-ownership wallet (signature de nonce) + screening AML on-chain bloquant avant whitelist (09 §cycle de vie wallet). `[À FAIRE]`

**Epic 1.2 — Catalogue deals & fiche** `P0`
- `T1.2.1` Back-office opérateur : créer deal+SPV (`POST /api/invest/deals`), wizard 9 étapes (garde-fous saisie). `[À FAIRE]`
- `T1.2.2` `GET /api/invest/deals` + `/{id}` ; marketplace + fiche deal (réutiliser le prototype). `[À INTÉGRER]`
- `T1.2.3` Brancher les **11 charts** (moteur 07 → `<hearst-asset>`/primitives) sur la fiche. `[À INTÉGRER]`
- `T1.2.4` KIIS versionné (WF-1) : `inv_kiis_documents/versions`, machine à états DRAFT→PUBLISHED, hash PDF figé. `[À FAIRE]`
- `T1.2.5` Data room + gate KYC (flou sur chiffres KIIS tant que KYC non fait). `[À FAIRE]`

**Epic 1.3 — Souscription → signature → séquestre** `P0`
- `T1.3.1` `POST /deals/{id}/subscribe` = **soft-commit non engageant** (I2/I3) ; vérif suitability + plafond serveur. `[À FAIRE]`
- `T1.3.2` Machine à états souscription serveur stricte (`reserved→signed→funded→allocated→minted` + refunded/cancelled), aucune transition pilotée client (09). `[À FAIRE]`
- `T1.3.3` `ESignaturePort` → Yousign (eIDAS) ; bulletin + contrat d'émission ; webhook `/esign` (WF-8). `[À FAIRE]`
- `T1.3.4` `EscrowPort` → EMI/notaire ; instruction versement séquestre **par deal** ; webhook `/escrow` ; délai réflexion 4j (`cooling_off_ends_at`). `[À FAIRE]`
- `T1.3.5` Schéma UI « Vous → Séquestre tiers → SPV » + EUR par défaut (EURC/EURe en option Jalon 2). `[À INTÉGRER]`

**Epic 1.4 — Closing : saga DvP + DEEP + mint** `P0` *(le cœur)*
- `T1.4.1` Déployer la stack ERC-3643 par SPV (script `DeploySPV.s.sol`) sur chaîne cible (testnet→mainnet permissionné). `[FAIT]` (script) → `[À INTÉGRER]`
- `T1.4.2` `inv-closing-saga` (Inngest) selon l'ordre canonique C3 : conditions suspensives → DEEP → mint → reconcile → escrow release ; compensation refund. `[À FAIRE]`
- `T1.4.3` `LedgerService` : inscription DEEP (`inv_deep_inscriptions`/`inv_cap_table_entries`), registre append-only hash-chaîné. `[À FAIRE]`
- `T1.4.4` `TokenizationPort` → mint via signer custodial/KMS (ADR-006, jamais clé en clair). `[À FAIRE]`
- `T1.4.5` Edge Function `inv-reconciliation-tick` (5 min) + règle « DEEP gagne, chaîne>DEEP ⇒ pause() ». `[À FAIRE]`
- `T1.4.6` Réconciliation 3-way (souscrit↔séquestre↔tokenisé) avant mint (09). `[À FAIRE]`

**Epic 1.5 — Suivi, distribution, portefeuille** `P1`
- `T1.5.1` `/invest/portefeuille` : positions par deal **juxtaposées** (jamais de NAV), donut + timeline exits. `[À INTÉGRER]`
- `T1.5.2` Jalons travaux (`POST /deals/{id}/milestones`) + dashboard suivi (LTV temps réel). `[À FAIRE]`
- `T1.5.3` `inv-distribution-run` : waterfall (07) → payouts via `BondDistributor` (EURC) / `EscrowPort` (EUR). `[À FAIRE]`
- `T1.5.4` Reporting + IFU (WF-10 amorce), documents investisseur. `[À FAIRE]`

**Epic 1.6 — Conformité & audit (transverse pilote)** `P0`
- `T1.6.1` `inv_audit_log` immuable branché sur tous les flux financiers (`append_audit_log` à chaque décision). `[FAIT]` (SQL) → `[À INTÉGRER]`
- `T1.6.2` Wrapper `withAudit` sur routes sensibles + 4-eyes (`inv_approvals`) sur publish/close/transfert>seuil. `[À FAIRE]`
- `T1.6.3` Job refund automatique (cron */15 + événementiel) si condition suspensive non remplie (WF-5). `[À FAIRE]`
- `T1.6.4` Memo qualification FIA (avocat) — **gate légal du pilote** (D-01). `[À FAIRE — juridique]`

**Epic 1.7 — Sécurité minimale go-live pilote** `P0`
- `T1.7.1` CSP stricte + headers sécu (HSTS, nosniff, frame DENY) ; pas de service-role côté client ; source maps off en prod. `[À FAIRE]`
- `T1.7.2` Durcir `JWT_SECRET` (≥256 bits, rotation) ; rate-limit fail-closed sur routes financières. `[À FAIRE]`
- `T1.7.3` Justificatifs KYC chiffrés (R2) + scrub logs ; screening sanctions on-chain (Chainalysis/TRM) avant whitelist. `[À FAIRE]`
- `T1.7.4` IBAN séquestre verrouillé serveur + DMARC reject (anti-BEC R-05). `[À FAIRE]`

### JALON 2 — V2 PSFP (Version B : retail UE) — *scale, GTM T2-T3, ~3-6 mois.*

**Objectif (KPI de sortie) :** ouverture retail sous **PSFP partenaire** ; funnel scalable ; taux de remplissage >80% ; premiers remboursements publics. 3-10 M€ cumulés.

**Epic 2.1 — Distribution PSFP & self-signup retail** `P0`
- `T2.1.1` Bascule **self-signup contrôlé** (vérification email + KYC bloquant) ; résout C5 phase 2 (D-05). `[À FAIRE]`
- `T2.1.2` Parcours non-averti complet : test ECSP + **délai 4j** appliqué + avertissement plafond acquitté (I7). `[À FAIRE]`
- `T2.1.3` Reporting réglementaire PSFP/AMF (WF-10) : `inv_regulatory_reports` + vues d'agrégation. `[À FAIRE]`
- `T2.1.4` Contrat PSFP partenaire (LOI → signé) ; dossier PSFP propre déposé en parallèle (D-02). `[À FAIRE — juridique]`

**Epic 2.2 — Règlement stablecoin (EURC/EURe)** `P1`
- `T2.2.1` `StablecoinPort` → Circle (EURC) / Monerium (EURe) ; whitelist asset (refuse USDT) ; webhook `/stablecoin`. `[À FAIRE]`
- `T2.2.2` Travel Rule (TFR 2023/1113) sur entrées crypto au-delà du seuil (WF-6) → `inv_travel_rule_records`. `[À FAIRE]`
- `T2.2.3` On/off-ramp + onglet paiement EURC/EURe dans le flux souscription. `[À INTÉGRER]`

**Epic 2.3 — Marché secondaire (bulletin board)** `P1`
- `T2.3.1` `inv_secondary_orders` (annonces, prix indicatif libre, **pas de matching**) ; `/invest/secondaire`. `[À INTÉGRER]`
- `T2.3.2` Mise en relation + transfert P2P whitelisté (`canTransfer`/ONCHAINID) ; rapprochement déclaratif a posteriori (ADR-007). `[À FAIRE]`
- `T2.3.3` 4-eyes compliance sur transfert au-delà d'un seuil. `[À FAIRE]`

**Epic 2.4 — Multi-tranches & badges produit complets** `P1`
- `T2.4.1` Support N tranches/deal (senior secured + mezzanine — résout C2) avec waterfall multi-rang. `[À FAIRE]`
- `T2.4.2` Badges produit complets (P6) + radar de risque comparable inter-deals (07 g9). `[À INTÉGRER]`

**Epic 2.5 — Observabilité & résilience (DORA-ready)** `P1`
- `T2.5.1` Axiom (audit stream long terme) + alertes critiques (chaîne>DEEP, saga DLQ, webhook invalide répété). `[À FAIRE]`
- `T2.5.2` Registre DORA prestataires TIC critiques + clauses contractuelles + plans de sortie. `[À FAIRE — juridique/ops]`
- `T2.5.3` DLQ handler (`inv-dlq-handler`) + 5 runbooks incident opérationnels. `[À FAIRE]`

**Epic 2.6 — Audits avant scale** `P0`
- `T2.6.1` **2 audits smart-contract tiers indépendants** + bug bounty (substituer vendor par OpenZeppelin audité + T-REX officiel). `[À FAIRE]`
- `T2.6.2` Pentest tiers (Z1/Z2) + revue DORA cabinet + DPA RGPD signés avec chaque sous-traitant. `[À FAIRE]`
- `T2.6.3` Property-based testing des 12 invariants smart-contract (Foundry/Echidna), coverage ≥95%. `[À FAIRE]`

### JALON 3 — SCALE & INTERNATIONAL (Version B+ → amorce C) — *GTM T4, ~mois 9-12+.*

**Objectif :** passeport UE (BE/LU/DE/ES/IT) + Reg S international ; track-record de remboursement public ; 8-15 M€ cumulés an 1, 500-1500 investisseurs.

**Epic 3.1 — Passeport UE & Reg S** `P1`
- `T3.1.1` Activation passeport PSFP (notifications AMF→pays UE) ; content localisé. `[À FAIRE — juridique]`
- `T3.1.2` Reg S (non-US persons) : exclusion US + juridictions via `CountryRestrictModule` (ISO-3166) déjà codé. `[FAIT]` (module) → `[À INTÉGRER]`
- `T3.1.3` KYC multi-juridictions + fiscalité multi-pays (affichage). `[À FAIRE]`

**Epic 3.2 — Dashboard track-record public & confiance** `P1`
- `T3.2.1` Dashboard public de remboursement (NSM, taux de défaut/retard par cohorte) = arme marketing (GTM §5). `[À FAIRE]`
- `T3.2.2` 7 preuves de confiance affichées (statut PSFP, séquestre vérifiable, cap table on-chain auditable, scénario pessimiste, taux remboursement, DD ouverte, risque affiché). `[À INTÉGRER]`

**Epic 3.3 — White-label & multi-actifs (R6)** `P2`
- `T3.3.1` Licence de la stack tokenisation+conformité à des PSFP/opérateurs tiers (modèle Brickken). `[À FAIRE]`
- `T3.3.2` Extension à d'autres classes d'actifs (dette PME, infra) réutilisant la même stack. `[À FAIRE]`

**Epic 3.4 — Amorce Version C (institutionnel)** `P2`
- `T3.4.1` Étude FIA tokenisé institutionnel (AIFM) — **uniquement si le produit décolle** (étude P14). `[À FAIRE — décision board]`

### Récapitulatif visuel des jalons

```
J0 FONDATIONS        J1 PILOTE (V.A)         J2 PSFP (V.B)          J3 SCALE/INTL (V.B+→C)
schéma inv_ unifié → soft-commit→closing  →  retail self-signup  →  passeport UE + Reg S
ports+stubs          1er mint réconcilié      EURC/EURe + 2ndaire    track-record public
robustesse           1-3 M€, avertis          3-10 M€, audits 3P     8-15 M€, white-label
~2-4 sem             ~8-12 sem (GTM T1)        ~3-6 mois (T2-T3)      ~mois 9-12+ (T4)
```

---

## 6. Décisions ouvertes à trancher (produit ET juridique)

> Classées par criticité. Une décision `[JURIDIQUE]` exige un avocat AIFM/financier ; `[PRODUIT]` relève d'Adrien/board ; `[TECH]` de l'architecte.

| # | Décision | Type | Bloque | Recommandation |
|---|---|---|---|---|
| **D-01** | **Memo de qualification FIA du montage exact** (obligations vs actions, gouvernance, rôle plateforme). La frontière est casuistique ; aucun artefact ne garantit la non-requalification. | `[JURIDIQUE]` | Go-live pilote (J1) | **Gate absolu.** Avocat AIFM avant tout closing réel. |
| **D-02** | **PSFP partenaire vs agrément propre** + délai réel d'un partenaire acceptant des deals tokenisés. | `[JURIDIQUE]` | Retail (J2) | Partenaire d'abord (M4), dossier propre en parallèle (M7-9). LOI dès J0-J30. |
| **D-03** | **R4 (performance fee plateforme)** : supprimer / garder en fee de succès ? Risque carried « façon ManCo » = FIA. | `[JURIDIQUE]` `[PRODUIT]` | Activation R4 | **Désactivé au lancement** (cf. C6). La marge tient sans (R1+R3). |
| **D-04** | **Carte T loi Hoguet** : requise selon le rôle exact de la plateforme/opérateur. | `[JURIDIQUE]` | Selon périmètre | Non requise si la SPV achète/revend en propre (MdB) ; à confirmer. |
| **D-05** | **Self-signup public vs `disable_signup=true`.** | `[PRODUIT]` `[TECH]` | Retail (J2) | Invitation en J1, self-signup contrôlé en J2 (cf. C5). |
| **D-06** | **Choix de la chaîne EVM** (Base / Polygon PoS / permissionné DLT Pilot). `evm_version=paris` choisi par défaut (compat L2 EU). | `[TECH]` | Déploiement mainnet | À arbitrer avec l'agent de tokenisation ; réversible via `ChainPort`. |
| **D-07** | **Atomicité DvP du closing** : le release notaire est-il en 1 ou 2 temps ? Pas de rollback technique après déblocage. | `[JURIDIQUE]` `[TECH]` | Saga closing | Caler avec contrat EMI/notaire réel. Compensation manuelle assumée (cf. C3). |
| **D-08** | **Custody du signer émetteur** : partenaire (Tokeny/Tangany/Fireblocks) vs auto-custody KMS/HSM. | `[TECH]` | Mint | Partenaire régulé recommandé (ADR-006). Auto-custody = sous-projet gouvernance clés. |
| **D-09** | **Charts hors catalog** : porter `.waterfall/.gantt/.gauge` au DS Cockpit vs créer de nouveaux assets. | `[TECH]` | Fiche deal complète | **Porter au DS** (source-of-truth, réutilisable) — cf. C4. |
| **D-10** | **Niveau de signature eIDAS** du bulletin (AdES vs QES). | `[JURIDIQUE]` `[PRODUIT]` | E-sign | Impact UX/coût ; trancher avec LEGAL. |
| **D-11** | **Pseudonymisation investisseur côté opérateur** (RGPD vs reporting PSFP). | `[JURIDIQUE]` `[PRODUIT]` | Face opérateur | Arbitrer le niveau ; opérateur ne voit pas l'identité par défaut (02). |
| **D-12** | **Disponibilité marque TITRO** (INPI/EUIPO + domaines). | `[PRODUIT]` | Branding | Vérifier avant tout investissement. Réserve PIERVAL. |
| **D-13** | **`numeric(16,2)` vs `numeric(20,2)`** pour les montants (suffit ≤5M€ PSFP ; institutionnel = Version C). | `[TECH]` | Version C | Conserver `(16,2)` jusqu'à l'institutionnel. |
| **D-14** | **Preuve à exiger pour le patrimoine net auto-déclaré** (plafond 5%, art. 21(5) ECSP) sur gros tickets. | `[JURIDIQUE]` | Plafonds | Risque de fausse déclaration ; définir le seuil de justificatif. |
| **D-15** | **Mix produit cible** (~70% MdB / 30% locatif) et son rééquilibrage vers le locatif (AUA récurrent). | `[PRODUIT]` | Stratégie | Suivre la valorisation ARR vs vélocité (cf. 01 §6.3). |

> **Rappel transverse [FAIT] :** aucune de ces décisions, même tranchée, ne constitue une garantie de non-requalification FIA. La discipline « 0 pré-collecte / 0 pooling / 0 NAV / choix deal-by-deal réel » doit être **auditée en continu** via les KPIs binaires (01 §9.3). Veille réglementaire requise (fin transitoire CASP 1/7/2026, paquet AMLR/AMLA 2025-2027).

---

## 7. Ce qui rend ce produit « le meilleur au monde »

> Sans complaisance : voici pourquoi TITRO peut devenir le n°1 mondial de **sa catégorie** — et où sont les risques qui pourraient l'en empêcher.

### 7.1 Les différenciateurs structurels (le « pourquoi on gagne »)

1. **La seule case complète du marché (white space vide, prouvé).** Tableau 9 capacités × 6 concurrents (Vision §4.8) : TITRO est la **seule** colonne qui coche tout — deal-by-deal anti-FIA + dette (créance) + ERC-3643 conforme + registre DEEP + liquidité secondaire + passeport UE + EUR/EURC + dette bancaire senior + marque grand public. Ce n'est pas un « moi aussi », c'est une **catégorie créée** : « obligations immobilières tokenisées passeportées UE ».
2. **La conformité transformée en produit ET en arme marketing.** Là où le marché est un cimetière (BrickVest faillite, WiSEED RJ 2025, Homunity retards) et où les tokeniseurs sont en zone grise (RealT/Lofty), TITRO fait de la **transparence prouvée on-chain** (cap table auditable, flux séquestre traçables, scénario pessimiste toujours affiché, taux de remboursement public) son différenciateur n°1. La contrainte réglementaire devient l'argument de vente (« Pas de cagnotte, pas de boîte noire »).
3. **Le passeport UE = cheat-code de distribution.** Un seul agrément PSFP AMF → 27 marchés. Ni les US (RealT/Fundrise, fragmentés par état, pas d'UE) ni les FR analogiques (ClubFunding, mono-pays de fait) ne l'exploitent à fond.
4. **L'anti-FIA gravé à tous les étages (défense en profondeur).** Le risque n°1 n'est pas géré par une politique mais **par construction** : code (pas d'ERC-4626, `ITokenAdapter` T-REX), base (CHECK exclut ERC-4626/USDT, UNIQUE 1 SPV=1 deal, soft-commit exclu de `raised`), UI (lint juridique du wording), GTM (gate do/don't), métriques (KPIs binaires à 0). Chaque couche est un filet de sécurité indépendant.
5. **Des artefacts réels, pas des slides.** À ce stade : 42 tests smart-contract passants, 89 tests moteur financier passants, 6 migrations SQL testées en prod, un prototype UI à 0 erreur console. Le « time-to-pilot » est court car les briques techniques les plus dures (ERC-3643 conforme, waterfall exact, registre hash-chaîné) sont **déjà construites et validées**.
6. **Le moat composé qui se renforce avec le temps.** Conformité-produit (barrière cognitive + agrément 6-12 mois) + réseau two-sided (winner-takes-most sur la liquidité) + données propriétaires (track-record → scoring → meilleure sélection) + marque de confiance. Le premier à la masse critique (liquidité + agrément + remboursement) verrouille la catégorie.
7. **Le règlement DEEP+euro qui borne le blast-radius.** Insight sécu structurant : le DEEP étant la source de vérité légale, un exploit on-chain **ne vole pas la créance** → recovery possible, confiance institutionnelle, et un avantage de robustesse que RealT (ERC-20 libre) ne peut pas offrir.
8. **L'unit economics viable sans dériver.** R1+R3 (~25,9 k€/deal MdB, encaissés au closing, non conditionnels) suffisent à dégager une marge positive **sans** carried agressif — donc sans recréer le faisceau d'indices FIA. La rentabilité ne dépend pas de la zone grise.

### 7.2 Les conditions de la domination (ce qu'il faut exécuter sans faute)

- **Sourcer mieux que tout le monde.** Le goulot est l'offre : devenir le canal préféré des meilleurs opérateurs (vitesse 3 sem. vs 3 mois, récurrence, structuration clé en main, co-prescription bancaire).
- **Ne jamais courir devant le taux de remboursement.** Règle d'or : si remboursement <100% ou défaut, **geler l'acquisition payante** avant de re-scaler. Un défaut sur un pilote aurait un impact réputationnel disproportionné → sur-sélectivité (marge marchand ≥10%, LTV ≤70%, skin ≥10%).
- **Passer les audits avant le scale.** 2 audits smart-contract tiers + pentest + revue DORA + DPA RGPD = gate non négociable du Jalon 2.

### 7.3 Les risques lucides qui pourraient tuer la thèse (sans fard)

1. **[FAIT] La requalification FIA reste casuistique.** Aucun montage ne la garantit. C'est le risque existentiel — d'où le memo avocat en gate absolu (D-01) et l'audit continu des KPIs binaires.
2. **[HYPOTHÈSE] Tous les chiffres business sont des paramètres de modélisation** (TAM/SAM/SOM, CAC, taux de conversion, P&L). À recouper avec data AMF/ASPIM avant board.
3. **Dépendance forte à 6 intégrations externes irréversibles** (KYC, séquestre, CASP, tokenisation, e-sign, indexer). Mitigée par ports+circuit breaker+DLQ, mais une panne CASP/EMI/Tokeny dégrade le service → plan de continuité à formaliser.
4. **La liquidité secondaire ne doit jamais être survendue** : bulletin board ≠ marché garanti (garde-fou AMF/ECSP). Risque marketing à cadrer.
5. **Le sourcing pilote repose sur le réseau du fondateur** : capacité réelle à activer banques co-prescriptrices et opérateurs de qualité à prouver sur le terrain.
6. **Réglementation mouvante** (CASP transitoire jusqu'au 1/7/2026, AMLR/AMLA) pouvant modifier les conditions d'on-ramp et les obligations LCB-FT.
7. **Tension RGPD ↔ immutabilité blockchain** : résolue par design (PII jamais on-chain, ONCHAINID = claims hashés) mais à faire valider juridiquement.

> **Verdict d'architecte.** Le produit est **construisible aujourd'hui** : la doctrine juridique est solide et sourcée, les briques techniques les plus dures sont livrées et testées, l'architecture est isolée et non-régressive, et les conflits inter-domaines sont identifiés et tranchés (C1-C6). Le chemin critique n'est pas la technique — c'est **(a) le memo FIA de l'avocat (D-01), (b) le sourcing d'opérateurs de qualité, (c) la discipline anti-dérive**. Si ces trois-là tiennent, TITRO a une trajectoire crédible vers le statut de standard européen de l'émission obligataire immobilière tokenisée.

---

## Annexe — Index des livrables de domaine

| # | Domaine | Fichier(s) |
|---|---|---|
| Étude | Fondation juridique | [`docs/etude-immobilier-tokenise-2026.md`](../etude-immobilier-tokenise-2026.md) |
| 01 | Vision & Business Model | [`01-vision-business-model.md`](01-vision-business-model.md) |
| 02 | UX & Parcours | [`02-ux-parcours.md`](02-ux-parcours.md) |
| 03 | UI & Design System | [`03-ui-design-system.md`](03-ui-design-system.md) · [`prototype-ui.html`](prototype-ui.html) |
| 04 | Architecture technique | [`04-architecture-technique.md`](04-architecture-technique.md) |
| 05 | Smart contracts | [`05-smart-contracts/`](05-smart-contracts/) · [`README`](05-smart-contracts/README.md) |
| 06 | Modèle de données | [`06-modele-donnees.md`](06-modele-donnees.md) · [`06-migrations/`](06-migrations/) |
| 07 | Moteur financier | [`07-moteur-financier/`](07-moteur-financier/) · [`README`](07-moteur-financier/README.md) |
| 08 | Conformité opérationnelle | [`08-conformite-operationnelle.md`](08-conformite-operationnelle.md) |
| 09 | Sécurité, Custody & Risk | [`09-securite-custody-risk.md`](09-securite-custody-risk.md) |
| 10 | GTM & Growth | [`10-gtm-growth.md`](10-gtm-growth.md) |

> **Avertissement final.** Ce blueprint est un document produit/technique/business, PAS un conseil juridique. Tout déploiement réel requiert : un memo de qualification FIA d'un avocat AIFM/droit financier, 2 audits smart-contract tiers indépendants, un pentest, une revue DORA par un cabinet spécialisé, et des DPA RGPD signés avec chaque sous-traitant. La frontière FIA est casuistique (approche économique AMF) — aucune décision de ce document ne garantit la non-requalification.
