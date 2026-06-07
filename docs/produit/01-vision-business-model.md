# 01 — Vision, Positionnement & Business Model

> **Domaine :** Stratégie produit fintech/proptech.
> **Statut :** Livrable fondateur. Tout ce qui suit DÉCOULE de `docs/etude-immobilier-tokenise-2026.md` (étude sourcée AMF/ESMA/EUR-Lex/Légifrance) et respecte les 7 contraintes verrouillées du contexte partagé.
> **Tag juridique :** chaque affirmation à portée réglementaire est taguée **[FAIT]** (norme/décision citée dans l'étude), **[ANALYSE]** (raisonnement) ou **[HYPOTHÈSE]** (zone grise / chiffre à valider). Aucun rendement n'est garanti.
> **Avertissement :** ceci est un document produit/business, PAS un conseil juridique ni un document promotionnel. Les chiffres de revenus sont des **hypothèses de modélisation** à valider.

---

## 0. TL;DR (lecture 60 secondes)

On construit **le marché obligataire tokenisé de l'immobilier européen** : une marketplace où un investisseur choisit **deal par deal** de prêter à une SAS opérationnelle (marchand de biens / promotion), via des **obligations** tokenisées en **ERC-3643** miroir d'un registre légal **DEEP**, réglées en **EUR** (séquestre tiers) ou **EURC/EURe**.

- **Ce qu'on EST :** un PSFP (crowdfunding immobilier régulé, modèle ClubFunding) + une couche d'infrastructure de tokenisation conforme (modèle Tokeny/Securitize) + une liquidité secondaire native (bulletin board + transferts P2P whitelistés). [FAIT — étude P14 Version B]
- **Ce qu'on N'EST PAS :** un fonds (pas d'AIFM), un vault mutualisé (pas d'ERC-4626), un vendeur de « propriété fractionnée » (l'investisseur est créancier), un détenteur de fonds clients. [FAIT — étude P1, P9, P10]
- **Pourquoi on gagne :** personne ne combine aujourd'hui (a) le cadre PSFP prouvé et passeportable UE, (b) une tokenisation réellement conforme (security token hors MiCA + KYC onchain), (c) une liquidité secondaire, (d) un règlement euro-natif. Les Français (ClubFunding) ne tokenisent pas ; les tokeniseurs (RealT/Lofty) sont en zone grise securities et font de l'equity ERC-20 « libre ».
- **North Star :** **€ de capital investisseur déployé dans des deals réellement financés (closés), par cohorte trimestrielle.**

---

## 1. Proposition de valeur unique (UVP)

### 1.1 Phrase-pivot

> **« Prêtez à l'immobilier, deal par deal, avec la liquidité d'un titre et la conformité d'une banque. »**

Décomposition de la promesse, chaque morceau rattaché à une contrainte verrouillée :

| Promesse | Mécanisme produit | Fondement |
|---|---|---|
| **« deal par deal »** | Choix réel de chaque opération par l'investisseur, aucune pré-collecte, aucun pooling | [FAIT] Anti-FIA / SAN-2025-08 (étude P1, P10) |
| **« prêtez »** (pas « possédez ») | Obligations émises par une SAS opérationnelle = l'investisseur est **créancier** | [FAIT] Modèle n°1 du classement (étude P3, total 41/45) |
| **« liquidité d'un titre »** | Token ERC-3643 transférable entre wallets whitelistés + bulletin board art. 25 ECSP | [FAIT] Étude P9, P5 étape 16 |
| **« conformité d'une banque »** | KYC onchain (ONCHAINID), séquestre tiers, registre DEEP source de vérité, dette senior bancaire réelle | [FAIT] Étude P4, P9, P11 |

### 1.2 Les 5 douleurs qu'on tue

1. **Ticket d'entrée prohibitif & opacité du crowdfunding classique.** → ticket dès **1 000 €** (plancher ECSP non-averti), data-room structurée, badges produit normalisés (étude P6/P7). [FAIT pour le plancher : étude P5 étape 4]
2. **Illiquidité totale jusqu'à l'exit (ClubFunding, Anaxago, Homunity).** → marché secondaire natif : le token EST transférable (dans les limites KYC/lock-up), et un bulletin board ECSP organise la mise en relation. On ne **garantit jamais** la liquidité, mais on la **rend possible**. [FAIT — étude P5/P9, garde-fou « ne jamais garantir »]
3. **Zone grise juridique des plateformes tokenisées (RealT, Lofty).** → on est l'inverse : statut PSFP explicite, security token confirmé hors MiCA mais sous MiFID/Prospectus/DEEP, KYC embarqué dans le token. La conformité est le **produit**, pas une contrainte cachée. [FAIT — étude P12 « 3 pièges à éviter »]
4. **Friction crypto pour le retail (gestion de wallet, gas, stablecoins exotiques).** → embedded wallet pour les non-crypto, règlement **EUR par défaut**, EURC/EURe en option, **jamais USDT**. L'investisseur peut ne jamais voir une blockchain. [FAIT — étude P4, P5 étape 3, P10]
5. **Manque de transparence sur la performance et le risque.** → dashboard temps réel (LTV, avancement travaux, waterfall, scénario pessimiste TOUJOURS affiché), reporting trimestriel + IFU. [FAIT — étude P5 étapes 12-13, P8]

### 1.3 Ce que l'UVP n'inclut PAS (et pourquoi)

- ❌ Pas de « rendement garanti » → interdit ([FAIT] badge « distribution variable », étude P6).
- ❌ Pas de « propriété de l'immeuble » → l'investisseur est créancier, l'immeuble appartient à la SPV ([FAIT] mise en garde AMF 29/12/2022, étude P1).
- ❌ Pas de « portefeuille géré pour vous » / « robo-allocation » → signal FIA direct ([FAIT] étude P1).
- ❌ Pas de « rachat à tout moment » → ce serait un vault rachetable = unité d'OPC ([FAIT] ERC-4626 interdit, étude P9).

---

## 2. Nom de marque

### 2.1 Recommandation : **TITRO**

**TITRO** — contraction de *titre* (l'obligation, le security token) + suffixe sonore court, international, prononçable FR/EN/ES/DE. Domaine probable `titro.eu` / `titro.io`.

**Pourquoi ce nom gagne :**
- Ancre la vérité juridique du produit : l'investisseur achète un **titre financier** (créance), pas « une brique » ni « un bout d'immeuble ». Cohérent avec la mise en garde AMF anti-« propriété ». [FAIT]
- Neutre sectoriellement → permet l'extension future à d'autres classes d'actifs tokenisés (dette PME, infra) sans rebrand.
- Court (5 lettres), zéro connotation « crypto-hype » (on évite *-coin*, *-chain*, *-X*) → crédibilité institutionnelle/bancaire, essentielle pour le narratif « conformité d'une banque ».
- Sonorité latine → passeport UE naturel (le moat de distribution, cf. §6).

### 2.2 Trois alternatives

| # | Nom | Logique | Risque |
|---|---|---|---|
| 1 | **PIERVAL** | *Pierre* + *val(eur)* — très FR, rassurant, fléché immobilier patrimonial. | Trop franco-français, freine l'ambition UE/internationale ; sonorité « SCPI old-money ». |
| 2 | **OBLIO** | De *obligation* — dit exactement l'instrument, court, ludique. | « Oblio » = personnage de dessin animé (FR) ; risque de perception peu sérieuse. |
| 3 | **STAKE & BRICK** → réduit à **STAKEBRICK** | Bilingue, mémorable, « stake » (participation/mise) + « brick » (immobilier). | « Stake » a une connotation staking-crypto (DeFi/PoS) → brouille le message anti-FIA/anti-DeFi. À éviter pour la cible institutionnelle. |

> **Décision :** **TITRO** en marque-ombrelle. Garder **PIERVAL** comme nom de réserve pour une éventuelle gamme « patrimoniale FR » (locatif long terme) si segmentation de marque ultérieure.

---

## 3. Segments investisseurs (les 4 cibles, par priorité de lancement)

> Rappel cadre : la classification **averti / non-averti** et les plafonds (test ECSP, `max(1 000 €, 5 % du patrimoine net)` sans avertissement explicite) sont des [FAIT] de l'étude (P5 étape 4). Le **placement privé** (qualifiés / < 150 personnes par État / ticket ≥ 100 k€) et le **DIS jusqu'à 8 M€** sont les autres portes d'entrée [FAIT] (étude P13).

### Segment A — Investisseur averti / qualifié FR *(cible du pilote, Version A)*

- **Profil :** patrimoine financier > 100-500 k€, déjà exposé au crowdfunding immobilier (ClubFunding, Anaxago), cherche du rendement obligataire 8-11 % avec sûretés.
- **Pourquoi en premier :** permet le **placement privé** (pas besoin du PSFP propre), tickets élevés (≥ 100 k€ → moins d'investisseurs à servir pour clôturer), tolérance au risque et à l'illiquidité élevée. [FAIT — étude P14 Version A]
- **Ticket :** 10 k€ – 200 k€. Acquisition : réseau, family offices, CGP partenaires.

### Segment B — Retail UE éligible *(cœur du modèle scalé, Version B)*

- **Profil :** épargnant 30-55 ans, 5 k€-50 k€ à placer, veut diversifier hors livret/assurance-vie, sensible à la transparence et au digital.
- **Mécanisme :** distribution sous **PSFP/ECSP** (≤ 5 M€/deal/12 mois), test de connaissances + capacité de perte, délai de réflexion 4 jours, plafond `max(1 000 €, 5 % patrimoine net)` sans avertissement. [FAIT — étude P13/P5]
- **Pourquoi décisif :** c'est le volume. Le **passeport UE** du PSFP ouvre 27 marchés avec un seul agrément AMF → c'est le levier de scale n°1 (cf. moat §6). [FAIT — étude P13]
- **Ticket :** 1 k€ – 25 k€. Acquisition : SEO/contenu, performance marketing, parrainage.

### Segment C — Investisseur professionnel / institutionnel léger

- **Profil :** sociétés de gestion patrimoniale, family offices structurés, club deals existants, trésoreries d'entreprise cherchant du rendement court (12-24 mois) adossé à du réel.
- **Mécanisme :** placement privé qualifiés + co-investissement sur les grosses tranches mezzanine. Reporting institutionnel, API cap table.
- **Pourquoi :** lisse la collecte (un pro peut absorber 30-50 % d'un deal), réduit le temps de closing, crédibilise la due diligence.
- **Ticket :** 100 k€ – 1 M€+.

### Segment D — International via Reg S / passeport *(expansion)*

- **Profil :** investisseurs hors UE (modèle RealT : US accredited via Reg D + reste du monde via **Reg S**), expatriés, diaspora.
- **Mécanisme :** Reg S pour l'offshore + passeport PSFP pour l'intra-UE. Le token ERC-3643 gère nativement l'**exclusion de juridictions** via l'Identity Registry (codes pays ISO-3166). [FAIT — étude P9, P12 « copier Reg S »]
- **Pourquoi plus tard :** complexité KYC multi-juridictions, fiscalité, Travel Rule. À ouvrir une fois la machine UE rodée.
- **Ticket :** variable.

| Segment | Régime d'offre | Ticket type | Priorité | Phase |
|---|---|---|---|---|
| A — Averti FR | Placement privé | 10–200 k€ | 🥇 | Pilote (V.A) |
| B — Retail UE | PSFP/ECSP | 1–25 k€ | 🥇🥇 | Scale (V.B) |
| C — Pro/institutionnel | Placement privé | 100 k€–1 M€+ | 🥈 | V.A → V.B |
| D — International | Reg S + passeport | variable | 🥉 | Expansion |

---

## 4. Différenciation explicite vs concurrents

> Méthode : pour chaque concurrent, on dit **ce qu'il fait**, **sa faille**, et **notre angle**. Données issues de l'étude P12.

### 4.1 vs **ClubFunding** (FR, leader, > 1,2 Md€, PSFP)

- **Eux :** obligations de SAS dédiée, deal-by-deal, sous PSFP. Le modèle prouvé qu'on adopte. [FAIT]
- **Faille :** **zéro tokenisation** → zéro liquidité secondaire (argent bloqué jusqu'à l'exit), cap table 100 % off-chain (lourde, lente), pas de règlement crypto, transparence post-investissement limitée.
- **Notre angle :** **ClubFunding + couche token**. Même robustesse juridique (obligations/PSFP), mais on ajoute (1) **liquidité** (transfert P2P whitelisté + bulletin board), (2) **cap table on-chain** auto-réconciliée avec DEEP (coût opérationnel ↓), (3) **règlement EUR + stablecoin**, (4) **dashboard temps réel**. On bat le leader sur l'expérience post-souscription et la liquidité, sans rien céder sur la conformité.

### 4.2 vs **Anaxago / WiSEED / Homunity** (FR, PSFP/PSI)

- **Eux :** multi-produits (equity, dette, SCPI), deal-by-deal. WiSEED en **redressement judiciaire 2025** (repris Advenis) ; Homunity = retards. [FAIT]
- **Faille :** dispersion produit, dette promoteur vulnérable au cycle, pas de tokenisation, due diligence inégale.
- **Notre angle :** **focus + discipline de risque**. Une seule thèse (dette immobilière tokenisée), badges de risque normalisés et radar de risque comparable entre deals (étude P8), scénario pessimiste imposé. La discipline de souscription et la transparence = réponse directe aux défaillances du marché FR.

### 4.3 vs **RealT** (US, tokenisé ERC-20 restreint, Reg D + Reg S)

- **Eux :** 1 LLC (série) par bien, equity + loyers, token ERC-20 restreint (Gnosis). Pionnier de la tokenisation immo retail. [FAIT]
- **Faille :** **equity** (l'investisseur est associé d'une LLC → proche du club deal/FIA dans un cadre UE), token **ERC-20 « libre »** (conformité bolt-on, pas native), zone grise securities US, pas de cadre UE passeportable.
- **Notre angle :** **la version UE-native et juridiquement propre de RealT**. On garde l'idée géniale « 1 entité par bien + token », mais (1) **dette, pas equity** (anti-FIA, [FAIT] étude P3), (2) **ERC-3643** avec KYC soulbound natif au lieu d'ERC-20 restreint ([FAIT] étude P9), (3) **DEEP** comme source de vérité légale, (4) **PSFP passeporté** au lieu de Reg D/S bricolé. On prend leur force (liquidité tokenisée) et on supprime leur faiblesse (statut securities flou + equity-FIA).

### 4.4 vs **Lofty.ai** (US, DAO LLC par bien, Algorand)

- **Eux :** equity + loyer quotidien, gouvernance DAO. [FAIT]
- **Faille :** **DAO = aggravant FIA** (gestion collective on-chain) ET aucune banque ne prête à un smart contract → pas de levier bancaire propre ([FAIT] étude P2 modèle 9, P11). Zone grise securities.
- **Notre angle :** **anti-DAO assumé**. La dette senior bancaire (hypothèque 1er rang) est un **pilier** chez nous : elle amplifie le rendement, rassure via les sûretés, et c'est précisément ce qu'une DAO ne peut pas obtenir. La gouvernance reste celle de la **masse obligataire** (cadre légal connu), pas un token-vote DeFi.

### 4.5 vs **Fundrise** (US, eREIT/eFund, pré-collecte)

- **Eux :** eREIT/eFund, **pré-collecte = fonds**, allocation diversifiée gérée. [FAIT]
- **Faille (pour le cadre UE) :** pré-collecte + portefeuille géré = **exactement le vault mutualisé = FIA** en UE ([FAIT] étude P1). Leur modèle est illégal-sans-AIFM chez nous.
- **Notre angle :** **l'anti-Fundrise**. On revendique le **deal-by-deal sans pooling** comme une feature de conformité ET de contrôle investisseur : « vous choisissez chaque opération, votre argent ne bouge pas avant ». La contrainte réglementaire UE devient un argument de transparence supérieur à Fundrise.

### 4.6 vs **AngelList SPV / Syndicates** (US, LLC/LP par deal, Reg D, RIA)

- **Eux :** infrastructure SPV deal-by-deal pour le venture, lead/backers, carried au lead. [FAIT]
- **Faille :** **equity venture US** (pas immo, pas UE), non tokenisé, illiquide, réservé accredited.
- **Notre angle :** **« AngelList SPV pour la dette immobilière européenne, mais liquide et tokenisé »**. On copie leur mécanique two-sided (sourceur/opérateur d'un côté, backers de l'autre — cf. §5) et leur excellence d'infrastructure, transposée à une classe d'actifs tangible, sous cadre UE, avec liquidité secondaire.

### 4.7 vs **Securitize / Tokeny / Brickken** (infra de tokenisation)

- **Eux :** infrastructure (transfer agent, ATS, standard ERC-3643, no-code). [FAIT]
- **Faille :** ce sont des **fournisseurs d'outils**, pas une marketplace orientée investisseur. Pas de deal flow, pas de marque grand public, pas de distribution.
- **Notre angle :** **on les utilise, on ne les concurrence pas** (build vs buy : on s'appuie sur Tokeny/Securitize pour le déploiement ERC-3643/DEEP, [FAIT] étude P4/P15). Notre valeur est la **marketplace + la conformité distribution (PSFP) + le sourcing** : la couche que ces infra ne fournissent pas. Ils sont nos sous-traitants techniques, notre moat est la demande (investisseurs) et l'offre (opérateurs).

### 4.8 Tableau de synthèse — la case que personne ne coche

| Capacité | ClubFunding | RealT | Lofty | Fundrise | Securitize | **TITRO** |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| Deal-by-deal anti-FIA | ✅ | ⚠️ equity | ❌ DAO | ❌ fonds | n/a | ✅ |
| Instrument = dette (créance) | ✅ | ❌ | ❌ | ❌ | n/a | ✅ |
| Tokenisation conforme (ERC-3643) | ❌ | ⚠️ ERC-20 | ⚠️ | ❌ | ✅ | ✅ |
| Registre légal DEEP | ❌ | ❌ | ❌ | ❌ | ⚠️ | ✅ |
| Liquidité secondaire | ❌ | ⚠️ | ⚠️ | ⚠️ | ✅ | ✅ |
| Passeport UE (PSFP) | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Règlement EUR + EURC/EURe | ⚠️ EUR | ❌ | ❌ | ⚠️ | n/a | ✅ |
| Dette bancaire senior | ✅ | ⚠️ | ❌ | ✅ | n/a | ✅ |
| Marque investisseur grand public | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |

> **Conclusion §4 :** la colonne TITRO est la **seule** à cocher toutes les cases. Notre position est l'intersection vide entre « crowdfunding FR conforme mais analogique » et « tokeniseurs liquides mais juridiquement fragiles ». C'est un **white space** réel, pas un « moi aussi ».

---

## 5. Le marketplace à deux faces

> Un marketplace ne gagne que si les **deux** côtés ont une raison forte de venir et un effet de réseau croisé. Ici : **investisseurs (demande de capital)** ↔ **opérateurs/sourcing (offre de deals)**.

### 5.1 Face DEMANDE — Investisseurs (les 4 segments du §3)

- **Ce qu'ils apportent :** le capital obligataire (la liquidité du marché).
- **Ce qu'ils obtiennent :** accès à des deals sourcés/audités, tickets bas, transparence, liquidité secondaire, conformité, règlement euro.
- **Levier d'acquisition :** contenu/SEO, performance marketing, parrainage, CGP/family offices, communauté.

### 5.2 Face OFFRE — Opérateurs immobiliers / sourceurs

- **Qui :** marchands de biens, promoteurs, foncières value-add. Ce sont les **émetteurs** (via leur SPV SAS dédiée). [FAIT — étude P4 « Opérateur immobilier »]
- **Ce qu'ils apportent :** le deal flow (sourcing, due diligence, exécution travaux, asset management, exit), l'**alignement** (equity sponsor + carried = skin in the game), et l'**objet commercial réel** qui éloigne du FIA. [FAIT — étude P11 « rôle de l'opérateur »]
- **Ce qu'ils obtiennent :** une **source de financement junior/mezzanine** rapide et passeportée UE, complémentaire de la dette bancaire senior, sans diluer leur equity ; un canal de distribution clé en main (KYC, séquestre, e-sign, reporting) ; une **infrastructure de tokenisation** qu'ils n'ont pas à construire.
- **Garde-fou anti-FIA critique :** **la plateforme ne sélectionne JAMAIS discrétionnairement à la place de l'investisseur.** Elle référence des deals (avec due diligence et scoring de risque transparent), mais c'est l'investisseur qui choisit, deal par deal, sans pré-collecte. Le rôle plateforme = **place de marché + standardisation + conformité**, pas gérant. [FAIT — étude P1, P2 modèle 2 « la plateforme ne doit jamais pré-collecter ni imposer une sélection discrétionnaire »]

### 5.3 Effets de réseau croisés (le flywheel)

```
   Plus d'INVESTISSEURS (capital, vitesse de closing)
            │
            ▼
   Closings plus rapides & plus gros  ──►  attire plus d'OPÉRATEURS
            ▲                                        │
            │                                        ▼
   Track record + transparence + liquidité  ◄──  Plus de DEALS de qualité
            │                                        │
            └────────────────────────────────────────┘
   Plus de deals & meilleur choix  ──►  attire plus d'INVESTISSEURS
```

- **Côté investisseur :** plus d'opérateurs ⇒ plus de choix deal-by-deal ⇒ meilleure diversification ⇒ plus d'investisseurs.
- **Côté opérateur :** plus d'investisseurs ⇒ closings plus rapides/plus gros ⇒ les meilleurs opérateurs viennent ⇒ deals de meilleure qualité.
- **Accélérateur unique TITRO :** la **liquidité secondaire** brise le frein n°1 du crowdfunding immo (illiquidité). Un investisseur plus enclin à entrer (car il peut sortir) ⇒ collecte plus rapide ⇒ opérateurs encore plus attirés. C'est le boost que ClubFunding ne peut pas offrir.

### 5.4 Problème de l'œuf et la poule → résolu par séquençage

Stratégie classique « single-player utility first » + amorçage par l'offre :
1. **Amorcer l'OFFRE d'abord** : signer 3-5 opérateurs marchands de biens avec track record (deals pilotes en placement privé, Segment A). L'offre est plus concentrée et contractualisable que la demande retail.
2. **Servir la demande sur des deals réels** : le pilote (Version A) prouve la mécanique avec des investisseurs avertis (réseau, pas d'acquisition de masse).
3. **Basculer en marketplace** une fois PSFP actif (Version B) : ouverture retail UE, le flywheel s'enclenche.

---

## 6. Modèle de revenus (chiffré)

> ⚠️ **[HYPOTHÈSE]** sur tous les taux et montants : ce sont des paramètres de modélisation cohérents avec les ordres de grandeur de l'étude (P7 « FRAIS » : *« 1 % entrée + 0,5 %/an admin »* côté plateforme ; *« 2 % acquisition + 20 % carried > hurdle 8 % »* côté opérateur) [FAIT pour ces ordres de grandeur]. Les frais réels devront respecter la transparence KIIS (PSFP) et être validés juridiquement.

### 6.1 Les 4 lignes de revenus (et qui les paie)

| # | Ligne | Base | Taux (hypothèse) | Payeur | Récurrence | Risque réglementaire |
|---|---|---|---|---|---|---|
| **R1** | **Frais d'entrée investisseur** | Montant souscrit | **1 %** one-shot | Investisseur | Par souscription | Faible — divulgué KIIS |
| **R2** | **Frais d'admin / an** | Encours obligataire géré | **0,5 %/an** | Investisseur (prélevé sur flux) ou SPV | Annuel pendant la durée | Faible |
| **R3** | **Frais de structuration opérateur** | Montant levé via la plateforme | **2–3 %** one-shot au closing | Opérateur / SPV | Par deal | Faible — service de structuration/distribution |
| **R4** | **Performance fee plateforme (upside partagé)** | Surperformance au-delà du hurdle | **part minoritaire du carried**, p.ex. 10 % de l'upside au-delà du hurdle 8 % | Sur le solde après obligataires | À l'exit, conditionnel | [HYPOTHÈSE] — à structurer pour ne PAS ressembler à une rémunération de gestion de fonds. Préférer un **fee d'arrangement/succès** plutôt qu'un carried « façon ManCo ». [ANALYSE — éviter le signal FIA] |

**Lignes secondaires (phase de scale) :**
- **R5 — Frais de marché secondaire** : commission sur transfert P2P / mise en relation bulletin board (p.ex. 0,5–1 % du montant transféré). [HYPOTHÈSE] — encadré par l'art. 25 ECSP (bulletin board ≠ MTF). [FAIT pour le garde-fou]
- **R6 — Infrastructure / white-label** : licence de la stack tokenisation+conformité à des PSFP/opérateurs tiers (modèle Brickken). Marge logicielle, plus tard.

> **Garde-fou de design :** R2 et R4 doivent être structurés comme une rémunération de **services de plateforme/structuration** et NON comme des frais de gestion d'un portefeuille collectif, sinon on recrée le faisceau d'indices FIA (politique d'investissement gérée + rémunération de gestion). [ANALYSE — étude P2 critère (c)/(d)]

### 6.2 P&L UNITAIRE — Deal type « Marchand de biens »

> Basé sur le deal-template de l'étude (P7) : coût total **2 440 000 €**, dette senior **1 460 000 €**, equity sponsor **240 000 €**, **obligations levées = 740 000 €**, durée **22 mois**, TRI cible central ~10 %. [FAIT pour les montants du template]

**Revenus plateforme sur ce deal (hypothèses §6.1) :**

| Ligne | Calcul | Montant |
|---|---|---|
| R1 — Entrée investisseur (1 % de 740 k€) | 740 000 × 1,0 % | **7 400 €** |
| R3 — Structuration opérateur (2,5 % de 740 k€) | 740 000 × 2,5 % | **18 500 €** |
| R2 — Admin (0,5 %/an × 740 k€ × 22/12 mois) | 740 000 × 0,5 % × 1,833 | **6 783 €** |
| R4 — Performance (scénario central, voir note) | upside au-delà hurdle 8 %, part plateforme 10 % | **≈ 2 500 €** *(central)* |
| **Total revenus plateforme / deal MdB (central)** | | **≈ 35 200 €** |

*Note R4 (central) :* sur 740 k€ d'obligataire à TRI ~10 % vs hurdle 8 %, la surperformance distribuable est faible ; la part plateforme (10 % de l'upside) est modeste en central et nulle/négative en scénario pessimiste. **R4 est un bonus, pas le moteur.** Le moteur = R1+R3 (≈ 25,9 k€, encaissés au closing, non conditionnels à la performance).

**Coûts variables directs alloués au deal (hypothèse) :**

| Poste | Montant |
|---|---|
| Déploiement token ERC-3643 + inscription DEEP (Tokeny/registrar) | 4 000 € |
| KYC investisseurs (≈ 30 souscripteurs × ~5 €) + ONCHAINID | 1 500 € |
| Séquestre (notaire/EMI) + frais paiement SEPA/stablecoin | 2 500 € |
| Signature eIDAS (bulletins + contrat) | 800 € |
| Due diligence externe / scoring deal (quote-part) | 6 000 € |
| **Total coûts variables / deal** | **≈ 14 800 €** |

| **Marge de contribution / deal MdB** | **≈ 35 200 − 14 800 = 20 400 €** | **≈ 58 %** de marge sur revenus |

### 6.3 P&L UNITAIRE — Deal type « Locatif » (coupons périodiques)

> Hypothèse symétrique : un actif locatif, obligataire levé **1 000 000 €**, durée **60 mois** (5 ans), coupon servi périodiquement, valeur résiduelle à l'exit. Badge « Locatif » : coupons + valeur résiduelle, risque moyen. [FAIT pour la nature du produit, étude P6]

| Ligne | Calcul | Montant |
|---|---|---|
| R1 — Entrée (1 % de 1 000 k€) | 1 000 000 × 1,0 % | **10 000 €** |
| R3 — Structuration (2,5 %) | 1 000 000 × 2,5 % | **25 000 €** |
| R2 — Admin (0,5 %/an × 1 000 k€ × 5 ans) | 1 000 000 × 0,5 % × 5 | **25 000 €** |
| R4 — Performance (faible, coupon ≈ fixe) | marginal | **≈ 0–3 000 €** |
| **Total revenus plateforme / deal locatif** | | **≈ 61 500 €** |

| Coûts variables (token+DEEP, KYC ~40 souscripteurs, séquestre, e-sign, DD) | **≈ 17 000 €** |
| **Marge de contribution / deal locatif** | **≈ 44 500 €** | **≈ 72 %** |

**Lecture comparée MdB vs Locatif :**

| Critère | Marchand de biens | Locatif |
|---|---|---|
| Revenu / deal | ~35 k€ | ~61 k€ |
| Marge contribution / deal | ~20 k€ | ~44 k€ |
| Durée (capital immobilisé) | 22 mois | 60 mois |
| **Vélocité (rotation du capital)** | **Élevée** (l'opérateur revient ~tous les 2 ans) | Faible (lock-up long) |
| Profil revenu | Burst au closing (R1+R3) | Étalé (R2 récurrent fort) |
| Effet flywheel | Fort (deals fréquents → deal flow) | Faible mais collant (encours récurrent) |

> **Conclusion mix produit :** le **marchand de biens** est le moteur de **croissance/flywheel** (rotation rapide, deal flow fréquent), le **locatif** est le moteur de **revenu récurrent et de rétention** (R2 sur encours long). **Mix cible : ~70 % MdB / 30 % locatif** en volume de deals au démarrage, en rééquilibrant vers le locatif à mesure que l'encours sous administration grossit (la valorisation d'une fintech récompense l'ARR/encours récurrent).

### 6.4 Sanity check business à l'échelle *(illustratif, [HYPOTHÈSE])*

- Hypothèse Année 2 (Version B active) : **120 deals/an**, ticket moyen levé **800 k€** → **96 M€ collectés/an**.
- Revenu moyen plateforme ≈ **4,4 %** du collecté (R1+R2+R3, hors R4) → **≈ 4,2 M€ de revenu annuel**.
- Marge de contribution ≈ **62 %** → **≈ 2,6 M€** pour couvrir l'OPEX fixe (équipe, agrément PSFP, compliance, infra).
- Encours sous administration en croissance (R2 récurrent) = **actif de valorisation** à la sortie.

> Ces chiffres sont une **maquette de modèle**, pas une projection auditée. Ils servent à montrer que l'unit economics est viable **sans** carried agressif (donc sans dériver vers le FIA) : R1+R3 au closing suffisent à dégager une marge positive par deal.

---

## 7. Le moat (pourquoi c'est défendable)

> Quatre douves, classées par profondeur. Un concurrent doit franchir les quatre pour nous rattraper.

### 7.1 Moat #1 — **Conformité comme produit** *(le plus profond, le plus rare)*

- Le cadre verrouillé (obligations / PSFP / ERC-3643 / DEEP / EUR / anti-FIA) est **difficile à reproduire** : il faut comprendre que (a) éviter l'offre au public ≠ éviter le FIA, (b) ERC-4626 = signal FIA, (c) USDT interdit en UE, (d) security token hors MiCA mais sous MiFID/DEEP. [FAIT — étude « 3 recadrages »]
- La plupart des entrants se trompent : soit ils tokenisent en zone grise (RealT/Lofty), soit ils restent analogiques (ClubFunding). Le **savoir réglementaire embarqué dans le produit** est un moat cognitif + une barrière d'agrément (PSFP : 6-12 mois AMF).
- **Renforcement :** agrément PSFP propre + relations AMF/ACPR + jurisprudence interne anti-FIA = avance difficilement rattrapable.

### 7.2 Moat #2 — **Effet de réseau two-sided + liquidité**

- Le flywheel investisseurs ↔ opérateurs (§5) se renforce avec l'échelle. La **liquidité secondaire** crée en plus un effet de réseau de second ordre : un carnet d'ordres/bulletin board n'a de valeur que s'il y a des deux côtés des holders → winner-takes-most sur la liquidité, comme toute place de marché. [ANALYSE]
- Plus on a de deals closés, plus on a de track record → meilleur scoring de risque → meilleure sélection → meilleurs investisseurs/opérateurs. Boucle de **données propriétaires**.

### 7.3 Moat #3 — **Technologie & intégration**

- Pipeline intégré rare : KYC onchain (ONCHAINID) ↔ ERC-3643 ↔ registre DEEP ↔ séquestre EUR/EMI ↔ EURC/EURe ↔ e-sign eIDAS ↔ cap table on/off-chain ↔ reporting/IFU. [FAIT — étude P15 stack]
- La **réconciliation automatique DEEP ↔ on-chain** (source de vérité légale + miroir token toujours cohérents) est un actif logiciel non trivial → réutilisable en white-label (R6).
- Switching cost opérateur : une fois un opérateur intégré (KYC, contrats-types, historique), il reste.

### 7.4 Moat #4 — **Marque & confiance**

- Sur un produit où la peur n°1 de l'investisseur est l'arnaque (cf. mises en garde AMF), la **marque de confiance** (TITRO = « titre », sérieux, conforme, transparent) est un actif composé.
- Transparence radicale (scénario pessimiste imposé, badges de risque honnêtes, reporting) = différenciation morale ET commerciale vs les plateformes qui ont déçu (WiSEED RJ, Homunity retards, BrickVest faillite). [FAIT — étude P12]

### 7.5 Ce qui N'EST PAS un moat (lucidité)

- ❌ La techno blockchain seule (commoditisée : Tokeny/Securitize la vendent à tous).
- ❌ Les frais bas (course vers le bas).
- ❌ Le deal flow ponctuel (les opérateurs sont multi-plateformes tant qu'on n'a pas de switching cost).

---

## 8. Pourquoi ce produit peut devenir n°1 mondial

1. **Le white space est réel et vide** (§4.8) : personne ne combine PSFP-conforme + tokenisation native + liquidité + euro-settlement. On n'attaque pas un marché saturé, on crée une catégorie (« obligations immobilières tokenisées passeportées UE »).
2. **Le passeport UE est un cheat code de distribution** : un seul agrément PSFP AMF → 27 marchés. C'est l'arme que ni les US (RealT/Fundrise, fragmentés par état + pas d'UE) ni les FR analogiques (ClubFunding, mono-pays de fait) n'exploitent à fond. [FAIT — étude P13]
3. **Le marché sous-jacent est colossal** : le crowdfunding immo FR seul a dépassé 1,2 Md€ (ClubFunding) ; l'immobilier européen et la dette promoteur représentent des centaines de Md€. La tokenisation des RWA est la thèse macro de la décennie (BlackRock/Apollo via Securitize). [FAIT — étude P12]
4. **Timing réglementaire parfait** : MiCA en place (EURC/EURe conformes), DEEP opérationnel depuis 2017, ECSP/PSFP stabilisé depuis 11/2023, DLT Pilot disponible pour le secondaire futur. Les briques légales sont **toutes posées** en 2026. [FAIT — étude P13]
5. **Le moat composé** (§7) : conformité + réseau + techno + marque se renforcent mutuellement et avec le temps. Le premier à atteindre la masse critique de liquidité + agrément + track record verrouille la catégorie.
6. **Trajectoire d'expansion claire** : démarrer FR (dette MdB) → UE retail (passeport) → international (Reg S) → multi-actifs (dette PME, infra) → infrastructure white-label. Chaque étape réutilise la même stack conforme.

> **Thèse de domination :** devenir **le standard de l'émission obligataire immobilière tokenisée en Europe** — la « place de marché » que les opérateurs utilisent par défaut pour lever leur junior/mezzanine, et que les investisseurs UE utilisent par défaut pour s'exposer à la dette immobilière liquide. Le n°1 mondial de **cette** catégorie, créée par nous.

---

## 9. North Star Metric & KPIs

### 9.1 North Star Metric (NSM)

> **NSM = € de capital investisseur DÉPLOYÉ dans des deals réellement closés (financés), par cohorte trimestrielle.**

**Pourquoi cette métrique :**
- Elle capture la **valeur réellement créée pour les deux faces** : l'investisseur a placé son argent (et choisi son deal), l'opérateur a obtenu son financement, et le deal est **closé** (pas une intention). [ANALYSE]
- Elle est **anti-vanity** : on ne compte ni les inscrits, ni les « réservations » non engageantes (soft-commits), ni le collecté en séquestre non débloqué. Seul le **capital déployé au closing** compte — ce qui aligne aussi sur la conformité (le closing = moment où le deal choisi se finance, étude P5 étape 11). [FAIT]
- Elle **interdit structurellement** d'optimiser vers la pré-collecte (qui serait du FIA) : on ne récompense que le capital qui finance un deal déjà choisi.

### 9.2 KPIs par couche

**Acquisition & activation**
- Inscrits → KYC complété (taux) ; KYC → premier investissement (taux).
- CAC par segment ; ratio LTV/CAC.
- Opérateurs signés / actifs (face offre).

**Cœur (NSM drivers)**
- **Capital déployé / trimestre** (la NSM).
- Nombre de deals closés / trimestre ; **taux de closing** (deals financés / deals listés).
- Délai moyen de closing (jours entre ouverture levée et closing) — proxy de la profondeur de demande.
- Ticket moyen ; nombre d'investisseurs par deal.
- **Encours obligataire sous administration** (AUA) — base de R2, actif de valorisation.

**Engagement & rétention**
- Taux de ré-investissement (investisseur qui revient sur un 2e deal) — proxy de confiance.
- Deals par investisseur (diversification).
- Volume marché secondaire (transferts P2P + bulletin board) — proxy de liquidité réelle.
- Taux de ré-émission opérateur (opérateur qui revient lever).

**Santé du portefeuille & confiance (critiques sur ce produit)**
- **Taux de défaut / retard** par cohorte de deals (le KPI qui tue la marque s'il dérape — cf. WiSEED/Homunity). [FAIT — étude P12]
- LTV moyen pondéré du book ; % deals avec sûreté réelle inscrite.
- Performance réalisée vs cible (et vs scénario pessimiste affiché).
- NPS investisseur ; NPS opérateur.

**Conformité (KPIs de non-négociables)**
- 0 deal avec pré-collecte ; 0 pooling ; 0 NAV globale (binaires, doivent rester à zéro). [FAIT]
- % flux entrants en EUR vs EURC/EURe ; 0 USDT (binaire). [FAIT]
- Couverture KYC/ONCHAINID = 100 % des holders ; conformité Travel Rule sur flux crypto.

### 9.3 Garde-fou métrique anti-dérive

| Tentation de croissance | Pourquoi c'est interdit | Métrique de contrôle |
|---|---|---|
| Pré-collecter pour « accélérer » | = FIA (SAN-2025-08) | « 0 pré-collecte » doit rester binaire à 0 [FAIT] |
| Offrir un « fonds diversifié » 1-clic | = pooling/NAV = FIA | « 0 pooling / 0 NAV » binaire [FAIT] |
| Promettre un rendement fixe pour convertir | Interdit (distribution variable) | Audit marketing : 0 promesse de taux [FAIT] |
| Accepter USDT pour réduire la friction crypto | Non MiCA, delisté UE | « 0 USDT » binaire [FAIT] |
| Vendre « la propriété d'un immeuble » | Mise en garde AMF (créancier ≠ propriétaire) | Audit wording : 0 « propriété » [FAIT] |

---

## 10. Décisions clés (récapitulatif actionnable)

1. **Marque : TITRO** (réserve : PIERVAL pour gamme patrimoniale future).
2. **Positionnement : « ClubFunding tokenisé + RealT juridiquement propre »** — la seule case qui coche tout (§4.8).
3. **Instrument unique : obligations de SAS opérationnelle**, jamais d'equity géré, jamais de vault. [FAIT]
4. **Go-to-market séquencé : Offre d'abord** (3-5 opérateurs) → pilote placement privé (Segment A, Version A) → PSFP partenaire puis propre (Segment B retail UE, Version B) → international (Segment D, Reg S). [FAIT — étude P14]
5. **Revenus : R1 (1 % entrée) + R3 (2,5 % structuration opérateur) = moteur non conditionnel ; R2 (0,5 %/an admin) = récurrence/valorisation ; R4 (performance) = bonus marginal structuré pour NE PAS être un carried de gestion.** [HYPOTHÈSE chiffres / FAIT ordres de grandeur étude P7]
6. **Mix produit : ~70 % marchand de biens (flywheel) / 30 % locatif (récurrence)** au démarrage.
7. **NSM : € de capital investisseur déployé dans des deals closés / trimestre** — anti-vanity, anti-FIA par construction.
8. **Moat prioritaire : la conformité-produit + le passeport UE**, accélérés par le réseau two-sided et la liquidité secondaire.

---

## 11. Dépendances vers les autres domaines

> Ce livrable de vision **commande** des spécifications aux autres domaines. À répercuter dans leurs livrables respectifs.

- **→ Domaine juridique/structuration :** valider le memo qualification FIA du montage exact ; cadrer R2/R4 pour qu'ils ne constituent pas une rémunération de gestion de fonds ; périmètre carte T (loi Hoguet) ; statut PSFP propre vs partenaire.
- **→ Domaine smart-contracts (`05-smart-contracts/`) :** ERC-3643 (T-REX) + ONCHAINID + transfer restrictions (lock-up, juridictions exclues, whitelist) ; jamais ERC-4626 ; réconciliation DEEP ↔ on-chain ; settlement EURC/EURe (jamais USDT).
- **→ Domaine data/migrations (`06-migrations/`) :** modèle de données cap table on/off-chain, investisseurs (classification averti/non-averti, plafonds), deals (badges, waterfall), souscriptions (soft-commit vs engagé), séquestre, RLS multi-tenant. Schéma doit refléter la NSM (état « closé » du deal = source de vérité du capital déployé).
- **→ Domaine moteur financier (`07-moteur-financier/`) :** waterfall, scénarios (pessimiste/central/optimiste imposés), TRI, LTV/DSCR, sensibilités prix-exit & retard-travaux, marge marchand — alimentant les graphiques UX (étude P8) et le scoring de risque.
- **→ Domaine UX/UI (Cockpit) :** badges produit (étude P6), fiche deal (P7), dashboard temps réel, parcours 16 étapes (P5) ; tokens `--ct-*` uniquement, `data-product` = seul switch d'accent. [contrainte verrouillée #6]
- **→ Domaine paiement/conformité :** séquestre tiers (notaire/EMI), KYC (Sumsub/Onfido + ONCHAINID), Travel Rule, CASP partenaire pour EURC/EURe.

---

## 12. Risques & incertitudes (de ce livrable)

- **[HYPOTHÈSE]** Tous les taux de revenus (R1-R6) et montants P&L sont des paramètres de modélisation. Ils doivent être (a) validés économiquement par les vrais coûts partenaires (Tokeny, KYC, séquestre), (b) validés juridiquement pour la transparence KIIS et pour ne pas créer un faisceau FIA (R2/R4).
- **[ANALYSE]** Le carried/performance fee plateforme (R4) est le point le plus délicat : un carried « façon société de gestion » rapproche du FIA. Recommandation : le structurer en **fee de succès/arrangement** ou le supprimer si l'avocat le juge risqué. La marge tient sans lui (§6.2/6.3).
- **[FAIT]** La frontière FIA est **casuistique** (étude, limites finales) : aucune métrique ni positionnement ne garantit la non-requalification. La discipline « 0 pré-collecte / 0 pooling / 0 NAV / choix deal-by-deal réel » est non négociable et doit être auditée en continu (KPIs §9.3).
- **[HYPOTHÈSE]** Le séquençage offre-d'abord suppose qu'on signe rapidement des opérateurs avec track record ; si l'offre tarde, le pilote (Segment A) glisse.
- **[ANALYSE]** La liquidité secondaire est un argument fort MAIS ne doit **jamais** être survendue : bulletin board ≠ marché garanti (garde-fou « ne jamais garantir la liquidité », étude P6). Risque marketing à cadrer.
- **[FAIT]** Plafond PSFP **5 M€/opération/12 mois** : pour les gros deals, prévoir DIS (≤ 8 M€) ou placement privé — contrainte à intégrer au sizing des deals et au modèle de revenu par deal.
