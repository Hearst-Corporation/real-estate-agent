# 08 — Conformité opérationnelle (légal → produit → code)

> **Domaine** : workflows opérationnels de conformité PSFP/ECSP + LCB-FT + legal-tech.
> **Fondation** : tout découle de [`docs/etude-immobilier-tokenise-2026.md`](../etude-immobilier-tokenise-2026.md). Les renvois `[Étude P10]` pointent vers la partie correspondante.
> **Tags** : `[FAIT]` = norme/décision citée · `[ANALYSE]` = raisonnement · `[HYPOTHÈSE]` = zone grise non tranchée à valider avocat.
> **Avertissement** : analyse documentaire, PAS un conseil juridique. Chaque workflow doit être validé par avocat gestion d'actifs avant mise en production.

---

## 0. Cadre verrouillé rappelé (garde-fous transverses à TOUS les workflows)

Ces invariants conditionnent chaque machine à états ci-dessous. Toute transition qui les viole est un **bug de conformité bloquant** (P0).

| # | Invariant | Conséquence opérationnelle | Source |
|---|---|---|---|
| I1 | **Pas de pré-collecte, pas de pooling, pas de NAV, pas de rebalancing.** | Aucun versement avant qu'un deal précis ne soit choisi ET souscrit. L'argent ne « dort » jamais sur un compte plateforme. | [FAIT] AMF SAN-2025-08 · [Étude P10] |
| I2 | **La plateforme ne détient JAMAIS les fonds clients.** | Séquestre tiers obligatoire (notaire / CARPA / cantonnement EMI). | [FAIT] PSD2 / [Étude P10] |
| I3 | **Choix deal-by-deal RÉEL par l'investisseur.** | Pas de sélection discrétionnaire substituée. Le consentement par deal est horodaté et signé. | [FAIT] SAN-2025-08 |
| I4 | **Token = ERC-3643 en MIROIR du registre légal DEEP (source de vérité).** | Le DEEP fait foi ; l'on-chain reflète. En cas de divergence, **le DEEP gagne** et on gèle les transferts. | [FAIT] Ord. 2017-1674 / [Étude P9] |
| I5 | **Règlement EUR (séquestre) par défaut ; EURC/EURe via CASP régulé en option. JAMAIS USDT.** | On/off-ramp stablecoin uniquement via partenaire MiCA + Travel Rule. | [FAIT] MiCA / [Étude P10] |
| I6 | **Délai de réflexion 4 jours** pour investisseurs non-avertis (ECSP). | Closing impossible avant expiration ; rétractation = remboursement intégral sans pénalité. | [FAIT] Règl. (UE) 2020/1503 art. 22 |
| I7 | **Plafonds non-avertis** : par investissement, si > max(1 000 €, 5 % du patrimoine net) sans avertissement explicite acquitté → blocage. | Contrôle serveur à chaque souscription. | [FAIT] ECSP art. 21 |
| I8 | **Piste d'audit immuable** : toute décision de conformité (KYC, test, plafond, closing, refund) est journalisée append-only, horodatée, chaînée (hash). | Table `compliance_audit_log` WORM (cf. §9). | [ANALYSE] exigence PSFP + LCB-FT |

**Convention de nommage des états** : `SCREAMING_SNAKE_CASE`. Les transitions sont notées `ÉTAT_A --[événement / garde]--> ÉTAT_B`.

**Légende RACI** : **R** = Responsable (exécute) · **A** = Approbateur (rend des comptes) · **C** = Consulté · **I** = Informé.
Acteurs : `INV` (investisseur) · `OPS` (back-office plateforme) · `COMPL` (responsable conformité/RCCI-équivalent PSFP) · `LCBFT` (responsable LCB-FT) · `LEGAL` (avocat/juriste) · `KYC` (prestataire Sumsub/Onfido) · `ESCROW` (notaire/EMI séquestre) · `CASP` (Circle/Monerium) · `REGISTRAR` (Tokeny/teneur DEEP) · `SYS` (automatisation/smart contract) · `EMETTEUR` (dirigeant SPV SAS).

---

## 1. Vue d'ensemble : carte des 10 workflows de conformité

```
┌────────────────────────────────────────────────────────────────────────────┐
│  AVANT LE DEAL (onboarding investisseur)                                      │
│  WF-2 KYC/AML ──► WF-3 Test investisseur + classification + plafonds          │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                 │ (investisseur éligible & classifié)
┌────────────────────────────────▼──────────────────────────────────────────────┐
│  CRÉATION DU DEAL (émetteur + plateforme)                                       │
│  WF-1 Génération + versionning KIIS/DIS ──► validation conformité ──► publish   │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                 │ (deal OPEN)
┌────────────────────────────────▼──────────────────────────────────────────────┐
│  SOUSCRIPTION → CLOSING                                                          │
│  WF-4 Réservation soft + délai 4j ──► WF-8 Signature eIDAS ──► WF-5 Séquestre   │
│   + conditions suspensives ──► (succès) WF-9/WF-10 DEEP + mint ERC-3643          │
│                              ──► (échec) remboursement AUTOMATIQUE               │
│  WF-6 Travel Rule si entrée stablecoin (greffé sur WF-5)                         │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                 │ (deal CLOSED / token émis)
┌────────────────────────────────▼──────────────────────────────────────────────┐
│  VIE DU TITRE & SUPERVISION (transverse)                                         │
│  WF-7 Piste d'audit immuable · WF-9 Registres légaux (masse obligataire/DEEP)   │
│  WF-10 Reporting réglementaire PSFP/AMF · GED + signature eIDAS                  │
└────────────────────────────────────────────────────────────────────────────────┘
```

| WF | Workflow | Responsable principal | Déclencheur | Artefact code/SQL |
|----|----------|----------------------|-------------|-------------------|
| WF-1 | Génération + versionning KIIS/DIS | COMPL | Création/maj deal | `kiis_documents`, `kiis_versions` |
| WF-2 | KYC/AML onboarding | LCBFT + KYC | Inscription investisseur | `kyc_cases`, webhook Sumsub |
| WF-3 | Test connaissances + capacité de perte + classification + plafonds | COMPL | Post-KYC | `investor_assessments`, `investor_classification`, fn plafond |
| WF-4 | Réservation soft + délai réflexion 4j | SYS/OPS | Clic « réserver » | `subscriptions` (état machine) |
| WF-5 | Séquestre + conditions suspensives + refund auto | ESCROW + SYS | Versement | `escrow_deposits`, `deal_closing_conditions`, job refund |
| WF-6 | Travel Rule (TFR 2023/1113) entrées stablecoin | CASP + LCBFT | Versement EURC/EURe | `travel_rule_records` |
| WF-7 | Piste d'audit immuable | SYS | Toute décision conformité | `compliance_audit_log` (WORM) |
| WF-8 | Signature eIDAS + GED | OPS + INV | Souscription engageante | `signature_envelopes`, `documents` |
| WF-9 | Registres légaux (masse obligataire + DEEP) | REGISTRAR + EMETTEUR | Closing | `bond_register`, `deep_inscriptions`, `bondholder_mass` |
| WF-10 | Reporting réglementaire PSFP/AMF | COMPL | Périodique / événementiel | `regulatory_reports`, vues d'agrégation |

---

## 2. WF-1 — Génération + versionning du KIIS / DIS

**But** : produire la **Fiche d'Informations Clés sur l'Investissement (FICI/KIIS)** imposée par l'ECSP `[FAIT, Règl. 2020/1503 art. 23 + Annexe I]`, et, hors périmètre ECSP (offre 5–8 M€), le **Document d'Information Synthétique (DIS)** `[FAIT, L.411-2-1 CMF, RG AMF art. 217-1]`. Versionner chaque modification (le KIIS est opposable, toute promesse de rendement est interdite).

### Qui produit quoi
- Le **KIIS est élaboré par l'émetteur** (la SPV / l'opérateur) sous sa responsabilité `[FAIT, art. 23(11)]`. La plateforme PSFP **vérifie le caractère complet, correct et clair** `[FAIT, art. 23(11) al. 2]` mais ne le « valide » pas au sens d'un visa AMF (le KIIS ECSP **n'est pas visé par l'AMF**).
- Le **DIS** (régime national 5–8 M€) suit le format RG AMF 217-1.

### Machine à états (document)

```
                       ┌─────────────────────────────────────────────────────┐
   create deal         │                                                       │
 ───────────────►  DRAFT ──[soumission émetteur]──► PENDING_COMPLIANCE_REVIEW   │
                       │                                    │                   │
                       │                          [COMPL: incomplet/promesse]   │
                       │◄───────────────────────────────────┘ (renvoi annoté)   │
                       │                                                         │
                       │                          [COMPL: complet/correct/clair] │
                       │                                    ▼                    │
                       │                              APPROVED ──[publish]──► PUBLISHED (v1)
                       │                                                  │      │
                       │                          [maj matérielle deal]   ▼      │
                       │                                       SUPERSEDED ◄──── new DRAFT (v2)
                       │                                                         │
                       │                          [deal clôturé/annulé]         │
                       │                                    ▼                    │
                       │                                ARCHIVED  (conservation 5 ans min) │
                       └─────────────────────────────────────────────────────┘
```

Transitions clés :
- `DRAFT --[submit]--> PENDING_COMPLIANCE_REVIEW`
- `PENDING_COMPLIANCE_REVIEW --[reject(reasons[])]--> DRAFT` (annotations bloquantes)
- `PENDING_COMPLIANCE_REVIEW --[approve / contrôle complétude OK]--> APPROVED`
- `APPROVED --[publish]--> PUBLISHED` (immuable : gèle un hash du PDF + des champs)
- `PUBLISHED --[material_change]--> SUPERSEDED` + ouverture d'une **nouvelle version** `DRAFT(v_{n+1})`. **Interdit d'éditer un PUBLISHED en place** (I8).
- `* --[deal_closed | deal_cancelled]--> ARCHIVED`

### Checklist de conformité par étape

**À la soumission (PENDING_COMPLIANCE_REVIEW), COMPL contrôle `[FAIT, Annexe I ECSP]`** :
- [ ] Section A — Informations sur le **porteur de projet** (l'émetteur SPV) et le projet (nature MdB/promotion, usage des fonds).
- [ ] Section B — Caractéristiques du processus de financement participatif (objectif de levée, seuil min, durée).
- [ ] Section C — **Facteurs de risque** : perte en capital jusqu'à 100 %, illiquidité/lock-up, retard travaux, défaut émetteur, risque de marché, risque crypto si stablecoin, risque réglementaire `[Étude P7 « RISQUES »]`.
- [ ] Section D — Informations relatives à l'offre de **valeurs mobilières** (obligations : nominal, taux/indexation **sans garantie**, rang/subordination, échéance, sûretés).
- [ ] Section E — Informations sur les **véhicules ad hoc** (SPV) le cas échéant.
- [ ] Section F — **Droits des investisseurs** (dont droit de rétractation 4 j).
- [ ] Section G — Frais et voies de recours.
- [ ] **Avertissement réglementaire ECSP** présent en tête `[FAIT, art. 23(2)]` (« ce produit n'est pas couvert par les systèmes de garantie des dépôts / d'indemnisation des investisseurs… »).
- [ ] **Aucune promesse de rendement** : scan automatique des termes interdits (« garanti », « assuré », « sans risque », « rendement fixe ») → bloque la publication. `[ANALYSE]` invariant marketing [Étude P6].
- [ ] Cohérence chiffrée KIIS ↔ moteur financier (waterfall, LTV, scénarios) : le KIIS reprend EXACTEMENT les valeurs publiées par le module financier (cf. dépendance WF `07-moteur-financier`).
- [ ] Disclaimer **créancier ≠ propriétaire** explicite `[FAIT, mise en garde AMF 29/12/2022]`.

**À la publication** :
- [ ] Hash SHA-256 du PDF figé + horodatage + numéro de version + lien audit (WF-7).
- [ ] KIIS rédigé dans **une langue officielle de chaque État membre ciblé** par le passeport `[FAIT, art. 23(5)]` (FR a minima).
- [ ] Disponible **avant** toute souscription (gate produit : impossible de réserver sans accusé de lecture).

**RACI WF-1** : Élaboration KIIS = **R** EMETTEUR, **A** EMETTEUR, **C** LEGAL/COMPL. Contrôle complétude = **R/A** COMPL. Publication = **R** OPS, **A** COMPL, **I** AMF (tenu à disposition). Versionning = **R** SYS.

---

## 3. WF-2 — KYC / AML (onboarding investisseur)

**But** : vérifier l'identité, l'**origine des fonds**, screener sanctions/PEP, avant toute interaction financière. `[FAIT, LCB-FT ; PSFP assujettis Règl. (UE) 2024/1624 « AMLR »]`. Identité réutilisable on-chain via **ONCHAINID** (claim soulbound) `[Étude P9]`.

### Machine à états (dossier KYC d'un investisseur)

```
 inscription
 ──────────► NOT_STARTED ──[start]──► PENDING_DOCS ──[upload complet]──► UNDER_REVIEW
                                                                            │
                  ┌──────────────────────────┬──────────────────────────────┤
            [provider: APPROVED]     [provider: NEEDS_MORE_INFO]      [provider: REJECTED
                  │                           │                        / sanctions hit]
                  ▼                           ▼                              ▼
            VERIFIED                   PENDING_DOCS (boucle)            REJECTED ──► (escalade LCBFT)
                  │                                                            │
   [claim ONCHAINID émis par trusted issuer]                          [déclaration Tracfin si suspicion]
                  ▼                                                            ▼
            VERIFIED_ONCHAIN ──[périodicité / risque élevé]──► RE_KYC_DUE     FROZEN
                  │                                                            
            [expiration doc / changement risque]                              
                  ▼                                                           
            RE_KYC_DUE ──[re-vérif OK]──► VERIFIED_ONCHAIN                     
```

Transitions clés :
- `NOT_STARTED --[start]--> PENDING_DOCS`
- `PENDING_DOCS --[docs_submitted]--> UNDER_REVIEW`
- `UNDER_REVIEW --[webhook approved]--> VERIFIED`
- `VERIFIED --[onchainid_claim_issued]--> VERIFIED_ONCHAIN` (prérequis du mint, WF-9)
- `UNDER_REVIEW --[needs_more_info]--> PENDING_DOCS`
- `UNDER_REVIEW --[rejected | sanctions_hit]--> REJECTED` → si suspicion blanchiment : **déclaration de soupçon Tracfin** (gel + non-tip-off).
- `VERIFIED_ONCHAIN --[doc_expiry | risk_change]--> RE_KYC_DUE` (revue périodique : risque standard ≤ 5 ans, **risque élevé annuel** `[ANALYSE, vigilance constante LCB-FT]`).
- `* --[freeze (sanction/Tracfin)]--> FROZEN` (révoque le claim ONCHAINID → bloque tout transfert ERC-3643).

### Checklist de conformité par étape

**Collecte (PENDING_DOCS)** :
- [ ] Pièce d'identité officielle + **liveness/selfie** (anti-usurpation).
- [ ] Justificatif de domicile < 3 mois.
- [ ] **Origine des fonds** (déclaration + justificatif si seuil) `[FAIT, vigilance LCB-FT]`.
- [ ] Statut PEP (auto-déclaration + screening).
- [ ] Pour personne morale : bénéficiaires effectifs (UBO ≥ 25 %), K-bis, statuts.

**Vérification (UNDER_REVIEW)** :
- [ ] Screening **listes de sanctions** (UE, OFAC, ONU) + PEP + médias défavorables.
- [ ] Score de risque LCB-FT calculé (pays, produit, canal, profil).
- [ ] Vigilance **renforcée** si risque élevé (origine des fonds documentée, validation COMPL).

**Approbation** :
- [ ] Décision tracée (WF-7) avec score, niveau de vigilance, validateur.
- [ ] Émission du **claim ONCHAINID** (KYC topic) par le **trusted issuer** = prestataire KYC, lié au wallet whitelisté `[Étude P9]`.

**RACI WF-2** : Collecte = **R** INV. Vérification = **R** KYC, **A** LCBFT. Décision/escalade/Tracfin = **R/A** LCBFT, **C** LEGAL. Émission claim ONCHAINID = **R** REGISTRAR (trusted issuer), **I** SYS.

> **Greffe Travel Rule** : si l'investisseur prévoit un dépôt en stablecoin, le KYC alimente WF-6 (originator/beneficiary info).

---

## 4. WF-3 — Test investisseur, classification averti/non-averti, plafonds

**But** : appliquer le régime de **protection des investisseurs ECSP** `[FAIT, Règl. 2020/1503 art. 21]` : test d'**entrée en connaissances** + **simulation de capacité à supporter des pertes** pour les **investisseurs non avertis**, classification, et **plafonds** d'investissement avec **avertissement spécifique** au-delà.

### Définitions verrouillées `[FAIT, art. 21–22 + Annexe II ECSP]`
- **Investisseur averti** (sophisticated) : remplit les critères de l'Annexe II (ex. personne morale : fonds propres ≥ 100 k€ / CA ≥ 2 M€ / bilan ≥ 1 M€ ; personne physique : 2 des 3 — revenus bruts ≥ 60 k€/an, portefeuille d'instruments financiers > 100 k€, ≥ 1 an d'expérience pro pertinente ou ≥ 10 opérations significatives/trimestre l'an passé). **Doit en faire la demande** et la plateforme l'accepte explicitement.
- **Investisseur non averti** : tous les autres → test obligatoire + plafonds.

### Plafond non-averti `[FAIT, art. 21(7)]`
Pour un **investissement donné**, si le montant > **max(1 000 €, 5 % du patrimoine net de l'investisseur)** (hors résidence principale, hors régimes de retraite/assurance-vie selon l'évaluation art. 21(5)), la plateforme **doit s'assurer que l'investisseur reçoit un avertissement de risque** et **donne un consentement exprès** (acknowledgement) prouvant qu'il a connaissance de dépasser le seuil. Ce n'est pas une interdiction absolue, mais un **gate de friction** avec preuve.

> `[ANALYSE]` Le « patrimoine net » est auto-déclaré dans le test (art. 21(5) : somme revenu annuel + actifs liquides − engagements). On conserve la déclaration horodatée et on recalcule le plafond à CHAQUE souscription avec la dernière valeur valide (validité 1 an, art. 21(8) → renouvellement annuel du test).

### Machine à états (profil investisseur)

```
 KYC VERIFIED
 ───────────► ASSESSMENT_REQUIRED
                    │
        [INV demande statut averti]        [INV non averti]
                    ▼                              ▼
            SOPHISTICATED_REVIEW          KNOWLEDGE_TEST  ──[échec]──► TEST_FAILED
                    │                              │                     │
        [critères Annexe II OK]          [réussite]                [avertissement
                    ▼                              ▼                  d'inadéquation +
            CLASSIFIED_SOPHISTICATED      LOSS_CAPACITY_SIM          ré-essai possible
            (renouv. 2 ans)                       │                  après délai]
                                                  ▼                     │
                                          CLASSIFIED_RETAIL ◄───────────┘ (peut investir
                                                  │                       avec avertissement
                                  [date+1 an]     ▼                       d'inadéquation)
                                          ASSESSMENT_EXPIRED ──[refaire]──► KNOWLEDGE_TEST
```

Transitions clés :
- `ASSESSMENT_REQUIRED --[request_sophisticated]--> SOPHISTICATED_REVIEW --[criteria_met / COMPL valide]--> CLASSIFIED_SOPHISTICATED`
- `ASSESSMENT_REQUIRED --[start_retail_test]--> KNOWLEDGE_TEST`
- `KNOWLEDGE_TEST --[pass]--> LOSS_CAPACITY_SIM --[completed]--> CLASSIFIED_RETAIL`
- `KNOWLEDGE_TEST --[fail]--> TEST_FAILED` → l'investisseur **peut quand même** investir mais reçoit un **avertissement d'inadéquation** et doit le reconnaître `[FAIT, art. 21(4)]` (l'ECSP n'interdit pas, il oblige à avertir).
- `CLASSIFIED_* --[+1 an / +2 ans sophisticated]--> ASSESSMENT_EXPIRED` (renouvellement).

### Checklist de conformité par étape

**Test de connaissances (art. 21(1)-(2))** — collecte :
- [ ] Expérience d'investissement & compréhension des risques (crowdfunding, obligations, illiquidité).
- [ ] Objectifs d'investissement.
- [ ] Situation financière de base.

**Simulation capacité de perte (art. 21(5)-(6))** :
- [ ] Calcul de **10 % du patrimoine net** présenté comme simulation de perte → l'investisseur visualise l'impact.
- [ ] Patrimoine net = revenu annuel + actifs liquides − engagements financiers (déclaration horodatée).

**Classification** :
- [ ] Statut figé (`retail` / `sophisticated`) + date d'expiration.
- [ ] Pour averti : preuve des critères Annexe II archivée (WF-8/GED).

**Plafond (à chaque souscription, gate serveur)** :
- [ ] `montant_souscrit ≤ max(1000, 0.05 × patrimoine_net)` → souscription directe.
- [ ] Sinon → **avertissement spécifique** affiché + **consentement exprès horodaté** requis avant de continuer (I7).
- [ ] Recalcul si le test a expiré → blocage tant que non renouvelé.

**RACI WF-3** : Conception des tests = **R/A** COMPL, **C** LEGAL. Passation = **R** INV. Validation statut averti = **R/A** COMPL. Gate plafond = **R** SYS (automatique), **A** COMPL. Journalisation = **R** SYS (WF-7).

---

## 5. WF-4 — Réservation (soft-commit) + délai de réflexion 4 jours

**But** : matérialiser le **choix deal-by-deal réel** (I3) par une **réservation non engageante** (aucun versement, I1), puis ouvrir le **délai de rétractation de 4 jours civils** pour les non-avertis `[FAIT, ECSP art. 22 : « at least 4 calendar days »]` durant lequel la rétractation est **inconditionnelle et sans pénalité**.

### Machine à états (souscription)

```
 deal OPEN + investisseur CLASSIFIED
 ──────────────────────────────────►  SOFT_RESERVED  (aucun €, réservation non engageante)
                                            │
                         [INV confirme intention + signe bulletin (WF-8)]
                                            ▼
                                   REFLECTION_PERIOD  (T0 → T0+4j civils, non-avertis)
                                       │           │
                         [INV se rétracte]   [délai expiré sans rétractation]
                                       ▼           ▼
                                 WITHDRAWN     COMMITTED ──[instructions de versement émises]──► AWAITING_FUNDS
                                                                                                     │
                                                                              (suite dans WF-5 : séquestre)
```

Transitions clés :
- `deal.OPEN + investor.CLASSIFIED --[reserve(amount)]--> SOFT_RESERVED` — garde : `amount ∈ [ticket_min, ticket_max]`, plafond WF-3 OK, KIIS lu (accusé), capacité résiduelle du deal suffisante. **Aucun mouvement de fonds.**
- `SOFT_RESERVED --[confirm + sign]--> REFLECTION_PERIOD` (signature du bulletin, WF-8). Pour **averti** : le délai 4 j ne s'applique pas → passage direct possible à `COMMITTED` `[FAIT, art. 22 vise les non-avertis]`, **mais** `[HYPOTHÈSE]` on peut l'appliquer à tous par prudence produit (à trancher LEGAL).
- `REFLECTION_PERIOD --[withdraw]--> WITHDRAWN` (inconditionnel, sans frais, art. 22(3)).
- `REFLECTION_PERIOD --[deadline_passed]--> COMMITTED`
- `COMMITTED --[issue_payment_instructions]--> AWAITING_FUNDS` → WF-5.

### Checklist de conformité par étape

**SOFT_RESERVED** :
- [ ] Vérifier statut KYC = `VERIFIED_ONCHAIN` (WF-2) et classification valide (WF-3).
- [ ] Plafond non-averti respecté ou avertissement+consentement acquittés (I7).
- [ ] **Accusé de lecture du KIIS** (version publiée précise, hash) horodaté.
- [ ] **Aucun appel de fonds** émis (I1).
- [ ] Capacité résiduelle du deal ≥ montant (anti-survente).

**REFLECTION_PERIOD** :
- [ ] Affichage explicite du compte à rebours (date/heure de fin) + bouton de rétractation visible en permanence `[FAIT, art. 22(2) : information claire sur le droit de rétractation]`.
- [ ] Notification de début et de fin de délai (preuve d'information).
- [ ] Calcul du délai en **jours civils** (pas ouvrés), fuseau Europe/Paris, à partir de la souscription engageante.

**COMMITTED** :
- [ ] Délai expiré (timestamp serveur, pas client).
- [ ] Génération des **instructions de versement vers le séquestre** (IBAN dédié / adresse de versement CASP).

**RACI WF-4** : Réservation = **R** INV. Gate éligibilité/plafond/KIIS = **R** SYS, **A** COMPL. Gestion du délai 4 j = **R** SYS. Rétractation = **R** INV, **I** OPS. Journalisation = **R** SYS (WF-7).

---

## 6. WF-5 — Séquestre + conditions suspensives de closing + remboursement automatique

**But (cœur anti-FIA et protection des fonds)** : les fonds versés sont **bloqués chez un tiers séquestre** (notaire / CARPA / cantonnement EMI) — **jamais** chez la plateforme (I2) — et ne sont **débloqués vers la SPV qu'au closing**, sous **double condition suspensive** : (1) **seuil de levée atteint** ET (2) **prêt bancaire senior accordé** `[Étude P5 étape 11, P10]`. Si l'une échoue ou si le délai expire → **remboursement intégral et automatique** depuis le séquestre, sans pénalité.

### Machine à états (deal closing) — niveau opération

```
 deal OPEN
 ─────────► FUNDING_OPEN ──[seuil min atteint avant deadline]──► THRESHOLD_REACHED
     │            │                                                    │
     │     [deadline sans seuil]                          [term sheet bancaire signé /
     │            ▼                                         prêt confirmé]
     │       FUNDING_FAILED                                          ▼
     │            │                                          CONDITIONS_MET
     │            │                                                  │
     │            │                                    [acte/closing notaire : déblocage]
     │            │                                                  ▼
     │            │                                            CLOSING_IN_PROGRESS
     │            │                                                  │
     │            │                              [fonds → SPV + inscription DEEP + mint OK]
     │            │                                                  ▼
     │            │                                              CLOSED  ──► WF-9 / WF-10
     │            ▼                                                  
     └──────► REFUND_PENDING ──[refund batch exécuté]──► REFUNDED ──► CANCELLED
                  ▲                                                   
       [prêt refusé | délai conditions expiré | annulation émetteur]  
```

### Machine à états (dépôt séquestre) — niveau investisseur

```
 instructions émises (WF-4 COMMITTED)
 ────────────────────────────────────► EXPECTED ──[fonds reçus & rapprochés]──► HELD_IN_ESCROW
                                                                                     │
                         ┌───────────────────────────────┬───────────────────────────┤
                  [deal CLOSED]                   [deal REFUND_PENDING]        [rétractation
                         ▼                                 ▼                    pré-closing]
                  RELEASED_TO_SPV                   REFUND_INITIATED ──────────────┘
                  (token mintable)                        │
                                                  [virement retour confirmé]
                                                          ▼
                                                     REFUNDED
```

Transitions clés :
- `FUNDING_OPEN --[sum(HELD_IN_ESCROW) ≥ threshold_min before deadline]--> THRESHOLD_REACHED`
- `FUNDING_OPEN --[deadline & sum < threshold_min]--> FUNDING_FAILED --> REFUND_PENDING`
- `THRESHOLD_REACHED --[bank_loan_confirmed (term sheet/offre ferme)]--> CONDITIONS_MET`
- `THRESHOLD_REACHED --[bank_loan_refused | conditions_deadline_passed]--> REFUND_PENDING`
- `CONDITIONS_MET --[notaire: closing]--> CLOSING_IN_PROGRESS` (atomicité visée : déblocage fonds ⇄ inscription DEEP ⇄ mint).
- `CLOSING_IN_PROGRESS --[all legs OK]--> CLOSED` ; en cas d'échec d'une jambe → rollback vers `REFUND_PENDING` (cf. §6.2).
- Dépôt : `EXPECTED --[funds_reconciled]--> HELD_IN_ESCROW` ; `HELD_IN_ESCROW --[deal CLOSED]--> RELEASED_TO_SPV` ; `HELD_IN_ESCROW --[deal REFUND_PENDING | withdrawal]--> REFUND_INITIATED --> REFUNDED`.

### 6.1 Checklist de conformité par étape

**Réception des fonds (EXPECTED → HELD_IN_ESCROW)** :
- [ ] Fonds reçus sur le **compte séquestre tiers** (jamais compte plateforme) — rapprochement par référence unique de souscription.
- [ ] Si entrée **stablecoin** : Travel Rule complétée (WF-6) AVANT crédit, conversion via CASP, arrivée des EUR en séquestre.
- [ ] Contrôle de cohérence montant reçu = montant souscrit (gestion des écarts : trop-perçu remboursé, sous-perçu = relance/annulation partielle).
- [ ] Délai de réflexion (WF-4) **déjà expiré** pour non-averti (un versement reçu pendant le délai reste rétractable → reste `HELD` mais flag « rétractable »).

**Conditions suspensives (THRESHOLD_REACHED → CONDITIONS_MET)** :
- [ ] **CS1 — Seuil de levée** : `Σ fonds confirmés ≥ objectif_min` à la `funding_deadline`.
- [ ] **CS2 — Prêt senior** : offre de prêt **ferme** (pas une simple indication) reçue, intercreditor agreement prêt à signer `[Étude P11]`.
- [ ] `[HYPOTHÈSE]` CS additionnelles paramétrables par deal (ex. obtention permis de construire purgé, expertise de valeur confirmée) — à définir dans le term sheet ; chacune devient une condition trackée.
- [ ] Toutes les CS doivent être **objectives, vérifiables et horodatées** (preuve documentaire en GED, WF-8).

**Closing (CONDITIONS_MET → CLOSED)** :
- [ ] Concomitance fonds / titres `[FAIT, principe DvP, Étude P10]` : déblocage séquestre → SPV **simultané** à l'inscription DEEP + mint ERC-3643.
- [ ] Signature de l'acte/closing notarié, intercreditor signé.
- [ ] Aucun mint avant `RELEASED_TO_SPV` confirmé (anti-token sans contrepartie).

**Remboursement (REFUND_PENDING → REFUNDED)** :
- [ ] Déclenchement **automatique** (job, cf. §6.3) sur `FUNDING_FAILED`, `bank_loan_refused`, `conditions_deadline_passed`, annulation émetteur, ou rétractation.
- [ ] **Montant intégral**, **sans pénalité ni frais** `[FAIT, esprit ECSP art. 22(3) + protection des fonds]`.
- [ ] Remboursement sur le **moyen d'entrée** (IBAN source EUR ; pour stablecoin → reconversion via CASP vers le wallet d'origine, Travel Rule retour si applicable).
- [ ] Réconciliation : `Σ remboursé == Σ HELD_IN_ESCROW` pour le deal (contrôle à zéro résiduel).

### 6.2 Atomicité du closing (DvP) — séquence transactionnelle

`[ANALYSE]` Le closing touche 3 systèmes hétérogènes (séquestre off-chain, DEEP, chaîne). Pas de transaction distribuée native → **pattern saga avec compensation** :

```
1. PRE-CHECK    : CS1 ✓ CS2 ✓ délais ✓ wallets investisseurs VERIFIED_ONCHAIN ✓
2. LOCK         : passer deal en CLOSING_IN_PROGRESS (verrou, refuse toute nouvelle souscription/rétractation)
3. ESCROW       : instruction de déblocage séquestre → compte SPV   (étape pivot, off-chain, irréversible une fois confirmée notaire)
4. DEEP         : inscription des obligations au registre DEEP (source de vérité, I4)
5. MINT         : appel ERC-3643 mint() vers chaque wallet whitelisté (miroir)
6. COMMIT       : deal CLOSED + dépôts RELEASED_TO_SPV + log WF-7
   ── compensation si échec ──
   • échec avant (3)         → rollback vers REFUND_PENDING (aucun fonds bougé)
   • échec en (4) après (3)  → P0 : fonds débloqués mais DEEP non inscrit → geler, escalade LEGAL+REGISTRAR, régularisation manuelle DEEP (le DEEP DOIT refléter la réalité juridique du versement)
   • échec en (5) après (4)  → DEEP fait foi (I4) ; re-tenter le mint ; tant que non minté, transferts on-chain impossibles de toute façon → pas de perte de droit
```

> **Règle d'or** `[ANALYSE]` : l'étape **3 (séquestre)** est le point de non-retour. On ne la franchit **qu'après** PRE-CHECK complet. Le DEEP (4) prime toujours sur l'on-chain (5) : un titre existe juridiquement par son inscription DEEP, le token n'en est que le reflet.

### 6.3 Job de remboursement automatique (pseudo-spécification)

```
JOB refund_failed_deals  (cron */15 min + déclencheur événementiel)
  POUR chaque deal EN (FUNDING_FAILED, REFUND_PENDING):
    si deal.refund_batch_status != DONE:
      pour chaque deposit EN HELD_IN_ESCROW du deal:
        deposit -> REFUND_INITIATED
        émettre ordre de remboursement (API séquestre) montant = deposit.amount_eur, frais = 0
        si entrée stablecoin: ordonner reconversion CASP -> wallet origine
      attendre confirmations -> deposit REFUNDED
      si Σ REFUNDED == Σ HELD: deal -> REFUNDED -> CANCELLED ; refund_batch_status = DONE
    log WF-7 (immuable) à chaque ordre + confirmation
  ALERTE COMPL si un remboursement > SLA (ex. 5 jours ouvrés) sans confirmation
```

**RACI WF-5** : Tenue du séquestre = **R/A** ESCROW (tiers régulé). Suivi conditions suspensives = **R** OPS, **A** COMPL, **C** EMETTEUR (prêt)/LEGAL. Décision de closing = **A** COMPL + EMETTEUR, **R** ESCROW (déblocage). Déclenchement refund = **R** SYS (auto), **A** COMPL, **I** INV. Réconciliation = **R** OPS, **A** COMPL.

---

## 7. WF-6 — KYC/AML Travel Rule sur entrées stablecoin (TFR 2023/1113)

**But** : sur **tout flux entrant en crypto** (EURC/EURe), appliquer le **Transfer of Funds Regulation (UE) 2023/1113** (« Travel Rule ») `[FAIT]` : transmettre/recevoir les informations **originateur** et **bénéficiaire**, screener, et **refuser** si non conforme. La conformité MiCA + Travel Rule est **portée par le CASP régulé** partenaire (Circle/Monerium), la plateforme l'orchestre `[Étude P9/P10]`. **USDT interdit** (I5).

### Champ d'application `[FAIT, TFR art. 14-16]`
- Transferts entre **CASP** : information complète originateur + bénéficiaire, **sans seuil de minimis** pour les crypto (contrairement au fiat).
- Transferts depuis/vers **self-hosted wallet** (≥ 1 000 €) : vérification renforcée de la propriété/contrôle du wallet.

### Machine à états (flux stablecoin entrant)

```
 INV choisit règlement stablecoin
 ───────────────────────────────► RAMP_INITIATED ──[adresse de dépôt CASP générée]──► AWAITING_ONCHAIN_TX
                                                                                          │
                                              [tx détectée on-chain]                       
                                                          ▼                               
                                              SCREENING ──[sanctions/mixer hit]──► BLOCKED ──► (Tracfin/CASP report)
                                                  │                                       
                                  [originator/beneficiary info OK + screening clean]       
                                                  ▼                                       
                                          TRAVEL_RULE_OK ──[conversion EUR via CASP]──► CONVERTED_TO_EUR
                                                                                          │
                                                              [EUR crédités au séquestre]  
                                                                          ▼               
                                                                  SETTLED_TO_ESCROW ──► (WF-5 EXPECTED→HELD)
```

Transitions clés :
- `RAMP_INITIATED --[deposit_address_issued]--> AWAITING_ONCHAIN_TX`
- `AWAITING_ONCHAIN_TX --[tx_seen]--> SCREENING`
- `SCREENING --[sanctions/mixer/non-MiCA asset]--> BLOCKED` → gel, **non-restitution sans analyse LCB-FT**, report CASP/Tracfin.
- `SCREENING --[clean + travel rule data complete]--> TRAVEL_RULE_OK`
- `TRAVEL_RULE_OK --[CASP converts]--> CONVERTED_TO_EUR --[escrow credit]--> SETTLED_TO_ESCROW` → branche sur WF-5.

### Checklist de conformité par étape

**Avant acceptation** :
- [ ] Actif = **EURC ou EURe uniquement** (allowlist on-chain par contrat/émetteur MiCA). Tout autre asset (USDT, …) → rejet automatique (I5).
- [ ] Chaîne autorisée (allowlist réseaux).

**Screening (SCREENING)** :
- [ ] Analyse on-chain : exposition sanctions (OFAC/UE), mixers/tumblers, adresses à risque (via CASP / Chainalysis-like).
- [ ] **Originator info** : nom, adresse de wallet émettrice, identifiant (le CASP émetteur fournit les données TFR).
- [ ] **Beneficiary info** : l'investisseur KYCé (rattachement wallet ↔ ONCHAINID, WF-2).
- [ ] Self-hosted wallet ≥ 1 000 € → preuve de contrôle (signature de message / micro-dépôt).

**Conversion & settlement** :
- [ ] Conversion EUR opérée **par le CASP** (la plateforme ne fait pas le change → pas d'activité CASP en propre, I5/[Étude P10]).
- [ ] EUR atterrissent en **séquestre** (jamais wallet plateforme).
- [ ] Enregistrement Travel Rule conservé (5 ans) + lien audit (WF-7).

**RACI WF-6** : Génération adresse + conversion + données TFR = **R/A** CASP. Screening = **R** CASP, **A** LCBFT. Décision blocage/Tracfin = **R/A** LCBFT, **C** LEGAL. Orchestration/état = **R** SYS. Crédit séquestre = **R** ESCROW.

---

## 8. WF-8 — Gestion documentaire (GED) + signature électronique eIDAS

**But** : produire, faire signer, horodater et archiver les documents contractuels avec une **signature électronique conforme eIDAS (Règl. (UE) 910/2014, révisé eIDAS 2 / 2024/1183)** `[FAIT]`, via prestataire (Yousign/DocuSign QES-ready) `[Étude P5 étape 9]`. Niveau visé : **signature électronique avancée (AdES)** a minima ; **qualifiée (QES)** pour les actes sensibles `[HYPOTHÈSE]` (à arbitrer LEGAL : le bulletin de souscription obligataire et l'acceptation du contrat d'émission peuvent se contenter d'AdES horodatée ; la QES renforce la valeur probante).

### Documents par jalon
| Jalon | Document | Niveau signature | Source |
|---|---|---|---|
| Onboarding | CGU + disclosures de risque | Acceptation horodatée (clickwrap) | [Étude P5.1] |
| WF-3 | Avertissement d'inadéquation / consentement plafond | Acknowledgement horodaté | [FAIT art. 21] |
| WF-4 → WF-8 | **Bulletin de souscription** | AdES (→ QES option) | [Étude P5.9] |
| WF-8 | **Contrat d'émission obligataire** (terms) | AdES/QES | [Étude P3/P11] |
| Closing | Intercreditor, acte notarié | Notaire (acte authentique) | [Étude P11] |

### Machine à états (enveloppe de signature)

```
 doc généré (template + données deal/investisseur)
 ─────────────────────────────────────────────► DRAFT ──[envoi]──► SENT ──[ouvert]──► VIEWED
                                                                                        │
                                              [SCA/OTP + consentement signataire]        
                                                                ▼                       
                                                            SIGNED ──[horodatage qualifié + scellement]──► SEALED
                                                                                        │
                                                  [archivage probatoire (coffre-fort)]   
                                                                ▼                       
                                                            ARCHIVED  (conservation légale)
   ── voies alternatives ──
   SENT/VIEWED --[expiration]--> EXPIRED       SENT --[refus signataire]--> DECLINED
```

### Checklist de conformité par étape
- [ ] Identité du signataire **liée au KYC** (WF-2) — pas de signature par un tiers non vérifié.
- [ ] Consentement explicite + intention de signer (case + action positive).
- [ ] **Horodatage qualifié** (timestamp authority) sur la signature.
- [ ] **Scellement** (sceau électronique) du document final → intégrité (toute altération détectable).
- [ ] **Piste d'audit eIDAS** (audit trail du prestataire) attachée + dupliquée dans WF-7.
- [ ] Archivage à **valeur probante** (coffre-fort numérique, NF Z42-013 / norme équivalente) `[HYPOTHÈSE]`, durée ≥ durée de l'obligation + prescription (≥ 5 ans après extinction).
- [ ] Liaison document ↔ version KIIS publiée (le bulletin référence le hash du KIIS lu).

**RACI WF-8** : Génération templates = **R** LEGAL, **A** COMPL. Envoi/suivi = **R** OPS. Signature = **R** INV/EMETTEUR. Horodatage/scellement/archivage = **R/A** prestataire eIDAS, **I** SYS. Conservation probatoire = **R** OPS, **A** COMPL.

---

## 9. WF-7 — Piste d'audit immuable (WORM)

**But** : toute **décision/événement de conformité** (KYC, test, classification, plafond, réservation, rétractation, versement, condition suspensive, closing, refund, mint, transfert, reporting) est journalisée **append-only**, **horodatée**, **chaînée par hash** (chaque entrée référence le hash de la précédente → détection d'altération/suppression), exportable pour l'AMF (I8).

### Propriétés
- **Append-only** : aucune ligne ne peut être `UPDATE`/`DELETE` (révoqué au niveau RLS + trigger interdisant UPDATE/DELETE).
- **Chaînage** : `entry_hash = SHA256(prev_hash || canonical_payload || ts || actor)`. Le 1er enregistrement d'un tenant a `prev_hash = '0'`. Une rupture de chaîne = alerte intégrité.
- **Horodatage** : `created_at` serveur + (option) ancrage périodique du dernier hash on-chain (notarisation) `[HYPOTHÈSE]`.
- **Qui/quoi/quand/pourquoi** : acteur, type d'événement, entité concernée (deal/subscription/investor), payload canonique (JSON normalisé), décision, motif.

### Machine à états — il n'y en a pas (journal append-only)
> Un log immuable n'a pas de cycle de vie modifiable : `INSERT` uniquement. La seule « transition » est l'ajout. C'est volontaire (I8).

### Checklist
- [ ] Chaque WF ci-dessus **émet** au moins un événement aux transitions sensibles.
- [ ] Payload **canonicalisé** (clés triées, encodage stable) avant hash.
- [ ] `prev_hash` lu et vérifié sous verrou (sérialisation des écritures par tenant pour éviter les forks de chaîne).
- [ ] Vérificateur d'intégrité (job) qui recalcule la chaîne et alerte si rupture.
- [ ] Export AMF : extraction filtrée par période/deal, avec preuve de chaîne.

**RACI WF-7** : Écriture = **R** SYS (toutes les routes). Intégrité/monitoring = **R** OPS, **A** COMPL. Export régulateur = **R** COMPL.

---

## 10. WF-9 — Registres légaux : masse obligataire + DEEP

**But** : tenir les **registres juridiques** qui font foi : le **registre des obligations** (cap table créance), la **masse des obligataires** `[FAIT, art. L.228-46 s. C. com. : les porteurs d'une même émission sont groupés en une masse dotée de la personnalité civile, avec représentant(s) de la masse]`, et l'**inscription en DEEP** `[FAIT, Ord. 2017-1674 + Décret 2018-1226 : l'inscription en DLT vaut inscription en compte-titres]`. Le DEEP est la **source de vérité** ; l'ERC-3643 en est le **miroir** (I4).

### Articulation DEEP ⇄ ERC-3643
```
   REGISTRE DEEP (off-chain, source de vérité)            MIROIR ERC-3643 (on-chain)
   ┌──────────────────────────────────┐                  ┌──────────────────────────────┐
   │ inscription au closing            │ ──── doit ────►  │ mint() vers wallet whitelisté │
   │ transfert (cession) validé        │   refléter       │ transfer() après canTransfer()│
   │ remboursement / extinction        │                  │ burn() à l'échéance/exit      │
   └──────────────────────────────────┘                  └──────────────────────────────┘
        ▲  en cas de divergence : le DEEP gagne → on FREEZE l'on-chain et on régularise
```

### Machine à états (ligne du registre obligataire / position d'un porteur)

```
 closing (WF-5 CLOSED)
 ─────────────────────► INSCRIBED_DEEP ──[mint miroir OK]──► MIRRORED_ONCHAIN  (position active)
                              │                                   │
                              │                      [cession validée: DEEP d'abord]
                              │                                   ▼
                              │                            TRANSFER_PENDING ──[transfer on-chain OK]──► MIRRORED_ONCHAIN (nouveau porteur)
                              │                                   │
                              │                      [échec / non-conforme]
                              │                                   ▼
                              │                               FROZEN ──► (régularisation REGISTRAR)
                              │
                   [remboursement / exit]
                              ▼
                       REDEEMED_DEEP ──[burn miroir]──► EXTINGUISHED
```

Transitions clés :
- `CLOSED --[inscription DEEP]--> INSCRIBED_DEEP` (acte d'inscription, teneur de registre/REGISTRAR).
- `INSCRIBED_DEEP --[mint]--> MIRRORED_ONCHAIN`.
- **Cession** : `MIRRORED_ONCHAIN --[demande cession]--> TRANSFER_PENDING` → **validation DEEP d'abord** (cessionnaire whitelisté, lock-up purgé, juridiction OK) → `transfer()` on-chain → retour `MIRRORED_ONCHAIN`.
- Divergence/échec compliance on-chain → `FROZEN` (le contrat ERC-3643 bloque déjà via `canTransfer()` ; le registre DEEP reste la référence).
- `MIRRORED_ONCHAIN --[remboursement/exit]--> REDEEMED_DEEP --[burn]--> EXTINGUISHED`.

### Checklist de conformité
**Inscription (closing)** :
- [ ] Inscription DEEP **concomitante** au déblocage des fonds (WF-5 §6.2).
- [ ] Mention : émetteur SPV, série, nominal, taux/indexation, échéance, rang, sûretés, titulaire (identité KYC).
- [ ] **Masse des obligataires** constituée : désignation du **représentant de la masse** `[FAIT, L.228-47]`, modalités de convocation/vote (la masse vote, **pas** de droit réel sur l'immeuble — [Étude P7]).
- [ ] Cohérence registre DEEP ↔ supply ERC-3643 (réconciliation automatique : `Σ balances on-chain == Σ positions DEEP`).

**Transfert (marché secondaire)** :
- [ ] **Bulletin board uniquement** (art. 25 ECSP) : pas de matching automatique, pas de carnet d'ordres `[FAIT, Étude P9]` → pas de MTF, pas de DLT Pilot requis.
- [ ] `canTransfer()` ERC-3643 : cessionnaire KYC/ONCHAINID valide, lock-up expiré, juridiction autorisée, plafonds respectés.
- [ ] Mise à jour DEEP **avant ou simultanément** au transfert on-chain (I4).

**Extinction** :
- [ ] Remboursement validé → radiation DEEP → burn → réconciliation à zéro.

**RACI WF-9** : Tenue DEEP = **R/A** REGISTRAR/EMETTEUR. Masse obligataire/représentant = **R** EMETTEUR, **A** LEGAL. Opérations on-chain (mint/transfer/burn) = **R** SYS (smart contract), contrôle = **A** COMPL. Réconciliation DEEP↔chain = **R** SYS, **A** COMPL.

---

## 11. WF-10 — Reporting réglementaire PSFP / AMF

**But** : produire les **reportings réglementaires** dus par un prestataire PSFP `[FAIT, Règl. 2020/1503 + RTS/ITS]`, le **reporting investisseurs** (suivi, IFU fiscal), et les **déclarations LCB-FT**. `[Étude P5 étape 13, P10]`.

### Catégories de reporting `[FAIT / ANALYSE]`
| Reporting | Destinataire | Fréquence | Base |
|---|---|---|---|
| **Reporting annuel PSFP** : liste des projets financés, taux de défaut par projet, montants levés | **AMF** | Annuel | `[FAIT, art. 16 + RTS 2022/2114 (défauts)]` |
| **Taux de défaut** des projets sur 36 mois | AMF (+ publication) | Annuel | `[FAIT, art. 20 + RTS défauts]` |
| **KIIS tenus à disposition** + registre des offres | AMF (sur demande) | Continu | art. 23 |
| **Déclarations LCB-FT** (Tracfin) : soupçons, COSI le cas échéant | Tracfin/ACPR | Événementiel | LCB-FT |
| **Reporting investisseur** : avancement deal, jalons, comptes, LTV | Investisseurs | Trimestriel | [Étude P5.13] |
| **Documents fiscaux (IFU)** : intérêts versés, plus-values | Investisseurs + DGFiP | Annuel | [Étude P7 fiscalité] |
| **Incident reporting** : plaintes, incidents opérationnels | AMF/interne | Événementiel | gouvernance PSFP |

### Machine à états (cycle d'un rapport)

```
 échéance / déclencheur
 ──────────────────────► DUE ──[agrégation données]──► DRAFT ──[revue COMPL]──► REVIEWED
                                                                                  │
                                          [corrections]                           │
                                                ◄─────────────────────────────────┤
                                                                          [validation]
                                                                                  ▼
                                                                              APPROVED ──[transmission]──► SUBMITTED
                                                                                                              │
                                                              [accusé régulateur / archivage]                 
                                                                                  ▼                          
                                                                              ACKNOWLEDGED ──► ARCHIVED
```

### Checklist
- [ ] Source unique : les données proviennent des tables transactionnelles (pas de ressaisie) → vues d'agrégation.
- [ ] **Taux de défaut** calculé selon la méthodologie RTS (un projet en défaut = retard de paiement > X jours / restructuration / procédure collective) `[FAIT, RTS 2022/2114]`.
- [ ] Pas de donnée nominative au-delà du nécessaire (RGPD : minimisation).
- [ ] Validation COMPL avant transmission ; horodatage + archivage (WF-7).
- [ ] IFU : cohérence avec les flux de distribution réels.
- [ ] Conservation des rapports ≥ 5 ans.

**RACI WF-10** : Agrégation = **R** SYS. Revue/validation = **R/A** COMPL. Transmission AMF/Tracfin = **R** COMPL, **A** dirigeant PSFP. IFU = **R** OPS/expert-comptable, **A** COMPL.

---

## 12. Matrice de cohérence inter-workflows (anti-FIA + protection)

| Garde-fou verrouillé | Workflow(s) qui l'implémentent | Point de contrôle code |
|---|---|---|
| Pas de pré-collecte (I1) | WF-4 (soft-reserve sans €), WF-5 (séquestre) | `subscriptions.state ∈ {SOFT_RESERVED,...}` n'autorise aucun ordre de versement avant `COMMITTED` |
| Plateforme ne détient pas les fonds (I2) | WF-5, WF-6 | Aucun IBAN/wallet plateforme dans les flux ; uniquement séquestre/CASP |
| Choix deal-by-deal réel (I3) | WF-4 (réservation par deal + signature), WF-8 | 1 souscription = 1 deal explicitement choisi + signé |
| DEEP source de vérité (I4) | WF-9, WF-5 §6.2 | Réconciliation `Σ on-chain == Σ DEEP` ; freeze si divergence |
| EUR par défaut / pas USDT (I5) | WF-5, WF-6 | Allowlist actifs = {EURC, EURe} ; rejet sinon |
| Délai 4 j (I6) | WF-4 | `REFLECTION_PERIOD` calculé serveur, closing bloqué avant expiration |
| Plafonds non-avertis (I7) | WF-3, WF-4 | gate `max(1000, 5% patrimoine)` à chaque souscription |
| Audit immuable (I8) | WF-7 (+ tous) | WORM, chaînage hash, no UPDATE/DELETE |

---

## 13. Artefact SQL — schéma de conformité (aligné pattern multi-tenant du repo)

> **Conventions respectées** (cf. `supabase/migrations/0008_crm.sql`) : `user_id` (référence `auth.users`) + `tenant_id text default 'real-estate-agent'`, RLS `for all using/with check ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()))`, **index sur chaque FK**, trigger `set_updated_at()`.
> **Statut** : `[ANALYSE]` artefact de conception, à appliquer via `mcp__supabase__apply_migration` (numéro à attribuer après les migrations métier ; ne PAS écraser une migration existante). Ce fichier vit dans `docs/produit/` (livrable conception) — la migration réelle ira dans `supabase/migrations/` lors de l'implémentation.
> **Note d'architecture** : les deals/SPV/émetteurs sont des **entités back-office** (souvent partagées au tenant, pas « possédées » par un investisseur). Pour ces tables on garde `tenant_id` + RLS tenant, mais on **n'impose pas** `auth.uid() = user_id` (sinon un investisseur ne verrait pas les deals). Les tables **investisseur** (assessment, subscription, deposit, kyc) gardent le double filtre owner+tenant.

```sql
-- ════════════════════════════════════════════════════════════════════════════
-- 08_conformite_operationnelle  —  workflows PSFP/ECSP + LCB-FT + legal-tech
-- Pattern : tenant_id partout ; owner (user_id) sur les tables investisseur.
-- Source de vérité juridique : DEEP. On-chain = miroir.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── helper : interdit UPDATE/DELETE sur les tables WORM ──────────────────────
create or replace function public.deny_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'append-only table: % not allowed', tg_op;
end $$;

-- ─── helper : tenant courant (réutilise l'existant) ──────────────────────────
-- public.current_tenant_id() déjà défini en 0003 ; public.set_updated_at() en 0007.

-- ════════════════ A. ENTITÉS BACK-OFFICE (tenant-scoped, non owner) ══════════

-- Émetteur (SAS opérationnelle / SPV) — 1 SPV = 1 opération
create table if not exists issuers (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       text not null default 'real-estate-agent',
  legal_name      text not null,
  siren           text,
  form            text not null default 'SAS' check (form in ('SAS','SA')), -- seules les sociétés par actions émettent des titres financiers
  role            text not null default 'spv' check (role in ('topco','opco_platform','operator','spv')),
  is_marchand_de_biens boolean not null default true, -- objet commercial réel = garde anti-FIA
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Deal / opération (obligations émises par un issuer)
create table if not exists deals (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       text not null default 'real-estate-agent',
  issuer_id       uuid not null references issuers(id) on delete restrict,
  code            text not null,                 -- ex. "LYON6-HAUSSMANN"
  instrument      text not null default 'obligation'
                  check (instrument in ('obligation','obligation_subordonnee','action_preference')),
  state           text not null default 'DRAFT'
                  check (state in ('DRAFT','FUNDING_OPEN','THRESHOLD_REACHED','CONDITIONS_MET',
                                   'CLOSING_IN_PROGRESS','CLOSED','FUNDING_FAILED','REFUND_PENDING',
                                   'REFUNDED','CANCELLED')),
  -- paramètres de levée (anti-magic-number : tout vient d'ici, pas de hardcode)
  target_amount_eur     numeric not null,
  threshold_min_eur     numeric not null,        -- seuil min = condition suspensive CS1
  ticket_min_eur        numeric not null default 1000,
  ticket_max_eur        numeric not null,
  funding_deadline      timestamptz not null,
  conditions_deadline   timestamptz not null,    -- date limite levée des CS (prêt, etc.)
  bank_loan_confirmed   boolean not null default false,  -- CS2
  jurisdiction          text not null default 'FR',
  settlement_eur        boolean not null default true,
  settlement_stablecoin boolean not null default false,  -- EURC/EURe via CASP, jamais USDT
  refund_batch_status   text not null default 'NONE' check (refund_batch_status in ('NONE','RUNNING','DONE')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Conditions suspensives paramétrables (CS1, CS2, + permis, expertise…)
create table if not exists deal_closing_conditions (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       text not null default 'real-estate-agent',
  deal_id         uuid not null references deals(id) on delete cascade,
  code            text not null,                 -- 'THRESHOLD','BANK_LOAN','PERMIT','VALUATION'
  label           text not null,
  is_met          boolean not null default false,
  met_at          timestamptz,
  evidence_document_id uuid,                      -- lien GED (WF-8)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ════════════════ B. ONBOARDING INVESTISSEUR (owner + tenant) ════════════════

-- Dossier KYC/AML (WF-2)
create table if not exists kyc_cases (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete cascade,
  tenant_id       text not null default 'real-estate-agent',
  state           text not null default 'NOT_STARTED'
                  check (state in ('NOT_STARTED','PENDING_DOCS','UNDER_REVIEW','VERIFIED',
                                   'VERIFIED_ONCHAIN','RE_KYC_DUE','REJECTED','FROZEN')),
  provider        text,                           -- 'sumsub' | 'onfido'
  provider_ref    text,                           -- id dossier prestataire
  risk_level      text not null default 'standard' check (risk_level in ('standard','high')),
  source_of_funds text,
  is_pep          boolean not null default false,
  sanctions_clear boolean not null default false,
  onchainid_address text,                         -- identité on-chain (soulbound)
  wallet_address  text,                           -- wallet whitelisté
  verified_at     timestamptz,
  re_kyc_due_at   timestamptz,                    -- standard ≤5 ans, high = 1 an
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Test + classification (WF-3)
create table if not exists investor_assessments (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete cascade,
  tenant_id       text not null default 'real-estate-agent',
  state           text not null default 'ASSESSMENT_REQUIRED'
                  check (state in ('ASSESSMENT_REQUIRED','KNOWLEDGE_TEST','LOSS_CAPACITY_SIM',
                                   'SOPHISTICATED_REVIEW','CLASSIFIED_RETAIL','CLASSIFIED_SOPHISTICATED',
                                   'TEST_FAILED','ASSESSMENT_EXPIRED')),
  classification  text check (classification in ('retail','sophisticated')),
  knowledge_score numeric,
  knowledge_passed boolean,
  -- capacité de perte (art. 21(5) ECSP)
  annual_income_eur     numeric,
  liquid_assets_eur     numeric,
  financial_commitments_eur numeric,
  net_worth_eur   numeric generated always as
                  (coalesce(annual_income_eur,0) + coalesce(liquid_assets_eur,0)
                   - coalesce(financial_commitments_eur,0)) stored,
  classified_at   timestamptz,
  expires_at      timestamptz,                    -- retail +1 an ; sophisticated +2 ans
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ════════════════ C. SOUSCRIPTION → SÉQUESTRE (owner + tenant) ═══════════════

-- Souscription (WF-4) — état machine
create table if not exists subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete cascade,
  tenant_id       text not null default 'real-estate-agent',
  deal_id         uuid not null references deals(id) on delete restrict,
  state           text not null default 'SOFT_RESERVED'
                  check (state in ('SOFT_RESERVED','REFLECTION_PERIOD','COMMITTED',
                                   'AWAITING_FUNDS','WITHDRAWN')),
  amount_eur      numeric not null,
  kiis_version_hash text not null,                -- hash du KIIS lu (WF-1) — opposabilité
  kiis_acknowledged_at timestamptz not null,
  -- plafond non-averti (I7)
  exceeds_cap     boolean not null default false,
  cap_warning_ack_at timestamptz,                 -- consentement exprès si dépassement
  -- délai de réflexion (I6)
  reflection_starts_at timestamptz,
  reflection_ends_at   timestamptz,              -- starts + 4 jours civils
  withdrawn_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Dépôt en séquestre (WF-5) — jamais sur compte plateforme (I2)
create table if not exists escrow_deposits (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete cascade,
  tenant_id       text not null default 'real-estate-agent',
  subscription_id uuid not null references subscriptions(id) on delete restrict,
  deal_id         uuid not null references deals(id) on delete restrict,
  state           text not null default 'EXPECTED'
                  check (state in ('EXPECTED','HELD_IN_ESCROW','RELEASED_TO_SPV',
                                   'REFUND_INITIATED','REFUNDED')),
  escrow_provider text not null,                  -- 'notaire' | 'carpa' | 'emi_cantonnement'
  escrow_ref      text,
  entry_method    text not null default 'sepa' check (entry_method in ('sepa','stablecoin')),
  amount_eur      numeric not null,
  is_withdrawable boolean not null default true,  -- true tant que délai 4j non purgé
  received_at     timestamptz,
  released_at     timestamptz,
  refunded_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Travel Rule (WF-6) — entrées stablecoin
create table if not exists travel_rule_records (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete cascade,
  tenant_id       text not null default 'real-estate-agent',
  escrow_deposit_id uuid references escrow_deposits(id) on delete set null,
  state           text not null default 'RAMP_INITIATED'
                  check (state in ('RAMP_INITIATED','AWAITING_ONCHAIN_TX','SCREENING',
                                   'TRAVEL_RULE_OK','BLOCKED','CONVERTED_TO_EUR','SETTLED_TO_ESCROW')),
  casp_provider   text not null,                  -- 'circle' (EURC) | 'monerium' (EURe)
  asset           text not null check (asset in ('EURC','EURe')), -- jamais USDT (I5)
  chain           text not null,
  tx_hash         text,
  originator_info jsonb,                          -- TFR 2023/1113
  beneficiary_info jsonb,
  screening_result text,                          -- 'clean' | 'sanctions' | 'mixer'
  amount_token    numeric,
  amount_eur      numeric,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ════════════════ D. DOCUMENTS & SIGNATURE eIDAS (WF-1, WF-8) ════════════════

-- KIIS / DIS versionnés (WF-1)
create table if not exists kiis_documents (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       text not null default 'real-estate-agent',
  deal_id         uuid not null references deals(id) on delete cascade,
  doc_type        text not null default 'KIIS' check (doc_type in ('KIIS','DIS')),
  current_version int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists kiis_versions (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       text not null default 'real-estate-agent',
  kiis_document_id uuid not null references kiis_documents(id) on delete cascade,
  version         int not null,
  state           text not null default 'DRAFT'
                  check (state in ('DRAFT','PENDING_COMPLIANCE_REVIEW','APPROVED',
                                   'PUBLISHED','SUPERSEDED','ARCHIVED')),
  pdf_sha256      text,                           -- figé à PUBLISHED
  content         jsonb,                          -- sections A-G ECSP
  review_notes    text,
  published_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Enveloppes de signature eIDAS (WF-8)
create table if not exists signature_envelopes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete cascade,
  tenant_id       text not null default 'real-estate-agent',
  subscription_id uuid references subscriptions(id) on delete set null,
  doc_kind        text not null check (doc_kind in ('bulletin_souscription','contrat_emission',
                                                    'cgu_disclosures','cap_warning','intercreditor')),
  state           text not null default 'DRAFT'
                  check (state in ('DRAFT','SENT','VIEWED','SIGNED','SEALED','ARCHIVED','EXPIRED','DECLINED')),
  provider        text not null default 'yousign',
  signature_level text not null default 'AdES' check (signature_level in ('SES','AdES','QES')),
  provider_ref    text,
  doc_sha256      text,
  signed_at       timestamptz,
  sealed_at       timestamptz,
  audit_trail     jsonb,                          -- piste eIDAS du prestataire
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ════════════════ E. REGISTRES LÉGAUX (WF-9) ════════════════════════════════

-- Registre des obligations / position de chaque porteur (DEEP = source de vérité)
create table if not exists bond_register (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       text not null default 'real-estate-agent',
  deal_id         uuid not null references deals(id) on delete restrict,
  holder_user_id  uuid references auth.users(id) on delete restrict, -- titulaire KYC
  subscription_id uuid references subscriptions(id) on delete set null,
  state           text not null default 'INSCRIBED_DEEP'
                  check (state in ('INSCRIBED_DEEP','MIRRORED_ONCHAIN','TRANSFER_PENDING',
                                   'FROZEN','REDEEMED_DEEP','EXTINGUISHED')),
  nominal_eur     numeric not null,
  units           numeric not null,               -- nb d'obligations
  rate_or_index   text,                           -- jamais "garanti"
  rank            text not null default 'subordonnee' check (rank in ('senior','subordonnee')),
  inscribed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Inscriptions DEEP (acte juridique d'inscription en DLT)
create table if not exists deep_inscriptions (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       text not null default 'real-estate-agent',
  bond_register_id uuid not null references bond_register(id) on delete cascade,
  registrar       text not null,                  -- 'tokeny' | teneur de registre
  inscription_ref text,
  -- miroir on-chain
  onchain_contract text,                          -- adresse ERC-3643
  onchain_chain   text,
  onchain_token_units numeric,
  reconciled      boolean not null default false, -- Σ on-chain == Σ DEEP ?
  inscribed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Masse des obligataires (L.228-46 s. C. com.)
create table if not exists bondholder_mass (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       text not null default 'real-estate-agent',
  deal_id         uuid not null references deals(id) on delete cascade,
  representative_name text,                        -- représentant de la masse (L.228-47)
  representative_contact text,
  constituted_at  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ════════════════ F. REPORTING RÉGLEMENTAIRE (WF-10) ═════════════════════════
create table if not exists regulatory_reports (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       text not null default 'real-estate-agent',
  report_type     text not null check (report_type in ('psfp_annual','default_rate','tracfin',
                                                       'investor_quarterly','ifu','incident')),
  state           text not null default 'DUE'
                  check (state in ('DUE','DRAFT','REVIEWED','APPROVED','SUBMITTED','ACKNOWLEDGED','ARCHIVED')),
  period_start    date,
  period_end      date,
  payload         jsonb,
  submitted_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ════════════════ G. PISTE D'AUDIT IMMUABLE — WORM (WF-7) ════════════════════
create table if not exists compliance_audit_log (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       text not null default 'real-estate-agent',
  actor           text not null,                  -- 'INV'|'OPS'|'COMPL'|'SYS'|...
  event_type      text not null,                  -- 'KYC_VERIFIED','CAP_WARNING_ACK','CLOSING','REFUND'...
  entity_type     text,                           -- 'subscription'|'deal'|'kyc_case'...
  entity_id       uuid,
  decision        text,
  reason          text,
  payload         jsonb,                          -- état canonicalisé
  prev_hash       text not null,                  -- chaînage
  entry_hash      text not null,                  -- SHA256(prev_hash||payload||ts||actor)
  created_at      timestamptz not null default now()
);

-- ─── triggers updated_at ─────────────────────────────────────────────────────
create trigger trg_issuers_updated_at      before update on issuers      for each row execute function public.set_updated_at();
create trigger trg_deals_updated_at        before update on deals        for each row execute function public.set_updated_at();
create trigger trg_dcc_updated_at          before update on deal_closing_conditions for each row execute function public.set_updated_at();
create trigger trg_kyc_updated_at          before update on kyc_cases    for each row execute function public.set_updated_at();
create trigger trg_assess_updated_at       before update on investor_assessments for each row execute function public.set_updated_at();
create trigger trg_subs_updated_at         before update on subscriptions for each row execute function public.set_updated_at();
create trigger trg_escrow_updated_at       before update on escrow_deposits for each row execute function public.set_updated_at();
create trigger trg_travel_updated_at       before update on travel_rule_records for each row execute function public.set_updated_at();
create trigger trg_kiisdoc_updated_at      before update on kiis_documents for each row execute function public.set_updated_at();
create trigger trg_kiisver_updated_at      before update on kiis_versions for each row execute function public.set_updated_at();
create trigger trg_sig_updated_at          before update on signature_envelopes for each row execute function public.set_updated_at();
create trigger trg_bondreg_updated_at      before update on bond_register for each row execute function public.set_updated_at();
create trigger trg_deep_updated_at         before update on deep_inscriptions for each row execute function public.set_updated_at();
create trigger trg_mass_updated_at         before update on bondholder_mass for each row execute function public.set_updated_at();
create trigger trg_reports_updated_at      before update on regulatory_reports for each row execute function public.set_updated_at();

-- ─── WORM : interdit UPDATE/DELETE sur le journal d'audit (I8) ────────────────
create trigger trg_audit_no_update before update on compliance_audit_log for each row execute function public.deny_mutation();
create trigger trg_audit_no_delete before delete on compliance_audit_log for each row execute function public.deny_mutation();

-- ─── INDEX sur chaque FK (convention repo) ───────────────────────────────────
create index if not exists idx_deals_tenant            on deals(tenant_id);
create index if not exists idx_deals_issuer            on deals(issuer_id);
create index if not exists idx_deals_state             on deals(state);
create index if not exists idx_issuers_tenant          on issuers(tenant_id);
create index if not exists idx_dcc_tenant              on deal_closing_conditions(tenant_id);
create index if not exists idx_dcc_deal                on deal_closing_conditions(deal_id);
create index if not exists idx_kyc_user                on kyc_cases(user_id);
create index if not exists idx_kyc_tenant              on kyc_cases(tenant_id);
create index if not exists idx_kyc_state               on kyc_cases(state);
create index if not exists idx_assess_user             on investor_assessments(user_id);
create index if not exists idx_assess_tenant           on investor_assessments(tenant_id);
create index if not exists idx_subs_user               on subscriptions(user_id);
create index if not exists idx_subs_tenant             on subscriptions(tenant_id);
create index if not exists idx_subs_deal               on subscriptions(deal_id);
create index if not exists idx_subs_state              on subscriptions(state);
create index if not exists idx_escrow_user             on escrow_deposits(user_id);
create index if not exists idx_escrow_tenant           on escrow_deposits(tenant_id);
create index if not exists idx_escrow_sub              on escrow_deposits(subscription_id);
create index if not exists idx_escrow_deal             on escrow_deposits(deal_id);
create index if not exists idx_escrow_state            on escrow_deposits(state);
create index if not exists idx_travel_user             on travel_rule_records(user_id);
create index if not exists idx_travel_tenant           on travel_rule_records(tenant_id);
create index if not exists idx_travel_deposit          on travel_rule_records(escrow_deposit_id);
create index if not exists idx_kiisdoc_tenant          on kiis_documents(tenant_id);
create index if not exists idx_kiisdoc_deal            on kiis_documents(deal_id);
create index if not exists idx_kiisver_tenant          on kiis_versions(tenant_id);
create index if not exists idx_kiisver_doc             on kiis_versions(kiis_document_id);
create index if not exists idx_sig_user                on signature_envelopes(user_id);
create index if not exists idx_sig_tenant              on signature_envelopes(tenant_id);
create index if not exists idx_sig_sub                 on signature_envelopes(subscription_id);
create index if not exists idx_bondreg_tenant          on bond_register(tenant_id);
create index if not exists idx_bondreg_deal            on bond_register(deal_id);
create index if not exists idx_bondreg_holder          on bond_register(holder_user_id);
create index if not exists idx_bondreg_sub             on bond_register(subscription_id);
create index if not exists idx_deep_tenant             on deep_inscriptions(tenant_id);
create index if not exists idx_deep_bondreg            on deep_inscriptions(bond_register_id);
create index if not exists idx_mass_tenant             on bondholder_mass(tenant_id);
create index if not exists idx_mass_deal               on bondholder_mass(deal_id);
create index if not exists idx_reports_tenant          on regulatory_reports(tenant_id);
create index if not exists idx_audit_tenant            on compliance_audit_log(tenant_id);
create index if not exists idx_audit_entity            on compliance_audit_log(entity_type, entity_id);
create index if not exists idx_audit_created           on compliance_audit_log(created_at);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table issuers                 enable row level security;
alter table deals                   enable row level security;
alter table deal_closing_conditions enable row level security;
alter table kyc_cases               enable row level security;
alter table investor_assessments    enable row level security;
alter table subscriptions           enable row level security;
alter table escrow_deposits         enable row level security;
alter table travel_rule_records     enable row level security;
alter table kiis_documents          enable row level security;
alter table kiis_versions           enable row level security;
alter table signature_envelopes     enable row level security;
alter table bond_register           enable row level security;
alter table deep_inscriptions       enable row level security;
alter table bondholder_mass         enable row level security;
alter table regulatory_reports      enable row level security;
alter table compliance_audit_log    enable row level security;

-- Tables back-office : visibles dans le tenant (lecture pour les investisseurs du tenant),
-- écriture réservée au service-role (back-office) qui bypass RLS.
create policy "tenant read issuers"  on issuers  for select using (tenant_id = (select public.current_tenant_id()));
create policy "tenant read deals"    on deals    for select using (tenant_id = (select public.current_tenant_id()));
create policy "tenant read dcc"      on deal_closing_conditions for select using (tenant_id = (select public.current_tenant_id()));
create policy "tenant read kiisdoc"  on kiis_documents for select using (tenant_id = (select public.current_tenant_id()));
create policy "tenant read kiisver"  on kiis_versions  for select using (tenant_id = (select public.current_tenant_id()) and state = 'PUBLISHED');
create policy "tenant read mass"     on bondholder_mass for select using (tenant_id = (select public.current_tenant_id()));

-- Tables investisseur : owner + tenant (pattern 0008_crm.sql).
create policy "own kyc"        on kyc_cases            for all
  using ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()))
  with check ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()));
create policy "own assessment" on investor_assessments for all
  using ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()))
  with check ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()));
create policy "own subscriptions" on subscriptions     for all
  using ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()))
  with check ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()));
create policy "own escrow"     on escrow_deposits      for all
  using ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()))
  with check ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()));
create policy "own travel"     on travel_rule_records  for all
  using ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()))
  with check ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()));
create policy "own signatures" on signature_envelopes  for all
  using ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()))
  with check ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()));
create policy "own bondreg read" on bond_register      for select
  using ((select auth.uid()) = holder_user_id and tenant_id = (select public.current_tenant_id()));

-- compliance_audit_log : lecture tenant (COMPL via back-office), INSERT only, jamais UPDATE/DELETE.
create policy "tenant read audit"   on compliance_audit_log for select using (tenant_id = (select public.current_tenant_id()));
create policy "tenant insert audit" on compliance_audit_log for insert with check (tenant_id = (select public.current_tenant_id()));
-- (pas de policy UPDATE/DELETE → refusé par défaut ; + triggers WORM en double sécurité)
```

---

## 14. Plan d'implémentation produit (mapping vers le repo Next.js 16)

`[ANALYSE]` Ordre de câblage recommandé (chaque route émet vers `compliance_audit_log`) :

1. **Migration** `supabase/migrations/00NN_conformite.sql` (SQL §13) → `mcp__supabase__apply_migration` puis `generate_typescript_types`.
2. **Machines à états** : `lib/compliance/state-machines/` — une fonction de transition par WF, **validation serveur des gardes** (jamais côté client). Toute transition interdite lève une erreur typée.
3. **Routes API** (`app/api/...`, runtime `nodejs`) :
   - `POST /api/kyc/start|callback` (webhook Sumsub signé) — WF-2
   - `POST /api/assessment/test|classify` — WF-3 (gate plafond ici)
   - `POST /api/deals/[id]/reserve|confirm|withdraw` — WF-4
   - `POST /api/escrow/webhook` (séquestre) + `POST /api/casp/webhook` (Travel Rule) — WF-5/WF-6
   - `POST /api/deals/[id]/close` (saga §6.2, **service-role**, idempotente) — WF-5/WF-9
   - cron `POST /api/jobs/refund` (§6.3) — WF-5
   - `POST /api/kiis/[dealId]/submit|approve|publish` — WF-1
   - `POST /api/sign/envelope|callback` — WF-8
   - `GET /api/reports/[type]` (agrégations) — WF-10
4. **Middleware d'audit** : un wrapper `withAudit(eventType, fn)` qui, après chaque transition, écrit l'entrée chaînée (hash) sous verrou (sérialisation par tenant).
5. **UI Cockpit** : badges produit ([Étude P6]), compte à rebours délai 4 j, gate avertissement plafond, accusé de lecture KIIS — **tokens `--ct-*` uniquement**, `data-product` = seul switch d'accent (cf. CLAUDE.md / SPEC Cockpit).

---

## 15. Risques & incertitudes de conformité (à trancher avec LEGAL)

1. `[HYPOTHÈSE]` **Niveau de signature eIDAS** requis pour le bulletin de souscription : AdES suffit-il ou QES nécessaire ? Impact UX/coût.
2. `[HYPOTHÈSE]` **Délai 4 j appliqué aux avertis** : l'ECSP ne l'impose qu'aux non-avertis ; faut-il l'étendre par prudence produit ?
3. `[HYPOTHÈSE]` **Patrimoine net auto-déclaré** (art. 21(5)) : quelle preuve exiger pour les gros tickets ? Risque de fausse déclaration → vigilance LCB-FT.
4. `[INCERTAIN]` **Périmètre carte T (loi Hoguet)** : non requise si SPV achète/revend en propre, mais à confirmer selon le rôle exact de la plateforme [Étude P13].
5. `[HYPOTHÈSE]` **Ancrage on-chain du hash d'audit** (notarisation périodique) : utile pour la preuve mais ajoute une dépendance ; optionnel.
6. `[INCERTAIN]` **Atomicité DvP closing** : le séquestre off-chain n'offre pas de rollback technique une fois le notaire a débloqué → la compensation §6.2 repose sur une régularisation DEEP manuelle ; à valider avec le notaire/registrar.
7. `[FAIT, rappel]` La frontière FIA est **casuistique** : ces workflows minimisent le risque (créance d'opco réelle, deal-by-deal, séquestre, pas de pooling) mais **ne garantissent pas** la non-requalification. Memo avocat AIFM indispensable avant lancement.
8. `[ANALYSE]` **Reporting taux de défaut** : la méthodologie exacte (seuil de jours de retard) suit le RTS 2022/2114 — paramétrer précisément la définition du défaut par deal.
