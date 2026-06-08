# 03 — UI & Design System

> Domaine : **UI / front design**. Livrable principal : `docs/produit/prototype-ui.html` (prototype HTML autonome, ouvrable en `file://`, zéro dépendance).
> Fondation : `docs/etude-immobilier-tokenise-2026.md` (parties P5 parcours · P6 badges · P7 fiche produit · P8 graphiques · P9 token). DS : **copie locale éditable** de ce repo — `components/cockpit/` + `app/cockpit/*.css` (source de vérité du repo, modifiable directement, pas de source centrale).
> Statut juridique du document : ce sont des choix de **présentation** qui matérialisent les contraintes verrouillées (anti-FIA). Aucune affirmation de droit nouvelle ici — tout découle de l'étude.

---

## 0. Résultat en une phrase

Un prototype 4 écrans — **marketplace · fiche deal · portefeuille · flux de souscription** — qui rend visible, à chaque pixel, que l'investisseur souscrit des **obligations deal-by-deal** (créancier, pas propriétaire), via un **séquestre tiers** (la plateforme ne touche jamais les fonds), avec **aucune NAV / aucun pooling / aucune pré-collecte**. Validé headless : **0 erreur console**, responsive, tokens `--ct-*` exclusivement.

---

## 1. Décisions de design system

### 1.1 Accent produit = `gold` (`#d4af37`)
- `data-product="gold"` sur `<html>` — **seul switch d'accent autorisé** (règle Cockpit).
- Cet accent **existe déjà** dans `app/cockpit.css` (ligne 63) : aucun token inventé.
- Justification : différencie l'app d'investissement (finance/premium) de l'app CRM/estimation existante (bordeaux `default`), **sans sortir du DS**. Le shell reste le bordeaux verre dépoli (`--ct-bg-deep`, `--ct-accent-maroon` pour l'ambient glow) ; seul l'accent d'action bascule en or.

### 1.2 Zéro hex hors tokens
- Tout `:root` est une **copie conforme** de `cockpit.css` (tokens + spacing + ombres + timing).
- Toutes les couleurs sémantiques passent par `color-mix(in srgb, var(--ct-*) …)`. Aucun `#xxxxxx` n'apparaît dans le corps du document (seuls les tokens `:root` portent des hex, comme dans la source).
- States de risque : `--ct-warning` (risque), `--ct-success` (sûreté/sécurisé), `--ct-text-danger` (perte), `--ct-accent-strong` (votre position / nature du deal).

### 1.3 Shell Cockpit respecté à l'identique
- Rail gauche 88px (`--ct-rail-left`), centre + bottom-bar pilule flottante, rail droit 420px (`--ct-rail-right`) **repliable** avec chat Kimi (présent sur toutes les vues, jamais une page sans chat — règle SPEC §3).
- Classes shell reprises 1:1 : `.ct-root`, `.ct-ambient-*`, `.ct-panels-row`, `.ct-rail-left`, `.ct-center-panel`, `.ct-page-area`, `.ct-bottom-bar`, `.ct-rail-right`, `.ct-chat-*`.
- Primitives reprises : `.ct-eyebrow`, `.ct-title`, `.ct-sub`, `.ct-kpi-grid`/`.ct-kpi-card`(+`.accent`), `.ct-card`, `.ct-field`, `.ct-input`, `.ct-badge`.

### 1.4 Système de badges produit (P6)
Code couleur de l'étude (🟢 nature · 🔵 financier · 🟠 risque · ⚪ conformité) mappé sur tokens :

| Classe | Sémantique | Token | Exemples de badges (P6) |
|---|---|---|---|
| `.badge.nat` | 🟢 nature / structure | `--ct-accent` (or) | Marchand de biens, Locatif, Value-add, Promotion, SPV dédiée |
| `.badge.fin` | 🔵 financier | `--ct-text-strong` | Mezzanine, Equity sponsor, Dette bancaire |
| `.badge.secured` | ✓ sûreté | `--ct-success` | Senior secured, Hypothèque, GAPD, Nantissement |
| `.badge.risk` | 🟠 risque | `--ct-warning` | Risque élevé / moyen, Lock-up |
| `.badge.conf` | ⚪ conformité / géo | `--ct-text-muted` | France, KYC, Averti, EUR settlement, Financé, Bientôt |

> Règle appliquée : un badge **résume une réalité juridique/financière**, jamais un argument marketing (P6). « Distribution variable » et « Risque élevé » sont affichés au même niveau que les badges positifs.

---

## 2. Les 4 écrans

### 2.1 Marketplace (`renderMarketplace`)
- Bandeau de tête rappelant le modèle (**deal-by-deal · obligations de SAS · aucune pré-collecte / NAV**).
- 4 KPI (deals ouverts, collecté, TRI médian *non garanti*, ticket min).
- Filtres (type d'opération, sûreté, lock-up) + recherche.
- Grille de **deal-cards** (`auto-fill minmax(330px,1fr)`) : vignette skyline (SVG pur, token), pill de statut (ouvert / clôture imminente / financé / bientôt), J-restants, 3 badges, 3 métriques (TRI cible / LTV / durée), barre de progression de levée.
- Disclaimer de risque en pied (TRI non garanti, perte en capital, illiquidité).

### 2.2 Fiche deal (`renderDeal`) — l'écran central
- **Hero** (nom, localisation approx. « adresse exacte au closing/NDA », jeu complet de badges) + **bloc de souscription** sticky (montant levé / objectif, %, J-, investisseurs, TRI, lock-up, min, CTA « Réserver sans engagement »).
- **Callout d'avertissement** proéminent : *« Vous serez créancier obligataire, pas propriétaire »* — matérialise la mise en garde AMF 2022 (P contre Bricks.co).
- 4 KPI d'économie d'opération (coût total, dette senior, **obligations = vous** en accent, equity sponsor) — chiffres du template P7.
- **Les 11 graphiques (P8)** dans une grille 12 colonnes — voir §3.
- **Waterfall** dédié (P7/P8.3) : cascade rankée + détail du retour obligataire + KPI (TRI central, MOIC).
- **Sûretés** (P11) + **Documents** (KIIS/DIS, contrat d'émission, intercreditor…) + **Token & structure** (ERC-3643, DEEP, ONCHAINID, droits/restrictions — P9), avec badge « Security token · hors MiCA ».
- Onglets de section (Vue d'ensemble / Analyse graphique / Waterfall / Sûretés / Token) — ancres de navigation.

### 2.3 Portefeuille (`renderPortfolio`)
- Message clé : **positions obligataires distinctes, pas de NAV globale, pas de rééquilibrage** ; chaque ligne se dénoue à l'exit de son opération.
- 4 KPI (capital investi, valeur estimée *indicative*, coupons perçus en EUR, positions actives).
- Donut de répartition par opération + **timeline des exits attendus** (lock-up visible).
- Table des positions (investi / valeur* / rendement* / avancement / statut) avec badges de statut.
- Callout : *« la valeur estimée n'est PAS une NAV de fonds »* + fiscalité PFU 31,4 % + IFU annuel.

### 2.4 Flux de souscription (`renderFlow`) — modal 5 étapes
Calque les étapes 6→11 du parcours P5 :
1. **Montant** — slider + quick-amounts + projection live (intérêts / retour total, scénario central, *non garanti*).
2. **Profil & adéquation** — test ECSP non-averti, checklist de compréhension (créancier, perte totale, illiquidité, non-garanti), rappel plafond + délai 4 j.
3. **Documents & signature** — KIIS/DIS, bulletin, contrat d'émission, signature **eIDAS** ; la signature crée une **réservation ferme sans versement**.
4. **Paiement → séquestre** — schéma **Vous → Séquestre tiers → SPV (closing)** ; choix **EUR (défaut)** ou **EURC/EURe** (CASP régulé, MiCA) ; récap des frais ; rappel *« jamais d'USDT »*.
5. **Confirmation** — fonds en séquestre, **token minté au closing (pas avant)**, registre DEEP, délai de réflexion, remboursement intégral si la levée échoue.

---

## 3. Mapping des 11 graphiques (P8) → catalog Cockpit

Les charts sont implémentés en **SVG/CSS pur via tokens** dans le prototype (contrainte : fichier autonome `file://`, le Web Component `<hearst-asset>` nécessite un runtime JS absent en statique). **Chaque carte porte un tag** indiquant l'asset catalog à utiliser **en intégration React réelle**.

| # (P8) | Graphique | Asset catalog cible (`<hearst-asset id>`) | Implémentation proto |
|---|---|---|---|
| 1 | Répartition dette / equity | `chart:progress-circle` (donut) | Anneau SVG segmenté 3 parts |
| 2 | Use of funds | `chart:dashed-bars` | BarList tokenisé (`.barlist`) |
| 3 | **Waterfall de distribution** | `chart:storage-bar` (multi-segments) | Cascade rankée (`.waterfall`) — votre rang surligné |
| 4 | Calendrier opérationnel (Gantt) | `chart:storage-bar` (horizontal) | `.gantt` + repère « aujourd'hui » |
| 5 | Scénarios de performance | `chart:histogram` (groupé) | Barres groupées (`.scenario-grid`) |
| 6 | Sensibilité prix revente → rendement | `chart:sparkline-area` | Sparkline SVG + ligne zéro (point mort) |
| 7 | Sensibilité retard travaux → rendement | `chart:sparkline-area` | Sparkline SVG décroissante |
| 8 | Cashflow prévisionnel (J-curve) | `chart:sparkline-area` (aire) | Aire SVG sous/sur zéro |
| 9 | Exposition au risque | `chart:radar-hexagon` | Radar 6 axes SVG (notes /5) |
| 10 | LTV (jauge) | `kpi:value-trend` + jauge | Demi-arc SVG + aiguille + seuils 60/80 |
| 11 | Marge marchand | `chart:dashed-bars` + repère | Barre + seuil de fragilité 10 % |

> **En production** : remplacer chaque bloc `chart(...)` par `<hearst-asset id="..." data='{...}' />` (composants déjà présents : `components/cockpit/Donut.tsx`, `BarList.tsx`, `Funnel.tsx` ; sinon catalog). Les données sont déjà structurées côté JS du proto pour brancher le moteur financier (domaine 07).

---

## 4. Conventions front pour l'implémentation React

- **Route** : `app/(dashboard)/invest/` (marketplace), `invest/[deal]/` (fiche), `portfolio/` (portefeuille). Ne PAS toucher aux routes estimation/CRM existantes.
- **Shell** : réutiliser `components/cockpit/CockpitShell.tsx` tel quel ; ajouter les icônes de nav dans `RailLeft.tsx` (Marché / Portefeuille).
- **Accent** : poser `data-product="gold"` au niveau du layout de la section invest (ou via `AccentSelector` si on veut le rendre global).
- **Charts** : `<hearst-asset>` (catalog) ou les primitives `components/cockpit/{Donut,BarList,Funnel}.tsx`. Pour waterfall / gantt / jauge / radar / sparkline : ajouter des primitives `components/cockpit/` réutilisant les classes `.ct-chart-*` déjà dans `cockpit.css` (ou porter les classes `.waterfall/.gantt/.gauge/.radar/.barlist/.scenario` du proto vers `cockpit.css`).
- **Flux de souscription** : modal `crm-form-overlay`-like (classe existante), state machine 5 étapes côté client, chaque étape POST vers les routes API du domaine correspondant (KYC, e-sign, séquestre, mint).
- **Aucune logique métier dans le proto** : les chiffres sont des fixtures ; le moteur financier (domaine 07) et les smart contracts (domaine 05) fournissent les vraies données.

---

## 5. Garde-fous DS respectés (checklist)

- [x] Tokens `--ct-*` uniquement — aucun hex hors `:root` (copie conforme cockpit.css).
- [x] `data-product="gold"` = seul switch d'accent (token déjà présent dans cockpit.css).
- [x] Shell bordeaux verre dépoli (ambient glow `--ct-accent-maroon`, surfaces `rgba(255,255,255,…)`, `backdrop-filter`).
- [x] Rail droit chat Kimi repliable, présent sur toutes les vues.
- [x] Bottom-bar pilule flottante (segments nav + CTA primaire).
- [x] Spacing via `--ct-space-*`, ombres via `--ct-shadow-depth`, timing via `--ct-dur-base`/`--ct-ease`.
- [x] `<hearst-asset>` documenté pour chaque chart (intégration réelle).
- [x] Fichier autonome, ouvrable `file://`, **0 erreur console** (vérifié Playwright headless).
- [x] Responsive (grilles `auto-fill`, `repeat(12,1fr)` → `span 12` < 1200px, `grid-2` → 1 col < 900px).

## 6. Garde-fous JURIDIQUES rendus visibles dans l'UI (anti-FIA)

| Contrainte verrouillée | Matérialisation UI |
|---|---|
| Obligations (créancier ≠ propriétaire) | Callout d'avertissement sur la fiche + réponse chat dédiée + libellés « créancier obligataire » partout |
| 1 SPV = 1 opération, choix deal-by-deal réel | Marketplace = deals individuels ; souscription par deal ; portefeuille = lignes indépendantes |
| Aucune pré-collecte / pooling / NAV / rebalancing | Messages explicites en tête de marketplace ET de portefeuille ; callout « pas une NAV de fonds » |
| Séquestre tiers, plateforme ne détient jamais les fonds | Schéma Vous→Séquestre→SPV à l'étape paiement ; remboursement intégral si échec |
| Token ERC-3643 miroir DEEP, hors MiCA | Panneau Token & structure ; badge « Security token · hors MiCA » ; « minté au closing » |
| Règlement EUR par défaut, EURC/EURe option, jamais USDT | 2 onglets de paiement (EUR défaut + stablecoin CASP) ; mention explicite « jamais d'USDT » |
| Rendement variable, non garanti | Astérisque systématique « TRI cible* non garanti » + fineprints + checklist d'adéquation |
| KYC / test ECSP / délai 4 j | Étape Profil (test d'adéquation) + délai de réflexion 4 j rappelé 3× |

---

## 7. Dépendances inter-domaines

- **07 — Moteur financier** : fournit les vraies valeurs des 11 graphiques + waterfall + projections de la souscription (les structures de données JS du proto sont prêtes à recevoir ces sorties).
- **05 — Smart contracts** : adresse de contrat, état du mint, whitelist ONCHAINID affichés dans le panneau Token & au step confirmation.
- **06 — Migrations / DB** : tables deals, souscriptions, positions, registre cap table (alimentent marketplace / portefeuille).
- **DS Cockpit** (copie locale `app/cockpit/*.css`) : ajouter les nouvelles classes chart (`.waterfall/.gantt/.gauge/.radar/.scenario`) directement dans le CSS local pour les réutiliser hors invest, puis `npm run cockpit:manifest`. Pas de remontée vers une source centrale.
