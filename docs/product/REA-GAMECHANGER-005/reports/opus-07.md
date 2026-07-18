# REA-GAMECHANGER-005 — Opus 07 · Widgets visuels & intelligence opérationnelle

> Domaine : cartes géographiques, timelines, entonnoirs cross-module, matrices, fraîcheur de dossier,
> comparables visuels, scores expliqués, mouvements de portefeuille. **Règle absolue tenue : chaque widget
> proposé porte une ACTION (cliquer → agir).** Les KPI décoratifs et graphiques sans action sont éliminés
> d'office (voir §Idées rejetées). Angle différenciant vs Opus 01/02/04/06 : **VISUALISATION TRANSVERSE**
> (spatial multi-entités, trajectoire, matrice), pas de la next-best-action ni de la densité UI (M04).

---

## 1. Synthèse coordinateur

| # | Candidat | Écran (existant) | Taille | Score | Données prêtes (O/P/N) | Effet business (1 ligne) |
|---|----------|------------------|--------|-------|------------------------|--------------------------|
| C1 | **Carte de secteur prospection** (annonces géolocalisées sur carte, clic → fiche/contact) | `/prospection` onglet *annonces* + *matching* | **S** | **86** | **O** | La géo est persistée (`prosp_annonces.latitude/longitude`, 0015) mais JAMAIS affichée : l'agent lit une liste au lieu de voir son secteur → concentration des mandats potentiels visible d'un coup. |
| C2 | **Trajectoire de prix d'une annonce** (sparkline `prosp_annonce_versions` : chaque baisse datée, clic → contacter) | `/prospection` → `AnnonceDetailDialog` | **S** | **84** | **O** | Le pipeline détecte et stocke DÉJÀ chaque baisse (`prix_precedent`, `statut='baisse'`, versions) mais l'UI ne montre qu'un badge : voir la courbe = lire la motivation vendeur et frapper au bon moment. |
| C3 | **Nuage de comparables DVF** (scatter prix m²×surface, bien positionné, clic point → détail vente) | `/estimations/[id]` → `SidePanel` | **S** | **82** | **O** | Les comparables DVF ne sont qu'un tableau ; le nuage montre en 2 s si le bien est cher/dans le marché → argument de mandat visuel devant le vendeur, pas un tableau de chiffres. |
| C4 | **Carte du portefeuille de biens** (mandats/biens sur carte + statut couleur, clic → fiche) | `/properties` (toggle vue carte) | **M** | **79** | **P** | `properties` n'a PAS de lat/lng → géocodage à la volée (moteur BAN déjà là). Vue territoriale du portefeuille = démonstration immédiate « voici où je travaille », attendue par tout CRM concurrent. |
| C5 | **Matrice de positionnement prix du portefeuille** (biens : prix affiché vs médiane marché, sur/sous-évalués) | `/mandates` + `/properties` (bandeau) | **M** | **76** | **P** | Croise `properties.asking_price` avec la médiane DVF de l'estimation liée (0039) → détecte les biens sur-évalués qui vont stagner → tâche « proposer un ajustement de prix ». |
| C6 | **Score de match expliqué (barres de contribution)** (breakdown déjà en base, rendu visuel + action) | `/prospection` → `MatchReasons` | **XS** | **74** | **O** | `score_breakdown` est stocké mais affiché en repli brut : des barres « localisation +30 / budget +25 / surface +15 » rendent le « Pourquoi ce match » lisible → l'agent envoie le bon bien avec confiance. |
| C7 | **Entonnoir de conversion transverse** (estimation→mandat→bien→visite→match, un seul funnel cross-module) | `/` accueil (bandeau) | **M** | **72** | **O** | Aucune vue ne relie les modules : un entonnoir global montre où ça décroche (ex. 40 estimations → 6 mandats) → l'agent voit son taux de transformation réel et où agir. |

*Shortlist = 7 candidats ≥70. Tous portent une action au clic. C4/C5 marqués « P » car dépendent d'un géocodage/lien-estimation à câbler (dépendance interne, pas externe).*

---

## 2. Lecture du terrain (vérifié dans le worktree)

### Ce que j'ai ouvert et confirmé
- **Carte statique maison** : `lib/estimation/staticmap.ts` — `buildStaticMap({subject, listings, width, height})` pur (tuiles OSM `tile.openstreetmap.org`, **aucune clé API**, calcule tuiles + pixels des markers, auto-fit zoom). Rendu 100 % HTML/CSS, marche en navigateur ET PDF chromium.
- **Carte déjà rendue en prod** : `app/(dashboard)/estimations/_components/SidePanel.tsx:93-337` compose `buildStaticMap` avec `marketProp.subject_lat/subject_lon` + `listing_comparables[].lat/lon`, markers accent positionnés. **Preuve que l'infra carte fonctionne déjà** — un 2e usage (prospection) coûte S, pas M. Aussi utilisé dans `components/brochure/Brochure.tsx`.
- **Géocodage BAN opérationnel** : `lib/estimation/geocode.ts` — `geocode(adresse)` → `{lat,lon,inseeCode,city,postcode,score}`, BAN primaire + failover Geopf, bornes métropole. Réutilisable pour géocoder `properties` à la volée.
- **AUCUNE lib de carte JS** dans `package.json` (pas de Leaflet/Mapbox/MapLibre) → la carte maison est la seule voie, ce qui **garantit** zéro nouvelle dépendance externe.

### Géo réellement persistée — honnêteté data (le point le plus important de mon domaine)
| Entité | lat/lng en base ? | Source | Conséquence |
|--------|-------------------|--------|-------------|
| `prosp_annonces` | **OUI** — `latitude numeric(10,7)`, `longitude numeric(10,7)` | `supabase/migrations/0015_prosp_annonces.sql:34-35` | Carte prospection = **données prêtes (O)**. ⚠️ mais l'API `annonces/route.ts:32` ne les SELECT pas → 1 ligne à ajouter. |
| `estimations` (snapshot) | **OUI (dans JSONB `market`)** — `subject_lat/subject_lon` + `listing_comparables[].lat/lon` + `dvf_comparables` | `lib/estimation/types.ts:130-146`, consommé `SidePanel.tsx:93-100` | Carte + scatter estimation = **prêts (O)**. |
| `properties` | **NON** — seulement `address/city/postal_code` | `supabase/migrations/0008_crm.sql:19-21` | Carte portefeuille = **géocodage requis (P)**, faisable avec `geocode.ts`. |
| DVF comparables | **date_mutation, prix_m2, surface, nombre_pieces** (pas lat/lon exposés dans le type, mais `valeur_fonciere`/`prix_m2`) | `lib/estimation/types.ts:87-98` | Scatter prix×surface = **prêt (O)** ; carte DVF = non (pas de coord dans le type). |

### Trajectoire de prix — donnée en or sous-exploitée
- `prosp_annonce_versions` (`0040_prospection_industrialization.sql:31-47`) : **historique complet par annonce** — `prix, surface, statut, observed_at`, indexé `(annonce_id, observed_at desc)`. C'est une timeline prête à tracer.
- `prosp_annonces` porte `prix_precedent numeric(14,2)` + `republication boolean` (`0015:48-49`).
- Le pipeline **détecte et écrit déjà** les baisses : `lib/prospection/ingest.test.ts:199-215` prouve `statut='baisse'` + `prix_precedent=300000` + `republication=true` persistés. **La donnée existe, elle n'est jamais visualisée** (l'API annonces ne remonte que `republication`, `route.ts:32`).

### Widgets DS réutilisables (coût de composition)
- `components/cockpit/Funnel.tsx` — entonnoir vertical, props `{steps: FunnelStep[]}` typées depuis `lib/crm/aggregate.ts`. Server component, trivial à alimenter.
- `components/cockpit/BarList.tsx` — barres horizontales `{items: BarItem[]}` → **exactement** le rendu voulu pour un score expliqué (label + valeur + piste).
- `lib/crm/aggregate.ts` — `countByStatus`, `barsByStatus`, `topByCategory`, `distributeByBand`, `PRICE_BANDS`, `autoBands`, `average`, `ratio` → boîte à outils d'agrégation déjà là (funnel/matrice ≈ gratuit côté calcul).
- `ScoreRing` (radial) existe déjà inline dans `app/(dashboard)/prospection/page.tsx:78-101` — pattern de score circulaire réutilisable.
- `ValuationHero.tsx:24-30` — `pct(value, low, high)` positionne une valeur dans une fourchette (barre de position déjà écrite → base du scatter/positionnement).
- `Donut.tsx`, `LeadKanban.tsx`, `PropertyKanban.tsx`, `ActionCenter.tsx`, `Skeleton.tsx` disponibles.

### Matrice de capacités — mon domaine
| Capacité visuelle | Statut |
|-------------------|--------|
| Carte de secteur (tuiles OSM, markers) | **AVAILABLE persisté & rendu** (estimation) → sous-exploité ailleurs (prospection O, propriétés P) |
| Géocodage adresse→lat/lon | **AVAILABLE** (`geocode.ts`, BAN+Geopf) |
| Historique de prix annonce | **AVAILABLE persisté, JAMAIS affiché** (`prosp_annonce_versions`, `prix_precedent`) |
| Comparables DVF (prix m², surface, date) | **AVAILABLE persisté**, rendu **tableau seulement** → scatter absent |
| Score de match décomposé | **AVAILABLE persisté** (`score_breakdown`), rendu **repli brut** → visuel absent |
| Fourchette de valorisation (barre position) | **AVAILABLE & rendu** (`ValuationHero`) |
| Funnel par statut (mono-module) | **AVAILABLE & rendu** (mandats/visites) → funnel **transverse** absent |
| lat/lon sur `properties` | **nouvelle donnée requise** (géocodage à la volée, pas d'API externe payante) |
| Carte interactive zoom/pan (Leaflet) | **UNAVAILABLE / hors périmètre** — la carte maison est statique (choix assumé, PDF-safe) |
| Couvert M04 | densité/hiérarchie des écrans (M04-08/09/10/11) — je n'y touche pas ; mes widgets ajoutent une **capacité de visualisation nouvelle**, pas du polish |

---

## 3. Preuves concurrentielles

| Produit | Capacité observée | URL | Date | Prouvé / Inféré |
|---------|-------------------|-----|------|-----------------|
| **Casafari** | Historique de prix de chaque bien + **alertes de changement de prix** + **détection multi-portails du même bien** (« Who else is selling this property? What are the price changes? ») | casafari.com/products/solutions-for-agents/ | 2026-07-18 | **Prouvé** (cité sur la page) |
| **Casafari** | Rapports comparatifs « detailed historical data, price trends » partageables | casafari.com/products/solutions-for-agents/ | 2026-07-18 | **Prouvé** |
| **Yanport** | Dashboard : « nouveaux biens et **baisses de prix** de particuliers et pros **depuis moins de 24h sur votre zone**, actionnable en un clic » ; Agent 360 « détecte nouveaux mandats, variations de prix, annonces concurrentes » | yanport.com/blog/posts/evolution-du-tableau-de-bord ; recherche « Yanport Agent 360 » | 2026-07-18 | **Prouvé** (widget décrit) / positionnement Agent 360 **inféré** (résumé de recherche, pas capture) |
| **PriceHubble** | Dataviz d'évolution des prix (heatmap Paris/Bordeaux/Nantes/Rennes) sur données DGFiP | actuia.com/.../dataviz-pricehubble-dgfip | 2026-07-18 | **Prouvé** (article décrit la vidéo/heatmap) |
| **kvCORE / BoldTrail** | **Heatmaps personnalisées** pour repérer les zones à prospect + suivi comportemental des leads (recherches, gammes de prix) ajustant les relances | boldtrail.com/blog/kvcore-vs-lofty/ | 2026-07-18 | **Prouvé** (heatmap + tracking cités) |
| **SweepBright** | Matching **bidirectionnel** contact↔bien + **envoi en un clic** (mail all matches / individuel) + **swipe** sur carte-bien pour voir/agir | sweepbright.help/match.html ; recherche SweepBright matching 2026 | 2026-07-18 | **Prouvé** (mécanique matching + envoi décrite) |
| **Lofty** | v2026 : AI Co-Pilots + SEO/website agents dans le dashboard ; carte non détaillée | agentadvice.com/lofty-review/ | 2026-07-18 | Co-pilots **prouvé** ; map **non observé** (honnête) |

**Lecture** : les leaders FR (Yanport, Casafari, PriceHubble) convergent sur **trois** visualisations que ce repo a les données pour faire mais n'affiche pas : (1) **carte de secteur** avec biens/annonces, (2) **historique/baisse de prix** d'une annonce, (3) **positionnement prix** (heatmap/comparables). C'est précisément là que se situe le retard perçu — et le rattrapage le moins cher, car les données sont déjà en base.

---

## 4. Candidats (format obligatoire + décompte de score)

### C1 — Carte de secteur prospection · **S** · **86/100**
- **Problème métier exact** : l'agent scanne une liste d'annonces sans voir leur répartition géographique ; il rate les **concentrations** (rue/quartier où plusieurs vendeurs PAP apparaissent = filon de mandats) et ne peut pas raisonner « quel bien est proche de quel acquéreur ».
- **Utilisateur** : agent en phase de prospection / pige.
- **Moment du parcours** : consultation quotidienne des annonces scrapées et des matchs.
- **Écran/emplacement** : `/prospection`, onglets *annonces* et *matching* — bloc carte au-dessus/à côté de la liste existante (`app/(dashboard)/prospection/page.tsx`). Aucun nouveau menu.
- **Comportement du widget** : `buildStaticMap({subject:null, listings: annonces géolocalisées})` (réutilise l'infra de `SidePanel.tsx`). Chaque marker = une annonce ; couleur/taille selon `is_pap` (PAP = cible mandat) ou score de match ; hover → mini-carte (titre, prix, m²).
- **Action disponible** : clic marker → ouvre `AnnonceDetailDialog` (existant) → depuis lequel « Contacter le vendeur » (`lib/prospection/contact.ts`, respecte `prosp_optout`) ou « Estimer » / « Lier au CRM » (routes existantes `annonces/[id]/estimate`, `link-crm`).
- **Automatisation éventuelle** : aucune (widget de lecture→action) ; peut afficher un halo sur les zones à ≥3 annonces PAP (« secteur chaud »).
- **Validation humaine** : le contact reste soumis au flux existant (opt-out + validation), inchangé.
- **Données nécessaires** : lat/lon + prix + is_pap + score des annonces.
- **Données DÉJÀ dispo** : `prosp_annonces.latitude/longitude` (`0015_prosp_annonces.sql:34-35`), `prix`, `is_pap`, `ville` ; matchs `prosp_matchs.score_match`. Infra carte `lib/estimation/staticmap.ts`.
- **Données manquantes** : aucune en base ; **1 correctif** : ajouter `latitude,longitude` au SELECT de `app/api/prospection/annonces/route.ts:32` (aujourd'hui absents).
- **Routes/tables/composants concernés** : `annonces/route.ts` (select), nouveau `_components/SectorMap.tsx` (copie du bloc SidePanel), `prospection/page.tsx` (intégration onglet), `AnnonceDetailDialog` (cible du clic).
- **Dépendances externes** : tuiles OSM (déjà utilisées, pas de clé). **Aucune**.
- **Risques** : annonces sans coord (filtrées, comme SidePanel le fait déjà `l.lat!=null`) ; charge tuiles (statique, négligeable). Bas.
- **Preuve concurrentielle** : Yanport « baisses/nouveaux biens sur votre zone, un clic » (prouvé) ; SweepBright swipe carte-bien (prouvé) ; kvCORE heatmaps de zones (prouvé).
- **Scénario démo** : ouvrir *annonces* → la carte montre 12 markers, 3 groupés rue X → clic → dialog → « Contacter ». « Mon secteur, d'un coup d'œil. »
- **Indicateur de succès** : % de sessions prospection qui utilisent la carte ; nb de contacts initiés depuis un marker vs depuis la liste.
- **Décompte** : impact business 21/25 · utilité quotidienne 18/20 · effet démontrable 14/15 · avantage agentique 8/15 (widget de lecture, action manuelle) · faisabilité 14/15 (infra carte existante) · données 10/10. **Brut 85** ; +1 réutilisation directe d'un composant prouvé. **= 86**. Pénalités : 0.

### C2 — Trajectoire de prix d'une annonce · **S** · **84/100**
- **Problème métier exact** : un vendeur qui **baisse son prix** (surtout à répétition) est un vendeur qui doute de son mandat actuel → **fenêtre de prise de mandat**. Aujourd'hui l'agent ne voit qu'un badge « republiée » sans amplitude ni chronologie.
- **Utilisateur** : agent chasseur de mandats.
- **Moment** : ouverture de la fiche d'une annonce repérée.
- **Écran/emplacement** : `/prospection` → `AnnonceDetailDialog.tsx` (dialog existant), section prix.
- **Comportement** : sparkline/mini-courbe des `prosp_annonce_versions.prix` par `observed_at`, avec chaque **baisse** marquée (▼ −X %, date). Badge synthèse « −8 % en 21 j sur 2 baisses ». Rendu HTML/CSS pur (pas de lib graphique — cohérent avec la carte maison).
- **Action disponible** : bouton « Contacter maintenant » (contexte : « prix baissé 2× ») → `contact.ts` (draft, opt-out respecté) ; ou « Créer une tâche de relance » (`rea_tasks`).
- **Automatisation éventuelle** : optionnel — l'agent Vigie (domaine Opus 06) peut consommer cette même donnée ; **ici, pur widget de visualisation**, pas d'agent, pour rester dans mon périmètre.
- **Validation humaine** : contact = brouillon validé (règle dure du brief).
- **Données nécessaires** : versions de prix horodatées d'une annonce.
- **Données DÉJÀ dispo** : `prosp_annonce_versions (prix, statut, observed_at)` indexé (`0040:31-47`) ; `prosp_annonces.prix_precedent` (`0015`). Détection baisse **déjà écrite** (`ingest.test.ts:199-215`).
- **Données manquantes** : aucune ; il faut **exposer** les versions via une route (nouvelle `annonces/[id]/versions` ou joindre dans le detail).
- **Routes/tables/composants** : nouvelle route lecture versions, `AnnonceDetailDialog.tsx` (rendu courbe), petit `PriceTrail.tsx`.
- **Dépendances externes** : aucune.
- **Risques** : annonces à 1 seule version (afficher « pas d'historique ») ; fuseau `observed_at`. Bas.
- **Preuve concurrentielle** : Casafari « price history + price changes » (prouvé) ; Yanport « baisses de prix 24h » (prouvé).
- **Scénario démo** : ouvrir une annonce republiée → courbe 320k→300k→285k sur 3 semaines → « ce vendeur est mûr » → Contacter.
- **Indicateur de succès** : taux de contact sur annonces avec ≥1 baisse vs sans ; mandats attribués à un contact post-baisse.
- **Différenciation** : Opus 01 (C6) et Opus 06 (Vigie) exploitent la baisse comme **signal→tâche/agent** ; moi je livre la **visualisation de la trajectoire dans la fiche** (objet et écran différents). Complémentaire, non-dupliqué.
- **Décompte** : impact 22/25 · utilité 16/20 · démontrable 14/15 · agentique 8/15 · faisabilité 14/15 · données 10/10. **Brut 84**. Pénalités : 0.

### C3 — Nuage de comparables DVF · **S** · **82/100**
- **Problème métier exact** : devant le vendeur, un **tableau** de ventes DVF ne prouve rien visuellement ; l'agent peine à montrer « votre prix est au-dessus du marché ». Il manque un visuel où le bien se **positionne** parmi les ventes réelles.
- **Utilisateur** : agent en R2/présentation d'estimation.
- **Moment** : consultation du résultat d'estimation, préparation du RDV vendeur.
- **Écran/emplacement** : `/estimations/[id]` → `SidePanel.tsx`, au-dessus de la table DVF existante (`:237`).
- **Comportement** : scatter prix m² (Y) × surface (X), un point par `dvf_comparables`, le **bien estimé** en point accent distinct ; bande médiane (réutilise `prix_median_m2` de `MarketAnalysis`). Pur SVG (comme `ScoreRing`).
- **Action disponible** : clic point → surligne la ligne correspondante dans la table DVF (ancre) ; le bien positionné au-dessus de la bande → CTA « Ajuster le prix recommandé » (ouvre l'édition de valorisation) ; export inclus dans le **PDF/brochure** (infra partage existante).
- **Automatisation éventuelle** : aucune.
- **Validation humaine** : ajustement de prix = action agent explicite.
- **Données nécessaires** : comparables DVF (prix m², surface) + prix/m² du bien.
- **Données DÉJÀ dispo** : `dvf_comparables[]` avec `prix_m2, surface_reelle_bati, nombre_pieces, date_mutation` (`lib/estimation/types.ts:87-98`), `prix_median_m2` (`:132`), position `pct()` (`ValuationHero.tsx:24`). Comparables déjà chargés dans `SidePanel` (`:82`).
- **Données manquantes** : aucune.
- **Routes/tables/composants** : `SidePanel.tsx` (+ `ComparablesScatter.tsx`), `Brochure.tsx` (réutilisation pour le partage/PDF).
- **Dépendances externes** : aucune.
- **Risques** : peu de comparables (<5) → afficher fallback tableau (déjà géré `comparables.ts:110`) ; échelle log si dispersion forte. Bas.
- **Preuve concurrentielle** : PriceHubble dataviz prix DGFiP (prouvé) ; Casafari « price trends » comparatifs (prouvé).
- **Scénario démo** : estimation ouverte → nuage → le bien est un point haut isolé → « voilà pourquoi il ne se vendra pas à ce prix » → Ajuster.
- **Indicateur de succès** : usage du scatter dans les estimations partagées ; corrélation avec taux d'acceptation du prix recommandé.
- **Différenciation vs Opus 04** (funnel estim→mandat) : Opus 04 possède le **mécanisme de conversion** ; moi la **visualisation du positionnement prix** dans la fiche estimation. Angles disjoints.
- **Décompte** : impact 20/25 · utilité 15/20 · démontrable 15/15 (très visuel devant client) · agentique 7/15 · faisabilité 15/15 · données 10/10. **Brut 82**. Pénalités : 0.

### C4 — Carte du portefeuille de biens · **M** · **79/100**
- **Problème métier exact** : l'agent n'a aucune **vue territoriale** de son portefeuille (biens/mandats) ; impossible de voir sa couverture géographique, les zones où il est fort/absent, ou de préparer une tournée de visites.
- **Utilisateur** : agent gérant un portefeuille de mandats.
- **Moment** : pilotage hebdo du portefeuille, préparation de tournée.
- **Écran/emplacement** : `/properties` — **toggle vue liste ↔ carte** (le kanban existe déjà via `PropertyKanban`, on ajoute une 3e vue). Pas de nouveau menu.
- **Comportement** : markers colorés par `status` (disponible/sous-compromis/vendu) sur `buildStaticMap`. Clic → fiche bien. Filtre par statut réutilise la logique existante.
- **Action disponible** : clic marker → `/properties/[id]` ; depuis un cluster → « planifier une tournée » (crée des `visits` groupées — mutation simple, sans confirmation, conforme au brief).
- **Automatisation éventuelle** : aucune.
- **Validation humaine** : création de visites = action agent (pas de comm externe).
- **Données nécessaires** : lat/lon des biens.
- **Données DÉJÀ dispo** : `properties.address/city/postal_code/status/asking_price` (`0008_crm.sql`), moteur `geocode.ts`, infra carte.
- **Données manquantes** : **lat/lon non persistés sur `properties`** → géocodage. Deux options : (a) colonne `latitude/longitude` + backfill par `geocode.ts` (migration + job), (b) géocodage à la volée avec cache. Option (a) recommandée (migration légère, FK-free, index géo optionnel).
- **Routes/tables/composants** : migration `properties` (+lat/lon), job/route de géocodage, `properties/page.tsx` (toggle), `PropertyMap.tsx`, `LeadsViewToggle`-like réutilisé.
- **Dépendances externes** : BAN (gratuit, déjà câblé). Aucune payante.
- **Risques** : adresses incomplètes → géocodage échoue (score<0.4 rejeté par `geocode.ts`) → bien non mappé (afficher compteur « X non géolocalisés ») ; coût backfill (borné au portefeuille). Moyen.
- **Preuve concurrentielle** : Casafari gestion de portefeuille par agent (prouvé) ; kvCORE heatmaps de zones (prouvé) ; SweepBright vue carte des biens (prouvé, mobile-first).
- **Scénario démo** : `/properties` → bascule Carte → 8 mandats sur la carte, 3 dans le même quartier → « planifier tournée ».
- **Indicateur de succès** : adoption de la vue carte ; nb de tournées planifiées depuis la carte.
- **Décompte** : impact 20/25 · utilité 16/20 · démontrable 14/15 · agentique 7/15 · faisabilité 12/15 (géocodage à câbler) · données 6/10 (P — géo à produire). **Brut 75** ; +4 (réutilisation infra carte+géocodage déjà présentes, dépendance INTERNE seulement). **= 79**. Pénalité données non accessibles : non applicable (donnée productible sans API payante, juste à câbler).

### C5 — Matrice de positionnement prix du portefeuille · **M** · **76/100**
- **Problème métier exact** : des biens **sur-évalués** stagnent et pourrissent le mandat, mais l'agent n'a pas de vue synthétique « lesquels sont au-dessus du marché ». L'info existe (estimation liée au bien) mais dispersée.
- **Utilisateur** : agent/manager pilotant les mandats.
- **Moment** : revue de portefeuille, décision d'ajustement de prix.
- **Écran/emplacement** : `/mandates` (bandeau au-dessus de la table) ou `/properties`. Réutilise `BarList`/matrice.
- **Comportement** : pour chaque bien avec estimation liée, écart % entre `asking_price` et médiane marché (`prix_median_m2 × surface`). Rendu = liste triée (BarList) ou matrice écart×ancienneté du mandat ; rouge = sur-évalué + ancien.
- **Action disponible** : clic ligne → fiche bien/mandat ; CTA « Créer tâche : proposer ajustement » (`rea_tasks`).
- **Automatisation éventuelle** : aucune (calcul dérivé) ; peut nourrir une tâche.
- **Validation humaine** : ajustement = décision agent, aucune comm auto.
- **Données nécessaires** : `asking_price` du bien + médiane marché de l'estimation liée + date du mandat.
- **Données DÉJÀ dispo** : `properties.asking_price/surface` (`0008`), `estimations` lié au bien (**migration 0039 lien propriété**), `prix_median_m2` dans le snapshot (`types.ts:132`), `mandates.expires_at/created` (`mandates/page.tsx:47`), `average`/`ratio` (`aggregate.ts`).
- **Données manquantes** : biens **sans** estimation liée → non positionnables (afficher « estimer d'abord », CTA vers `/estimations/new`). Dépend de la qualité du lien 0039.
- **Routes/tables/composants** : lecture jointe properties↔estimations, `mandates/page.tsx`/`properties/page.tsx` (bandeau), `PriceMatrix.tsx`.
- **Dépendances externes** : aucune.
- **Risques** : couverture partielle (peu de biens estimés-liés) → widget maigre au départ ; médiane obsolète si estimation ancienne (afficher date). Moyen.
- **Preuve concurrentielle** : Casafari rapports comparatifs & price trends (prouvé) ; Yanport détection variations de prix (prouvé/inféré).
- **Scénario démo** : `/mandates` → bandeau montre 2 biens à +18 %/+12 % vs marché, mandats de 60 j → « proposer un ajustement ».
- **Indicateur de succès** : nb d'ajustements de prix déclenchés ; réduction du délai de vente des biens signalés.
- **Différenciation vs Opus 01 C5** (score de refroidissement / fraîcheur) : Opus 01 mesure **l'inactivité temporelle** (updated_at) ; moi le **positionnement prix vs marché** (donnée différente, angle prix). Disjoint.
- **Décompte** : impact 21/25 · utilité 14/20 · démontrable 12/15 · agentique 7/15 · faisabilité 12/15 · données 6/10 (P — dépend du lien estimation). **Brut 72** ; +4 (calcul via `aggregate.ts` + `BarList` existants). **= 76**. Pénalités : 0.

### C6 — Score de match expliqué (barres de contribution) · **XS** · **74/100**
- **Problème métier exact** : le « Pourquoi ce match » retombe sur un affichage **brut** de `score_breakdown` quand l'explication calculée manque ; l'agent ne voit pas *combien* chaque critère pèse → moindre confiance pour proposer le bien à l'acquéreur.
- **Utilisateur** : agent traitant ses matchs.
- **Moment** : revue des matchs, avant de proposer un bien.
- **Écran/emplacement** : `/prospection` → `MatchReasons.tsx` (bloc « Pourquoi ce match », `:105-138`).
- **Comportement** : rendre `score_breakdown` en **barres** (`BarList`) — « localisation +30 / budget +25 / surface +15 / DPE +5 » — au lieu du repli brut. Total = `score_match` (déjà un `ScoreRing`).
- **Action disponible** : bouton « Proposer ce bien à l'acquéreur » (draft d'envoi via flux existant, opt-out respecté) directement sous l'explication.
- **Automatisation éventuelle** : aucune.
- **Validation humaine** : proposition = brouillon validé.
- **Données nécessaires** : `score_breakdown` (map critère→points).
- **Données DÉJÀ dispo** : `prosp_matchs.score_breakdown jsonb` (`0017_prosp_matchs_feedback.sql:9`), déjà remonté par `matchs/route.ts:81` et manipulé dans `MatchReasons.tsx:138`. `BarList` prêt.
- **Données manquantes** : aucune.
- **Routes/tables/composants** : `MatchReasons.tsx` uniquement (+ `BarList`).
- **Dépendances externes** : aucune.
- **Risques** : breakdown aux clés hétérogènes selon `engine_version` → normaliser l'affichage (libellés depuis `ui-strings`). Bas.
- **Preuve concurrentielle** : SweepBright matching « type/location/price » explicite (prouvé) ; Yanport « influence de chaque critère » dans l'estimation (prouvé/inféré).
- **Scénario démo** : ouvrir un match 88/100 → barres montrent localisation+budget dominants → « Proposer ce bien ».
- **Indicateur de succès** : taux de propositions envoyées depuis un match ; feedback positif (`prosp_match_feedback`).
- **Décompte** : impact 15/25 · utilité 16/20 · démontrable 13/15 · agentique 8/15 · faisabilité 15/15 · données 10/10. **Brut 77** ; −3 (chevauche partiellement l'esprit du « Pourquoi ce match » déjà présent → ajout = visualisation, pas capacité radicalement neuve). **= 74**. Note : reste ≥70 car transforme un repli brut en widget actionnable.

### C7 — Entonnoir de conversion transverse · **M** · **72/100**
- **Problème métier exact** : les modules (estimation, mandats, biens, visites, prospection) sont **cloisonnés** ; l'agent ne voit jamais son **taux de transformation global** (ex. combien d'estimations deviennent des mandats, puis des ventes) → pilote à l'aveugle.
- **Utilisateur** : agent/manager (pilotage).
- **Moment** : bilan hebdo/mensuel, sur l'accueil.
- **Écran/emplacement** : `/` accueil, bandeau sous les KPI (`app/(dashboard)/page.tsx`, section KPI `:277`). Réutilise `Funnel`.
- **Comportement** : entonnoir **cross-module** : Estimations → Mandats signés → Biens en vente → Visites → Matchs/Offres. Chaque étage = count sur la période ; largeur = ratio. Distinct des funnels **mono-module** existants (mandats par statut, visites par statut).
- **Action disponible** : clic étage → liste filtrée de l'écran correspondant (ex. étage « Mandats » → `/mandates`). Chaque « fuite » (chute forte entre 2 étages) → CTA vers l'écran à travailler.
- **Automatisation éventuelle** : aucune (agrégation).
- **Validation humaine** : n/a (lecture).
- **Données nécessaires** : counts par module sur une fenêtre temporelle.
- **Données DÉJÀ dispo** : `estimations`, `mandates`, `properties`, `visits`, `prosp_matchs` tous déjà fetchés sur l'accueil (`page.tsx:200-230`) ; `Funnel.tsx` + `countByStatus`/`aggregate.ts`.
- **Données manquantes** : la **jointure de transformation** exacte (quelle estimation → quel mandat) est imparfaite (lien estimation↔propriété 0039 existe, mais pas un chaînage complet estimation→mandat→vente). MVP = counts par étage (pas un vrai suivi de cohorte), affiché honnêtement comme « volumes par étape », pas « taux de conversion d'une même cohorte ».
- **Routes/tables/composants** : `page.tsx` (agrégats déjà chargés), `ConversionFunnel.tsx` (compose `Funnel`).
- **Dépendances externes** : aucune.
- **Risques** : **surinterprétation** (volumes ≠ cohorte) → libellé prudent obligatoire ; recouvre l'esprit de M04-08 (accueil) → différencié car M04-08 = hiérarchie urgent/aujourd'hui, pas un funnel transverse. Moyen.
- **Preuve concurrentielle** : Casafari « lead & sales funnel de la prospection à la fin » + dashboards dynamiques (prouvé) ; SweepBright pipeline (prouvé).
- **Scénario démo** : accueil → funnel 40 estim → 6 mandats → 5 biens → 12 visites → 2 offres → « ma déperdition est estimation→mandat » → clic → `/mandates`.
- **Indicateur de succès** : usage du funnel ; actions déclenchées depuis l'étage le plus faible.
- **Différenciation vs Opus 04** : Opus 04 possède le **funnel estimation→mandat** spécifique et son mécanisme ; mon funnel est **le cycle entier transverse** (5 étages, vue de pilotage accueil). Si recouvrement jugé trop fort par le coordinateur, fusionner sous Opus 04 en gardant mon angle « vue accueil transverse ».
- **Décompte** : impact 18/25 · utilité 13/20 · démontrable 13/15 · agentique 6/15 · faisabilité 13/15 · données 9/10 (agrégats prêts, cohorte imparfaite). **Brut 72**. Pénalités : 0 (pas de refonte, données là). Risque de doublon partiel Opus 04 signalé honnêtement.

---

## 5. Idées rejetées

- **Carte interactive Leaflet/Mapbox (zoom/pan, clustering dynamique)** — nouvelle dépendance externe + poids ; la carte maison statique couvre 90 % du besoin sans clé ni infra. Rejeté (−20 nouvelle infra, contre la doctrine « zéro lib de carte »).
- **Heatmap de prix au m² à l'échelle ville/quartier (façon PriceHubble)** — nécessite un maillage géo agrégé (prix moyen par polygone) **non présent en base** ; seules des transactions ponctuelles existent. Rejeté (données non accessibles −15, XL de construction du maillage).
- **KPI 4 tuiles « chiffre du jour » enrichies (CA, honoraires prévisionnels)** — pur affichage sans action ; honoraires non calculés en base de façon fiable. Rejeté (gadget KPI sans action = élimination d'office, brief).
- **Graphique d'activité de l'agent (courbe d'appels/emails/jour)** — décoratif, pas d'action, et les événements d'activité ne sont pas tous journalisés. Rejeté (graphique sans action).
- **Timeline unifiée par lead/bien (frise visites+estim+mandats+notes)** — **déjà proposé par Opus 01 (C8)**. Rejeté (doublon inter-opus ; je cède l'angle « frise par entité », je garde la trajectoire de prix C2 qui est un objet distinct).
- **Radar mandats à expiration en action-center** — **déjà Opus 01 (C3)**. Rejeté (doublon) ; ma matrice C5 est sur le **positionnement prix**, pas l'échéance.
- **Score de refroidissement lead/bien (tuile fraîcheur)** — **déjà Opus 01 (C5)**. Rejeté (doublon temporel) ; C5-moi est prix-vs-marché.
- **Agent nocturne de veille baisses de prix** — **déjà Opus 06 (Vigie)** et signal Opus 01 (C6). Je ne propose PAS d'agent ; C2 est la **visualisation** de la même donnée dans la fiche (complémentaire, pas dupliqué).
- **Dashboard analytique séparé (nouveau menu top-level « Stats »)** — nouveau menu non nécessaire, les widgets vivent dans les écrans existants (règle du brief). Rejeté.
- **Carte des acquéreurs (zones de recherche `prosp_criteres_acquereur.zones`)** — `zones` est textuel (communes/codes), pas géocodé en polygones ; mapper une zone de recherche = géocodage flou peu fiable. Rejeté (données non exploitables proprement −15), à réétudier si `zones` devient structuré.
- **Matterport/visite virtuelle 3D embarquée** — aucune intégration, pas de source de tours 3D en base. Rejeté (dépendance externe indispo −15).
- **Comparateur multi-portails (même annonce sur SeLoger+LBC+PAP côte à côte, façon Casafari)** — `duplicate_count`/`hash_dedup` existent mais l'agrégation multi-sources par bien n'est pas assez dense (dépend de MoteurImmo/sources absentes). Rejeté (données partielles −15) ; réétudier quand l'ingestion multi-portails sera large.

---

### Note d'honnêteté data (récapitulatif)
- **Prêt sans rien produire (O)** : C1 (add 2 colonnes au select), C2 (exposer versions déjà écrites), C3 (comparables déjà chargés), C6 (breakdown déjà remonté), C7 (agrégats déjà fetchés — mais cohorte imparfaite, libellé prudent).
- **Nécessite un câblage interne, zéro API payante (P)** : C4 (géocoder `properties` via BAN déjà câblé), C5 (dépend du lien estimation↔bien 0039).
- **Jamais présenté comme dispo ce qui ne l'est pas** : pas de heatmap ville, pas de carte acquéreurs, pas de comparateur multi-portails, pas de Leaflet. Tout candidat s'appuie sur une table/route/fichier cité et vérifié dans le worktree.
