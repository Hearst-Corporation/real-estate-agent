# 10 — Stratégie Go-To-Market & Growth
## Marketplace deal-by-deal d'obligations immobilières tokenisées (FR/UE) — Juin 2026

> **Cadre verrouillé (rappel).** Ce document découle de `docs/etude-immobilier-tokenise-2026.md`. Tout le GTM est borné par : (1) obligations émises par SAS opérationnelle, 1 SPV = 1 opération, distribution PSFP/ECSP ; (2) **anti-FIA absolu** — aucune pré-collecte, aucun pooling, aucune NAV globale, aucun rebalancing, choix deal-by-deal RÉEL ; (3) security token ERC-3643 en miroir DEEP, jamais ERC-4626 ; (4) règlement EUR séquestre tiers par défaut, EURC/EURe via CASP régulé en option, jamais USDT ; (5) la plateforme ne détient jamais les fonds. Tags : **[FAIT]** norme/décision citée · **[ANALYSE]** raisonnement · **[HYPOTHÈSE]** zone grise.
>
> **Avertissement marketing-conformité.** Aucune affirmation commerciale de ce GTM ne doit promettre un rendement, parler de « propriété » d'un immeuble (l'investisseur est **créancier obligataire**), ni suggérer une sélection de portefeuille faite « à la place » de l'investisseur. [FAIT] Mise en garde AMF 29/12/2022 sur les « royalties immobilières » + interdiction de promettre un taux (KIIS ECSP). **La conformité n'est pas un frein marketing : c'est l'argument marketing n°1.**

---

## 0. TL;DR — La thèse GTM en 12 lignes

1. **Marché à deux faces, goulot = l'offre, pas la demande.** En crowdfunding immo FR, la demande retail/averti existe déjà (>2,3 Md€/an collectés tous acteurs). Le vrai combat est le **sourcing d'opérateurs marchands-de-biens/promoteurs de qualité**. On gagne en devenant **le canal de financement préféré des meilleurs opérateurs**, pas en achetant de la pub investisseur.
2. **Wedge = averti FR d'abord.** Placement privé (qualifiés / ≥100 k€) sur 2-3 deals pilotes → preuve de track-record et de remboursement AVANT d'ouvrir au retail sous PSFP. On n'achète pas d'audience large tant qu'on n'a pas un historique de remboursement.
3. **Différenciation = transparence radicale on-chain + conformité PSFP.** On bat ClubFunding (opaque, pas tokenisé) sur la **preuve cryptographique de la cap table et des flux**, et on bat RealT/Lofty (zone grise US) sur le **statut régulé UE + passeport**.
4. **Modèle économique GTM = fees alignés** (entrée + admin + carried plateforme) — détaillé en §9, à valider avec le doc pricing (07-moteur-financier).
5. **Roadmap business 12 mois : Pilote (M0-M4) → V2 PSFP partenaire (M4-M9) → Scale UE + Reg S (M9-M12).**
6. **KPIs nord : deals sourcés qualifiés/mois, taux de remboursement à l'échéance, CAC investisseur averti, conversion souscription, NPS opérateur.**

---

## 1. Marché, segmentation et taille (TAM/SAM/SOM)

### 1.1 Réalité du marché [FAIT/ANALYSE]
- [FAIT] Le crowdfunding immobilier FR a collecté **>1,2 Md€ par ClubFunding** (cumul, leader PSFP) ; le segment dette promoteur/marchand de biens est le format dominant et **prouvé anti-FIA** (étude P12).
- [FAIT] Statut **PSFP/ECSP** : passeport UE, plafond **5 M€/porteur/12 mois**, accessible au retail avec test investisseur + délai 4 j (étude P13).
- [FAIT] Fragilité du cycle : **WiSEED en redressement judiciaire 2025**, **Homunity retards**, **BrickVest faillite 2019** (étude P12). → La **due diligence et le taux de remboursement** sont l'avantage défendable, pas le volume.
- [ANALYSE] La tokenisation conforme (ERC-3643 + DEEP) n'a **aucun acteur FR dominant** : RealT/Lofty sont US en zone grise, Brickken/Tokeny sont des infra B2B. **Fenêtre ouverte** pour le premier acteur FR « marketplace tokenisée régulée ».

### 1.2 TAM / SAM / SOM [ANALYSE / HYPOTHÈSE chiffres]
> Chiffres = ordres de grandeur de cadrage, à recouper avec data AMF/ASPIM avant board. Tagués [HYPOTHÈSE].

| Niveau | Définition | Taille indicative | Source/logique |
|---|---|---|---|
| **TAM** | Épargne immobilière non cotée adressable UE (crowdfunding + club deals + SCPI digitalisable) | ~10-15 Md€/an de flux | [HYPOTHÈSE] extrapolation marché crowdfunding immo EU + report SCPI |
| **SAM FR an 1-2** | Crowdfunding immo dette FR (marché PSFP existant) | ~2-2,5 Md€/an collectés | [FAIT/ANALYSE] benchmark ClubFunding + Anaxago + Homunity + La Première Brique |
| **SOM 12 mois** | Part réaliste capturable (nouvel entrant tokenisé) | **8-15 M€ collectés** sur 12 mois | [HYPOTHÈSE] 3-6 deals retail PSFP @ 1-3 M€ + 2-3 deals pilotes privés |
| **SOM 36 mois** | Avec passeport UE + Reg S international | **60-120 M€/an** | [HYPOTHÈSE] scale multi-pays |

### 1.3 Segmentation des DEUX faces

**Face DEMANDE — investisseurs (4 segments, dans l'ordre d'attaque) :**

| Priorité | Segment | Profil | Ticket | Statut réglementaire | Pourquoi cet ordre |
|---|---|---|---|---|---|
| **#1 (M0-M4)** | **Investisseur averti / qualifié FR** | CSP+, entrepreneurs, family offices junior, crypto-natifs fortunés | 20-200 k€ | Placement privé (qualifiés / ≥100 k€, <150 pers.) [FAIT] | Pas besoin de PSFP, validation du produit, tickets élevés, tolérants au lock-up |
| **#2 (M4-M9)** | **Retail averti immo FR** | déjà clients ClubFunding/Anaxago, cherchent rendement + transparence | 1-20 k€ | PSFP/ECSP (test + délai 4 j) [FAIT] | Marché chaud, comprend le risque dette promoteur |
| **#3 (M9-M12)** | **Retail UE (passeport)** | Belgique, Luxembourg, Allemagne, Espagne, Italie | 1-20 k€ | PSFP passeporté [FAIT] | Un seul agrément → distribution UE |
| **#4 (M9+)** | **International hors UE (Reg S)** | non-US persons, crypto-natifs internationaux | 5-100 k€ | Reg S (modèle RealT) [FAIT P12] | Liquidité on-chain, demande crypto RWA mondiale |

> **Exclusion stricte :** investisseurs **US persons** (Reg S impose leur exclusion), et toute juridiction sous embargo (transfer restrictions ERC-3643 par code pays ISO-3166 — étude P9).

**Face OFFRE — opérateurs / sourcing de deals (le vrai goulot) :**

| Segment opérateur | Profil | Besoin | Notre proposition de valeur |
|---|---|---|---|
| **Marchand de biens établi** | 5-50 opérations/an, track record, déjà bancarisé | financement junior/mezzanine rapide, complément d'equity | levée tokenisée rapide, base d'investisseurs récurrente, moins cher que la mezzanine classique |
| **Promoteur PME** | opérations VEFA/réhabilitation 2-8 M€ | quasi-equity pour boucler le plan de financement bancaire | obligations subordonnées, intercreditor clé en main |
| **Marchand de biens émergent** | 1-3 opérations, bon deal mais peu d'historique | accès au capital sans réseau family office | scoring transparent + visibilité, mais **due diligence renforcée** |
| **Apporteurs/agrégateurs** | clubs deals, CGP, foncières opportunistes | placer des tranches | co-distribution |

---

## 2. Positionnement & proposition de valeur (les deux faces)

### 2.1 Positionnement central
> **« La marketplace où vous choisissez chaque opération immobilière, financée par obligation tokenisée, avec une transparence prouvée on-chain et un cadre PSFP — sans jamais confier votre argent à une cagnotte. »**

Trois piliers verrouillés dans la promesse :
1. **Choix réel deal-by-deal** ("vous choisissez, nous ne choisissons pas à votre place") — c'est à la fois le **différenciateur produit** ET la **défense anti-FIA** (étude P10, principe directeur). Le marketing en fait une force : *« Pas de fonds, pas de boîte noire. Chaque euro va dans l'opération que VOUS avez choisie. »*
2. **Transparence prouvée** — cap table on-chain, flux de séquestre traçables, KIIS + scénario pessimiste **toujours affiché** (étude P8 : "toujours montrer le pessimiste").
3. **Créancier protégé, pas spéculateur** — hypothèque 1er rang sur l'actif, intercreditor, SPV ring-fencée. *Jamais le mot "propriétaire".*

### 2.2 Grille concurrentielle — comment on bat chacun [ANALYSE, base P12]

| Concurrent | Sa force | Sa faille | Notre angle d'attaque |
|---|---|---|---|
| **ClubFunding** (FR, leader 1,2 Md€) | track record, volume, confiance | opaque, **non tokenisé**, pas de marché secondaire, reporting PDF | **transparence on-chain + bulletin board + tickets fractionnés tokenisés** |
| **RealT** (US, tokenisé) | liquidité ERC-20, narratif Web3, loyer quotidien | **zone grise securities**, ERC-20 "libre", pas de cadre UE | **ERC-3643 permissionné + PSFP + passeport UE** (conforme = vendable aux institutionnels) |
| **Fundrise** (US) | UX grand public, scale | **pré-collecte = fonds (eREIT)** → modèle FIA-like interdit chez nous | on assume l'inverse : **pas de pooling**, choix deal-by-deal (notre contrainte devient notre USP) |
| **AngelList SPV** (US) | rapidité de structuration SPV | equity only, US, RIA, non tokenisé | **dette tokenisée UE + automatisation SPV→token** |
| **Securitize** (US infra) | infra institutionnelle, BlackRock | B2B pur, pas de marketplace retail | on est le **front marketplace** + l'infra (build-vs-buy : on consomme Tokeny côté infra) |
| **Anaxago / Homunity** (FR) | multi-produits, PSFP | tokenisation absente, retards (Homunity) | **due diligence affichée + remboursement public + tokenisation** |

> **Synthèse positionnement :** on est le **croisement unique** entre la rigueur PSFP française (ClubFunding) et la transparence/liquidité tokenisée (RealT) — mais conforme là où RealT ne l'est pas. Personne n'occupe cette case en FR/UE en 2026. [ANALYSE]

### 2.3 Value props par audience (messages)

**Investisseur averti #1 :**
- "Choisissez vos opérations une par une. Aucune cagnotte, aucun fonds géré dans votre dos."
- "Votre créance est inscrite en registre légal (DEEP) **et** reflétée on-chain. Vérifiez tout."
- "Hypothèque 1er rang, SPV dédiée, intercreditor : vous êtes créancier protégé."

**Retail averti #2 :**
- "L'investissement immobilier en obligation, à partir de 1 000 €, avec la transparence de la blockchain."
- "On vous montre toujours le scénario pessimiste. Risque de perte en capital affiché sans détour."

**Opérateur (face offre) :**
- "Financez votre quasi-equity en 3 semaines, pas 3 mois."
- "Une base d'investisseurs récurrents qui re-souscrit à vos opérations suivantes."
- "Intercreditor et structuration SPV clé en main — vous gardez le pilotage opérationnel."

---

## 3. Acquisition face DEMANDE — investisseurs

### 3.1 Phase 1 — Averti FR (M0-M4) : pas de scale, du sur-mesure
> Objectif : **valider la mécanique + remplir 2-3 deals pilotes en placement privé.** Placement privé strict (<150 personnes/État, qualifiés ou ≥100 k€) → **pas de sollicitation publique généralisée** [FAIT P13]. Le marketing est **ciblé et privé**, pas du paid grand public.

Canaux (par ROI attendu) :
1. **Réseau fondateurs + warm intros** (family offices, entrepreneurs, CGP). CAC ≈ 0 €, conversion la plus haute.
2. **Co-investissement / club privé sur invitation** (waitlist fermée, NDA). Crée la rareté.
3. **LinkedIn ciblé décideurs + content thought-leadership** (le fondateur publie l'analyse réglementaire — la conformité comme contenu, §6).
4. **Partenariats CGP / cabinets de gestion de patrimoine** : ils apportent des clients qualifiés (rétrocession encadrée). [ANALYSE] vérifier statut CIF/MiFID du partenaire.
5. **Communautés crypto-RWA fortunées** (events, Telegram privés tech) — sans promesse de rendement.

À NE PAS faire en phase 1 : Google/Meta Ads grand public, influenceurs crypto rendement, "earn X%". Risque sollicitation publique + AMF.

### 3.2 Phase 2 — Retail averti FR sous PSFP (M4-M9)
> Une fois PSFP (partenaire d'abord) actif → on peut **solliciter le public** dans le cadre ECSP (KIIS, test, délai 4 j). C'est ICI que le funnel paid s'ouvre.

Canaux scalables :
1. **SEO/Content** (cf. §6) — "investir obligation immobilière", "alternative SCPI", "crowdfunding immobilier tokenisé". Coût marginal décroissant, le moteur de CAC le plus durable.
2. **Paid search** (Google Ads sur intentions hautes : "crowdfunding immobilier", "investissement immobilier rendement") — borné par compliance (pas de taux promis dans l'annonce).
3. **Comparateurs/agrégateurs** (HelloCrowdfunding, Finance Héros, Avenue des Investisseurs) — referral, très haute intention.
4. **Referral investisseur→investisseur** (parrainage encadré : avantage non-financier ou bonus conforme, [ANALYSE] vérifier compat. PSFP).
5. **Newsletter / nurturing** : chaque nouveau deal = email à la base whitelistée (l'argent ne bouge pas avant souscription d'un deal précis → conforme anti-pré-collecte).
6. **Webinars deal-by-deal** : présentation d'une opération avec l'opérateur (preuve sociale + transparence).

### 3.3 Phase 3 — UE + Reg S international (M9-M12)
1. **Passeport PSFP** → réplication SEO/content localisé (BE, LU, DE, ES).
2. **Reg S** (non-US persons) → distribution on-chain, communautés crypto-RWA internationales, listing sur agrégateurs RWA (RWA.xyz, etc.).
3. **Partenariats CASP régulés** (Circle/Monerium) pour l'on-ramp EURC/EURe → réduit friction crypto-natifs.

### 3.4 Funnel investisseur détaillé (mappé sur les 16 étapes de l'étude P5)

```
ACQUISITION   → Visite (SEO/paid/referral/warm)
ACTIVATION    → Inscription (email+mdp) + accept CGU/disclosures      [étape 1]
              → KYC/AML (Sumsub) + wallet + ONCHAINID                 [étapes 2-3]
              → Profil investisseur (test ECSP, classif averti/non)   [étape 4]
INTÉRÊT       → Parcours deals (AUCUNE pré-collecte)                  [étape 5]
              → Badge produit + fiche détaillée + KIIS + pessimiste   [étapes 6-7]
CONVERSION    → Réservation NON engageante (soft-commit)              [étape 8]
              → Signature eIDAS (bulletin + contrat obligataire)      [étape 9]
              → Dépôt EUR → SÉQUESTRE tiers (délai réflexion 4j)      [étape 10]
CLOSING       → Levée atteinte + prêt bancaire → mint ERC-3643        [étape 11]
              → (si échec : REMBOURSEMENT INTÉGRAL séquestre)
RÉTENTION     → Dashboard suivi + reporting + distribution           [étapes 12-14]
              → Sortie/exit + burn token                             [étape 15]
EXPANSION     → Re-souscription deal suivant + bulletin board        [étape 16]
              → Referral
```

**Métriques de funnel cibles (M4-M9, retail) [HYPOTHÈSE à calibrer] :**
| Étape | Métrique | Cible an 1 |
|---|---|---|
| Visite → Inscription | taux signup | 3-6 % |
| Inscription → KYC validé | taux complétion KYC | 55-70 % (KYC = friction n°1) |
| KYC → 1ʳᵉ souscription | activation | 15-25 % |
| Soft-commit → versement séquestre | conversion finale | 60-80 % |
| Souscripteur → re-souscripteur (90j) | rétention | 30-45 % |

---

## 4. Acquisition face OFFRE — sourcing d'opérateurs & deals (LE goulot critique)

> [ANALYSE] **C'est ici que se gagne ou se perd la boîte.** La demande investisseur est abondante ; les **bons deals avec de bons opérateurs** sont rares. Toute marketplace fintech à deux faces vit ou meurt sur la qualité du côté contraint (ici : l'offre). On y met 60 % de l'énergie GTM en phase pilote.

### 4.1 Pourquoi un opérateur viendrait chez nous (proposition de valeur offre)
1. **Vitesse** : levée junior/mezzanine en ~3 semaines vs. plusieurs mois en mezzanine bancaire/family office.
2. **Coût compétitif** : taux quasi-equity attractif vs. mezzanine institutionnelle (souvent 12-15 %).
3. **Récurrence** : une base d'investisseurs fidèles qui re-souscrit aux opérations suivantes (effet flywheel).
4. **Clé en main légal** : structuration SPV (SAS), contrat d'émission, intercreditor, tokenisation — l'opérateur garde le pilotage opérationnel, on industrialise la dette.
5. **Image** : association à une plateforme transparente et régulée = signal de sérieux vis-à-vis de SES propres partenaires (banque, vendeurs).

### 4.2 Canaux de sourcing d'opérateurs (par ordre de priorité)
1. **Chasse directe ciblée** (M0+) : identifier les 50-100 meilleurs marchands de biens/promoteurs PME FR (via greffes, ventes notariales, réseaux FPI/SNAL, deals passés sur ClubFunding/Anaxago). Approche commerciale 1-to-1.
2. **Réseau bancaire prêteur** (M2+) : les banques qui font le senior ont besoin de quasi-equity pour boucler les dossiers → **co-prescription** (la banque nous envoie l'opérateur qui a besoin de junior). Partenariat clé (§8).
3. **Apporteurs d'affaires / courtiers en financement pro** (M2+) : ils connaissent les opérateurs en recherche de fonds.
4. **Experts-comptables / avocats d'affaires immo** spécialisés MdB.
5. **Inbound via contenu B2B** (M4+) : "comment financer sa quasi-equity de marchand de biens", landing page opérateur.
6. **Events sectoriels** (SIMI, RENT, salons promotion).

### 4.3 Sélection & due diligence — la transparence comme barrière à l'entrée
> [FAIT P12] Les faillites (BrickVest) et RJ (WiSEED) viennent du **risque de crédit mal maîtrisé**. Notre due diligence devient un **actif marketing** : on publie nos critères.

Critères de scoring opérateur/deal (à industrialiser, lien avec 07-moteur-financier) :
- **Track record opérateur** : nombre d'opérations livrées, taux de remboursement passé, antériorité.
- **Skin in the game** : equity sponsor ≥ 10 % (étude P7 exemple ~10 %).
- **LTV / LTC** : LTV cible 55-70 %, marge marchand ≥ 10 % (sous 10 % = fragile, étude P8).
- **Sûretés réelles** : hypothèque 1er rang inscrite, intercreditor signé.
- **Qualité du senior bancaire** : term sheet bancaire obtenu (un deal sans senior = drapeau rouge).
- **Réalité de l'objet commercial** (anti-FIA) : la SPV exerce une **vraie activité MdB/promotion** (étude P11/recadrage 2).

**Taux de sélectivité affiché comme USP** : "Sur N deals analysés, M acceptés" (ex. acceptation 10-20 %). C'est ce que fait le venture pour signaler la qualité. [ANALYSE]

### 4.4 Flywheel deux faces
```
   Plus d'opérateurs de qualité
        ↓
   Plus de deals attractifs & variés
        ↓
   Plus d'investisseurs (choix, diversification deal-by-deal)
        ↓
   Levées remplies plus vite + base récurrente
        ↓
   Plus attractif pour les opérateurs (vitesse + récurrence)
        ↺ (retour au début)
   + couche TRANSPARENCE on-chain qui renforce la confiance à chaque tour
```
**Amorçage du flywheel (chicken-and-egg) :** on résout le démarrage par **(a) les 2-3 deals pilotes** sourcés en direct par le réseau fondateur côté offre, et **(b) le placement privé averti** côté demande (capital concentré, peu d'investisseurs nécessaires). On n'a PAS besoin d'une masse retail pour démarrer.

---

## 5. La confiance / transparence / conformité comme ARME marketing

> [FAIT] Recadrage étude : toujours qualifier juridiquement avant le marketing ; jamais vendre de la "propriété" à un créancier (AMF 2022) ; toujours afficher le risque de perte (KIIS). Dans un marché marqué par les faillites (BrickVest, WiSEED RJ), **la confiance est le produit**.

### 5.1 Les 7 preuves de confiance affichées publiquement
1. **Statut PSFP affiché** (numéro d'agrément REGAFI propre ou du partenaire) — différenciateur vs. zone grise US.
2. **Séquestre tiers vérifiable** : "Nous ne touchons jamais votre argent. Il est bloqué chez [notaire/EMI] jusqu'au closing du deal que vous avez choisi." [FAIT P10]
3. **Cap table on-chain auditable** : registre DEEP (légal) + miroir ERC-3643 (vérifiable par explorer). "Vérifiez votre créance, ne nous croyez pas sur parole."
4. **Scénario pessimiste systématique** sur chaque fiche (étude P8) — honnêteté radicale.
5. **Taux de remboursement public** (dashboard de track-record agrégé, mis à jour) — quand on en aura un, c'est l'arme ultime vs. concurrents opaques.
6. **Due diligence ouverte** : critères publiés, taux de sélectivité affiché.
7. **Risque de perte affiché sans fard** : "perte possible jusqu'à 100 %", "illiquidité (lock-up)", "non garanti" — la transparence sur le risque CRÉE la confiance chez l'averti.

### 5.2 Garde-fous de communication (do/don't) — checklist marketing-compliance
| ✅ AUTORISÉ | ❌ INTERDIT |
|---|---|
| "Rendement cible non garanti", "TRI cible ~X% (non garanti)" | "Rendement garanti X%", "placement sûr" |
| "Créancier obligataire", "vous détenez une obligation" | "Devenez propriétaire", "votre immeuble" |
| "Vous choisissez chaque opération" | "Nous gérons votre portefeuille", "notre fonds" |
| "Risque de perte en capital jusqu'à 100 %" | masquer/minimiser le risque |
| "Liquidité possible via bulletin board (non garantie)" | "revente facile", "liquidité garantie" |
| "Compatible EURC/EURe via CASP régulé" | accepter/promouvoir l'USDT en UE |
| KIIS + délai 4 j mis en avant (retail) | sollicitation publique avant PSFP |

> **Process :** toute campagne/landing/email passe par une **revue compliance** avant diffusion (lien avec le RCCI/DPO et l'avocat — étude P15 liste de courses). Le marketing-compliance n'est pas optionnel, c'est un gate.

### 5.3 La conformité comme contenu (retournement)
On transforme la contrainte réglementaire en **autorité de marque** : on publie l'analyse (pourquoi pas de FIA, pourquoi pas de vault, pourquoi ERC-3643 et pas ERC-4626, pourquoi séquestre tiers). Cela :
- éduque le marché (réduit le coût d'acquisition à terme),
- positionne la marque comme **la plus sérieuse**,
- crée du SEO de fond (mots-clés réglementaires à faible concurrence).

---

## 6. Contenu & éducation (moteur de CAC durable)

### 6.1 Stratégie de contenu par étape de maturité de l'audience
| Stade audience | Type de contenu | Objectif | Exemples de pièces |
|---|---|---|---|
| **Inconscient** | Éducatif large | SEO, notoriété | "Crowdfunding immobilier : comment ça marche", "Alternative à la SCPI 2026" |
| **Conscient du problème** | Comparatifs | Considération | "Obligation immo vs SCPI vs crowdfunding equity", "Pourquoi le rendement n'est jamais garanti" |
| **Conscient solution** | Preuve & différenciation | Préférence | "Qu'est-ce qu'un security token immobilier ?", "DEEP + ERC-3643 expliqué", "Pourquoi pas de fonds chez nous" |
| **Prêt à décider** | Deal content + track record | Conversion | fiches deals, webinars, scénarios, taux de remboursement |
| **Client** | Reporting & pédagogie fiscale | Rétention | "Fiscalité de vos obligations (PFU 31,4 % 2026)", reporting trimestriel |

> [FAIT] PFU 2026 = **31,4 %** (étude P13) — corriger tout contenu citant "30 %".

### 6.2 Formats & cadence
- **Blog/SEO** : 2-4 articles/mois piliers + clusters (le moteur long terme).
- **Newsletter** : hebdo (nouveaux deals + 1 contenu éduc).
- **Webinars deal-by-deal** : 1-2/mois avec l'opérateur (transparence + preuve sociale).
- **LinkedIn fondateur** : thought leadership réglementaire (autorité).
- **Glossaire / centre d'aide** : KYC, lock-up, waterfall, security token, séquestre.
- **Rapports de marché annuels** : "État du crowdfunding immobilier tokenisé" (link-building + PR).

### 6.3 Cohérence Design System (Cockpit)
Tout artefact front (landing, dashboard, fiche deal, badges) utilise les tokens `--ct-*` et `data-product` comme switch d'accent — source **locale et éditable** : `app/cockpit/*.css` + `components/cockpit/` (pas de source centrale). Les **badges produit** (étude P6) et **graphiques UX** (étude P8 : donut dette/equity, waterfall, sensibilité, jauge LTV) réutilisent le catalog local `public/cockpit-catalog/catalog/` (`<hearst-asset>` ; donut, sparkline déjà disponibles) — privilégier la composition d'un graphe existant plutôt que d'en recoder un, et libre d'enrichir le catalog local si besoin.

---

## 7. Métriques & KPIs (les deux faces)

### 7.1 North Star Metric
> **NSM = € collectés sur des deals qui seront remboursés intégralement.**
> (Pas juste "€ collectés" : un € collecté sur un deal qui défaut détruit la confiance. La qualité prime le volume.)

### 7.2 KPIs face DEMANDE (investisseur)
| KPI | Définition | Cible an 1 [HYPOTHÈSE] |
|---|---|---|
| **CAC averti** | coût d'acquisition d'un investisseur averti actif | < 150 € (phase 1, surtout warm) |
| **CAC retail** | idem retail PSFP | < 80-120 € |
| **LTV investisseur** | somme des fees générés sur la durée de vie | LTV/CAC ≥ 3 (cible fintech) |
| **Taux conversion souscription** | soft-commit → versement séquestre | 60-80 % |
| **Taux complétion KYC** | inscrits → KYC validé | 55-70 % |
| **Ticket moyen** | montant moyen souscrit | 5-15 k€ (averti) / 1,5-4 k€ (retail) |
| **Taux de re-souscription** | % qui re-souscrit ≥1 deal sous 12 mois | 30-45 % |
| **NPS investisseur** | satisfaction | > 40 |

### 7.3 KPIs face OFFRE (opérateur/deal) — les plus critiques
| KPI | Définition | Cible an 1 [HYPOTHÈSE] |
|---|---|---|
| **Deals sourcés qualifiés/mois** | deals passant le 1ᵉʳ filtre due diligence | ≥ 4-8/mois en régime |
| **Taux de sélectivité** | deals acceptés / deals analysés | 10-20 % (signal qualité) |
| **Time-to-funding** | mise en ligne → levée bouclée | < 3-4 semaines |
| **Taux de remplissage** | deals atteignant 100 % de la levée | > 85 % |
| **Taux de remboursement** | deals remboursés intégralement à l'échéance | **objectif 100 %** (le KPI de survie) |
| **Taux de retard/défaut** | deals en retard ou défaut | < 5 % (vs. concurrents fragiles) |
| **NPS opérateur** | satisfaction opérateurs | > 50 (récurrence = flywheel) |
| **Taux de ré-engagement opérateur** | opérateurs revenant pour un 2ᵉ deal | > 50 % |

### 7.4 KPIs marketplace / santé business
- **GMV** (volume total levé), **net revenue** (fees), **take rate** (revenue/GMV), **burn / runway**, **liquidité bulletin board** (volume secondaire), **temps de closing moyen**.

### 7.5 Instrumentation (lien stack)
- Analytics produit + funnel (events sur les 16 étapes P5).
- Observabilité : Langfuse (LLM chat Cockpit), Sentry, Axiom (infra) — déjà câblés dans le repo.
- Dashboard de track-record public (KPI de remboursement) — à builder côté produit.

---

## 8. Pricing GTM (modèle de revenus aligné)

> [ANALYSE] Le pricing **détaillé** relève de `07-moteur-financier` (waterfall, fees) — ici on pose le **pricing GO-TO-MARKET** : ce qu'on annonce au marché et comment il sert la croissance. Base : template fees de l'étude P7.

### 8.1 Structure de fees (alignement = argument de vente)
| Fee | Payeur | Niveau indicatif (étude P7) | Logique GTM |
|---|---|---|---|
| **Frais d'entrée investisseur** | investisseur | ~1 % à l'entrée | transparent, faible friction |
| **Frais admin annuels** | investisseur | ~0,5 %/an | couvre reporting/registre |
| **Fee opérateur acquisition** | opérateur (SPV) | ~2 % du montant | facturé à l'opérateur, pas à l'investisseur |
| **Carried plateforme** | sur surperformance | part au-delà d'un hurdle (ex. 8 %) | **alignement** : on gagne plus si le deal performe |
| **Fee secondaire** (bulletin board) | cédant | faible % sur transfert P2P | revenu récurrent à terme |

> **Argument GTM clé :** "Nos frais sont alignés sur votre rendement, pas sur votre versement initial." Le carried au-delà d'un hurdle (vs. fee fixe) est un signal de confiance fort vs. concurrents qui prennent leur marge upfront quoi qu'il arrive.

### 8.2 Stratégie de pricing par phase
- **Pilote (M0-M4)** : fees réduits/offerts aux **premiers opérateurs** (incentive d'amorçage du flywheel offre). Côté investisseur averti, possibilité de **conditions founding members** (frais d'entrée réduits) pour récompenser les early adopters.
- **V2 (M4-M9)** : grille standard publiée, transparente (la transparence du pricing = cohérent avec l'ADN).
- **Scale (M9-M12)** : segmentation possible (tickets élevés / family offices : frais dégressifs ; pas de pricing prédateur).

> **Garde-fou compliance pricing :** aucune structure de fee ne doit créer une **promesse de rendement** ni une **pré-collecte**. Les fees ne se déclenchent qu'au closing d'un deal choisi.

---

## 9. Partenariats (le levier de scale)

> [FAIT/ANALYSE] L'architecture de l'étude (P4) impose des partenaires structurels. Le GTM les transforme aussi en **canaux d'acquisition**.

### 9.1 Partenaires réglementaires/infra (obligatoires — gate de lancement)
| Partenaire | Rôle | Qui | Impact GTM |
|---|---|---|---|
| **PSFP partenaire** | distribution sous agrément avant le nôtre | acteur PSFP existant | **débloque le retail immédiatement** (M4) sans attendre 6-12 mois d'agrément AMF [FAIT P14] |
| **Séquestre tiers** | détention des fonds (anti "service de paiement") | notaire / EMI / CARPA | **preuve de confiance #2** (on ne touche pas l'argent) [FAIT P10] |
| **CASP régulé** | on/off-ramp EURC/EURe | Circle (EURC, agréé ACPR) / Monerium (EURe) | ouvre la cible crypto-native sans risque MiCA [FAIT P9] |
| **Agent tokenisation** | ERC-3643 + DEEP + identity registry | Tokeny / Securitize | infra conforme (build-vs-buy : on **achète** la tokenisation) [FAIT P9] |
| **KYC/AML** | vérification + ONCHAINID | Sumsub / Onfido | réduit friction KYC (le drop-off n°1) [FAIT P5] |
| **Signature eIDAS** | bulletins/contrats | Yousign / DocuSign | conversion fluide [FAIT P5] |

### 9.2 Partenaires d'acquisition (croissance)
| Partenaire | Apport | Face |
|---|---|---|
| **Banques prêteuses** (senior) | co-prescription opérateurs ayant besoin de junior | **OFFRE** (le canal de sourcing #2) |
| **Family offices** | tickets élevés averti + crédibilité | DEMANDE |
| **CGP / cabinets de gestion** | clients qualifiés (rétrocession encadrée) | DEMANDE |
| **Apporteurs de deals / courtiers financement pro** | flux de deals | OFFRE |
| **Comparateurs/agrégateurs** (HelloCrowdfunding, RWA.xyz) | trafic haute intention | DEMANDE |
| **Experts-comptables/avocats immo** | sourcing opérateurs + crédibilité | OFFRE |

### 9.3 Priorisation partenariats par phase
- **M0-M2 :** séquestre + KYC + tokenisation + 1 PSFP partenaire (LOI). Sans eux, pas de lancement.
- **M2-M6 :** banques prêteuses (co-prescription offre) + CGP (demande).
- **M6-M12 :** CASP (crypto on-ramp) + agrégateurs RWA internationaux (Reg S).

---

## 10. Roadmap business 12 mois

> Aligné sur les Versions A→B→(amorce C) de l'étude P14 et le plan 30/60/90 P15. Phases trimestrielles.

### T1 (M0-M3) — PILOTE / Placement privé averti [Version A]
**Thème : prouver la mécanique, sourcer les premiers deals, capital concentré.**
- **Offre :** sourcing direct des 2-3 premiers opérateurs de qualité (réseau fondateur). Due diligence des deals pilotes.
- **Demande :** waitlist fermée d'investisseurs **avertis/qualifiés** (warm intros, club privé). Pas de paid.
- **Légal/infra :** memo qualification FIA (avocat), constitution TopCo/OpCo, sélection partenaires (séquestre, KYC, tokenisation), LOI PSFP partenaire.
- **Produit :** MVP front (inscription, KYC, page deal, badges, KIIS, soft-commit, e-sign, séquestre, mint ERC-3643 testnet→mainnet permissionné, dashboard).
- **Cible chiffrée [HYPOTHÈSE] :** 1-2 deals pilotes bouclés, **1-3 M€ collectés**, 20-50 investisseurs avertis.
- **KPI de sortie de phase :** 1ᵉʳ closing réussi + tokens émis + séquestre→SPV fonctionnel.

### T2 (M4-M6) — V2 PSFP PARTENAIRE / Ouverture retail FR [Version B amorce]
**Thème : ouvrir au retail via PSFP partenaire, allumer le funnel scalable.**
- **Légal :** distribution sous **PSFP partenaire** (sollicitation publique autorisée, KIIS, test, délai 4 j). Dossier PSFP propre déposé en parallèle.
- **Demande :** ouverture SEO/content + paid search borné + comparateurs. Newsletter par deal.
- **Offre :** pipeline opérateurs élargi (banques co-prescription, apporteurs). Critères DD publiés.
- **Produit :** reporting trimestriel, bulletin board (art. 25 ECSP), parcours non-averti (test ECSP).
- **Cible [HYPOTHÈSE] :** 2-4 deals retail, **3-6 M€ collectés** cumulés, premiers remboursements pilotes amorcés.
- **KPI de sortie :** taux de remplissage > 80 %, CAC retail mesuré, ≥ 4 deals sourcés qualifiés/mois.

### T3 (M7-M9) — SCALE FR + préparation UE
**Thème : densifier le flywheel, premiers remboursements publics, préparer passeport.**
- **Demande :** moteur SEO/content mature, referral, founding members → standard.
- **Offre :** ré-engagement opérateurs (2ᵉ deal), NPS opérateur > 50.
- **Légal :** avancement agrément **PSFP propre** (AMF), préparation passeport UE, intégration CASP (EURC/EURe).
- **Confiance :** **publication du 1ᵉʳ track-record de remboursement** (arme marketing majeure).
- **Cible [HYPOTHÈSE] :** **6-10 M€ collectés** cumulés, taux de remboursement à date 100 %.

### T4 (M10-M12) — INTERNATIONAL : passeport UE + Reg S
**Thème : sortir de France.**
- **UE :** passeport PSFP → BE/LU/DE/ES, content localisé.
- **International :** **Reg S** (non-US persons), distribution on-chain, agrégateurs RWA, on-ramp EURC/EURe.
- **Produit :** transfer restrictions multi-juridictions (ISO-3166), marché secondaire P2P whitelisté renforcé.
- **Cible 12 mois [HYPOTHÈSE] :** **8-15 M€ collectés** cumulés an 1, base de 500-1500 investisseurs actifs, 15-25 opérateurs, taux de remboursement maintenu.
- **Amorce Version C :** si le produit décolle, étude d'un FIA tokenisé institutionnel (AIFM) — **plus tard uniquement** (étude P14).

### Synthèse roadmap (vue d'ensemble)
```
T1 PILOTE          T2 PSFP PARTENAIRE      T3 SCALE FR           T4 INTERNATIONAL
placement privé →  retail FR ouvert    →   flywheel dense    →   passeport UE + Reg S
averti only        SEO/paid on              track-record pub      multi-pays + crypto
1-3 M€             3-6 M€ cumulé            6-10 M€ cumulé        8-15 M€ cumulé an 1
prouver mécanique  allumer funnel           densifier            sortir de France
```

---

## 11. Risques de marché & mitigations

| Risque | Gravité | Probabilité | Mitigation GTM |
|---|---|---|---|
| **Requalification FIA** (le risque n°1, SAN-2025-08) | Critique | Moyenne | Marketing "deal-by-deal, pas de fonds" verrouillé ; gate compliance sur toute comm ; jamais de pré-collecte/pooling dans le messaging ; objet commercial réel mis en avant [FAIT] |
| **Sollicitation publique avant PSFP** | Élevée | Moyenne | Phase 1 strictement privée (warm/qualifiés <150 pers.) ; paid grand public seulement après PSFP [FAIT] |
| **Défaut/retard d'un deal pilote** | Élevée (détruit la confiance early) | Moyenne | Due diligence renforcée sur les pilotes ; sur-sélectivité ; hypothèque + intercreditor ; communication de crise préparée |
| **Goulot offre (pas assez de bons deals)** | Élevée | Élevée | 60 % de l'énergie GTM sur le sourcing ; co-prescription bancaire ; incentives founding operators |
| **Cycle immobilier baissier** | Élevée | Moyenne | Marge marchand ≥ 10 % exigée ; LTV ≤ 70 % ; scénario pessimiste affiché ; diversification deal-by-deal |
| **Friction KYC/crypto (drop-off)** | Moyenne | Élevée | Embedded wallet pour non-crypto ; KYC fluide Sumsub ; règlement EUR par défaut (crypto optionnel) |
| **Concurrent établi copie la tokenisation** (ClubFunding) | Moyenne | Moyenne | Avance produit + ADN transparence + Reg S international ; effet réseau opérateurs récurrents |
| **Dépendance partenaires** (PSFP, CASP, séquestre) | Moyenne | Moyenne | Multi-sourcing ; agrément PSFP propre visé en M7-M9 ; contrats avec SLA |
| **Réglementation mouvante** (AMLR/AMLA 2025-27, fin transitoire CASP 1/7/2026) | Moyenne | Élevée | Veille réglementaire ; conformité = avantage ; partenaires régulés portent une partie du risque [FAIT P13] |
| **Mauvaise réputation crypto/RWA** (amalgame scams) | Moyenne | Moyenne | Distance vis-à-vis du jargon spéculatif ; pas d'USDT ; statut régulé en avant ; contenu pédagogique |

---

## 12. KPIs de succès trimestriels (synthèse pilotable)

| KPI | T1 (pilote) | T2 (PSFP) | T3 (scale) | T4 (intl) |
|---|---|---|---|---|
| **€ collectés (cumulé)** [HYPOTHÈSE] | 1-3 M€ | 3-6 M€ | 6-10 M€ | 8-15 M€ |
| **Deals bouclés (cumulé)** | 1-2 | 3-6 | 6-12 | 12-20 |
| **Deals sourcés qualifiés/mois** | 2-3 | 4-6 | 6-8 | 6-10 |
| **Taux de sélectivité** | publié | 10-20 % | 10-20 % | 10-20 % |
| **Taux de remplissage levée** | n/a | > 80 % | > 85 % | > 85 % |
| **Taux de remboursement** | n/a (en cours) | premiers OK | **100 %** | **100 %** |
| **Investisseurs actifs (cumulé)** | 20-50 | 150-400 | 400-900 | 500-1500 |
| **Opérateurs actifs** | 2-3 | 5-8 | 10-15 | 15-25 |
| **CAC investisseur** | < 150 € | < 120 € | < 100 € | < 100 € |
| **Re-souscription 90j** | n/a | 25-35 % | 30-45 % | 30-45 % |
| **NPS opérateur** | qualitatif | > 40 | > 50 | > 50 |
| **Pays distribués** | FR (privé) | FR | FR | FR + 4 UE + Reg S |

> **Règle d'or des KPIs :** si **taux de remboursement < 100 %** ou **deal en défaut**, on **gèle l'acquisition payante** et on traite la confiance avant de re-scaler. La croissance ne doit jamais courir devant la qualité de crédit. [ANALYSE]

---

## 13. Plan d'action 30/60/90 jours (GTM opérationnel)

**J0-J30 :**
1. Construire la **waitlist averti fermée** (warm intros, club privé sur invitation).
2. Lancer la **chasse opérateurs** : liste des 50-100 meilleurs MdB/promoteurs PME, premières prises de contact.
3. Poser le **gate compliance marketing** (do/don't §5.2, validé avocat/RCCI).
4. Publier les **3-5 premiers contenus piliers** SEO + LinkedIn fondateur (conformité = contenu).
5. Sécuriser **LOI partenaires** : séquestre, KYC, tokenisation, PSFP partenaire.

**J30-J60 :**
6. Due diligence des **2-3 deals pilotes**, publier les **critères DD**.
7. Brancher l'**instrumentation funnel** (events sur les 16 étapes) + dashboards KPI.
8. Préparer le **kit de vente opérateur** (pitch, term sheet type, timeline 3 semaines).
9. Activer **co-prescription bancaire** (premiers contacts banques senior).

**J60-J90 :**
10. **1ᵉʳ closing pilote** (placement privé qualifiés) → tokens émis → séquestre→SPV.
11. Préparer l'**ouverture retail T2** (landing PSFP, paid search borné, comparateurs).
12. Mettre en place le **dashboard track-record public** (préparer la preuve de remboursement).
13. Déposer le **dossier PSFP propre** en parallèle (pour autonomie M7-M9).

---

## 14. Dépendances vers les autres domaines (handoffs)

| Domaine | Ce dont le GTM dépend | Ce que le GTM fournit en retour |
|---|---|---|
| **Juridique** (étude + memo avocat) | qualification FIA, périmètre PSFP, gate compliance comm, carte T | besoins marketing à valider (messages, parrainage, founding members) |
| **05-smart-contracts** | ERC-3643 + transfer restrictions (ISO-3166, lock-up) | exigences GTM : badges produit, vérifiabilité cap table, Reg S exclusions |
| **06-migrations** (DB) | tables deals, souscriptions, KYC, tracking funnel, track-record | schéma d'events analytics (16 étapes), KPI à stocker |
| **07-moteur-financier** | waterfall, grille de fees, scénarios, LTV/marge | pricing GTM (founding members, fees alignés), KPIs financiers |
| **Produit/front (Cockpit)** | parcours 16 étapes, fiche deal, dashboard, bulletin board | funnel cible, value props par audience, do/don't comm |
| **Infra/observabilité** | Langfuse/Sentry/Axiom déjà câblés | events funnel + dashboard track-record |

---

## 15. Synthèse stratégique GTM

**On gagne en 3 mouvements :**
1. **Sourcer mieux que tout le monde** (le goulot = l'offre) : devenir le canal préféré des meilleurs opérateurs via vitesse + récurrence + structuration clé en main.
2. **Faire de la conformité et de la transparence le produit** : dans un marché de faillites (BrickVest, WiSEED RJ), la confiance prouvée on-chain + statut PSFP est le différenciateur n°1 vs. ClubFunding (opaque) ET RealT (zone grise).
3. **Séquencer la demande** : averti FR privé (prouver) → retail PSFP (scaler) → UE + Reg S (internationaliser), sans jamais courir devant le taux de remboursement.

**Ce qu'on ne fera JAMAIS (verrous GTM) :** promettre un rendement · vendre de la "propriété" · pré-collecter/pooler · solliciter le public avant PSFP · accepter l'USDT en UE · laisser l'acquisition payante courir devant la qualité de crédit.

> **L'ambition** — battre ClubFunding, RealT, Fundrise, AngelList SPV, Securitize — se gagne précisément sur la case que personne n'occupe : **marketplace deal-by-deal d'obligations immobilières tokenisées, régulée PSFP, transparente on-chain, avec passeport UE.** C'est notre océan bleu, strictement dans le cadre.

---

*Document GTM v1 — Juin 2026. Découle de `docs/etude-immobilier-tokenise-2026.md`. Tous les chiffres tagués [HYPOTHÈSE] sont des ordres de grandeur de cadrage à recouper (data AMF/ASPIM, benchmarks) avant présentation board. Toute communication issue de ce plan passe par le gate compliance (§5.2) avant diffusion.*
