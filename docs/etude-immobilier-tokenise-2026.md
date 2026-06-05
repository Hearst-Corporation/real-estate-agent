# Produit d'investissement immobilier tokenisé sans licence de gestion de fonds
## Étude juridique, produit, financière et technique — France / Union européenne — Juin 2026

> **Avertissement.** Ce document est une analyse documentaire sourcée, **PAS un conseil juridique**. Chaque montage doit être validé par un avocat en gestion d'actifs / droit financier avant lancement. Les affirmations sont taguées **[FAIT]** (norme ou décision citée), **[ANALYSE]** (raisonnement juridique) ou **[HYPOTHÈSE/INCERTAIN]** (zone grise non tranchée). Aucun rendement n'est garanti ; l'investissement immobilier comporte un risque de perte en capital et d'illiquidité.

---

## ⚠️ Trois recadrages qui gouvernent toute l'étude

**1. Éviter « l'offre au public » ≠ éviter « le FIA ». Ce sont DEUX risques distincts et indépendants.**
- L'offre au public de titres = régime *Prospectus* (UE 2017/1129). On l'évite par placement privé ou crowdfunding.
- Le FIA = la *nature* du véhicule (AIFMD 2011/61/UE). On peut faire un placement privé **et rester un FIA non autorisé**.
- [FAIT] La décision **AMF SAN-2025-08 du 9 sept. 2025** a requalifié des club deals immobiliers (SAS, 14 puis 7 investisseurs, placement privé) en « Autre FIA » → sanction 400 000 € (société) + 100 000 € (dirigeant). **Le deal-by-deal et le mono-actif ne sont pas des « safe harbours ».**

**2. Le levier décisif pour échapper au FIA : être une vraie société opérationnelle financée par de la DETTE, pas un véhicule de placement collectif en equity.**
- [FAIT] Considérant 8 AIFMD : exclusion des sociétés à « objet commercial ou industriel général ».
- [ANALYSE] Une SAS **marchand de biens / promoteur** qui finance son activité commerciale par **émission d'obligations** (les investisseurs sont des **créanciers**, pas des co-investisseurs d'un portefeuille géré) est le montage le plus éloigné du FIA — c'est le modèle prouvé du crowdfunding immobilier français (ClubFunding, Homunity). L'**equity club deal** mutualisé est, lui, en première ligne du risque FIA.

**3. Trois couches produit à ne JAMAIS confondre (le piège Bricks.co).**
| Couche | Ce que c'est | Ce que détient l'investisseur | Régime |
|---|---|---|---|
| **Produit immobilier** | L'immeuble | **Rien en direct** — l'immeuble appartient à la SPV | Droit immobilier, loi Hoguet, fiscalité immo |
| **Produit financier** | Le titre (obligation/action) | **Un titre financier** (créance ou capital) | MiFID II, Prospectus, ECSP, AIFMD |
| **Produit crypto** | Le token | **Un security token** = le titre, inscrit sur DLT | DEEP (FR) ; **hors MiCA** (art. 2(4)) ; le **stablecoin de règlement**, lui, relève de MiCA |

[FAIT] L'AMF a mis en garde le public le 29/12/2022 contre les plateformes de « royalties immobilières » faisant passer un **créancier** pour un **propriétaire**. Toujours qualifier le produit juridiquement **avant** le marketing.

---

# PARTIE 1 — Résumé exécutif

### Modèle recommandé
**Marketplace deal-by-deal régulée léger.** Chaque opération est isolée dans **une SAS dédiée** (1 SPV = 1 bien/opération) exerçant une **activité opérationnelle réelle** (marchand de biens ou promotion). La SAS :
- prend la **dette senior bancaire** (hypothèque 1er rang) ;
- émet des **obligations** (titres de créance) — junior/subordonnées — souscrites par les investisseurs ;
- ces obligations sont **tokenisées** comme *security tokens* : registre légal en **DEEP** (droit français) + **miroir on-chain ERC-3643** (token permissionné, KYC embarqué) ;
- la distribution se fait sous statut **PSFP/ECSP** (le sien ou celui d'un partenaire agréé), plafond 5 M€/opération/12 mois ; au-delà, placement privé (qualifiés / ≥ 100 k€) ou DIS jusqu'à 8 M€ ;
- **règlement en EUR** (séquestre notaire/EMI) par défaut ; **EURC/EURe** en option via un **CASP régulé** partenaire ;
- **lock-up** jusqu'à l'événement de liquidité (revente du bien), **distribution variable** sans rendement garanti ;
- **choix réel deal-by-deal** par l'investisseur, **aucune pré-collecte**, **aucune mutualisation**, **aucune NAV globale**, **aucun rebalancing**.

### Modèle à éviter absolument
- **Le vault mutualisé** (l'argent entre dans une cagnotte qui investit ensuite discrétionnairement) = **FIA quasi certain**. Sa traduction technique ERC-4626 (parts d'un pool géré, rachetables) est, pour l'ESMA, une « unité d'OPC ». [FAIT/ANALYSE]
- **Le club deal equity** avec **sélection discrétionnaire imposée par la plateforme** et pouvoir réservé à un sous-groupe = risque FIA (SAN-2025-08). [FAIT]
- **Accepter de l'USDT en flux entrant UE** (non conforme MiCA, delisté par les CASP européens depuis Q1 2025). [FAIT]
- **Vendre de la « propriété »** quand l'investisseur est créancier (mise en garde AMF). [FAIT]

### Risques principaux (du plus grave au plus gérable)
1. **Requalification FIA** → sanction AMF, nullité du montage. *Le risque n°1.*
2. **Offre au public sans prospectus/DIS** → infraction, au-delà des seuils (1 M€ / 5 M€ ECSP / 8 M€ DIS).
3. **Statut CASP/stablecoin** → activité crypto non autorisée si conversion en propre.
4. **Loi Hoguet (carte T/G)** → si entremise/gestion immobilière pour des tiers.
5. **Risque investisseur** : perte en capital, illiquidité, retard travaux, défaut promoteur, cycle immobilier. *À divulguer sans fard.*

### Niveau de faisabilité
- **Élevé** pour la brique « obligations de SAS opérationnelle distribuées en PSFP » : modèle éprouvé en France (>1,2 Md€ collectés par ClubFunding).
- **Moyen** pour la tokenisation pleinement on-chain conforme : techniquement mature (Tokeny/Securitize), juridiquement à cadrer (articulation DEEP/MiFID/MiCA).
- **Faible/long** pour la version « fonds tokenisé institutionnel » (AIFM).

### Points à valider avec l'avocat (liste de courses)
1. Qualification FIA du montage **précis** (obligations vs actions, gouvernance, rôle de la plateforme).
2. Périmètre PSFP vs placement privé vs DIS selon la cible investisseurs et le montant.
3. Nécessité ou non d'une **carte T** (loi Hoguet) selon le rôle exact de la plateforme.
4. Qualification du **token** (security token confirmé hors MiCA ; inscriptibilité DEEP).
5. Montage **stablecoin/CASP** (partenaire vs agrément propre ; Travel Rule).
6. Fiscalité : IS, TVA sur marge vs prix, engagement art. 1115 CGI, IFI.

---

# PARTIE 2 — Qualification juridique : 10 modèles comparés

> Critère transversal **[FAIT]** (ESMA 2013/611, AMF DOC-2013-16) : un véhicule est un **FIA** s'il réunit cumulativement (a) **pas d'objet commercial/industriel général**, (b) **mise en commun** de capitaux pour un rendement collectif, (c) les investisseurs **en tant que groupe** n'ont **pas** de pouvoir discrétionnaire quotidien, (d) **politique d'investissement définie**, (e) **levée de capitaux** auprès de plusieurs investisseurs.

| # | Modèle | Qualification probable | Licence | Risque AMF/ACPR | Difficulté op. | Stablecoin | Dette bancaire | Marché 2ndaire |
|---|---|---|---|---|---|---|---|---|
| 1 | **Vault mutualisé** | **FIA** (quasi certain) | **AIFM** (société de gestion + dépositaire) | **Très élevé** | Élevée | Oui | Oui | Difficile |
| 2 | **Marketplace de SPV** (deal-by-deal) | Hors FIA *si* bien structurée ; **risque** si pré-collecte/discrétion | PSFP recommandé | Moyen-élevé | Moyenne | Oui (CASP) | Oui | Bulletin board |
| 3 | **Club deal** (equity) | **FIA possible** (SAN-2025-08) | AIFM si FIA | **Élevé** | Moyenne | Oui | Oui | Faible |
| 4 | **Crowdfunding immobilier** (obligations) | **Hors FIA** (créance d'une opco) | **PSFP/ECSP** | **Faible** (cadre dédié) | Faible-moyenne | Oui (en marge) | Oui | Bulletin board (art. 25) |
| 5 | **Émission obligataire par SPV** | **Hors FIA** (financement d'opco) | Placement privé OU PSFP | **Faible** | Faible | Oui (CASP) | Oui | DEEP/ERC-3643 |
| 6 | **Tokenisation d'actions/parts** | Actions SAS : FIA **possible** ; parts SCI/SARL : **non tokenisables** | Selon FIA / placement | Moyen-élevé | Élevée | Oui | Oui | DEEP (actions SAS only) |
| 7 | **Tokenisation de créances** | **Hors FIA** (créance) | Placement privé / PSFP | **Faible** | Moyenne | Oui | Oui | Oui |
| 8 | **Membership + deal-by-deal** | Dépend du fond ; risque FIA si pooling | PSFP recommandé | Moyen | Moyenne | Oui | Oui | Variable |
| 9 | **DAO / gouvernance** | **Aggrave** le risque FIA (gestion collective on-chain) + flou statut juridique | Indéterminé | **Élevé** | Élevée | Oui | **Non** (banque ne prête pas à une DAO) | On-chain |
| 10 | **Société en participation / club d'investissement** | SEP : non-FIA possible mais opacité ; club d'invest. (loi 1945) : **plafonné, non commercialisable** | Aucune mais **non scalable** | Moyen | Faible | Non | Difficile | Non |

### Avantages / inconvénients clés par modèle

1. **Vault mutualisé** — ✅ UX simple, capital immédiat. ❌ FIA, AIFM (coût 200–500 k€/an, dépositaire, RCCI). *Exactement ce que vous voulez éviter.*
2. **Marketplace de SPV** — ✅ scalable, narratif clair. ❌ frontière FIA casuistique ; la plateforme ne doit **jamais** pré-collecter ni imposer une sélection discrétionnaire.
3. **Club deal equity** — ✅ alignement, simplicité apparente. ❌ **SAN-2025-08** : requalifié FIA dès lors que la sélection est centralisée et le pouvoir réservé à un sous-groupe.
4. **Crowdfunding obligations** — ✅ cadre dédié, prouvé, passeport UE, accessible au retail (avec tests). ❌ plafond 5 M€/12 mois, agrément PSFP à obtenir.
5. **Émission obligataire par SPV** — ✅ **le plus robuste anti-FIA**, bank-friendly, fiscalité claire, tokenisable en DEEP. ❌ rendement plafonné (créance), pas d'upside illimité pour l'investisseur.
6. **Tokenisation actions/parts** — ✅ upside, gouvernance. ❌ **parts SCI/SARL non tokenisables** (pas des titres financiers) ; actions SAS = risque FIA + offre au public.
7. **Tokenisation de créances** — ✅ flexible (obligations, prêts), hors FIA. ❌ qualification du token et du service (RTO/placement) à cadrer.
8. **Membership + deal-by-deal** — ✅ communauté, récurrence. ❌ si la cotisation finance un pool → FIA ; le membership ne doit donner accès qu'à des deals souscrits individuellement.
9. **DAO** — ✅ narratif Web3. ❌ gestion collective on-chain = signal FIA ; **aucune banque ne prête à un smart contract** ; responsabilité juridique des membres floue.
10. **SEP / club d'investissement** — ✅ zéro licence. ❌ club d'investissement = cadre associatif plafonné (≈ 5 500 €/membre/an, art. issus de la loi du 18 sept. 1945), **non commercialisable** ; SEP = opacité, pas de personnalité morale.

**Sources P2 :** ESMA 2013/611 ; AMF DOC-2013-16 ; AMF SAN-2025-08 (via analyse Couderc Dinh) ; CMF L.214-24 ; Règl. ECSP 2020/1503. *(liens en P13 et Sources)*

---

# PARTIE 3 — Meilleur format juridique : classement 1→10

Notation /5 sur : Solidité juridique · Simplicité · Fiscalité · Compat. bancaire · Compat. tokenisation · Transférabilité · **Faible** risque de qualification financière · Attractivité investisseur · **Faible** coût.

| Rang | Format | Solid. | Simpl. | Fisc. | Banque | Token. | Transf. | Anti-requal. | Attract. | Coût | **Total /45** |
|---|---|--|--|--|--|--|--|--|--|--|--|
| **1** | **Obligations émises par SAS opérationnelle** | 5 | 4 | 5 | 5 | 5 | 4 | 5 | 4 | 4 | **41** |
| **2** | **SAS (véhicule)** | 5 | 4 | 4 | 5 | 5 | 5 | 4 | 4 | 4 | **40** |
| **3** | **Token représentant une créance (obligation)** | 4 | 4 | 5 | 4 | 5 | 5 | 5 | 4 | 4 | **40** |
| **4** | **Actions de préférence (SAS)** | 5 | 3 | 4 | 4 | 5 | 4 | 3 | 5 | 3 | **36** |
| **5** | **SCCV** (promotion/revente) | 5 | 3 | 4 | 5 | 1 | 2 | 5 | 3 | 4 | **32** |
| **6** | **Token = titre financier (action SAS)** | 4 | 3 | 4 | 4 | 5 | 4 | 2 | 5 | 3 | **34** |
| **7** | **Nantissement / hypothèque** (sûreté, pas un format de levée) | 5 | 3 | 5 | 5 | 2 | 1 | 5 | 3 | 4 | **33** |
| **8** | **Contrat de prêt / revenue share** | 3 | 4 | 4 | 3 | 3 | 2 | 3 | 3 | 3 | **28** |
| **9** | **SCI** | 4 | 4 | 3 | 4 | 1 | 2 | 4 | 3 | 4 | **29** (mais **disqualifiée** pour MdB + non tokenisable) |
| **10** | **Titres participatifs / minibons / fiducie / SNC** | — | — | — | — | — | — | — | — | — | **Écartés** |

**Justifications décisives :**
- [FAIT] **Seule une société par actions (SA/SAS)** émet des **titres financiers** (actions, obligations) au sens de l'art. **L.211-1 CMF**, donc **inscriptibles en DEEP** (Ord. 2017-1674). Les **parts sociales** de SCI/SARL/SNC/SCCV **ne sont pas tokenisables comme titres financiers**. → **La SAS est le seul véhicule compatible tokenisation.**
- [FAIT] **Titres participatifs** : réservés au secteur public/coopératives (art. L.228-36 C. com.) → **une SAS classique ne peut pas en émettre**. Écartés.
- [FAIT] **Minibons** : **supprimés** (Ord. 2021-1735, run-off achevé le 10/11/2023). Écartés.
- [FAIT] **Bons de caisse** : **non négociables** (L.211-1 CMF les exclut des titres financiers) → non tokenisables comme titre. Écartés.
- [FAIT] **SCCV** : société **civile** à objet construction-vente, fiscalité **IR obligatoire** (art. 239 ter CGI), responsabilité indéfinie non solidaire — adaptée à la **promotion**, mais **parts non tokenisables**. Utilisable comme *sous-jacent opérationnel* détenu par une SAS, pas comme véhicule émetteur de tokens.
- **Nantissement / hypothèque** : ce sont des **sûretés** (cf. P11), pas des formats de collecte ; classés ici car évoqués, mais ils *renforcent* le produit obligataire, ils ne le remplacent pas.

**Conclusion P3 :** **SAS opérationnelle (MdB/promotion) émettant des obligations tokenisées**, garanties par hypothèque sur l'actif + éventuel nantissement, est le format optimal. L'action de préférence vient en complément si l'on veut offrir un **upside** (cf. structures hybrides en P14).

---

# PARTIE 4 — Structure recommandée (schéma + rôles)

```
┌─────────────────────────────────────────────────────────────────────┐
│  TOPCO — Holding SAS (marque, IP, équipe, capital)                    │
└───────────────┬─────────────────────────────────┬───────────────────┘
                │                                   │
   ┌────────────▼───────────────┐      ┌────────────▼──────────────────┐
   │ OPCO PLATEFORME — SAS       │      │ OPÉRATEUR IMMOBILIER — SAS     │
   │ édite le site + wallet +    │      │ sourcing, due diligence,       │
   │ back-office cap table       │      │ asset management, travaux      │
   │ ► statut PSFP (ECSP)        │      │ ► carte T/G SI entremise/      │
   │   propre OU partenaire      │      │   gestion pour tiers (sinon ✗) │
   └───┬───────┬───────┬─────────┘      └────────────────┬──────────────┘
       │       │       │                                  │ (gère le deal,
       │       │       │                                  │  perçoit fee opérateur)
   ┌───▼──┐ ┌──▼───┐ ┌─▼──────────┐                       │
   │ KYC/ │ │ EUR  │ │ CASP        │                      │
   │ AML  │ │ EMI/ │ │ stablecoin  │                      │
   │ +    │ │ PSP +│ │ EURC/EURe   │                      │
   │ONCHAIN│ │séques│ │(Circle/     │                      │
   │ ID   │ │ tre  │ │ Monerium)   │                      │
   └──────┘ └──────┘ └─────────────┘                      │
                                                          ▼
                              ┌───────────────────────────────────────────┐
                              │  SPV PAR OPÉRATION = SAS DÉDIÉE             │
                              │  (1 SPV = 1 bien / 1 opération)             │
                              │  • détient l'IMMEUBLE (asset)              │
                              │  • emprunte la DETTE SENIOR (hypothèque)   │
                              │  • émet les OBLIGATIONS TOKENISÉES (junior)│
                              │  • registre titres : DEEP + miroir ERC-3643│
                              └───┬───────────────────────────────┬────────┘
                                  │ prêt senior (hypothèque 1er rang)│ obligations
                          ┌───────▼────────┐               ┌────────▼─────────────┐
                          │ BANQUE PRÊTEUSE │               │ INVESTISSEURS         │
                          │ (prête à la SAS,│               │ TOKEN HOLDERS         │
                          │  PAS au smart   │◄──intercreditor──►│ (souscription deal-  │
                          │  contract)      │   (subordination) │  by-deal, lock-up)   │
                          └─────────────────┘               └──────────────────────┘
```

### Rôle de chaque entité
- **TopCo (Holding SAS)** : détient la marque, la techno, les participations ; remonte les management fees ; isole le patrimoine.
- **OpCo Plateforme (SAS)** : édite la marketplace, le wallet, le back-office, la cap table on/off-chain. **Porte le statut PSFP** (ou contractualise avec un PSFP partenaire). Ne détient **jamais** les fonds clients en propre.
- **Opérateur immobilier (SAS)** : sources les deals, fait la due diligence, pilote les travaux et la revente. Perçoit un **fee opérateur**. **Carte T loi Hoguet** requise **uniquement** s'il s'entremet dans des transactions pour le compte de tiers (cf. P11/P13) ; **non requise** si la SPV achète/revend **en son nom propre** (marchand de biens).
- **SPV (SAS dédiée)** : porte **un** actif, **une** dette, **une** émission obligataire. Faillite isolée (ring-fencing). Émet les obligations tokenisées, tient le registre en DEEP.
- **Banque prêteuse** : prête à la **personne morale SPV** (jamais au smart contract), garantie par **hypothèque 1er rang** ; signe un **intercreditor agreement** subordonnant les obligations.
- **Investisseurs token holders** : **créanciers obligataires** de la SPV, choisissent **chaque** deal, sous lock-up, distribution variable.
- **Prestataire KYC/AML** : Sumsub/Onfido + identité on-chain réutilisable (**ONCHAINID**).
- **Prestataire paiement EUR** : EMI/PSP + **compte séquestre** (notaire / CARPA / cantonnement EMI) qui détient les fonds jusqu'au closing.
- **Prestataire stablecoin (CASP régulé)** : Circle (EURC) / Monerium (EURe) pour l'on/off-ramp ; porte la conformité MiCA + Travel Rule.
- **Agent de tokenisation** : Tokeny / Securitize (déploiement ERC-3643, identity registry, compliance modules) + teneur du registre DEEP.

---

# PARTIE 5 — Parcours investisseur (16 étapes)

1. **Inscription** — email + mot de passe ; acceptation CGU + disclosures de risque.
2. **KYC/AML** — pièce d'identité, selfie, justificatif domicile, **origine des fonds** ; via Sumsub/Onfido. [FAIT] Obligatoire (LCB-FT, et bientôt PSFP assujettis via Règl. UE 2024/1624).
3. **Wallet connect** — création/connexion wallet (option *embedded wallet* pour les non-crypto) ; émission d'un **claim ONCHAINID** (KYC soulbound) lié au wallet.
4. **Profil investisseur** — questionnaire de connaissances + capacité de perte (test ECSP pour non-avertis) ; classification **averti / non-averti** ; détermination du plafond (max(1 000 €, 5 % du patrimoine net) sans avertissement explicite).
5. **Accès aux opportunités** — liste des deals ouverts ; **aucune pré-collecte**, l'argent ne bouge pas tant qu'un deal précis n'est pas souscrit.
6. **Badge produit** — lecture instantanée du deal (cf. P6).
7. **Fiche détaillée du deal** — KIIS/DIS, scénarios, waterfall, sûretés, risques (cf. P7).
8. **Souscription** — choix du montant (ticket min/max) ; **réservation non engageante** d'abord (soft-commit, sans versement).
9. **Signature électronique** — bulletin de souscription + contrat d'émission obligataire, via signature eIDAS (Yousign/DocuSign).
10. **Dépôt des fonds** — virement EUR vers **compte séquestre** (ou versement EURC/EURe via CASP → conversion → séquestre). [FAIT] Délai de réflexion **4 jours** (ECSP, non-avertis).
11. **Émission du token** — au **closing** (levée atteinte + prêt bancaire accordé) : déblocage du séquestre vers la SPV, inscription en **DEEP**, **mint** du token ERC-3643 sur le wallet whitelisté. Si échec → **remboursement intégral** depuis le séquestre.
12. **Suivi de performance** — dashboard : avancement travaux, jalons, photos, comptes, LTV en temps réel.
13. **Reporting** — reporting périodique (trimestriel) + documents fiscaux (IFU).
14. **Distribution** — coupons (locatif) ou distribution à la revente (marchand de biens), selon **waterfall**, en EUR ou stablecoin ; **variable, non garantie**.
15. **Sortie** — à l'événement de liquidité (revente du bien) : remboursement du principal + prime de performance éventuelle ; **burn** du token.
16. **Marché secondaire (option)** — **bulletin board** (art. 25 ECSP, simple babillard, *pas* de matching automatique) ; ou transfert P2P entre wallets whitelistés via les *transfer restrictions* du token.

---

# PARTIE 6 — Badges produit

> Règle : un badge est un **résumé visuel d'une réalité juridique/financière**, jamais un argument marketing trompeur. Code couleur suggéré : 🟢 nature/structure · 🔵 financier · 🟠 risque · ⚪ conformité/géo.

| Badge | Signification | Implication juridique | Implication financière | Impact risque | Condition d'usage |
|---|---|---|---|---|---|
| **Marchand de biens** | Achat-revente après travaux | Activité commerciale (IS, TVA), art. 1115 CGI | Plus-value à la revente, pas de loyer | Élevé (dépend du marché de sortie) | SPV à objet commercial réel |
| **Locatif** | Détention pour loyers | Revenus fonciers/BIC | Coupons périodiques + valeur résiduelle | Moyen | Bail(s) en place ou cible locative |
| **Value-add** | Création de valeur (travaux/repositionnement) | — | Upside conditionné à l'exécution | Élevé | Budget travaux et planning documentés |
| **Dette bancaire** | Levier senior présent | Hypothèque, intercreditor | Amplifie le rendement ET la perte (effet de levier) | ↑ avec LTV | LTV et rang à afficher |
| **Equity** | Apport en fonds propres / actions | Titre de capital (action) | Upside illimité, dernier servi | Élevé | Si actions/ADP émises |
| **Senior secured** | Créance de 1er rang garantie | Sûreté réelle 1er rang | Premier remboursé | Plus faible | Sûreté réellement inscrite |
| **Mezzanine** | Dette junior/subordonnée | Subordination contractuelle | Rendement supérieur, après le senior | Plus élevé | Intercreditor signé |
| **Lock-up 24 mois** | Blocage minimal 24 mois | Clause d'inaliénabilité (transfer restriction) | Illiquidité assumée | Liquidité ↓ | Durée réelle alignée sur l'opération |
| **Sortie à revente** | Liquidité à la cession du bien | Échéance liée à un événement | Pas de coupon, gain *in fine* | Concentration sur l'exit | Pour MdB/promotion |
| **Distribution variable** | Pas de rendement fixe | **Interdit de promettre un taux** | Dépend de la performance | — | **Toujours** afficher « non garanti » |
| **Hypothèque** | Bien hypothéqué | Sûreté réelle immobilière | Recouvrement facilité | ↓ perte en cas de défaut | Inscription notariée effective |
| **Nantissement** | Titres/compte nantis | Sûreté sur titres | Protection complémentaire | ↓ | Acte de nantissement signé |
| **SPV dédiée** | 1 société par opération | Ring-fencing, faillite isolée | Pas de contagion entre deals | ↓ (isolation) | SPV réellement distincte |
| **KYC obligatoire** | Identité vérifiée | LCB-FT | — | Conformité ✓ | Toujours |
| **Investisseur averti** | Réservé aux avertis | Placement restreint / test ECSP | Tickets potentiellement élevés | — | Selon classification |
| **Risque élevé** | Risque de perte significatif | Obligation d'information | Perte possible jusqu'à 100 % | — | **Honnêteté obligatoire** |
| **France** | Actif situé en France | Droit français applicable | Fiscalité FR | — | Localisation réelle |
| **Stablecoin compatible** | EURC/EURe acceptés | Via CASP régulé (MiCA) | On/off-ramp crypto | Risque opérationnel crypto | Partenaire CASP agréé |
| **EUR settlement** | Règlement en euros | PSD2 / séquestre | Pas d'exposition FX/crypto | ↓ | Compte séquestre en place |
| **Marché secondaire possible** | Revente envisageable | **Bulletin board** (pas de MTF) | Liquidité partielle | Liquidité incertaine | Ne jamais garantir la liquidité |

---

# PARTIE 7 — Fiche produit détaillée (template)

```
══════════════════════════════════════════════════════════════════
  [NOM DU DEAL]                          [BADGES: 🟢🔵🟠⚪]
  Statut levée : ▓▓▓▓▓▓░░░░ 62 %  •  J-14  •  France 🇫🇷
══════════════════════════════════════════════════════════════════

▸ IDENTITÉ
  Nom du deal              : « Résidence Haussmann — Lyon 6 »
  Adresse approximative    : Lyon 6e (adresse exacte au closing/NDA)
  Type d'opération         : Marchand de biens (achat-rénovation-revente)
  Opérateur                : [SAS opérateur], track record : X deals / Y M€

▸ ÉCONOMIE DE L'OPÉRATION
  Prix d'acquisition       : 1 800 000 €
  Frais de notaire (~)     : 130 000 €   (≈ 7,2 % ; réduits si art. 1115 CGI)
  Budget travaux           : 420 000 €
  Frais divers / portage   : 90 000 €
  ──────────────────────────────────────
  COÛT TOTAL DU PROJET     : 2 440 000 €
  Dette bancaire senior    : 1 460 000 €   (LTC ~60 %)
  Equity sponsor           : 240 000 €     (skin in the game ~10 %)
  EQUITY/QUASI-EQUITY recherchée (obligations) : 740 000 €
  LTV (dette/valeur)       : ~58 %         (valeur à dire d'expert)
  Durée cible              : 22 mois (lock-up jusqu'à l'exit)

▸ RENDEMENT (NON GARANTI)
  Rendement cible          : TRI cible ~9–11 %/an *non garanti*
  Scénario pessimiste      : revente -8 % → rendement ~0 à -15 %
  Scénario central         : business plan → ~10 %
  Scénario optimiste       : revente +5 % vs plan → ~16 %

▸ WATERFALL (ordre de paiement à l'exit)
  1. Remboursement dette bancaire senior + intérêts
  2. Remboursement principal obligataire (token holders)
  3. Coupon/intérêt obligataire (taux plancher si prévu)
  4. Frais plateforme + frais opérateur
  5. Prime de performance (carried) opérateur au-delà d'un hurdle
  6. Solde → equity sponsor

▸ FRAIS
  Frais plateforme         : ex. 1 % à l'entrée + 0,5 %/an admin
  Frais opérateur          : ex. 2 % acquisition + 20 % carried > hurdle 8 %

▸ GARANTIES & SÛRETÉS
  Hypothèque 1er rang (banque) ; nantissement titres SPV (obligataires) ;
  GAPD/caution sponsor ; assurance dommages-ouvrage (si travaux lourds)

▸ DOCUMENTS DISPONIBLES
  KIIS/DIS ; contrat d'émission obligataire ; rapport d'expertise ;
  devis travaux ; term sheet bancaire ; K-bis SPV ; intercreditor

▸ RISQUES (NON EXHAUSTIF)
  Perte en capital ; illiquidité (lock-up) ; retard/dépassement travaux ;
  baisse du marché à la revente ; défaut opérateur ; risque de taux ;
  risque crypto (si stablecoin) ; risque réglementaire

▸ FISCALITÉ INDICATIVE (à confirmer)
  Intérêts obligataires : PFU 31,4 % (2026) ou barème
  Plus-value de cession des tokens : régime valeurs mobilières (PFU)
  IFI : quote-part immobilière des titres potentiellement taxable
  *(la tokenisation ne crée AUCUN régime fiscal distinct)*

▸ CALENDRIER
  Levée → Closing → Travaux (M0–M14) → Commercialisation (M12–M20)
  → Revente/Exit (M20–M22) → Distribution → Burn token

▸ STRUCTURE LÉGALE
  Véhicule : SAS « [Deal] » dédiée ; instrument : obligations simples
  (option : tranche d'actions de préférence pour l'upside)

▸ SMART CONTRACT / TOKEN
  Standard : ERC-3643 (permissionné) ; registre légal : DEEP
  Adresse contrat : 0x… ; chaîne : [Polygon/Base/perm.] ; explorer : …
  Type de token : security token (créance obligataire)
  Droits du token holder : créance (principal + intérêt), info, vote
    limité (masse obligataire), pas de droit réel sur l'immeuble
  Restrictions de transfert : wallets whitelistés (KYC) ; lock-up 24 m ;
    juridictions exclues ; pas de transfert hors investisseurs éligibles

▸ PARAMÈTRES DE LEVÉE
  Statut : 62 % • Objectif 740 000 € • Min ticket 1 000 € •
  Max ticket 100 000 € (200 000 € averti) • Investisseurs : 0/?? •
  Règlement : EUR (séquestre) + EURC/EURe (option)
══════════════════════════════════════════════════════════════════
```

---

# PARTIE 8 — Graphiques UX (données · formule · interprétation)

1. **Répartition dette/equity (donut)** — *Données :* dette senior, obligations, equity sponsor. *Formule :* part = montant / coût total. *Interprétation :* niveau de levier et d'alignement (skin in the game).
2. **Use of funds (barres empilées)** — *Données :* acquisition, notaire, travaux, frais, portage. *Formule :* % du coût total. *Interprétation :* où va l'argent ; part travaux = part du risque d'exécution.
3. **Waterfall de distribution (cascade)** — *Données :* produit de revente, remboursements ordonnés (cf. P7). *Formule :* solde_n = solde_{n-1} − paiement_n. *Interprétation :* qui est payé, dans quel ordre, ce qui reste pour l'obligataire.
4. **Calendrier opérationnel (Gantt)** — *Données :* jalons datés. *Interprétation :* chemin critique, exposition au temps (portage).
5. **Scénarios de performance (barres groupées)** — *Données :* TRI pess./central/opt. *Formule :* TRI = taux annualisant flux entrants/sortants. *Interprétation :* dispersion = incertitude ; **toujours montrer le pessimiste**.
6. **Sensibilité prix de revente → rendement (courbe)** — *Données :* prix de sortie de -15 % à +15 %. *Formule :* rendement = f(prix_exit). *Interprétation :* point mort (rendement = 0) = marge de sécurité.
7. **Sensibilité retard travaux → rendement (courbe)** — *Données :* retard 0–12 mois. *Formule :* rendement = f(durée, coût de portage). *Interprétation :* coût du temps.
8. **Cashflow prévisionnel (aires)** — *Données :* flux mensuels (sorties travaux, entrée revente). *Interprétation :* profil de trésorerie, J-curve.
9. **Exposition au risque (radar)** — *Données :* notes /5 sur marché, exécution, levier, liquidité, opérateur, réglementaire. *Interprétation :* signature de risque comparable entre deals.
10. **LTV (jauge)** — *Formule :* LTV = dette / valeur expertisée. *Interprétation :* coussin avant que la dette ne dépasse la valeur ; seuils 60 %/70 %/80 %.
11. **Marge marchand (barre + ligne)** — *Formule :* marge = (prix_revente − coût_total) / coût_total. *Interprétation :* matelas absorbant les aléas ; < 10 % = fragile.

---

# PARTIE 9 — Smart contract / tokenisation

### Standard recommandé : **ERC-3643 (T-REX)** en miroir d'un **registre DEEP**

| Standard | Verdict pour des claims immobiliers EU 2026 |
|---|---|
| **ERC-20** | ❌ Seul, aucun contrôle KYC/transfert → inadapté à un titre financier. |
| **ERC-721 / 1155** | ⚠️ NFT par bien possible pour l'unicité, mais pas de couche conformité native. |
| **ERC-1400/1404** | ✅ Transfer restrictions, partitions ; bon, mais écosystème moindre qu'ERC-3643. |
| **ERC-3643 (T-REX)** | ✅✅ **Référence régulée UE** : token permissionné, **ONCHAINID** (KYC soulbound), Identity Registry, Compliance modules ; conformité vérifiée **avant chaque transfert** (`isVerified()` + `canTransfer()`). Adopté par Securitize, Tokeny, Tangany. |
| **ERC-4626 (vault)** | ❌ **À ÉVITER** : parts d'un pool géré rachetables = « unité d'OPC » pour l'ESMA → **signal FIA**. |

### Architecture réaliste (la plus déployée en prod)
1. **Registre légal off-chain = source de vérité** : inscription des obligations en **DEEP** (Ord. 2017-1674 + Décret 2018-1226). [FAIT] L'inscription en DEEP **vaut inscription en compte-titres**. *(N.B. : possible uniquement pour des titres financiers de société par actions → SAS, pas SCI/SARL.)*
2. **Miroir on-chain** : token **ERC-3643** reflétant la cap table.
3. **Whitelisting + transfer restrictions** : Identity Registry (pays ISO-3166, plafonds, lock-up), modules de compliance.
4. **KYC réutilisable** : **ONCHAINID** (claims signés par un *trusted issuer* = prestataire KYC), identité **non transférable** (soulbound).
5. **Settlement token** : **EURC** (Circle, EMT MiCA, agréé ACPR) ou **EURe** (Monerium, EMI) — **jamais USDT** en UE.
6. **Articulation réglementaire** : le security token reste **hors MiCA** (art. 2(4) — instrument financier MiFID II) ; il relève de **MiFID/Prospectus/DEEP/DLT Pilot**. Le stablecoin de règlement, lui, **relève de MiCA**.

> **Régime pilote DLT (UE 2022/858)** : pour exploiter un **marché secondaire** organisé (MTF/SS DLT). Niche réservée aux infrastructures régulées ; **non nécessaire** pour un simple émetteur. Pour démarrer : se limiter au **bulletin board** ECSP (art. 25) + transferts P2P whitelistés.

---

# PARTIE 10 — Flux de fonds (et risques réglementaires)

| Étape | Mécanisme | Risque réglementaire |
|---|---|---|
| **Réservation non engageante** | Soft-commit, **aucun versement** | Aucun (clé anti-« collecte discrétionnaire ») |
| **Escrow / séquestre** | Fonds bloqués chez **notaire / CARPA / cantonnement EMI** jusqu'au closing | [FAIT] Détenir des fonds clients en propre = **service de paiement** → besoin EMI/PSP **ou** séquestre tiers. **Ne jamais détenir soi-même.** |
| **Compte de paiement / PSP** | Virement SEPA entrant | PSD2 ; KYC bancaire |
| **EMI** | Émission/détention de monnaie électronique | Agrément DME (ou partenaire) |
| **Stablecoin on-ramp** | EUR → EURC/EURe | **CASP** (service d'échange) ; via partenaire régulé |
| **Conversion USDT/EUR** | **À ÉVITER en UE** | [FAIT] USDT non MiCA → un CASP ne peut le proposer ; risque AML |
| **Compte bancaire SPV** | Déblocage du séquestre au closing | Conditions suspensives (levée + prêt) |
| **Closing** | Inscription DEEP + mint token | Concomitance fonds/titres |
| **Remboursement si deal annulé** | Restitution intégrale depuis séquestre | Délai de réflexion 4 j (ECSP) ; pas de pénalité |
| **Distribution finale** | Coupons/exit en EUR ou stablecoin | Travel Rule (TFR 2023/1113) si crypto ; fiscalité |

**Principe directeur :** la plateforme **n'encaisse jamais** les fonds en propre ; ils transitent par un **séquestre tiers régulé** et ne sont débloqués qu'au **closing** d'un deal **déjà choisi** par l'investisseur. C'est ce qui distingue une marketplace d'une **collecte discrétionnaire** (= FIA).
**LCB-FT renforcé** sur toute entrée en stablecoin : KYC + **origine des fonds** + screening on-chain (sanctions, mixers) + **Travel Rule**. → privilégier **EURC/EURe via CASP** qui porte la conformité.

---

# PARTIE 11 — Banque et levier

- **Dette au niveau de la SPV** (pas de la holding) : ring-fencing, recours limité à l'actif.
- **Hypothèque 1er rang** sur l'immeuble : sûreté réelle principale du prêteur.
- **Nantissement** : des **titres de la SPV** (au profit des obligataires) et/ou du **compte de loyers**.
- **Caution / GAPD** : garantie autonome à première demande du sponsor → rassure la banque.
- **DSCR** (locatif) = revenu net / service de la dette ; cible > 1,2. **LTV** cible 55–70 %.
- **Pourquoi la banque ne prête PAS au smart contract** : un prêteur a besoin d'un **débiteur doté de la personnalité juridique** (la SAS), d'états financiers, de sûretés inscrites, d'un interlocuteur responsable. Une DAO/smart contract n'offre rien de tout cela → **prêt à la SAS, token en miroir**.
- **Documents pour rassurer la banque** : business plan, K-bis, track record opérateur, expertise de valeur, devis travaux, **intercreditor agreement** subordonnant les obligations à la dette senior, assurance.
- **Rôle de l'opérateur marchand de biens** : c'est lui le « sachant » qui porte le risque opérationnel et l'alignement (equity + carried) — élément clé tant pour la banque que pour la non-qualification FIA (objet commercial réel).

---

# PARTIE 12 — Comparables

| Plateforme | Pays | Véhicule | Collecte | Produit | Statut | Tokenisé |
|---|---|---|---|---|---|---|
| **AngelList SPV/Syndicates** | US | LLC/LP par deal | **Deal-by-deal** | Equity | Reg D 506(b)/(c) ; RIA | Non |
| **CrowdStreet** | US | Marketplace (souscription directe au sponsor) | Deal-by-deal | Equity/dette CRE | Reg D ; broker-dealer | Non |
| **Fundrise** | US | eREIT/eFund | **Pré-collecte = fonds** | Equity/dette diversifiés | Reg A+ ; RIA | Non |
| **RealtyMogul** | US | REIT + private placements | Hybride | Equity/dette | Reg A + Reg D ; BD | Non |
| **RealT** | US | **1 LLC (série) par bien** | Deal-by-deal | Equity + loyers | Reg D **+ Reg S** (international) | ✅ ERC-20 **restreint** (Gnosis) |
| **Lofty.ai** | US | **DAO LLC par bien** | Deal-by-deal | Equity + loyer quotidien | Zone grise securities | ✅ Algorand |
| **BrickVest** | UK/EU | Plateforme pro | — | Equity immo | Régulé (flou) | Non — **insolvable 2019** (repris PATRIZIA) |
| **Bricks.co** | FR | Royalties → **obligations** | Deal-by-deal | Dette | **PSFP** après recadrage | Non |
| **WiSEED** | FR | Multi (equity/dette/SCPI) | Deal-by-deal | Mixte | **PSI/PSFP** — **redressement judiciaire 2025** (repris Advenis) | Non |
| **Anaxago** | FR | Multi + SCPI | Deal-by-deal | Equity/obligations | **PSFP** | Non |
| **ClubFunding** | FR | **Obligations** de SAS dédiée | **Deal-by-deal** | Dette | **PSFP** — **leader >1,2 Md€** | Non |
| **Homunity** | FR | Obligations | Deal-by-deal | Dette | **PSFP + CIF** | Non |
| **Securitize** | US | Infra | — | Tokenisation titres | BD + transfer agent + ATS | ✅ (clients BlackRock/Apollo) |
| **Tokeny (ERC-3643)** | LU | Infra/standard | — | Token permissionné | — | ✅ standard de référence |
| **Brickken** | ES | Infra no-code | — | Equity/dette/immo | **MiCA + DORA ready** | ✅ |
| **Tangany** | DE | Custody white-label | — | Garde + registre | **BaFin + MiCA** | ✅ |

### 3 patterns à copier
1. **Obligations de SAS dédiée, deal-by-deal, sous PSFP** (ClubFunding) = le modèle FR prouvé, anti-FIA, bank-friendly.
2. **« 1 entité juridique par bien » + token permissionné** (RealT/Lofty) **mais avec conformité embarquée** (ERC-3643, custody régulée Tangany, MiCA-ready Brickken) — ne pas copier le token ERC-20 « libre ».
3. **Reg S (RealT) / passeport PSFP** pour l'international : un seul agrément AMF → distribution UE.

### 3 pièges à éviter
1. **Le contrat « royalties/redevance » (Bricks.co)** : créancier déguisé en propriétaire → **mise en garde AMF 2022**.
2. **La « zone grise » tokenisation sans statut (Lofty)** : parier que des parts ne sont pas des securities, sans BD/transfer agent.
3. **Modèle fragile** : BrickVest (faillite), WiSEED (RJ 2025), Homunity (retards) → la **dette promoteur deal-by-deal** est vulnérable au cycle ; soigner la due diligence et la diversification.

---

# PARTIE 13 — Réglementation France / Europe

- **FIA / AIFMD (2011/61/UE)** — [FAIT] FIA = OPC qui lève des capitaux auprès de plusieurs investisseurs selon une **politique d'investissement définie**, sans pouvoir discrétionnaire des investisseurs *en groupe* et **sans objet commercial général**. Transposition CMF **L.214-24**. **Sous-seuils** (art. 3) : enregistrement allégé si ≤ **100 M€** (avec levier) ou ≤ **500 M€** (sans levier + lock-up 5 ans) — **mais ≠ exonération de la qualification FIA**. **SAN-2025-08** : club deals requalifiés.
- **AMF / ACPR** — l'AMF agrée PSFP, sanctionne les FIA non autorisés, vise les prospectus/DIS ; l'ACPR couvre EMI/PSP/banque.
- **PSFP / ECSP (UE 2020/1503)** — [FAIT] statut unique européen, plafond **5 M€/porteur/12 mois**, **passeport UE**, **KIIS**, test investisseurs non-avertis, **délai 4 j**, **bulletin board** (pas de MTF). Transition CIP/IFP → PSFP achevée le **10/11/2023**.
- **PSAN / CASP (MiCA, UE 2023/1114)** — [FAIT] CASP applicable depuis 30/12/2024 ; transition FR **jusqu'au 1er juillet 2026**. 10 services (conservation, échange crypto↔fiat, transfert…).
- **MiCA** — ART/EMT depuis 30/06/2024. **EURC/EURe conformes** ; **USDT non conforme** (delisté UE). **Security tokens hors MiCA** (art. 2(4)).
- **MiFID II** — le security token = instrument financier ; sa distribution peut relever de services d'investissement (RTO/placement) → PSI ou exemption PSFP.
- **Titres financiers** — [FAIT] art. **L.211-1 CMF** : titres de capital (sociétés par actions), titres de créance, parts d'OPC. **Parts sociales exclues**.
- **Offre au public vs placement privé** — [FAIT] Prospectus (UE 2017/1129) : exempt < **1 M€** ; **DIS jusqu'à 8 M€** en France (L.411-2-1) ; au-delà, prospectus visé AMF. **Placement privé** (L.411-2 + 2017/1129) : investisseurs qualifiés / **< 150 personnes** par État / nominal ou ticket **≥ 100 000 €**.
- **Crowdfunding immobilier** — régime ECSP autonome (≤ 5 M€), dispensé de prospectus.
- **Obligations** — titres de créance émis par SA/SAS ; tokenisables en DEEP.
- **Minibons** — **supprimés** (2021) ; **bons de caisse** non négociables (hors tokenisation titre).
- **Blockchain / DEEP** — [FAIT] Ord. **2017-1674** + Décret **2018-1226** : inscription des titres financiers non cotés en DLT vaut inscription en compte. **DLT Pilot (2022/858)** pour les infrastructures de marché.
- **KYC/AML** — LCB-FT ; PSFP assujettis (Règl. UE 2024/1624) ; Travel Rule crypto (TFR 2023/1113) ; paquet AMLR/AMLA 2025-2027.
- **Loi Hoguet (carte T/G)** — [FAIT] requise pour **entremise/gestion immobilière pour le compte de tiers** à titre habituel ; **non requise** si la SPV achète/revend **en son nom propre** (marchand de biens) ou pour une simple distribution de titres financiers. [INCERTAIN] selon le périmètre réel de la plateforme.
- **Marchand de biens** — [FAIT] acte de commerce (IS, TVA sur marge/prix, **art. 1115 CGI** : droits réduits à 0,715 % avec engagement de revente sous 5 ans) ; **pas de carte** requise.
- **Fiscalité distributions** — [FAIT] **PFU 31,4 % en 2026** (12,8 % IR + **18,6 %** PS, hausse CSG) sur intérêts/dividendes/plus-values ; option barème. **IFI** : quote-part immobilière des titres potentiellement taxable (abattement 30 % RP **non applicable** via société ; [INCERTAIN] stocks MdB possiblement hors IFI). La **tokenisation ne crée aucun régime fiscal distinct**.

---

# PARTIE 14 — Scénarios de lancement

### Version A — Ultra-light (pilote)
- **Structure** : 1–2 SPV (SAS) émettant des **obligations**, **placement privé** (investisseurs **qualifiés / professionnels** ou tickets **≥ 100 k€**, < 150 personnes), tokenisation **permissionnée** (ERC-3643 sur chaîne privée/L2), **règlement EUR** (séquestre notaire).
- **Coût** : ~30–80 k€ (avocats, structuration, MVP). **Délai** : ~2–3 mois.
- **Licences** : **aucune licence de gestion** ; pas de PSFP si placement privé strict.
- **Contraintes** : audience étroite ; **le risque FIA reste à gérer** (objet commercial réel, choix deal-by-deal, pas de pooling).
- **Risques** : requalification FIA si dérive ; liquidité nulle.
- **Scale** : faible. **Reco** : ✅ **idéal pour 1–2 deals pilotes** et valider la mécanique.

### Version B — Plateforme régulée légère (cible)
- **Structure** : marketplace deal-by-deal, SPV (SAS) émettant **obligations tokenisées**, distribution sous **PSFP/ECSP** (≤ 5 M€/deal ; DIS jusqu'à 8 M€ ; ou placement privé au-delà), **DEEP + ERC-3643**, **EUR + EURC/EURe** via CASP partenaire, dette bancaire senior.
- **Coût** : ~150–400 k€ + temps d'agrément. **Délai** : PSFP propre **6–12 mois** (AMF), **immédiat via partenaire PSFP**.
- **Licences** : **PSFP** (pas AIFM) ; partenaires EMI/CASP/KYC.
- **Contraintes** : plafond 5 M€/deal ; obligations PSFP (KIIS, tests, reporting).
- **Risques** : exécution réglementaire ; dépendance partenaires.
- **Scale** : **bon** (passeport UE, retail). **Reco** : ✅✅ **modèle cible**.

### Version C — Institutionnelle / fonds tokenisé
- **Structure** : **FIA régulé** (ex. **SLP** / FPCI) géré par une **société de gestion agréée** (propre ou ManCo tierce), **parts tokenisées**, dépositaire.
- **Coût** : élevé (AIFM 200–500 k€/an + dépositaire + RCCI). **Délai** : **12–24 mois**.
- **Licences** : **AIFM** (gestion de fonds) — *exactement la licence à éviter au départ*.
- **Contraintes** : lourdeur, gouvernance, contrôle dépositaire.
- **Risques** : time-to-market, coûts fixes.
- **Scale** : **maximal** (100 M€+, institutionnels). **Reco** : ⏭️ **plus tard**, si le produit décolle.

---

# PARTIE 15 — Conclusion stratégique

### Meilleur modèle
**Marketplace deal-by-deal + SAS opérationnelle (MdB/promotion) émettant des obligations tokenisées (DEEP + ERC-3643), distribuées sous PSFP, règlement EUR (+ EURC/EURe optionnel), dette bancaire senior, lock-up jusqu'à l'exit, distribution variable.** C'est le point d'équilibre : **pas de licence de gestion (pas d'AIFM)**, risque FIA minimisé (créance d'une opco réelle), tokenisation conforme, scalable.

### Première version à lancer
**Version A → B.** Lancer **1–2 deals pilotes en placement privé** (qualifiés, obligations, tokenisation permissionnée, EUR), **puis** basculer en **Version B** (PSFP partenaire d'abord, agrément propre ensuite).

### À éviter absolument
- Le **vault mutualisé** / pré-collecte / NAV / rebalancing (= FIA).
- Le **club deal equity** avec sélection discrétionnaire imposée (SAN-2025-08).
- **USDT** en flux entrant UE.
- Vendre de la **« propriété »** quand l'investisseur est **créancier** (Bricks.co / AMF).
- Détenir les **fonds clients** en propre (utiliser un séquestre tiers).

### MVP juridique
Memo de qualification FIA ; term sheet + contrat d'émission obligataire ; bulletin de souscription ; KIIS/DIS ; intercreditor agreement ; CGU + disclosures de risque ; politique LCB-FT ; mapping juridique du token ; statuts SAS SPV.

### MVP produit
Inscription + KYC + wallet ; page deal + badges + KIIS ; réservation non engageante → signature eIDAS → séquestre → closing → mint ERC-3643 ; dashboard de suivi ; reporting + distribution ; bulletin board.

### Stack technique (CTO)
Next.js + wallet (wagmi/viem, option embedded) · KYC Sumsub/Onfido + **ONCHAINID** · **ERC-3643 (T-REX)** sur EVM (Polygon/Base ou permissionné) · registre **DEEP** (via Tokeny/registrar) · séquestre EMI/notaire (API) · **EURC/EURe** (Circle/Monerium API) · signature eIDAS (Yousign) · back-office cap table on/off-chain · reporting.

### Documents à produire
(cf. MVP juridique) + whitepaper token, politique de conflits d'intérêts, plan de continuité, grille de frais, modèles de reporting/IFU.

### Avocats / prestataires à consulter
1. **Avocat gestion d'actifs / droit financier** (qualification FIA, offre au public, PSFP).
2. **Avocat corporate/immobilier** (SAS, MdB, sûretés, intercreditor).
3. **Conseil MiCA/CASP** (stablecoin, Travel Rule).
4. **Notaire** (séquestre, hypothèque, art. 1115).
5. **Expert-comptable fiscaliste** (IS, TVA marge, IFI).
6. **Fournisseur de tokenisation** (Tokeny/Securitize) + **PSFP partenaire** (ex. distribution).

### Prochaines étapes — 30 / 60 / 90 jours
**J0–J30** — Memo qualification FIA avec avocat AIFM ; choix Version A ; constitution TopCo + OpCo ; sélection partenaires KYC/séquestre/tokenisation ; rédaction term sheet obligataire + KIIS ; sourcing du deal pilote.
**J30–J60** — Structuration SPV SAS du pilote ; term sheet bancaire ; docs légaux (contrat d'émission, souscription, intercreditor) ; MVP front (wallet, KYC, page deal, souscription, e-sign) ; registre DEEP + ERC-3643 en testnet.
**J60–J90** — Clôture de la levée pilote (placement privé qualifiés) ; déploiement tokens ; séquestre → closing → financement SPV ; dashboard reporting ; ouverture du **partenariat/dossier PSFP** pour la Version B.

---

# Sources complètes (URLs réellement consultées)

### FIA / AIFMD
- ESMA/2013/611 — Guidelines on key concepts of the AIFMD : https://www.esma.europa.eu/sites/default/files/library/2015/11/2013-611_guidelines_on_key_concepts_of_the_aifmd_-_en.pdf
- AMF DOC-2013-16 : https://www.amf-france.org/en/regulation/policy/doc-2013-16
- Légifrance — L.214-24 CMF : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000038611709
- AIFMD 2011/61/UE (considérant 8, miroir) : https://www.legislation.gov.uk/eudr/2011/61/introduction
- Analyse SAN-2025-08 (Couderc Dinh & Associés, Newsletter n°8) : https://coudercdinh.fr/wp-content/uploads/2025/09/CDA-Newsletter-n%C2%B08.pdf
- ASPIM — « Autres FIA » immobilier : https://www.aspim.fr/reglementation-autres-fia-en-immobilier.html
- CMS — régime des « Autres FIA » : https://cms.law/fr/fra/publication/l-amf-precise-le-regime-des-autres-fia
- Rivière Avocats — club deal & FIA : https://www.riviereavocats.com/club-deal-immobilier-fia/
- Pinsent Masons — ESMA AIFMD definitions : https://www.pinsentmasons.com/out-law/guides/esmas-definitions-of-aifmd-terms
- Seuils art. 3(2) : https://fund-xp.lu/aifmd-annex-iv/faq-aifmd/
- Linklaters — scope/definition AIF : https://www.linklaters.com/insights/publications/aifmd/scope--definition-of-aif

### Crowdfunding ECSP / PSFP
- ESMA — Q&As ECSPR (esma35-42-1088) : https://www.esma.europa.eu/sites/default/files/library/esma35-42-1088_qas_crowdfunding_ecspr.pdf
- AMF — Chiffres clés CIP/PSFP 2023 : https://www.amf-france.org/sites/institutionnel/files/private/2024-12/conseillers-en-investissements-participatifs-et-prestataires-de-services-de-financement-participatif-chiffres-cles-2023.pdf
- EUR-Lex — Règl. 2020/1503 : https://eur-lex.europa.eu/eli/reg/2020/1503/oj?locale=fr
- Jeantet — cadre crowdfunding UE : https://www.jeantet.fr/en/2020/11/new-european-framework-for-crowdfunding/
- AMF — opérer comme PSFP en France : https://www.amf-france.org/en/professionals/fintech/my-relations-amf/crowdfunding-service-provider-csp/operating-crowdfunding-service-provider-france
- vie-publique — Ord. 22/12/2021 : https://www.vie-publique.fr/loi/283046-ordonnance-22-decembre-2021-financement-participatif
- Soton Avocats — suppression des minibons : https://www.soton-avocat.com/actualites/articles/suppression-du-regime-des-minibons
- Raizers — promoteur/marchand de biens : https://raizers.com/en/promoteur-marchand-de-biens/
- planet-fintech — marchands de biens en crowdfunding : https://www.planet-fintech.com/Les-marchands-de-biens-ont-la-cote-en-crowdfunding_a2688.html

### MiCA / stablecoins / PSAN-CASP
- AMF — fin du régime transitoire PSAN (1er juillet 2026) : https://www.amf-france.org/en/news-publications/news/amf-reminds-digital-asset-service-providers-transitional-period-allowing-them-continue-providing
- AMF — agréments CASP (10 services) : https://www.amf-france.org/en/news-publications/news/mica-regulation-amf-now-accepting-applications-authorisation-casp
- ESMA — page MiCA : https://www.esma.europa.eu/esmas-activities/digital-finance-and-innovation/markets-crypto-assets-regulation-mica
- ESMA — Guidelines qualification crypto-actifs en instruments financiers : https://www.esma.europa.eu/sites/default/files/2024-12/ESMA75453128700-1323_Final_Report_Guidelines_on_the_conditions_and_criteria_for_the_qualification_of_CAs_as_FIs.pdf
- Circle — 1er émetteur conforme MiCA / agrément ACPR : https://www.circle.com/pressroom/circle-is-first-global-stablecoin-issuer-to-comply-with-mica-eus-landmark-crypto-law
- De Gaulle Fleurance — agrément EME Circle ACPR : https://www.degaullefleurance.com/en/actualites/conseille-par-de-gaulle-fleurance-circle-obtient-un-agrement-detablissement-de-monnaie-electronique-eme-aupres-de-lacpr/
- CNBC — Circle licence française : https://www.cnbc.com/2024/07/01/eu-mica-law-crypto-firm-circle-gets-french-license-for-stablecoin.html
- Monerium — EURe (EMI, on/off-ramp) : https://monerium.com/eure/ · https://monerium.com/blog/2025/mica-explained-how-to-choose-a-compliant-euro-stablecoin-in-europe/
- The Block — Binance delist USDT EEA : https://www.theblock.co/post/344182/binance-delist-tether-other-non-mica-compliant-stablecoins
- CoinDesk — Crypto.com/Bitstamp suspendent USDT : https://www.coindesk.com/policy/2025/01/29/crypto-com-will-suspend-tether-paypal-stablecoin-services-in-europe-due-to-mica
- CoinDesk — Coinbase delist (UE) : https://www.coindesk.com/policy/2024/10/04/coinbase-to-delist-unauthorized-stablecoins-in-eu-by-december
- Dechert — application 2e partie MiCA : https://www.dechert.com/knowledge/onpoint/2025/1/application-of-second-part-of-mica---regulation-of-casps-and-oth.html
- Freshfields — grandfathering MiCA : https://www.freshfields.com/en/our-thinking/blogs/technology-quotient/grandfathering-under-mica-how-member-states-approach-the-transitional-regime-102jake
- Tokeny — security tokens hors MiCA : https://tokeny.com/tokenized-securities-unaffected-by-mica-utility-tokens-and-stablecoins-face-stricter-rules/
- Tokenization Policy — MiCA art. 2(4) / MiFID : https://tokenizationpolicy.com/eu-mica/tokenized-securities-europe/
- Sumsub — conformité stablecoins (AML/Travel Rule) : https://sumsub.com/blog/global-stablecoin-compliance-guide/

### Tokenisation / standards / DEEP
- EIP-3643 : https://eips.ethereum.org/EIPS/eip-3643 · ERC3643.org : https://www.erc3643.org/ · Tokeny : https://tokeny.com/erc3643/ · T-REX : https://github.com/TokenySolutions/T-REX
- EIP-4626 : https://eips.ethereum.org/EIPS/eip-4626 · EIP-20 : https://eips.ethereum.org/EIPS/eip-20
- ERC-1400/1404 : https://github.com/ethereum/eips/issues/1411 · https://erc1404.org/
- Règl. (UE) 2022/858 (DLT pilot) : https://eur-lex.europa.eu/eli/reg/2022/858/oj?locale=fr · AMF Régime pilote : https://www.amf-france.org/en/news-publications/depth/pilot-regime
- Ord. 2017-1674 : https://www.legifrance.gouv.fr/loda/id/JORFTEXT000036171908/ · Rapport au Président : https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000036171895
- L.211-1 CMF (titres financiers) : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032469968
- Minibons L.223-12/13 : https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006072026/LEGISCTA000032468111/2017-12-30
- DEEP & titres non cotés (analyse) : https://www.lettredesreseaux.com/P-2501-485-A1-utilisation-de-la-blockchain-pour-l-inscription-des-titres-financiers-non-cotes.html
- CMS — inscrire des titres en blockchain : https://cms.law/fr/fra/news-information/comment-inscrire-des-titres-financiers-en-blockchain

### Comparables
- AMF — mise en garde « royalties immobilières » : https://www.amf-france.org/en/news-publications/news-releases/amf-news-releases/amf-warns-public-against-certain-platforms-proposing-investments-real-estate-royalties
- AngelList SPVs : https://www.angellist.com/fund-administration/spvs · 506(b) vs 506(c) : https://www.angellist.com/learn/506b-vs-506c-funds
- CrowdStreet : https://crowdstreet.com/resources/investment-fundamentals/real-estate-syndication-frequently-asked-questions-guide
- Fundrise (Wikipedia) : https://en.wikipedia.org/wiki/Fundrise · eREITs : https://fundrise.com/ereits
- RealtyMogul (SEC 1-A) : https://www.sec.gov/Archives/edgar/data/0001669664/000149315224013997/ex1-1.htm
- RealT — PPM Series 1 : https://realt.co/wp-content/uploads/2019/09/REALTOKEN-LLC-SERIES-1-9943-MARLOWE-1.pdf · whitepaper : https://realt.co/wp-content/uploads/2019/05/RealToken_White_Paper_US_v03.pdf
- Lofty.ai : https://www.lofty.ai/learn/ultimate-tokenized-real-estate-investment-strategies-guide
- BrickVest — insolvency : https://find-and-update.company-information.service.gov.uk/company/09294583/insolvency · rachat PATRIZIA : https://www.refire-online.com/companies/patrizia-ag-steps-in-to-swallow-up-insolvent-platform-brickvest/
- Bricks.co : https://www.okcrowdfunding.com/bricks-co
- WiSEED PSFP : https://www.wiseed.com/blog/articles/crowdfunding-quels-changements-avec-le-nouvel-agrement-europeen-psfp
- Anaxago — agrément : https://www.anaxago.com/legal/agrement
- ClubFunding : https://objectif-renta.com/platforms_review/ClubFunding.php · Homunity : https://www.homunity.com/fr/blog/immobilier/homunity-obtient-le-nouvel-agrement-psfp
- Securitize/ERC-3643 (comparatif) : https://blog.tokenizer.estate/real-estate-tokenization-platform-comparison-2026/ · Chainalysis ERC-3643 : https://www.chainalysis.com/blog/introduction-to-erc-3643-ethereum-rwa-token-standard/
- Brickken : https://www.brickken.com/real-estate-tokenization · Tangany (BaFin) : https://tangany.com/blog/tangany-receives-crypto-custody-license-from-bafin

### Structures juridiques FR / offre au public / fiscalité
- L.411-2 CMF : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000044563789
- L.228-11 C. com. (actions de préférence) : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000019733461/2012-03-24
- L.228-36 C. com. (titres participatifs) : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000029329659
- Règl. Prospectus 2017/1129 : https://eur-lex.europa.eu/legal-content/FR/TXT/PDF/?uri=CELEX:32017R1129
- BOFiP — art. 1115 CGI : https://bofip.impots.gouv.fr/bofip/3290-PGP.html/identifiant=BOI-ENR-DMTOI-10-50-20140429
- BOFiP — IFI titres : https://bofip.impots.gouv.fr/bofip/11305-PGP.html/identifiant=BOI-PAT-IFI-20-20-20-10-20180608
- PFU (economie.gouv) : https://www.economie.gouv.fr/particuliers/impots-et-fiscalite/gerer-mes-autres-impots-et-taxes/comment-fonctionne-le-prelevement · évolution taux : https://entreprendre.service-public.gouv.fr/actualites/A18796?lang=fr
- SCCV (Rivière Avocats) : https://droit-societes-immobilier.riviereavocats.com/2024/01/19/sccv-regime-fisca/
- SCI/MdB requalification : https://fintae.fr/blog/activite-de-marchand-de-biens-et-sci/ · TVA MdB : https://fiscalimmo.fr/fiscalite-des-marchands-de-biens-le-guide/
- SAS marchand de biens : https://www.l-expert-comptable.com/a/7342-la-sas-pour-le-marchand-de-biens-le-statut-ideal.html
- Loi Hoguet (cartes T/G) : https://www.galian-smabtp.fr/blog/agent-immobilier-tout-savoir-sur-loi-hoguet
- Placement privé (CMS) : https://cms.law/fr/fra/publication/le-placement-prive · seuil 8 M€/DIS (Squire Patton Boggs) : https://larevue.squirepattonboggs.com/reglement-prospectus-un-nouveau-seuil-national-pour-les-offres-au-public.html
- PFU 31,4 % 2026 : https://www.victorisavocat.com/en/blog/flat-tax-le-guide-complet-pour-les-dirigeants-et-investisseurs-en-2026
- SCI & IFI 2026 : https://www.socic.fr/ressources-comptabilite/articles/sci-et-ifi-2026-guide-complet-pour-les-detenteurs-de-partssci-et-ifi-comment-sont-imposees-les-parts-sociales-en-2026

---

### Limites & incertitudes signalées
- **SAN-2025-08** lue via analyse de cabinet (PDF), non via le texte intégral de la décision AMF ; citations entre guillemets issues de cette analyse.
- **EUR-Lex** non lisible automatiquement (pages JS/PDF) : articles MiCA (2(4), 149) et ECSP corroborés par ESMA + cabinets, non cités verbatim depuis le JO.
- **Numéros d'agrément PSFP** (Bricks FP-2023-08, ClubFunding FP-2023-40, Homunity) issus de pages plateformes, non recoupés un par un sur REGAFI.
- **Qualification fine du token** (security vs autre) et **nécessité de la carte T** dépendent du montage réel → analyse avocat indispensable.
- **PFU 2026 = 31,4 %** (hausse CSG) ; la valeur « 30 % » du brief est périmée.
- Aucune de ces analyses ne constitue une garantie de non-requalification : la frontière FIA est **casuistique** et l'AMF privilégie l'**approche économique**.
