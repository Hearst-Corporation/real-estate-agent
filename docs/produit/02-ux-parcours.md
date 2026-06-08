# 02 — UX & Parcours produit
## Plateforme d'investissement immobilier tokenisé (obligations de SAS, PSFP, ERC-3643/DEEP)

> **Statut.** Document de conception UX produit (architecture de l'information + parcours écran par écran). Source juridique : `docs/etude-immobilier-tokenise-2026.md` (lue en entier). Toute décision UX ci-dessous **découle** des contraintes verrouillées de l'étude. Tags : **[FAIT]** = imposé par une norme/décision citée dans l'étude · **[ANALYSE]** = choix UX raisonné · **[HYPOTHÈSE]** = à valider (produit ou avocat).
>
> **Design system.** Cockpit (shell bordeaux verre dépoli) — copie locale éditable de ce repo. Accent produit = `data-product="gold"` (`--ct-accent: #d4af37`) — l'or = code couleur « investissement/valeur », distinct du CRM estimation (bordeaux par défaut). Tokens `--ct-*` préférés par cohérence, mais tokens et CSS s'éditent directement. Réf : `components/cockpit/`, `app/cockpit/*.css`.
>
> **Cadre de non-régression.** Cette plateforme d'investissement est une **surface produit séparée** de l'app d'estimation/CRM existante (`app/(dashboard)/estimations|leads|mandates|...`). Préfixe de namespace proposé : `/invest/*` (espace investisseur) et `/operateur/*` (espace opérateur). On NE touche PAS aux routes existantes.

---

## 0. Principes UX directeurs (les 7 lois non négociables, traduites en design)

Ces 7 principes sont la **constitution UX**. Chaque écran doit pouvoir être justifié par l'un d'eux. Ils traduisent les contraintes juridiques (étude P1, P5, P10, P13) en règles d'interface.

| # | Loi juridique (étude) | Traduction UX concrète (ce qu'on FAIT / NE FAIT PAS) |
|---|---|---|
| **L1** | Anti-FIA : choix deal-by-deal RÉEL, pas de sélection discrétionnaire de la plateforme [FAIT SAN-2025-08] | **Jamais** de bouton « Investir automatiquement », « Portefeuille recommandé », « Auto-allocate », « Robo ». Le tri/filtre aide à *trouver*, jamais à *décider à la place*. Pas de « score plateforme » présenté comme une reco d'achat — uniquement des faits (LTV, marge, durée). |
| **L2** | Aucune pré-collecte, aucun pooling, aucune NAV globale [FAIT] | **Aucun écran « Alimenter mon compte / déposer des fonds en attente ».** L'argent ne bouge **jamais** avant qu'un deal précis soit choisi et signé. Le portfolio n'affiche **jamais** une « valeur nette du portefeuille » consolidée façon fonds (pas de NAV). On affiche des **positions par deal**, juxtaposées, jamais agrégées en une part unique. |
| **L3** | Réservation NON engageante d'abord (soft-commit, zéro versement) [FAIT P10] | Le 1er pas de souscription est **« Réserver ma place »** (révocable, gratuit, sans IBAN). Le versement est une étape **ultérieure et distincte**, après signature. Wording verrouillé : « réservation non engageante ». |
| **L4** | Créancier ≠ propriétaire (mise en garde AMF 29/12/2022) [FAIT] | **Interdit** dans l'UI : « devenez propriétaire », « votre bien », « achetez cet immeuble », « vos parts de l'immeuble ». Wording verrouillé : « obligations », « vous prêtez à la SAS », « créance », « titre de créance tokenisé ». Un composant `<LegalNatureBadge>` rappelle la nature exacte sur chaque deal. |
| **L5** | Distribution variable, jamais de rendement garanti [FAIT P6] | **Tout** chiffre de rendement porte le suffixe « cible · non garanti » et le scénario pessimiste est **toujours** visible au même niveau hiérarchique que le central. Interdit : « rendement de 10 % », « gagnez X% ». Autorisé : « TRI cible ~9–11 % · non garanti · perte en capital possible ». |
| **L6** | Plateforme ne détient JAMAIS les fonds (séquestre tiers) [FAIT P10] | L'écran de versement affiche **explicitement** le destinataire = compte séquestre notaire/EMI (nom du tiers), pas « notre compte ». Remboursement intégral si le deal échoue, sans pénalité, communiqué dès l'étape de versement. |
| **L7** | Hors MiCA pour le token, MiCA pour le stablecoin ; EUR par défaut, jamais USDT [FAIT] | Le rail de paiement par défaut = **virement EUR vers séquestre**. EURC/EURe = option secondaire, libellée « via [CASP régulé] ». **USDT n'apparaît nulle part** (pas même grisé). Le wallet embarqué (non-crypto) ne propose jamais d'acheter du crypto. |

> **Garde-fou transverse (copywriting).** Une checklist de mots **interdits/obligatoires** est annexée (§16). Tout texte d'interface passe par cette grille avant merge. C'est un *lint juridique* du wording.

---

## 1. Sitemap complet

Trois espaces + une frontière publique. Convention : `(PUBLIC)` = accessible sans auth · `(AUTH)` = session requise · `(KYC)` = KYC validé requis · `(WALLET)` = wallet lié + claim ONCHAINID requis.

```
RACINE
│
├── (PUBLIC) Surface marketing & légale ─────────────────────────────────────
│   ├── /                         Landing (proposition de valeur, sans promesse de rendement)
│   ├── /comment-ca-marche        Pédagogie : créance ≠ propriété, le cycle d'un deal, les risques
│   ├── /deals                    Vitrine publique des opportunités (données limitées, CTA = créer un compte)
│   │   └── /deals/[slug]         Aperçu deal public (badges + résumé ; KIIS/chiffres détaillés = après login+KYC)
│   ├── /risques                  Page risques (perte en capital, illiquidité, défaut opérateur…) [FAIT divulgation]
│   ├── /reglementation           Statut PSFP, séquestre, nature des titres, hors-MiCA token
│   ├── /frais                    Grille de frais (entrée, admin, opérateur, carried)
│   ├── /faq
│   ├── /legal/cgu  /legal/confidentialite  /legal/conflits-interets  /legal/lcb-ft
│   └── /auth/login · /auth/inscription · /auth/mot-de-passe-oublie
│
├── (AUTH) ESPACE INVESTISSEUR  ── préfixe /invest ───────────────────────────
│   ├── /invest/onboarding        Orchestrateur d'onboarding (stepper : profil→KYC→wallet→test)
│   │   ├── /invest/onboarding/identite      (KYC) Étapes 1-3 étude
│   │   ├── /invest/onboarding/wallet        (KYC) Étape 3 : wallet + ONCHAINID
│   │   └── /invest/onboarding/profil        Étape 4 : test connaissances + capacité de perte
│   │
│   ├── /invest                   Accueil investisseur (≈ tableau de bord, SANS NAV globale)
│   │
│   ├── /invest/deals             Découverte (liste + filtres + tri) — étape 5
│   │   ├── /invest/deals/[slug]              Fiche détaillée deal — étapes 6-7 (badges + KIIS + waterfall + charts)
│   │   │   ├── /invest/deals/[slug]/documents     Data room (KIIS, contrat, expertise, intercreditor…)
│   │   │   └── /invest/deals/[slug]/souscrire     Funnel souscription — étapes 8→11
│   │   │        ├── …/montant                Choix montant + réservation non engageante (soft-commit)
│   │   │        ├── …/eligibilite            Re-check classification + plafond + cohérence
│   │   │        ├── …/signature              Signature eIDAS (bulletin + contrat d'émission)
│   │   │        ├── …/versement              Instructions virement séquestre (ou EURC/EURe via CASP)
│   │   │        ├── …/reflexion              Écran délai 4 j (non-avertis) + rétractation
│   │   │        └── …/confirmation           Récap : en attente de closing
│   │   │
│   │   └── /invest/deals/[slug]/closing      Suivi de closing (séquestre → mint, ou échec → remboursement)
│   │
│   ├── /invest/portefeuille      Positions par deal (juxtaposées, PAS agrégées) — étape 12
│   │   └── /invest/portefeuille/[positionId]  Détail position : suivi, jalons, distributions, token, sortie
│   │
│   ├── /invest/distributions     Historique des distributions reçues (coupons/exit) — étape 14
│   ├── /invest/documents         Coffre : bulletins, contrats, IFU/reporting fiscal — étape 13
│   ├── /invest/secondaire        Bulletin board (annonces P2P, PAS de matching) — étape 16
│   │   └── /invest/secondaire/[annonceId]     Détail annonce + mise en relation
│   │
│   ├── /invest/wallet            Gestion wallet : adresse, tokens détenus, statut ONCHAINID, transferts
│   ├── /invest/profil            Profil, classification investisseur, plafonds, MAJ KYC, notifications
│   └── /invest/aide              Support + statut réglementaire contextualisé
│
├── (AUTH) ESPACE OPÉRATEUR  ── préfixe /operateur ──────────────────────────
│   ├── /operateur                Dashboard opérateur (deals soumis, levées en cours, distributions à verser)
│   ├── /operateur/deals/nouveau  Soumission de deal (wizard multi-étapes)
│   ├── /operateur/deals/[id]     Pilotage d'un deal (statut, levée, investisseurs, jalons)
│   │   ├── …/levee                Suivi temps réel de la levée (sans voir l'identité = pseudonymisé selon RGPD)
│   │   ├── …/closing              Déclenchement closing (conditions : levée + prêt)
│   │   ├── …/suivi                MAJ avancement travaux, photos, comptes, LTV
│   │   ├── …/distributions        Calcul waterfall + déclenchement distribution
│   │   └── …/documents            Dépôt KIIS, expertise, term sheet bancaire, intercreditor
│   └── /operateur/profil          Track record, KYB société, coordonnées séquestre
│
└── (BACK-OFFICE)  ── /admin (équipe plateforme = OpCo PSFP) ─────────────────
    ├── /admin/deals              Revue & validation des deals soumis (conformité avant mise en ligne)
    ├── /admin/investisseurs      Supervision KYC, classification, plafonds, LCB-FT
    ├── /admin/cap-table          Cap table on/off-chain (DEEP ↔ ERC-3643) par SPV
    ├── /admin/sequestre          Réconciliation séquestre ↔ souscriptions ↔ mint
    └── /admin/conformite         Journal d'audit, reporting AMF, registre des risques
```

### Carte de navigation Cockpit (rail gauche + bottom-bar)

Le **rail gauche** (88px) porte l'identité + l'avatar (cf. `RailLeft.tsx`). La navigation principale vit dans la **bottom-bar pilule** (cf. `BottomBar.tsx`) — props-driven, segments contextualisés par espace.

**Bottom-bar — espace investisseur :**
```
[ Accueil ]  [ Opportunités ]  [ Portefeuille ]  [ Distributions ]  [ Secondaire ]      · ( + Réserver )
```
**Bottom-bar — espace opérateur :**
```
[ Tableau de bord ]  [ Mes deals ]  [ Levées ]  [ Distributions ]      · ( + Soumettre un deal )
```

> [ANALYSE] Le rail droit (chat Kimi) reste présent sur **toutes** les pages (règle Cockpit §3). Sur cette plateforme il devient un **copilote conformité/produit** : « Explique-moi le waterfall de ce deal », « Quelle est la différence entre senior et mezzanine ? », « Suis-je averti ou non-averti ? ». Il **n'émet jamais de conseil d'investissement** (garde-fou L1) — réponses pédagogiques uniquement, avec disclaimer.

---

## 2. Système d'états (vocabulaire commun à tous les écrans)

Chaque écran ci-dessous décline ces 6 états. Ils mappent sur des primitives Cockpit existantes (`ct-placeholder`, `ct-badge`, `Card`, etc.).

| État | Déclencheur | Pattern Cockpit | Règle |
|---|---|---|---|
| **Vide (empty)** | Aucune donnée (0 deal, 0 position…) | `Card` centrée + `ct-placeholder` + CTA primaire `ct-seg-btn primary` | Toujours une **action de sortie** (« Découvrir les opportunités »). Jamais un cul-de-sac. |
| **Chargement (loading)** | Fetch en cours | Skeleton `.ct-skeleton` (à créer, shimmer sur `--ct-surface-1→2`) | Skeleton qui **mime la forme finale** (KPI, lignes, cartes). Pas de spinner plein écran. `aria-busy="true"`. |
| **Erreur (error)** | Échec réseau/serveur | `Card` ton danger (`--ct-danger`) + message + bouton « Réessayer » | Message **actionnable**, jamais de stack technique. Code d'erreur discret en `ct-text-faint` pour le support. |
| **Succès (success)** | Action aboutie | Toast `.ct-toast` + état visuel persistant (badge vert `--ct-success`) | Confirmation **non bloquante** + trace dans l'historique. |
| **Partiel / dégradé** | Donnée incomplète (ex. on-chain indispo mais off-chain OK) | Bandeau `.ct-banner-warn` + données dispo affichées | Ne jamais bloquer tout l'écran pour une source secondaire (ex. explorer down). |
| **Verrouillé (gated)** | Manque KYC/wallet/éligibilité | Overlay `.ct-gate` flouté sur le contenu sensible + CTA pour débloquer | Le **flou** sur les chiffres KIIS tant que KYC non fait (étude : KIIS détaillé après KYC). |

> [ANALYSE] **Nouvelles primitives à créer** (non présentes dans `components/cockpit/`) : `Stepper`, `Skeleton`, `Toast`, `Banner`, `Gate`, `Timeline` (jalons), `Waterfall` (cascade), `Gauge` (LTV), `LegalNatureBadge`, `RiskRadar`, `ScenarioBars`, `SensitivityCurve`, `DealCard`, `StatusPill`. Les charts (Donut, BarList, Funnel) existent déjà et sont réutilisés. Détail composants en `docs/produit/` (domaine front).

---

## 3. PARCOURS INVESTISSEUR — les 16 étapes (étude P5), écran par écran

> Légende wireframe : `▓` = rempli · `░` = vide · `[ ]` = bouton · `( )` = bouton secondaire · `‹›` = champ · `◉/○` = radio · `☑/☐` = checkbox · `▸` = section · `↳` = état conditionnel.

---

### ÉTAPE 1 — Inscription `/auth/inscription`  (PUBLIC)

**Objectif :** créer un compte (email + mot de passe — pas de magic link, cf. CLAUDE.md projet) + accepter CGU et **disclosures de risque** [FAIT P5.1].

```
┌──────────────────────────────────────────────────────────────┐
│  ‹logo›                                          ( Se connecter )│
│                                                                │
│            Investir dans l'immobilier, en obligations.         │
│            Vous prêtez à une société. Vous n'êtes pas          │
│            propriétaire du bien.  ⓘ                            │  ← L4 dès l'inscription
│                                                                │
│   Email          ‹ vous@email.fr                            ›  │
│   Mot de passe   ‹ ••••••••••              ›  [👁]  ▓▓▓░ Fort  │  ← jauge force
│   Confirmer      ‹ ••••••••••              ›                   │
│                                                                │
│   ☐  J'ai lu et j'accepte les CGU et la politique de           │
│      confidentialité.                                          │
│   ☐  J'ai lu l'avertissement sur les risques : perte en        │  ← case SÉPARÉE,
│      capital possible, illiquidité, rendement non garanti.     │     obligatoire [FAIT]
│                                                                │
│            [  Créer mon compte  ]                              │
│                                                                │
│   ─────────────────  Déjà investisseur ?  ─────────────────   │
│            ( Se connecter )                                    │
└──────────────────────────────────────────────────────────────┘
```

**États :**
- **Vide :** formulaire propre, bouton `[Créer]` désactivé (opacity .4, `aria-disabled`) tant que les 2 cases ne sont pas cochées et le mot de passe non valide.
- **Chargement :** bouton → spinner inline + label « Création… », champs `readonly`.
- **Erreur — email déjà utilisé :** champ email bordure danger + message « Un compte existe déjà. ( Se connecter ) ou ( Mot de passe oublié ). »
- **Erreur — mot de passe faible :** jauge rouge + règle manquante listée (« 8 caractères, 1 chiffre… »).
- **Succès :** redirection `/invest/onboarding` + toast « Compte créé. Vérifions votre identité. ». [HYPOTHÈSE] Email de vérification si `disable_signup` est assoupli côté invest (le CLAUDE.md actuel impose admin-only ; pour l'espace investisseur public, le self-signup est requis → **point à trancher produit/sécu**).
- **Edge — signup désactivé :** si la plateforme est en mode invitation-only (pilote Version A, placement privé qualifiés), l'écran bascule en « Accès sur invitation » + champ code d'invitation. [FAIT étude : Version A = placement privé qualifiés.]

**Micro-interactions :** jauge de force en temps réel (debounce 150 ms) ; les 2 checkboxes ont un lien hypertexte inline ouvrant la page en **modale latérale** (`ct-drawer`) sans quitter le formulaire ; focus auto sur email au mount.

**Accessibilité :** `<form>` avec `aria-describedby` sur chaque champ ; erreurs en `role="alert"` ; cases à cocher = vrais `<input type=checkbox>` labellisés ; cible tactile ≥ 24×24 px [WCAG 2.2 — 2.5.8 Target Size].

---

### ÉTAPE 2 — KYC / AML `/invest/onboarding/identite`  (AUTH)

**Objectif :** pièce d'identité, selfie, justificatif de domicile, **origine des fonds** via Sumsub/Onfido [FAIT P5.2 — LCB-FT obligatoire].

```
┌── Onboarding ──────────────────────────────────────────────────┐
│  ●━━━━━○━━━━━○━━━━━○   Identité · Wallet · Profil · Prêt        │  ← Stepper (4 étapes)
├────────────────────────────────────────────────────────────────┤
│  Vérification d'identité                                        │
│  Obligatoire pour investir (lutte anti-blanchiment).           │
│                                                                │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐           │
│  │  ① Pièce      │ │  ② Selfie     │ │  ③ Domicile   │           │
│  │     d'identité│ │     (vivacité)│ │     < 3 mois  │           │
│  │   [ Démarrer ]│ │   ○ en attente│ │   ○ en attente│           │
│  └──────────────┘ └──────────────┘ └──────────────┘           │
│                                                                │
│  ④ Origine des fonds                                           │  ← [FAIT] LCB-FT
│     ‹ Épargne / Cession d'actif / Revenus / Héritage… ▾ ›      │
│     ‹ Montant annuel investissable estimé              ▾ ›     │
│                                                                │
│  ⓘ Vos données sont traitées par [Sumsub], prestataire        │
│    KYC certifié. Voir la politique de confidentialité.        │
│                                                                │
│              [ Lancer la vérification ]                        │
└────────────────────────────────────────────────────────────────┘
```

**Intégration :** SDK Sumsub/Onfido **embarqué** (WebSDK iframe/modale) — pas de redirection hors-app si possible (réduit l'abandon). [ANALYSE]

**États :**
- **Vide :** 3 cartes « en attente », bouton global désactivé jusqu'à `origine des fonds` renseignée.
- **Chargement (capture en cours) :** SDK prestataire prend le relais (caméra). Notre UI affiche un overlay « Vérification en cours chez notre partenaire… ».
- **En revue (pending) :** [FAIT] le KYC peut être **asynchrone** (revue humaine). État dédié : bandeau `.ct-banner-warn` « Vérification en cours, sous 24 h. Vous pouvez explorer les opportunités, mais pas encore souscrire. » → l'utilisateur **peut avancer** sur le wallet/profil et **parcourir** les deals en mode gated.
- **Erreur — document illisible :** message précis par item (« Photo floue, recadrez la pièce ») + bouton « Reprendre ».
- **Erreur — rejet KYC :** écran sobre, sans détail technique (anti-fraude), CTA « Contacter le support ». Pas de re-tentative en boucle.
- **Succès :** item passe en ✔ vert ; quand les 4 sont OK → toast + déblocage de l'étape Wallet ; **claim KYC** prêt à être émis (étape 3).
- **Edge — mineur / juridiction exclue :** blocage immédiat avec explication (« Service réservé aux résidents de [liste UE] majeurs »).

**Micro-interactions :** progression par carte (chaque item s'illumine en `--ct-accent` au focus) ; statut live via webhook prestataire → l'item passe en ✔ **sans rechargement** (optimistic + reconcile). Sauvegarde automatique de l'origine des fonds (pas de perte si on quitte).

**Accessibilité :** le SDK tiers doit être audité a11y ; fournir un **fallback** « Vérification assistée par e-mail » si la caméra est inaccessible (handicap moteur/visuel) [WCAG 2.2]. Stepper avec `aria-current="step"`.

---

### ÉTAPE 3 — Wallet connect + ONCHAINID `/invest/onboarding/wallet`  (KYC)

**Objectif :** créer/connecter un wallet ; émettre un **claim ONCHAINID** (KYC soulbound) lié au wallet [FAIT P5.3]. **Embedded wallet** pour les non-crypto.

```
┌── Onboarding ──────────────────────────────────────────────────┐
│  ●━━━━━●━━━━━○━━━━━○   Identité · Wallet · Profil · Prêt        │
├────────────────────────────────────────────────────────────────┤
│  Votre coffre numérique                                         │
│  Vos titres tokenisés y seront inscrits. Choisissez :          │
│                                                                │
│  ┌────────────────────────────┐  ┌──────────────────────────┐  │
│  │ ◉  Coffre intégré (simple)  │  │ ○  Mon wallet existant    │  │
│  │    Recommandé si vous       │  │    MetaMask, Ledger,      │  │
│  │    débutez. Géré pour vous, │  │    WalletConnect…         │  │
│  │    sécurisé par e-mail +    │  │    Pour utilisateurs      │  │
│  │    passkey. Zéro crypto à   │  │    crypto avertis.        │  │
│  │    acheter.                 │  │                           │  │
│  └────────────────────────────┘  └──────────────────────────┘  │
│                                                                │
│  ↳ (embedded) [ Créer mon coffre avec passkey 🔐 ]            │
│  ↳ (externe)  [ Connecter un wallet ]  → modale WalletConnect  │
│                                                                │
│  Après connexion :                                             │
│   • Votre identité vérifiée est rattachée à votre coffre       │
│     (ONCHAINID — réutilisable, non transférable).             │
│   • Seuls des coffres vérifiés peuvent détenir nos titres.    │
└────────────────────────────────────────────────────────────────┘
```

**États :**
- **Vide :** 2 options, embedded pré-sélectionné (réduction de friction pour la cible non-crypto). [ANALYSE — la cible « battre Fundrise/RealT » inclut des non-crypto.]
- **Chargement (embedded) :** création MPC/passkey → « Génération de votre coffre sécurisé… » (jamais montrer de seed phrase à un non-crypto ; embedded = custody déléguée/MPC). [HYPOTHÈSE technique : provider type Privy/Magic/Turnkey — choix domaine front/smart-contract.]
- **Chargement (externe) :** modale WalletConnect → signature d'un message de **liaison** (pas une transaction, gratuit).
- **Erreur — réseau wallet non supporté :** « Réseau non pris en charge. Basculez sur [Polygon/Base/perm.]. » + bouton switch network.
- **Erreur — émission claim ONCHAINID échouée :** retry automatique 3×, puis « Liaison de votre identité en attente, sous peu » (non bloquant pour la suite si le claim arrive avant le 1er mint).
- **Succès :** badge « Coffre vérifié ✔ » + adresse tronquée `0x12…ab9` (copiable) + déblocage profil.
- **Edge — wallet déjà lié à un autre compte :** blocage anti-Sybil (« Ce coffre est déjà rattaché à un autre compte »).
- **Edge — perte d'accès embedded :** parcours de récupération (e-mail + passkey de secours) documenté dans `/invest/wallet`.

**Micro-interactions :** l'adresse copiée → micro-toast « Copié » ; animation de « sceau » quand le claim ONCHAINID est attaché (cadenas qui se ferme, respectant `prefers-reduced-motion`).

**Accessibilité :** ne **jamais** dépendre uniquement de la couleur pour « vérifié » (✔ + texte) [WCAG 1.4.1] ; passkey = parcours conforme WebAuthn ; libellés sans jargon pour l'embedded (« coffre » plutôt que « wallet » dans le chemin non-crypto).

---

### ÉTAPE 4 — Profil investisseur (test ECSP) `/invest/onboarding/profil`  (KYC)

**Objectif :** questionnaire de connaissances + capacité de perte ; **test ECSP** pour non-avertis ; classification **averti / non-averti** ; plafond `max(1 000 €, 5 % du patrimoine net)` sans avertissement explicite [FAIT P5.4, P13 ECSP].

```
┌── Onboarding ──────────────────────────────────────────────────┐
│  ●━━━━━●━━━━━●━━━━━○   Identité · Wallet · Profil · Prêt        │
├────────────────────────────────────────────────────────────────┤
│  Votre profil d'investisseur                                    │
│  Étape réglementaire (financement participatif). Soyez exact.  │
│                                                                │
│  A. Connaissances (test)                                        │
│   1. Une obligation est…  ◉ une créance  ○ une part de capital │
│   2. Si l'opérateur fait défaut, je peux perdre…  ○ 0 % ◉ 100 %│
│   3. Ces titres sont-ils liquides ? ○ Oui, à tout moment       │
│                                       ◉ Non, blocage jusqu'à    │
│                                          la revente du bien     │
│   … (test ECSP non-avertis)                                    │
│                                                                │
│  B. Capacité de perte                                          │
│   Patrimoine net estimé   ‹ ───────●──────  ›  250 000 €       │
│   → Plafond conseillé sans avertissement : 12 500 € (5 %)      │  ← calc live
│                                                                │
│  C. Statut                                                     │
│   ○ Investisseur non-averti (par défaut)                       │
│   ○ Je demande le statut d'investisseur averti  ⓘ (conditions) │
│                                                                │
│              [ Valider mon profil ]                            │
└────────────────────────────────────────────────────────────────┘
```

**États :**
- **Vide :** test vierge, slider patrimoine à 0, statut « non-averti » présélectionné.
- **Chargement :** validation serveur de la classification.
- **Erreur — échec du test (non-averti) :** [FAIT — le test ECSP peut échouer] écran pédagogique : « Certaines réponses montrent un risque de mauvaise compréhension. Vous pouvez quand même investir, mais nous devons recueillir votre **consentement explicite** au risque (avertissement renforcé). » → mène à un **avertissement signé** plutôt qu'un blocage sec. [FAIT — ECSP : avertissement + acknowledgment, pas interdiction totale pour le non-averti, mais plafonnement.]
- **Succès — non-averti :** badge classification + **plafond actif** affiché partout (« Votre plafond : 12 500 € »).
- **Succès — averti (demande) :** sous-formulaire conditions (revenus/patrimoine/portefeuille, expérience) → revue → statut « averti » (plafonds plus élevés, tickets ≥ 100 k€ possibles pour le placement privé). [FAIT P13.]
- **Edge — patrimoine très faible :** message de prudence renforcé + plafond plancher 1 000 €.

**Micro-interactions :** le plafond conseillé se recalcule **en direct** quand on bouge le slider (formule `max(1000, 0.05 × patrimoine)`), affiché en `--ct-accent` ; chaque mauvaise réponse au test n'est **pas** dévoilée immédiatement (évite le gaming) — bilan en fin de test.

**Accessibilité :** slider = `role="slider"` + saisie numérique alternative (jamais slider-only) [WCAG 2.5.7 Dragging Movements — fournir une alternative sans glisser] ; questions = `<fieldset><legend>`.

---

### ÉTAPE 5 — Accès aux opportunités (découverte) `/invest/deals`  (AUTH)

**Objectif :** liste des deals ouverts. **Aucune pré-collecte** ; l'argent ne bouge pas tant qu'un deal n'est pas souscrit [FAIT P5.5]. Filtres + tri = aide à *trouver*, pas à *choisir à la place* (L1).

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Opportunités                                          ‹🔍 Rechercher…   › │
│  L'argent ne bouge jamais avant que vous ayez choisi et signé un deal.  ⓘ │  ← L2 rappel
├──────────────────────────────────────────────────────────────────────────┤
│ FILTRES ▾   Type[MdB|Locatif|Value-add]  Durée[<12|12-24|>24]            │
│             LTV[<60|60-70|>70]  Statut[Ouvert|Bientôt|Clôturé]           │
│             Ticket min[≤1k|≤5k]  Région[…]  Sûreté[Hypo.|Nant.]          │
│ TRI ▾   ◉ Clôture proche  ○ TRI cible ↓  ○ Durée ↑  ○ LTV ↑  ○ Récent   │  ← tri NEUTRE, factuel
├──────────────────────────────────────────────────────────────────────────┤
│ ┌───────────────────────────┐ ┌───────────────────────────┐             │
│ │ ▢ Photo / illustration     │ │ ▢ Photo                    │             │
│ │ Résidence Haussmann · Lyon6│ │ Le Clos des Vignes · Bdx   │             │
│ │ 🟢MdB 🔵Senior 🟠Risque élevé│ │ 🟢Locatif 🔵Mezzanine       │             │
│ │ TRI cible 9–11% · non garanti│ │ Coupon cible 7% · non gar.  │             │
│ │ Durée 22 mois · LTV 58%    │ │ Durée 36 mois · LTV 64%    │             │
│ │ ▓▓▓▓▓▓░░░░ 62%  · J-14      │ │ ▓▓░░░░░░░░ 21%  · J-30     │             │
│ │ Ticket dès 1 000 €         │ │ Ticket dès 1 000 €         │             │
│ │            [ Voir le deal ]│ │            [ Voir le deal ]│             │
│ └───────────────────────────┘ └───────────────────────────┘             │
│ … (grille responsive : 3 col desktop / 2 tablette / 1 mobile)            │
└──────────────────────────────────────────────────────────────────────────┘
```

**Règle anti-FIA (L1) appliquée au tri :** le tri propose uniquement des **critères factuels** (clôture, TRI cible, durée, LTV, récence). **Jamais** « Recommandés pour vous », « Meilleurs deals », « Notre sélection ». Pas de tri « par score plateforme ». [FAIT — éviter la sélection discrétionnaire imposée.]

**États :**
- **Vide — aucun deal ouvert :** `Card` centrée « Aucune opportunité ouverte actuellement. » + ( M'alerter à la prochaine ) (notification, pas pré-collecte). 
- **Vide — filtres trop restrictifs :** « Aucun deal ne correspond. ( Réinitialiser les filtres ) ».
- **Chargement :** grille de `DealCard` en skeleton (forme préservée).
- **Erreur :** bandeau + « Réessayer ».
- **Gated — KYC en cours :** les cartes sont visibles mais le bouton « Voir le deal » mène à une fiche **partiellement floutée** (chiffres KIIS masqués) tant que KYC ≠ validé ; CTA « Terminer ma vérification pour débloquer ».
- **Edge — deal complet à 100% :** badge « Clôturé » + carte désaturée, déplacée en bas ; reste consultable (transparence track record).

**Micro-interactions :** barre de progression de levée animée (largeur transition `--ct-dur-base`) ; chips de filtre togglables (état actif = `--ct-accent-soft` + bordure accent) ; compteur de résultats live ; hover carte = élévation légère (`--ct-shadow-depth`) ; URL **shareable** (filtres encodés en query params, deep-linkable).

**Accessibilité :** chaque `DealCard` = un `<article>` avec titre `<h3>` ; badges = texte + icône (pas couleur seule) ; barre de progression = `role="progressbar"` `aria-valuenow` ; filtres opérables clavier (chips = boutons toggle `aria-pressed`).

---

### ÉTAPE 6 — Badge produit (lecture instantanée) — composant transverse

**Objectif :** lecture instantanée d'un deal via badges [FAIT P6]. Les badges sont un **résumé d'une réalité juridique/financière**, jamais un argument marketing.

> Composant `<ProductBadges deal={…} />`. Code couleur étude P6 : 🟢 nature/structure · 🔵 financier · 🟠 risque · ⚪ conformité/géo. Implémentation : `ct-badge` + variantes via `data-tone`.

| Famille | Exemples de badges (étude P6) | Rendu Cockpit |
|---|---|---|
| 🟢 Nature | Marchand de biens · Locatif · Value-add · SPV dédiée · Equity | `.ct-badge[data-tone="nature"]` (accent or léger) |
| 🔵 Financier | Senior secured · Mezzanine · Dette bancaire · Distribution variable · Sortie à revente · Lock-up 24 mois | `.ct-badge[data-tone="finance"]` |
| 🟠 Risque | Risque élevé · Investisseur averti | `.ct-badge[data-tone="risk"]` (warn) |
| ⚪ Conformité/géo | KYC obligatoire · France 🇫🇷 · EUR settlement · Stablecoin compatible · Hypothèque · Nantissement · Marché secondaire possible | `.ct-badge[data-tone="meta"]` |

**Règle critique [FAIT L5] :** le badge « Distribution variable » force l'affichage « non garanti » ; le badge « Risque élevé » est **obligatoire** quand le deal le justifie (honnêteté). Au survol/tap → tooltip avec l'**implication juridique + financière + impact risque** (les 3 colonnes de l'étude P6).

**Accessibilité :** chaque badge a un `aria-label` complet (« Senior secured : créance de premier rang garantie, premier remboursé, risque plus faible ») ; tooltip accessible au clavier + lisible par lecteur d'écran (`aria-describedby`).

---

### ÉTAPE 7 — Fiche détaillée du deal `/invest/deals/[slug]`  (KYC pour le détail chiffré)

**Objectif :** KIIS/DIS, scénarios, waterfall, sûretés, risques [FAIT P5.7]. C'est l'écran le plus dense — il matérialise le **template fiche produit P7** + les **11 graphiques P8**.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ‹← Opportunités›                                                          │
│  RÉSIDENCE HAUSSMANN — LYON 6                  🟢MdB 🔵Senior 🟠Risque élevé │
│  Levée ▓▓▓▓▓▓░░░░ 62% · 458k/740k € · J-14 · France 🇫🇷                     │
│  ┌─ NATURE JURIDIQUE ─────────────────────────────────────────────────┐  │
│  │ ⚖ Vous souscrivez des OBLIGATIONS émises par la SAS « Résidence     │  │  ← <LegalNatureBadge>
│  │   Haussmann ». Vous êtes CRÉANCIER, pas propriétaire du bien.       │  │     (L4, permanent,
│  │   Titre de créance tokenisé (ERC-3643), registre légal DEEP.        │  │      en haut de fiche)
│  └────────────────────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────────────┤
│  [Synthèse] [Économie] [Rendement & scénarios] [Sûretés] [Risques]        │  ← onglets ancrés
│  [Calendrier] [Token] [Documents]                                         │     (scroll-spy)
├──────────────────────────────────────────────────────────────────────────┤
│ ▸ ÉCONOMIE DE L'OPÉRATION            │ ▸ RÉPARTITION (donut)             │
│   Coût total projet     2 440 000 € │   ◐ Dette senior 60% / Oblig.     │  ← Donut (existe)
│   Dette senior  1 460 000 € (LTC60%)│     30% / Equity sponsor 10%      │
│   Equity sponsor  240 000 € (~10%)  │ ▸ USE OF FUNDS (barres empilées)  │  ← BarList (existe)
│   Obligations    740 000 €          │   Acq. ▓▓▓▓ Notaire ▓ Travaux ▓▓▓  │
│   LTV ~58% (valeur expert)          │                                   │
├──────────────────────────────────────────────────────────────────────────┤
│ ▸ RENDEMENT (NON GARANTI)  — scénarios (barres groupées)                  │  ← <ScenarioBars>
│   Pessimiste  ▓▓░░░░  ~0 à -15%   │  ⚠ Toujours montré en 1er           │  ← L5 : pessimiste
│   Central     ▓▓▓▓▓░  ~10%        │     au même niveau que central       │
│   Optimiste   ▓▓▓▓▓▓  ~16%        │                                      │
│   Sensibilité prix de revente → rendement   ╱ (courbe + point mort)      │  ← <SensitivityCurve>
├──────────────────────────────────────────────────────────────────────────┤
│ ▸ WATERFALL — ordre de paiement à l'exit (cascade)                       │  ← <Waterfall>
│   1. Dette bancaire senior + intérêts      ▓▓▓▓▓▓▓▓                       │
│   2. Principal obligataire (VOUS)          ▓▓▓▓                           │
│   3. Coupon obligataire                    ▓▓                             │
│   4. Frais plateforme + opérateur          ▓                             │
│   5. Carried opérateur (> hurdle 8%)       ▓                             │
│   6. Solde → equity sponsor                ░                             │
├──────────────────────────────────────────────────────────────────────────┤
│ ▸ SÛRETÉS & GARANTIES          │ ▸ RISQUE (radar /5)                     │  ← <RiskRadar>
│   ✔ Hypothèque 1er rang (banque)│   Marché ●●●○○  Exécution ●●●●○         │
│   ✔ Nantissement titres SPV    │   Levier ●●●○○  Liquidité ●○○○○         │
│   ✔ GAPD sponsor               │   Opérateur ●●●●○  Régl. ●●○○○          │
│   ✔ Assurance dommages-ouvrage │ ▸ LTV (jauge)  [────58%────|60|70|80]   │  ← <Gauge>
├──────────────────────────────────────────────────────────────────────────┤
│ ▸ RISQUES (non exhaustif)                                                 │
│   Perte en capital · illiquidité (lock-up) · retard/dépassement travaux ·│
│   baisse du marché · défaut opérateur · risque de taux · réglementaire   │
├──────────────────────────────────────────────────────────────────────────┤
│ ▸ CALENDRIER (Gantt)   Levée│Closing│Travaux M0-14│Commercial.│Exit M20-22│ ← <Timeline>
├──────────────────────────────────────────────────────────────────────────┤
│  Sticky bar (desktop droite / mobile bas) :                              │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Ticket dès 1 000 € · max 100 000 €      Votre plafond : 12 500 €   │  │
│  │              [  Réserver ma place  ]   ( Ajouter à ma liste )       │  │  ← L3 : "Réserver",
│  │   Réservation non engageante · sans versement · révocable          │  │     pas "Investir"
│  └──────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

**États :**
- **Gated (KYC non fait) :** sections Économie/Rendement/Waterfall/Token **floutées** (`.ct-gate`) avec overlay « Terminez votre vérification pour voir les chiffres détaillés (KIIS). » — seules Synthèse + Nature + Risques restent lisibles. [FAIT P5 : KIIS détaillé après KYC.]
- **Loading :** skeleton structuré (onglets + blocs charts en shimmer).
- **Erreur — KIIS indisponible :** bloc documents en erreur isolée, le reste reste affiché (état partiel).
- **Partiel — données on-chain indispo :** onglet Token affiche « Adresse contrat : en cours de déploiement (testnet) » sans casser la fiche. [FAIT — au pré-closing, le token n'est pas encore minté.]
- **Edge — levée clôturée :** sticky bar → « Levée clôturée » + ( Voir des deals similaires ) ; la fiche reste consultable (track record).
- **Edge — plafond dépassé :** si le ticket min > plafond investisseur, sticky bar grise « Réserver » + « Ce deal dépasse votre plafond (12 500 €). En savoir plus sur le statut averti. »
- **Succès :** clic « Réserver ma place » → funnel étape 8.

**Micro-interactions :** onglets = scroll-spy (l'onglet actif se surligne en `--ct-accent` au scroll) ; charts animés à l'entrée dans le viewport (`IntersectionObserver`, respect `prefers-reduced-motion`) ; sticky bar qui se colle au scroll ; la jauge LTV anime son aiguille de 0 → valeur ; tooltips sur chaque ligne de waterfall.

**Accessibilité :** onglets = pattern ARIA Tabs (`role=tablist/tab/tabpanel`, navigation flèches) ; **chaque graphique a une alternative textuelle** = un `<table>` de données visuellement masqué mais lisible lecteur d'écran (`.ct-sr-only`) [WCAG 1.1.1] ; titres hiérarchisés H1→H3 ; la fiche entière navigable au clavier ; contrastes ≥ 4.5:1 sur tout texte (les tokens `--ct-text-*` sont calibrés dark).

---

### ÉTAPE 8 — Souscription : montant + réservation non engageante `/invest/deals/[slug]/souscrire/montant`  (KYC)

**Objectif :** choix du montant (ticket min/max) ; **réservation non engageante** (soft-commit, **sans versement**) [FAIT P5.8, P10 — clé anti-collecte discrétionnaire].

```
┌── Souscription · Résidence Haussmann ──────────────────────────────────────┐
│  ① Montant ──○── ② Éligibilité ──○── ③ Signature ──○── ④ Versement        │  ← Stepper funnel
├────────────────────────────────────────────────────────────────────────────┤
│  Combien souhaitez-vous prêter à cette opération ?                         │
│                                                                            │
│        ‹ ───────────●───────────────────  ›   5 000 €                      │  ← slider + saisie
│        Min 1 000 €                  Max 100 000 €                           │
│        Votre plafond investisseur : 12 500 €   ⓘ                           │
│                                                                            │
│  Simulation (cible, NON garantie) :                                        │
│   • Au scénario central (~10%/an, 22 mois) → ~+916 €  ⓘ non garanti        │  ← simulateur,
│   • Au scénario pessimiste → de 0 à -750 €                                  │     L5 obligatoire
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │  ⚠ Étape suivante = RÉSERVATION NON ENGAGEANTE.                     │    │  ← L3
│  │  Aucun versement maintenant. Vous pourrez annuler à tout moment    │    │
│  │  avant la signature. L'argent ne bouge pas.                        │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                                                            │
│        ( Annuler )                    [  Réserver ma place  ]              │
└────────────────────────────────────────────────────────────────────────────┘
```

**États :**
- **Vide :** slider au ticket min, simulation recalculée live.
- **Erreur — montant < min :** « Le ticket minimum est de 1 000 €. »
- **Erreur — montant > max ou > plafond :** message + bouton désactivé ; suggestion « Réduire à 12 500 € (votre plafond) ».
- **Erreur — montant > reste à lever :** « Il reste 282 000 € sur ce deal. » + ajustement proposé.
- **Chargement :** « Enregistrement de votre réservation… ».
- **Succès :** réservation créée (statut `reserved`, soft-commit) → étape 9 ; la barre de levée de la fiche reflète la réservation **en pointillé** (« réservé, non versé ») pour la transparence sans gonfler le « collecté réel ».
- **Edge — deal clôturé pendant la saisie :** « Ce deal vient d'être clôturé. » + retour liste.

**Micro-interactions :** simulateur live (debounce 200 ms) montrant **les deux scénarios** (central + pessimiste) côte à côte ; le bloc d'avertissement « non engageant » est **toujours visible** au-dessus du bouton (pas en bas de page) ; le bouton dit littéralement « Réserver ma place », jamais « Investir » / « Payer ».

**Accessibilité :** slider avec saisie numérique alternative ; simulateur = texte + non graphique-only ; avertissement en `role="note"` persistant.

---

### ÉTAPE 9 — Éligibilité + Signature électronique `/invest/deals/[slug]/souscrire/eligibilite` → `/signature`  (KYC)

**Objectif :** re-vérifier la classification/plafond, puis **signer** le bulletin de souscription + le contrat d'émission obligataire via **signature eIDAS** (Yousign/DocuSign) [FAIT P5.9].

**9a — Éligibilité (re-check) :**
```
┌── Souscription ──  ①✔ Montant ──●── ② Éligibilité ──○── ③── ④ ──────────┐
│  Vérification finale avant signature                                      │
│   ✔ Identité vérifiée (KYC)                                              │
│   ✔ Coffre vérifié (ONCHAINID)                                          │
│   ✔ Montant 5 000 € ≤ votre plafond 12 500 €                            │
│   ✔ Profil : non-averti — test ECSP complété                            │
│   ☐  Je confirme avoir lu le KIIS de ce deal.                            │  ← case obligatoire
│   ☐  Je comprends que je peux perdre tout ou partie de mon capital,      │     [FAIT]
│      que les titres sont illiquides (lock-up jusqu'à l'exit) et          │
│      que le rendement n'est pas garanti.                                 │
│                              [ Continuer vers la signature ]             │
└──────────────────────────────────────────────────────────────────────────┘
```

**9b — Signature eIDAS :**
```
┌── Souscription ──  ✔ ── ✔ ──●── ③ Signature ──○── ④ Versement ─────────┐
│  Signature électronique                                                   │
│  Documents à signer (eIDAS, valeur légale) :                            │
│   📄 Bulletin de souscription — 5 000 € · 5 obligations                 │
│   📄 Contrat d'émission obligataire (SAS Résidence Haussmann)           │
│                                                                          │
│   ┌────────────────────────────────────────────────────────────────┐  │
│   │  [Prévisualiser]   Signature via [Yousign]                       │  │
│   │  Vous recevrez un code par SMS pour signer (eIDAS avancé).       │  │
│   └────────────────────────────────────────────────────────────────┘  │
│                              [ Signer maintenant ]                       │
└──────────────────────────────────────────────────────────────────────────┘
```

**États :**
- **Erreur — classification périmée / plafond changé :** re-check bloquant si quelque chose a changé (« Votre profil a été mis à jour, revérifions le plafond »).
- **Chargement (création enveloppe e-sign) :** « Préparation de vos documents… ».
- **Signature en cours (modale prestataire) :** SDK Yousign embarqué ; état « En attente de votre code SMS ».
- **Erreur — signature échouée/expirée :** « La session de signature a expiré. ( Recommencer ) » (la réservation reste valide, on ne perd pas la place).
- **Succès :** documents signés horodatés → étape versement ; copie déposée dans `/invest/documents`.
- **Edge — abandon après réservation :** la réservation `reserved` non signée **expire** après un délai (ex. 72 h) et **libère la place** (transparence : « réservation expirée »). [HYPOTHÈSE — délai à caler avec l'opérateur/PSFP.]

**Micro-interactions :** liste de documents avec preview en drawer ; après signature, animation « cachet » + horodatage qui s'inscrit ; le stepper passe l'étape 3 en ✔.

**Accessibilité :** documents téléchargeables en PDF accessible (tags) ; alternative à la signature SMS si besoin (clé eIDAS) [WCAG] ; checkbox de confirmation = vrais inputs labellisés.

---

### ÉTAPE 10 — Dépôt des fonds (séquestre) + délai 4 j `/invest/deals/[slug]/souscrire/versement` → `/reflexion`  (KYC)

**Objectif :** virement EUR vers **compte séquestre** (ou EURC/EURe via CASP → conversion → séquestre) [FAIT P5.10]. Délai de réflexion **4 jours** (ECSP, non-avertis) [FAIT].

```
┌── Souscription ──  ✔ ── ✔ ── ✔ ──●── ④ Versement ─────────────────────┐
│  Versement de 5 000 €                                                     │
│                                                                          │
│  ┌─ OÙ VONT VOS FONDS ───────────────────────────────────────────────┐ │
│  │ 🔒 Compte SÉQUESTRE tiers tenu par [Me Dupont, notaire / EMI X].   │ │  ← L6 explicite :
│  │   La plateforme ne détient JAMAIS vos fonds. Ils restent bloqués  │ │     destinataire = tiers
│  │   chez le séquestre jusqu'au closing du deal. Si le deal n'aboutit│ │
│  │   pas → remboursement intégral, sans frais.                        │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  Choisissez votre moyen de paiement :                                    │
│   ◉ Virement SEPA en euros (recommandé)                                  │  ← défaut = EUR (L7)
│      Bénéficiaire : SÉQUESTRE – SAS Résidence Haussmann                  │
│      IBAN : FR76 •••• •••• •••• ••••   [Copier]                          │
│      Référence OBLIGATOIRE : RES-HAUSS-5821   [Copier]                   │
│      Montant : 5 000,00 €                                                │
│   ○ Stablecoin EURC / EURe (via [Circle/Monerium], partenaire régulé)    │  ← option (L7)
│      → conversion en EUR puis dépôt au séquestre. (USDT non accepté)     │  ← USDT explicitement NON
│                                                                          │
│  ⏳ Délai légal de réflexion : 4 jours. Vous pouvez vous rétracter      │  ← [FAIT ECSP]
│     sans frais pendant 4 jours après votre engagement.                  │
│                                                                          │
│            [ J'ai effectué le virement ]   ( J'ai une question )         │
└──────────────────────────────────────────────────────────────────────────┘
```

**10b — Écran délai de réflexion `/reflexion` (post-versement) :**
```
┌──────────────────────────────────────────────────────────────────────────┐
│  Votre réservation est confirmée — délai de réflexion en cours           │
│   ⏳ 4 jours · expire le 09/06/2026 à 18:00                               │
│   ▓▓▓▓░░░░░░  Jour 2 sur 4                                                │
│  Pendant ce délai : vous pouvez vous RÉTRACTER sans frais.               │
│  Après : votre souscription devient ferme (sous réserve du closing).     │
│            ( Me rétracter — remboursement intégral )                      │
│  Statut des fonds : 🔒 reçus au séquestre · en attente de closing         │
└──────────────────────────────────────────────────────────────────────────┘
```

**États :**
- **Vide :** instructions de virement, copier-coller IBAN + référence.
- **Chargement (réconciliation) :** [FAIT — le virement SEPA est asynchrone] « Nous attendons la réception de votre virement (1-2 j ouvrés). » → statut `payment_pending`.
- **Succès — fonds reçus au séquestre :** statut `escrowed` ; toast + l'écran délai 4 j s'active.
- **Erreur — virement non identifié :** « Virement reçu sans référence — contactez le support pour rapprochement. » (cas réel fréquent).
- **Stablecoin :** sous-flux CASP : connexion au partenaire → conversion EURC→EUR → dépôt séquestre ; états « conversion en cours », « Travel Rule : vérification de l'origine » [FAIT P10 TFR].
- **Rétractation (dans les 4 j) :** confirmation modale → remboursement intégral depuis séquestre → statut `refunded` → la place est libérée.
- **Edge — deal échoue pendant l'attente :** remboursement automatique intégral (cf. étape 11 échec).

**Micro-interactions :** compte à rebours **live** du délai 4 j (jour/heure) ; boutons « Copier » IBAN/référence avec micro-toast ; le statut des fonds (`en attente` → `🔒 reçus`) se met à jour sans rechargement (webhook séquestre).

**Accessibilité :** IBAN/référence en `<code>` sélectionnable + bouton copier accessible ; compte à rebours = texte (pas image) ; instructions séquentielles numérotées.

---

### ÉTAPE 11 — Émission du token (au closing) `/invest/deals/[slug]/closing`  (WALLET)

**Objectif :** au **closing** (levée atteinte + prêt bancaire accordé) : déblocage séquestre → SPV, inscription **DEEP**, **mint** ERC-3643 sur le wallet whitelisté. Si échec → **remboursement intégral** [FAIT P5.11].

```
┌── Closing · Résidence Haussmann ───────────────────────────────────────────┐
│  Conditions de closing                                                      │
│   ✔ Levée atteinte : 740 000 € / 740 000 €  (100%)                         │
│   ✔ Prêt bancaire senior accordé (1 460 000 €)                             │
│   ◔ Inscription au registre légal (DEEP)…                                  │  ← séquence visible
│   ○ Émission de vos titres tokenisés (mint ERC-3643)                       │
│                                                                            │
│  Votre position : 5 obligations · 5 000 € · SAS Résidence Haussmann        │
│                                                                            │
│  ┌─ EN COURS ──────────────────────────────────────────────────────────┐ │
│  │ 1. Déblocage du séquestre vers la SAS            ✔ fait               │ │
│  │ 2. Inscription DEEP (source de vérité légale)    ◔ en cours          │ │
│  │ 3. Mint du token ERC-3643 sur votre coffre       ○ à venir          │ │
│  │ 4. Lock-up activé jusqu'à l'exit                 ○                    │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

**États :**
- **En attente de closing (levée incomplète) :** « Levée à 92% · closing dès l'objectif atteint. Vos fonds restent au séquestre. »
- **Closing en cours :** séquence DEEP → mint affichée comme une **timeline live** ; chaque étape passe en ✔.
- **Succès — minté :** animation « titre émis » + position visible dans le portefeuille + lien explorer (« voir on-chain »). Token = miroir du registre DEEP (mention).
- **Erreur — mint échoué (mais DEEP OK) :** [ANALYSE — le registre DEEP est la source de vérité] message rassurant : « Vos titres sont **légalement inscrits** (DEEP). La synchronisation on-chain est en cours, sans impact sur vos droits. » → retry technique en arrière-plan.
- **Échec du deal (levée non atteinte / prêt refusé) :** [FAIT] écran « Le deal n'a pas abouti. Remboursement intégral de 5 000 € en cours vers votre compte/séquestre, sans frais. » + suivi du remboursement.
- **Edge — wallet non whitelisté au moment du mint :** blocage compliance (« Votre coffre doit être vérifié pour recevoir les titres ») + re-déclenchement du claim ONCHAINID.

**Micro-interactions :** la timeline de closing est **temps réel** (Supabase realtime / polling) ; mint = animation de « sceau on-chain » (réduite si `prefers-reduced-motion`) ; notification push/email à chaque jalon de closing.

**Accessibilité :** la séquence = liste ordonnée `<ol>` avec `aria-live="polite"` pour annoncer chaque passage à ✔ ; jamais de dépendance couleur seule pour l'état (icône + libellé).

---

### ÉTAPE 12 — Suivi de performance (portefeuille) `/invest/portefeuille` + `/[positionId]`  (AUTH)

**Objectif :** dashboard de suivi : avancement travaux, jalons, photos, comptes, LTV temps réel [FAIT P5.12]. **CRITIQUE L2 : positions juxtaposées, JAMAIS de NAV globale.**

```
┌── Mon portefeuille ────────────────────────────────────────────────────────┐
│  Vos positions, deal par deal.  ⓘ Pas de valeur consolidée : chaque        │  ← L2 explicite
│  opération est indépendante (1 SPV = 1 deal).                              │
│                                                                            │
│  ┌── KPIs FACTUELS (pas une NAV) ───────────────────────────────────────┐ │
│  │  Capital prêté (cumul)   Positions actives   Distributions reçues     │ │
│  │       17 000 €                  3              + 1 240 € (cumul)       │ │  ← KpiGrid (existe)
│  └──────────────────────────────────────────────────────────────────────┘ │
│  ⚠ Ces montants additionnent vos prêts ; ils ne constituent PAS une       │  ← anti-NAV warn
│    valorisation de marché ni une part d'un fonds.                          │
├────────────────────────────────────────────────────────────────────────────┤
│  POSITION 1 — Résidence Haussmann · Lyon 6        🟢MdB 🔵Senior           │
│   Capital prêté 5 000 € · 5 obligations · lock-up jusqu'à l'exit          │
│   Avancement : ▓▓▓▓▓▓░░░░ Travaux 60% · LTV actuelle 56% ↓                 │
│   Prochain jalon : Fin gros œuvre — M+2                                    │
│   Statut : 🟢 En cours                              [ Voir le détail ]     │
├────────────────────────────────────────────────────────────────────────────┤
│  POSITION 2 — Le Clos des Vignes · Bordeaux       🟢Locatif 🔵Mezzanine    │
│   Capital prêté 8 000 € · Coupon trim. reçu : 140 €                        │
│   Avancement : ▓▓▓▓▓▓▓▓▓░ Exploitation · DSCR 1,3                          │
│   Statut : 🟢 En cours · prochain coupon J-22         [ Voir le détail ]   │
├────────────────────────────────────────────────────────────────────────────┤
│  POSITION 3 — Atelier Belleville · Paris 20       🟢Value-add              │
│   Statut : 🟡 Retard travaux (+2 mois)  ⓘ                  [ Voir ]        │  ← état risque visible
└────────────────────────────────────────────────────────────────────────────┘
```

**Détail position `/[positionId]` :** reprend la fiche deal **enrichie du suivi réel** : timeline des jalons franchis (photos, comptes-rendus), LTV historique (courbe), distributions reçues, document de la position (bulletin signé), bloc token (adresse, quantité, lock-up restant, lien explorer), et bloc « Sortie » (étape 15).

**États :**
- **Vide (aucune position) :** `Card` « Vous n'avez pas encore de position. L'investissement se fait deal par deal. » + ( Découvrir les opportunités ).
- **Loading :** skeleton KPI + lignes de position.
- **Erreur :** bandeau + réessayer ; si seul l'on-chain est down → afficher les positions off-chain (état partiel).
- **Position en retard (🟡) / en défaut (🔴) :** [FAIT — divulgation honnête] état mis en avant, jamais caché ; lien vers la communication de l'opérateur.
- **Position clôturée (remboursée) :** badge « Remboursée le … » + récap gain/perte réalisé.

**Micro-interactions :** chaque position = carte cliquable ; barres d'avancement animées ; LTV avec flèche tendance (↑ rouge / ↓ vert) ; toggle « Trier par : récence / statut / capital » (factuel, jamais « performance recommandée »).

**Accessibilité :** KPIs = `<dl>` (terme/définition) ; le disclaimer anti-NAV en `role="note"` ; statuts = icône + texte ; courbe LTV avec table alternative.

---

### ÉTAPE 13 — Reporting & documents `/invest/documents`  (AUTH)

**Objectif :** reporting périodique (trimestriel) + documents fiscaux (IFU) [FAIT P5.13].

```
┌── Mes documents ───────────────────────────────────────────────────────────┐
│  [Tous] [Bulletins] [Contrats] [Reportings] [Fiscalité (IFU)]             │  ← filtres
│                                                                            │
│  📄 IFU 2025 — synthèse fiscale annuelle           PDF   [Télécharger]     │
│  📊 Reporting T1 2026 — Résidence Haussmann        PDF   [Télécharger]     │
│  📄 Bulletin de souscription — Le Clos des Vignes  PDF   [Télécharger]     │
│  📄 Contrat d'émission — Résidence Haussmann       PDF   [Télécharger]     │
│  …                                                                         │
│  ⓘ La fiscalité dépend de votre situation. Intérêts obligataires :        │  ← info fiscale neutre
│    PFU 31,4% (2026) ou barème. La tokenisation ne crée aucun régime       │     [FAIT P7/P13]
│    fiscal distinct. Consultez votre conseiller.                           │
└──────────────────────────────────────────────────────────────────────────┘
```

**États :** Vide (« Vos documents apparaîtront ici après votre 1re souscription ») · Loading (skeleton liste) · Erreur (réessayer) · Edge — IFU pas encore généré (« Disponible chaque année en février »).

**Micro-interactions :** recherche/filtre par deal et par type ; téléchargement avec micro-toast ; badge « Nouveau » sur un reporting non lu.

**Accessibilité :** liste = `<ul>` ; chaque document = lien avec libellé explicite (« Télécharger le reporting T1 2026, PDF ») ; pas de « cliquez ici ».

---

### ÉTAPE 14 — Distribution `/invest/distributions`  (AUTH)

**Objectif :** coupons (locatif) ou distribution à la revente (MdB), selon **waterfall**, en EUR ou stablecoin ; **variable, non garantie** [FAIT P5.14].

```
┌── Distributions ───────────────────────────────────────────────────────────┐
│  Historique de vos distributions (variables, non garanties)               │  ← L5
│                                                                            │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ Date       Deal                 Type            Montant   Reçu via    │  │
│  │ 31/03/26   Le Clos des Vignes   Coupon T1       +140,00€  Virement   │  │
│  │ 15/01/26   Le Clos des Vignes   Coupon T4 25    +135,00€  EURe        │  │
│  │ 02/12/25   Atelier Belleville   Remb. partiel   +500,00€  Virement   │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
│  À VENIR (prévisionnel, non garanti) :                                    │
│   • Le Clos des Vignes — Coupon T2 estimé ~140€ — vers 30/06/26           │
│  Préférence de réception : ◉ Virement EUR  ○ Stablecoin EURC/EURe         │  ← choix du rail
└──────────────────────────────────────────────────────────────────────────┘
```

**États :** Vide (« Aucune distribution pour l'instant. Les distributions dépendent de la performance de chaque opération. ») · Loading · Erreur · À venir (prévisionnel **toujours** marqué « non garanti »).

**Micro-interactions :** tableau triable par date/deal ; toggle préférence de réception (EUR/stablecoin) avec confirmation ; chaque ligne ouvre le détail du calcul waterfall correspondant.

**Accessibilité :** vrai `<table>` avec `<th scope>` ; montants alignés ; libellé « non garanti » associé en `aria`.

---

### ÉTAPE 15 — Sortie (exit) — dans `/invest/portefeuille/[positionId]`  (WALLET)

**Objectif :** à l'événement de liquidité (revente du bien) : remboursement principal + prime éventuelle ; **burn** du token [FAIT P5.15].

```
┌── Position · Atelier Belleville · SORTIE ──────────────────────────────────┐
│  🏁 Opération clôturée — le bien a été revendu                            │
│  Cascade de remboursement (waterfall réel) :                             │
│   1. Dette senior remboursée                          ✔                  │
│   2. Votre principal : 5 000 €                         ✔ versé           │
│   3. Votre coupon/prime : +458 € (TRI réalisé ~9,2%)  ✔ versé           │  ← réalisé, factuel
│   ─────────────────────────────────────────────                         │
│   Total reçu : 5 458 €   (gain réalisé +458 €, non garanti à l'origine) │
│                                                                          │
│  Vos titres ont été remboursés et retirés (burn ERC-3643 + radiation     │  ← burn token
│  DEEP). Reçu de remboursement disponible.       [ Télécharger le reçu ]  │
└──────────────────────────────────────────────────────────────────────────┘
```

**États :**
- **Sortie réussie (gain) :** waterfall réel + total reçu + burn confirmé.
- **Sortie avec perte :** [FAIT — honnêteté] « Le produit de revente n'a pas couvert l'intégralité. Vous avez récupéré X € sur 5 000 € prêtés (perte réalisée -Y €). » — affiché sans euphémisme, avec le détail de la cascade (qui a été payé avant).
- **Sortie en cours :** « Revente signée — distribution finale en cours de calcul (waterfall). »
- **Défaut / contentieux :** état dédié « Procédure de recouvrement en cours (sûretés : hypothèque) » + suivi.

**Micro-interactions :** waterfall réel animé en cascade ; le « burn » du token = animation de retrait + mention « miroir du registre DEEP (source de vérité) » ; reçu téléchargeable.

**Accessibilité :** cascade = liste ordonnée + table alternative ; le résultat (gain/perte) annoncé en texte explicite, jamais couleur seule.

---

### ÉTAPE 16 — Marché secondaire (bulletin board) `/invest/secondaire`  (WALLET)

**Objectif :** **bulletin board** (art. 25 ECSP, simple babillard, **PAS de matching automatique**) ; transfert P2P entre wallets whitelistés via transfer restrictions [FAIT P5.16, P9].

```
┌── Marché secondaire ───────────────────────────────────────────────────────┐
│  ⚠ Babillard d'annonces. La plateforme NE rapproche PAS automatiquement    │  ← [FAIT] L'anti-MTF
│    acheteurs et vendeurs et NE GARANTIT AUCUNE liquidité. Toute cession    │     est central
│    se fait de gré à gré, entre coffres vérifiés (KYC).                     │
│                                                                            │
│  [ + Publier une annonce de cession ]        Filtrer ▾  Trier ▾           │
│                                                                            │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ VEND · Le Clos des Vignes · Mezzanine                               │  │
│  │ 4 obligations · prix demandé 3 950 € (nominal 4 000€)               │  │
│  │ Lock-up : levé ✔ · publié il y a 3 j           [ Contacter ]        │  │  ← mise en relation,
│  │ ⓘ Prix fixé par le vendeur. Faites votre propre analyse.            │  │     PAS d'exécution auto
│  └────────────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │ VEND · Résidence Haussmann · Senior                                 │  │
│  │ 2 obligations · lock-up ENCORE ACTIF (jusqu'au 03/2027) ⛔          │  │  ← transfer restriction
│  │ → Cession impossible avant la fin du lock-up.                       │  │     respectée
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

**Sous-flux « Contacter » → cession P2P :** mise en relation (messagerie ou coordonnées) → accord de gré à gré → transfert on-chain **conditionné** : l'acheteur doit être un wallet whitelisté (ONCHAINID vérifié) ; le smart contract ERC-3643 **refuse** le transfert si lock-up actif ou acheteur non éligible (`canTransfer()` = false). Le registre DEEP est mis à jour en parallèle.

**États :**
- **Vide :** « Aucune annonce. Vous pouvez publier une cession sur l'une de vos positions hors lock-up. »
- **Publier une annonce :** wizard (choisir une position éligible → quantité → prix demandé → durée d'annonce). Refus si position sous lock-up.
- **Lock-up actif :** annonce **impossible** (la position est grisée à la création) ; affichage de la date de fin de lock-up.
- **Transfert refusé (compliance) :** « Transfert refusé : l'acheteur n'est pas un investisseur éligible (KYC) » ou « lock-up actif ».
- **Edge — juridiction exclue de l'acheteur :** transfert bloqué par le module compliance (transfer restrictions par pays ISO-3166).

**Micro-interactions :** badge lock-up explicite (cadenas + date) ; bouton « Contacter » ouvre la mise en relation ; **aucun** bouton « Acheter maintenant » (ce serait du matching/MTF). Filtres factuels uniquement.

**Accessibilité :** annonces = `<article>` ; avertissement babillard en `role="note"` en tête, persistant ; lock-up = icône + texte + date.

---

## 4. FACE OPÉRATEUR (soumission & suivi de deal) `/operateur/*`

> [ANALYSE] L'opérateur (SAS marchand de biens / promoteur, cf. étude P4) **soumet** ses opérations, **pilote** la levée et le closing, **met à jour** le suivi et **déclenche** les distributions. La plateforme (OpCo PSFP) **valide** la conformité avant mise en ligne via le back-office `/admin`. L'opérateur ne **sélectionne pas pour l'investisseur** — il propose un deal, l'investisseur choisit (L1).

### 4.1 — Dashboard opérateur `/operateur`
```
┌── Espace opérateur · SAS [Opérateur] ──────────────────────────────────────┐
│  ┌ Deals en levée ┐ ┌ À closer ┐ ┌ Distributions dues ┐ ┌ En revue admin ┐│
│  │      2          │ │    1     │ │    1 (échéance J-3) │ │      1         ││  ← KpiGrid
│  └─────────────────┘ └──────────┘ └─────────────────────┘ └────────────────┘│
│  MES DEALS                                                                  │
│   • Résidence Haussmann · 🟢 En levée 62% · J-14         [ Piloter ]       │
│   • Le Clos des Vignes  · 🟢 Exploitation · coupon dû   [ Piloter ]       │
│   • Atelier Belleville  · 🟡 Retard travaux             [ Piloter ]       │
│   • Villa Méditerranée  · ⚪ En revue conformité (admin) [ Voir ]          │
│            [ + Soumettre un nouveau deal ]                                 │
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.2 — Soumission d'un deal `/operateur/deals/nouveau` (wizard)

Wizard multi-étapes mappé sur le **template fiche P7** (l'opérateur saisit ce que l'investisseur verra). Étapes :
```
① Société & opération   → SPV (SAS) dédiée, type (MdB/promotion/locatif), adresse approx., K-bis
② Économie              → prix acq., notaire, travaux, frais, coût total, dette senior, equity sponsor, montant obligations
③ Structuration titres  → obligations (montant, nominal, taux plancher éventuel), lock-up, rang (senior/mezzanine)
④ Sûretés               → hypothèque, nantissement, GAPD, assurances (cases + justificatifs)
⑤ Rendement & scénarios → TRI cible (avec mention "non garanti" forcée), pessimiste/central/optimiste, hypothèses
⑥ Calendrier            → jalons (Gantt) : levée, closing, travaux, commercialisation, exit
⑦ Documents             → KIIS/DIS, expertise, devis travaux, term sheet bancaire, intercreditor, statuts SPV
⑧ Paramètres de levée   → objectif €, ticket min/max, plafond averti, dates, séquestre désigné
⑨ Revue & soumission    → preview de la fiche telle qu'elle apparaîtra → soumission à l'admin
```

**Garde-fous UX [FAIT] dans le wizard :**
- Champ « rendement » impose le suffixe « cible · non garanti » (non éditable) — l'opérateur **ne peut pas** écrire « garanti » (L5 appliqué côté saisie).
- Le wizard **exige** le scénario pessimiste (champ obligatoire) avant soumission (L5).
- Le wizard **exige** de désigner un **séquestre tiers** (notaire/EMI) — pas d'option « compte plateforme » (L6).
- Champs de wording libres passés au **lint juridique** (§16) : « propriété/propriétaire/garanti » → erreur de validation.

**États :** Brouillon (sauvegarde auto, reprise possible) · Validation par étape (champs requis) · Soumis (lecture seule, en attente admin) · Renvoyé par l'admin (annotations de conformité à corriger) · Approuvé (passe en ligne, statut « En levée »).

### 4.3 — Pilotage d'un deal `/operateur/deals/[id]`
- **…/levee** — suivi temps réel : montant collecté (réel vs réservé), nombre d'investisseurs (**pseudonymisé** — l'opérateur ne voit pas l'identité nominative, RGPD/LCB-FT côté plateforme), courbe de collecte, J-restants. [ANALYSE — confidentialité investisseur.]
- **…/closing** — déclenchement du closing **conditionné** : la plateforme/back-office vérifie (levée atteinte ✔ + prêt accordé ✔) avant d'autoriser le déblocage séquestre → inscription DEEP → mint. L'opérateur **confirme** la réunion des conditions (term sheet bancaire signé, etc.).
- **…/suivi** — mise à jour de l'avancement : % travaux, jalons franchis, **photos**, comptes, LTV recalculée. Ces données alimentent l'étape 12 investisseur en temps réel.
- **…/distributions** — calcul du **waterfall** (le système applique l'ordre P7) → preview montant par investisseur → déclenchement du versement (EUR via séquestre/PSP, ou stablecoin via CASP). États : calcul / preview / en cours de versement / versé.
- **…/documents** — dépôt et MAJ des pièces (reporting trimestriel qui apparaît côté investisseur).

**États transverses opérateur :** deal en retard (🟡) → l'opérateur **doit** publier une note d'explication (forcé avant de continuer) ; défaut (🔴) → workflow de recouvrement (sûretés).

**Accessibilité face opérateur :** mêmes standards (formulaires labellisés, tables, steppers ARIA) ; densité d'information plus élevée acceptable (utilisateurs pro), mais responsive conservé.

---

## 5. Spécification des micro-interactions (catalogue transverse)

> Toutes les animations respectent `@media (prefers-reduced-motion: reduce)` → désactivées/réduites [WCAG 2.3.3]. Durées via `--ct-dur-base` (180 ms), easing `--ct-ease`.

| Interaction | Déclencheur | Comportement | Token / contrainte |
|---|---|---|---|
| **Barre de levée** | Mount + update temps réel | Largeur anime de l'ancienne à la nouvelle valeur ; pointillé pour « réservé non versé » | `--ct-accent`, `--ct-dur-base` |
| **Apparition charts** | Entrée dans le viewport | Fade + grow léger (`IntersectionObserver`) | reduced-motion → apparition immédiate |
| **Toast** | Succès/erreur action | Slide-in bas-droite, auto-dismiss 4 s, pausable au hover, fermable | `role="status"`/`alert` |
| **Stepper** | Validation d'étape | Le point passe en ✔ avec un « pop » discret ; ligne se remplit | `aria-current` migre |
| **Copier (IBAN/adresse)** | Clic bouton copier | Micro-toast « Copié » 1,5 s ; icône ✔ transitoire | cible ≥ 24px |
| **Slider montant** | Drag / saisie | Recalcul simulation debounce 200 ms ; les 2 scénarios côte à côte | alternative saisie clavier |
| **Hover DealCard** | Souris | Élévation `--ct-shadow-depth`, scale 1.01 | reduced-motion → pas de scale |
| **Compte à rebours 4 j** | Tick | MAJ chaque minute, format jour/heure ; passe en ton warn < 12 h | texte, pas image |
| **Sceau on-chain (mint/burn)** | Closing/exit | Animation de cachet (cadenas/anneau) | reduced-motion → icône statique |
| **Gate (flou KYC)** | Contenu sensible non débloqué | `backdrop-filter: blur` sur les chiffres + overlay CTA | jamais bloquer la nav |
| **Tooltips badges** | Hover/focus/tap | Affiche implication juridique+financière+risque | clavier-accessible, `aria-describedby` |
| **Filtres chips** | Toggle | Bascule `--ct-accent-soft` + bordure accent ; compteur résultats live | `aria-pressed` |
| **LTV gauge** | Mount | Aiguille anime 0→valeur ; zones seuil 60/70/80 colorées | table alternative |

---

## 6. Accessibilité — conformité WCAG 2.2 niveau AA (checklist transverse)

> Cible : **WCAG 2.2 AA**. Le thème Cockpit étant dark, les tokens `--ct-text-*` sont calibrés pour le contraste — à **vérifier au build** (lint contraste). Critères 2.2 récents explicitement couverts :

| Critère WCAG 2.2 | Application produit |
|---|---|
| **1.1.1** Contenu non textuel | Chaque chart (donut, waterfall, radar, courbes, jauge, Gantt) a une **table de données alternative** `.ct-sr-only`. Badges = texte+icône. |
| **1.4.1** Utilisation de la couleur | Statuts (en cours/retard/défaut), badges, vérifié = **icône + libellé**, jamais couleur seule. |
| **1.4.3 / 1.4.11** Contraste texte & UI | Texte ≥ 4.5:1, composants ≥ 3:1. Audit des tokens `--ct-text-muted/faint` sur surfaces. |
| **2.1.1** Clavier | Tout le funnel de souscription, filtres, onglets, steppers, modales = 100% clavier. |
| **2.4.3** Ordre de focus | Funnel linéaire ; modales/drawers piègent le focus (focus trap) et le restituent à la fermeture. |
| **2.4.7** Focus visible | Anneau de focus visible (`--ct-border-accent`) sur tous les interactifs. |
| **2.4.11 Focus non masqué** (2.2 *new*) | La sticky bar / bottom-bar ne doit jamais recouvrir l'élément focalisé → scroll-padding. |
| **2.5.7 Mouvements de glissement** (2.2 *new*) | Slider montant & patrimoine = **alternative sans glisser** (saisie numérique + boutons ±). |
| **2.5.8 Taille de cible** (2.2 *new*) | Toutes cibles tactiles ≥ 24×24 px (chips, badges cliquables, copier, fermer). |
| **3.2.6 Aide cohérente** (2.2 *new*) | Lien « Aide/Support » + chat copilote à un **emplacement constant** (rail droit). |
| **3.3.1 / 3.3.3** Erreurs | Erreurs en `role="alert"`, message + **suggestion de correction** (montant, plafond, KYC). |
| **3.3.7 Saisie redondante** (2.2 *new*) | Ne **jamais** re-demander une info déjà fournie (KYC, profil) dans le funnel ; pré-remplir. |
| **3.3.8 Authentification accessible** (2.2 *new*) | Login email+mdp standard ; passkey (WebAuthn) pour le coffre ; **pas** de captcha cognitif bloquant. |
| **4.1.3** Messages de statut | `aria-live` pour : réception séquestre, jalons de closing, statut KYC, toasts. |

**Langue & i18n :** `lang="fr"` racine ; copywriting FR (CLAUDE.md projet). Architecture i18n prête (passeport UE → EN/DE/ES ultérieurs, étude Version B). Nombres/devises au format FR (`5 000,00 €`).

---

## 7. Responsive & mobile-first

> Cockpit est dense (rail gauche 88px + rail droit 420px). **Adaptation mobile obligatoire** : la cible inclut des investisseurs non-crypto, souvent sur mobile.

| Breakpoint | Rail gauche | Rail droit (chat) | Navigation | Grille deals | Fiche deal |
|---|---|---|---|---|---|
| **Mobile** < 640px | Masqué → tiroir (hamburger) ou réduit à l'avatar | Fermé par défaut → bouton flottant pour ouvrir le copilote en plein écran | Bottom-bar pilule = **barre d'onglets** native bas d'écran | 1 colonne, cartes pleine largeur | Onglets → accordéons empilés ; sticky bar « Réserver » en bas |
| **Tablette** 640–1024px | 88px conservé | Repliable (défaut fermé) | Bottom-bar pilule | 2 colonnes | 2 colonnes (texte / charts) |
| **Desktop** > 1024px | 88px | 420px (défaut ouvert) | Bottom-bar pilule | 3 colonnes | Layout complet + sticky bar latérale droite |

**Règles mobiles spécifiques :**
- Le **funnel de souscription** est mono-colonne, une étape par écran, avec le stepper compact en haut + bouton primaire pleine largeur fixé en bas (au-dessus de la zone de geste système).
- Les **charts** (waterfall, radar, Gantt) deviennent **scrollables horizontalement** ou se simplifient (le waterfall passe en liste verticale sur mobile — déjà naturellement vertical dans nos wireframes).
- Les **tables** (distributions, documents, cap table) passent en **cartes empilées** sur mobile (pattern « card-per-row »).
- La **sticky CTA bar** de la fiche deal est toujours accessible (ne jamais cacher « Réserver » derrière un scroll infini).
- Cibles tactiles ≥ 44px recommandé sur mobile (au-delà du minimum WCAG 24px).

---

## 8. Tableau de traçabilité — 16 étapes étude ↔ écrans ↔ règles

| Étape (P5) | Écran(s) | États clés | Règles appliquées | Charts (P8) |
|---|---|---|---|---|
| 1 Inscription | `/auth/inscription` | vide, dup email, mdp faible, signup off | L4 (créancier dès l'accueil) | — |
| 2 KYC/AML | `/invest/onboarding/identite` | vide, pending async, rejet, juridiction | LCB-FT [FAIT] | — |
| 3 Wallet+ONCHAINID | `/invest/onboarding/wallet` | embedded/externe, claim échec, anti-Sybil | L7 (pas d'achat crypto) | — |
| 4 Profil ECSP | `/invest/onboarding/profil` | échec test, averti, plafond | test ECSP [FAIT], plafond 5% | — |
| 5 Découverte | `/invest/deals` | vide, filtres vides, gated KYC | L1 (tri neutre), L2 (pas de pré-collecte) | barre levée |
| 6 Badge produit | `<ProductBadges>` | tooltips 3 colonnes | L4, L5 (badges honnêtes) | — |
| 7 Fiche deal | `/invest/deals/[slug]` | gated, partiel on-chain, clôturé, plafond | L3, L4, L5 | donut, barres, scénarios, waterfall, sensibilité, radar, jauge, Gantt |
| 8 Souscription | `…/souscrire/montant` | <min, >plafond, >reste, clôturé | **L3 (réservation non engageante)** | simulateur 2 scénarios |
| 9 Signature | `…/eligibilite` `…/signature` | re-check, e-sign échec, abandon→expire | eIDAS [FAIT], confirmations risque | — |
| 10 Dépôt séquestre | `…/versement` `…/reflexion` | pending SEPA, stablecoin, rétractation | **L6 (séquestre tiers)**, **délai 4j [FAIT]**, L7 | — |
| 11 Mint (closing) | `…/closing` | levée incomplète, DEEP ok/mint ko, échec→rembourst | DEEP source de vérité [FAIT] | timeline closing |
| 12 Suivi | `/invest/portefeuille` | vide, retard, défaut, clôturée | **L2 (pas de NAV)** | avancement, LTV historique |
| 13 Reporting | `/invest/documents` | vide, IFU pas généré | info fiscale neutre [FAIT] | — |
| 14 Distribution | `/invest/distributions` | vide, prévisionnel | **L5 (variable, non garanti)** | détail waterfall |
| 15 Sortie | `…/portefeuille/[id]` (exit) | gain, **perte**, en cours, défaut | honnêteté [FAIT], burn token | waterfall réel |
| 16 Secondaire | `/invest/secondaire` | vide, lock-up, transfert refusé | **bulletin board, PAS de matching [FAIT]** | — |

---

## 9. Ce qui N'EXISTE PAS dans cette UX (liste anti-FIA — aussi important que ce qui existe)

> Cette section est un **garde-fou de conception**. Tout futur écran proposant l'un de ces patterns doit être **rejeté en revue**.

- ❌ **Pas** d'écran « Alimenter mon compte / solde disponible / wallet de cash en attente » (= pré-collecte/pooling → FIA). [FAIT L2]
- ❌ **Pas** de « Valeur nette de mon portefeuille » / NAV consolidée / part unique multi-deals (= signal OPC). [FAIT L2]
- ❌ **Pas** de bouton « Investir automatiquement », « Auto-allocate », « Réinvestir mes coupons automatiquement dans de nouveaux deals », « Portefeuille recommandé ». [FAIT L1]
- ❌ **Pas** de « Notre sélection » / « Top deals » / tri « par recommandation plateforme ». [FAIT L1]
- ❌ **Pas** de « rendement garanti », « gagnez X% », taux affiché sans « cible · non garanti ». [FAIT L5]
- ❌ **Pas** de « devenez propriétaire », « votre bien », « parts de l'immeuble ». [FAIT L4]
- ❌ **Pas** de carnet d'ordres / matching / « Acheter maintenant » sur le secondaire (= MTF, hors régime pilote). [FAIT P9/P16]
- ❌ **Pas** d'**USDT** nulle part (même pas grisé). [FAIT L7]
- ❌ **Pas** d'écran où la plateforme reçoit les fonds (toujours séquestre tiers nommé). [FAIT L6]
- ❌ **Pas** de rachat à la demande / fenêtre de liquidité organisée par la plateforme (= rachat de parts = ERC-4626/OPC). [FAIT P9]

---

## 10. Dépendances vers les autres domaines & questions ouvertes

**Dépendances (ce que cette UX présuppose des autres domaines) :**
- **Smart-contracts** (`docs/produit/05-smart-contracts/`) : ERC-3643 `canTransfer()`/`isVerified()`, ONCHAINID claims, lock-up et transfer restrictions par pays (alimentent étapes 3, 11, 16) ; événements de mint/burn pour la timeline closing/exit.
- **Migrations/DB** (`docs/produit/06-migrations/`) : modèle de données `deals`, `subscriptions` (statuts : `reserved`→`signed`→`payment_pending`→`escrowed`→`reflexion`→`minted`/`refunded`), `positions`, `distributions`, `secondary_listings`, `kyc_status`, `investor_profile` (classification, plafond), `escrow_accounts`. RLS multi-tenant (`current_tenant_id()`). Les états UX ci-dessus = la **machine à états** à modéliser.
- **Moteur financier** (`docs/produit/07-moteur-financier/`) : calculs TRI/scénarios/sensibilité (étapes 7, 8), **waterfall** (étapes 7, 14, 15), LTV/DSCR temps réel (étape 12), simulateur de souscription (étape 8).
- **Front** (composants Cockpit) : nouvelles primitives listées §2 (`Stepper`, `Skeleton`, `Toast`, `Banner`, `Gate`, `Timeline`, `Waterfall`, `Gauge`, `LegalNatureBadge`, `RiskRadar`, `ScenarioBars`, `SensitivityCurve`, `DealCard`, `StatusPill`, `ProductBadges`) — réutilise `Donut`, `BarList`, `Funnel`, `KpiGrid`, `Card`, `DataTable`, `StatusSelect` existants.
- **Intégrations** : Sumsub/Onfido (KYC, étape 2), provider embedded wallet type Privy/Magic/Turnkey (étape 3), Yousign/DocuSign eIDAS (étape 9), séquestre notaire/EMI API (étapes 10-11), Circle EURC/Monerium EURe CASP (étapes 10, 14), Tokeny/Securitize + DEEP registrar (étapes 11, 15, 16).
- **Copywriting/Légal** : la grille de lint §16 et tous les disclaimers doivent être validés par l'avocat (étude : « tag [FAIT]/[ANALYSE]/[HYPOTHÈSE] »).

**Questions ouvertes (à trancher produit/sécu/avocat) :**
1. **[HYPOTHÈSE]** Self-signup public vs invitation-only : le CLAUDE.md impose `disable_signup=true` (admin crée les users) ; l'espace investisseur public exige un self-signup. **À trancher** : ouvrir le signup pour `/invest` (avec vérification email) ou rester invitation-only en phase pilote (Version A placement privé qualifiés). L'UX gère les deux (étape 1 a un mode « code d'invitation »).
2. **[HYPOTHÈSE]** Délai d'expiration d'une réservation non signée (proposé 72 h) — à caler avec la dynamique de levée et l'opérateur.
3. **[HYPOTHÈSE]** Choix du provider d'embedded wallet (custody MPC) — impacte le parcours de récupération (étape 3) et la garde.
4. **[ANALYSE]** Niveau de pseudonymisation côté opérateur (combien voit-il des investisseurs ?) — RGPD vs besoins de reporting PSFP.
5. **[FAIT/INCERTAIN]** Le délai 4 j s'applique aux **non-avertis** (ECSP) ; modéliser un parcours averti sans ce délai mais avec ses propres conditions (étude P13).

---

## 11. Annexe — Grille de lint juridique du copywriting (§16 référencé partout)

> Tout texte d'interface (boutons, titres, tooltips, e-mails) passe cette grille **avant merge**. Implémentable en règle de CI (regex) sur les chaînes UI.

**MOTS / TOURNURES INTERDITS** (déclenchent un échec de validation) :
- « propriétaire », « votre bien », « vous achetez l'immeuble », « parts de l'immeuble », « copropriété » (sur un produit obligataire) → [FAIT L4 / AMF 2022]
- « rendement garanti », « garanti », « assuré de gagner », « sans risque », « capital protégé » → [FAIT L5]
- « investir automatiquement », « notre sélection », « deals recommandés pour vous », « robo », « auto-allocate », « rebalancing » → [FAIT L1]
- « solde », « alimenter mon compte », « cagnotte », « pool », « fonds commun », « NAV », « valeur liquidative » → [FAIT L2]
- « USDT », « Tether » → [FAIT L7]
- « acheter maintenant » / « ordre d'achat » sur le secondaire → [FAIT MTF/P16]
- « nous détenons vos fonds », « notre compte » (pour les versements) → [FAIT L6]

**MOTS / TOURNURES OBLIGATOIRES** (selon contexte) :
- Sur tout chiffre de rendement : « cible · non garanti » + mention « perte en capital possible ».
- Sur la souscription, 1re étape : « réservation non engageante · sans versement · révocable ».
- Sur le versement : nom du **séquestre tiers** + « la plateforme ne détient jamais vos fonds » + « remboursement intégral si le deal n'aboutit pas ».
- Sur la nature du titre : « obligations », « créance », « vous prêtez à la SAS », « titre de créance tokenisé ».
- Sur le secondaire : « babillard · pas de matching automatique · aucune liquidité garantie · de gré à gré ».
- Sur le portefeuille : « positions deal par deal · pas de valeur consolidée ».

---

*Fin du document 02 — UX & Parcours. Les artefacts de composants (code React/CSS des primitives) relèvent du domaine front ; ce document en spécifie le comportement, les états et les contraintes.*
