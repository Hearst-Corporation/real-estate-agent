# REA-GAMECHANGER-005 — Opus 02 · Acquisition vendeurs & prospection

> Domaine : détection de vendeurs, signaux faibles, changements de prix, doublons, biens
> retirés/republiés, annonces qui stagnent, opportunités de mandat (PAP), timing de contact.
> Hypothèse testée : **« un changement de prix ou une nouvelle annonce déclenche une opportunité
> visible et actionnable »** → **INFIRMÉE en l'état** : la donnée est capturée (`prosp_annonce_versions`,
> `prix_precedent`, `republication`, `scoreMandat`) mais **rien ne la SURFACE ni ne la transforme en
> action**. C'est un gisement dormant, pas un manque de données. Tous mes candidats exploitent ce gisement.

---

## 1. Synthèse coordinateur

| # | Candidat | Écran | Taille | Score | Données prêtes |
|---|----------|-------|--------|-------|:---:|
| C1 | **Radar mandats** (flux signaux vendeur : baisse prix / stagne / republie / PAP, scoré, priorisé) | `/prospection` → nouvel onglet « Radar » (6ᵉ) | M | **90** | O |
| C2 | **Historique de prix par annonce** (timeline `prosp_annonce_versions` + Δ vs marché DVF) dans le détail | `AnnonceDetailDialog` | S | **86** | O |
| C3 | **Opportunités de mandat sur l'accueil** (tâches `rea_tasks` auto-générées depuis les signaux) | `/` accueil, action center | M | **83** | O |
| C4 | **Détecteur « bien retiré / republié »** (sorties de marché → relance vendeur au bon moment) | `/prospection` Radar + détail | S | **78** | O |
| C5 | **Fusion multi-portail (dédoublonnage inter-source)** — 1 bien = N annonces regroupées | `/prospection` onglet annonces | M | **74** | P |
| C6 | **Écart prix demandé ↔ estimation** sur la liste annonces (flag « surcoté / sous-évalué ») | `/prospection` onglet annonces + détail | S | **72** | O |
| C7 | **Assistant : outils signaux vendeur** (le chat Cockpit sait lister/agir sur les opportunités) | Chat Cockpit (tools) | S | **71** | O |

**Effet business (une ligne)** : l'agent passe d'un mur d'annonces statiques à un **flux d'opportunités
de mandat classées par urgence** (« ce PAP a baissé de 6 % hier, ça fait 52 j qu'il stagne — appelle-le
maintenant »), avec brouillon de contact HITL déjà câblé — l'exact terrain de chasse où Casafari et
MoteurImmo se vendent, ici branché sur des données que le repo **collecte déjà**.

---

## 2. Lecture du terrain (vérifié dans le worktree)

### Ce que j'ai lu (fichier:ligne)
- `supabase/migrations/0040_prospection_industrialization.sql:29-47` — table **`prosp_annonce_versions`**
  (`prix, surface, statut, hash_dedup, snapshot jsonb, observed_at`) + index `(annonce_id, observed_at desc)`.
  **Écrite, jamais lue.**
- `lib/prospection/ingest.ts:98-138` — le versioning FONCTIONNE : à chaque changement de prix, l'ancien
  état est archivé dans `prosp_annonce_versions` avec `statut='baisse'|'hausse'`, et la ligne courante
  reçoit `prix_precedent` + `republication=true` (si baisse). Suivi par identité stable `(source, source_id)`,
  pas par `hash_dedup` (qui bucketise le prix à 5000 €). Solide.
- `lib/prospection/scoring/mandat.ts:14-75` — **`scoreMandat`** calcule un score d'opportunité de mandat
  (0-100) sur 6 facteurs : `pap`, `zone_prioritaire`, `republication_recente`, `description_pap`,
  `anciennete_45j`, `baisse_prix`. Testé (`mandat` présent), presets `api`/`doc` dans `types.ts:61-62`.
  **Zéro consommateur** : `grep scoreMandat` ne renvoie AUCUN import applicatif.
- `app/api/prospection/annonces/route.ts:32,38-40` — la liste `SELECT` inclut `republication` mais **le
  drop** au mapping de sortie (`:51-63` ne le renvoie pas). Commentaire explicite : *« Filtre éligible
  mandat […] Désactivé tant que le scoring n'est pas rebranché »*. Le mort-vivant est reconnu dans le code.
- `lib/prospection/contact.ts` + `app/api/prospection/contact/route.ts:1-381` — **moteur de contact vendeur
  HITL COMPLET** : draft→approved(confirmed:true)→sent, opt-out par hash (`prosp_optout`), fenêtre
  anti-doublon, cap anti-spam/jour, idempotence, mode dégradé (provider absent → jamais `sent`). **La
  plomberie d'action est faite ; il manque le DÉCLENCHEUR (le « pourquoi/quand contacter »).**
- `app/(dashboard)/prospection/_components/AnnonceDetailDialog.tsx:230-274,488-533` — le détail expose déjà
  *Préparer contact (brouillon)*, *Estimer*, *Créer lead+bien*, *Opt-out*, et un `ValuationBlock` qui montre
  « below_range / above_range » **uniquement côté match acquéreur** — pas côté acquisition vendeur.
- `app/api/prospection/history/route.ts:80-112` — l'historique lit `prosp_contact_attempts` (draft/sent).
  Aucune lecture de `prosp_annonce_versions` : l'historique de PRIX n'est nulle part.
- `supabase/migrations/0043_platform_augmented_002.sql:37-59` — **`rea_tasks`** accepte
  `entity_type in (…, 'annonce', 'match', …)`, `priority`, `due_at`, `status` — substrat parfait pour des
  tâches d'opportunité de mandat sur l'accueil (M04-08).
- `lib/agent/tools/prospection.ts:1-55` — l'outil chat prospection couvre critères acquéreur + liste des
  matchs (**côté acheteur**). Aucun outil « lister opportunités de mandat / signaux vendeur / préparer
  relance vendeur ».
- `app/api/inngest/route.ts` + `lib/jobs/inngest/functions` — **Inngest est câblé** (serve() + HMAC) →
  un job planifié (digest quotidien de signaux) est réalisable sans nouvelle infra.
- `app/api/agent-gateway/v1/alerts/prepare/route.ts` + `.../dispatch` — la gateway sait PRÉPARER une alerte
  (contenu déterministe, HITL `agent_alert_approvals`) ; **dispatch = aucun transport branché** (badge
  « Aperçu — envoi non branché » confirmé au brief).

### Matrice de capacités — mon domaine

| Capacité | Statut réel |
|---|---|
| Versioning prix/statut (`prosp_annonce_versions`) | **AVAILABLE persisté, JAMAIS lu** → gisement dormant |
| `prix_precedent` / `republication` sur l'annonce | **AVAILABLE persisté**, non exposé par la route liste |
| Score d'opportunité de mandat (`scoreMandat`) | **AVAILABLE codé + testé, 0 consommateur** |
| Contact vendeur HITL (draft→sent, opt-out, idempotence, dégradé) | **AVAILABLE, complet** |
| Ancienneté / days-on-market (`date_publication`, `age_hours`) | **AVAILABLE** (champ déjà dans l'UI) |
| Estimation d'un bien annonce (`/annonces/[id]/estimate`, moteur DVF) | **AVAILABLE** |
| Bien retiré du marché (`actif=false` posé sur stale) | **AVAILABLE partiel** — posé mais jamais surfacé |
| `rea_tasks` entity annonce/match, Inngest jobs | **AVAILABLE** (substrat action + planif) |
| Dédoublonnage INTRA-source (`hash_dedup`) | **AVAILABLE** ; INTER-source (même bien, 2 portails) = **à construire** |
| Envoi réel email/SMS/WA d'alerte | **CONFIG SEULEMENT** (Resend dispo infra ; transport dispatch non branché) — mes candidats restent DRAFT/HITL |
| Données d'occupation/hypothèque/durée-de-possession (predictive US SmartZip/Offrs) | **UNAVAILABLE en France** — je ne propose RIEN dessus (honnêteté) |
| Couvert M04 | UI densité 5 onglets (**M04-09**), RLS prospection (**M04-03**) — je ne touche ni l'un ni l'autre |

---

## 3. Preuves concurrentielles

| Produit | Capacité observée | URL | Date | Preuve |
|---|---|---|---|---|
| **Casafari** | Alertes : hausses ET baisses de prix, nouvelles entrées, biens **sortis du marché**, biens vendus | casafari.com/insights/gather-more-property-leads-with-casafari-get-to-know-alerts/ | 2026-07-18 | **PROUVÉ** (WebFetch) |
| **Casafari** | Détection **FSBO / vendeurs particuliers** (filtre *Private sellers*) pour générer des leads vendeurs | casafari.com/products/solutions-for-agents/ + insight Alerts | 2026-07-18 | **PROUVÉ** |
| **Casafari** | **Days-on-market** → « understanding which owners need professional help » (biens qui stagnent = cible mandat) | casafari.com/insights/…/get-to-know-alerts/ | 2026-07-18 | **PROUVÉ** |
| **Casafari** | Détection **exclusivité rompue / bien listé par un autre** ; digest **quotidien du matin**, 200 alertes/compte | idem | 2026-07-18 | **PROUVÉ** |
| **MoteurImmo** | **Historique de prix par paliers avec dates**, durée cumulée de publication, préservé même si annonce désactivée/republiée | blog.moteurimmo.fr/historique-des-prix-detecter-les-baisses-significatives-dans-le-temps/ | 2026-07-18 | **PROUVÉ** (WebFetch) |
| **MoteurImmo** | Baisse de prix = signal d'**« une mauvaise estimation initiale »** ou de motivation vendeur accrue | idem | 2026-07-18 | **PROUVÉ** |
| **Castorus / Leemo** | Extensions navigateur (SeLoger, LeBonCoin, Bien'ici, PAP…) : historique d'annonce + variations de prix par semaines | leemo.fr/surveiller-prix-immobilier/ ; alvimmobilier.com/blog/castorus-5-astuces-detecter-baisses-prix-2026/ | 2026-07-18 | **PROUVÉ** (WebSearch, snippet) |
| **SmartZip** | « Seller Score », **72 %** de précision, ~25 sources / des centaines de points → vendeurs probables à **6-12 mois** | smartzip.com/ ; housingwire.com/articles/top-real-estate-lead-generation-companies/ | 2026-07-18 | **PROUVÉ** (WebSearch) |
| **Offrs** | **250+ points/bien** (durée de possession, statut hypothécaire), Seller Score, outreach auto email/mail/ads | aiandrealtors.com/review-offrs | 2026-07-18 | **PROUVÉ** (WebSearch) — mais **données US, indispo France** → hors de portée ici |
| **kvCORE** | Automation comportementale de leads + CRM IA all-in-one | housingwire.com/articles/top-real-estate-lead-generation-companies/ | 2026-07-18 | **PROUVÉ** (WebSearch) |

**Découverte marquante** : Casafari et MoteurImmo **vendent exactement** le flux « baisse de prix + FSBO +
days-on-market + sortie de marché » comme cœur d'acquisition vendeur. Azigo **collecte déjà** ces signaux
(`prosp_annonce_versions`, `prix_precedent`, `is_pap`, `date_publication`, `actif`) mais **ne les montre
nulle part** — c'est un rattrapage concurrentiel à coût quasi nul (lecture + tri de données existantes),
pas une R&D. À l'inverse, le prédictif à la SmartZip/Offrs repose sur des datasets d'occupation/hypothèque
propres au marché US : **je ne le propose pas** (donnée absente = pénalité −15, honnêteté brief §106).

---

## 4. Candidats (format obligatoire + décompte de score)

### C1 — Radar mandats *(le flux de signaux vendeur, scoré et priorisé)* — **90/100** — M

- **Problème métier exact** : l'agent ne sait pas QUELLES annonces représentent une opportunité de mandat
  MAINTENANT. Les signaux (baisse de prix, stagnation, republication, PAP) sont enfouis dans la table
  `prosp_annonces`/`prosp_annonce_versions` sans tri ni mise en avant. Il rate la fenêtre de contact.
- **Utilisateur concerné** : agent immobilier en phase de rentrée de mandats (prospection quotidienne).
- **Moment du parcours** : ouverture de `/prospection` le matin — « qu'est-ce qui a bougé et vaut un appel ? ».
- **Écran/emplacement précis** : `/prospection`, **6ᵉ onglet « Radar »** ajouté à côté des 5 existants
  (annonces / matching / acquéreurs / feedback / historique). Pas de nouveau menu top-level — même page,
  onglet supplémentaire. Frontière avec **M04-09** (densité des 5 onglets EXISTANTS) : C1 = **capacité
  nouvelle** (un flux de signaux vendeur qui n'existe pas), pas du polish d'écran existant.
- **Comportement du widget** : liste triée par **score d'opportunité de mandat** (réutilise `scoreMandat`),
  chaque ligne = annonce + badges de signal (« Baisse −6 % · il y a 1 j », « Stagne 52 j », « Republié »,
  « PAP ») + prix actuel + Δ prix précédent. Filtres : type de signal, code postal, ancienneté, PAP-only.
- **Action disponible** : ouvrir le détail (`AnnonceDetailDialog` existant) → *Préparer contact (brouillon)*,
  *Estimer*, *Créer lead+bien*, *Opt-out* — tous déjà câblés. Bouton « Créer une tâche d'appel » (→ C3).
- **Automatisation éventuelle** : un job Inngest quotidien recalcule les scores après l'ingestion et
  alimente le Radar (pré-calcul). Aucun envoi automatique.
- **Étape de validation humaine** : aucun contact déclenché par le Radar ; toute prise de contact passe par
  le flux `confirmed:true` HITL existant (`contact/route.ts:203-231`). Le Radar ne fait qu'AFFICHER.
- **Données nécessaires** : score par facteur, prix courant + précédent, `is_pap`, `date_publication`, statut.
- **Données DÉJÀ dispo (repo)** : `prosp_annonces` (`prix, prix_precedent, republication, is_pap,
  date_publication, actif, code_postal`) + `prosp_annonce_versions` (`statut, prix, observed_at`) +
  `scoreMandat` (`lib/prospection/scoring/mandat.ts`) + presets (`types.ts:61`). **Tout présent.**
- **Données manquantes** : aucune bloquante. (`config` de seuils par tenant → `prosp_config` existe déjà.)
- **Routes/tables/composants concernés** : nouvelle route `GET /api/prospection/opportunites` (lit annonces +
  versions, applique `scoreMandat`, trie) ; nouvel onglet + `<RadarPanel/>` dans
  `app/(dashboard)/prospection/` ; réutilise `AnnonceDetailDialog`.
- **Dépendances externes** : aucune (données déjà ingérées via Apify/scrape-custom).
- **Taille** : **M** (3-5 j) — 1 route de lecture + tri, 1 panneau, rebranchement `scoreMandat`, badges.
- **Risques** : qualité des scores dépend de la fraîcheur d'ingestion (mitigé : afficher `observed_at`) ;
  faux positifs sur `republication` si la source republie sans changement réel (mitigé : croiser avec Δ prix).
- **Preuve concurrentielle** : Casafari (alertes baisse/hausse + FSBO + days-on-market « which owners need
  professional help »), MoteurImmo (baisse = mauvaise estimation initiale / motivation). PROUVÉ.
- **Scénario de démo** : ouvrir Radar → top ligne « Appartement PAP 75011, baisse −18 000 € (−6 %) hier,
  en ligne depuis 51 j » score 88 → clic → détail → *Préparer contact (brouillon)* → message pré-rempli,
  non envoyé (badge brouillon). 30 s, sans aucune donnée fabriquée.
- **Indicateur de succès** : nb d'opportunités ouvertes → contacts brouillon créés → leads rattachés
  (`prosp_annonces.lead_id`) par semaine ; taux de conversion signal→mandat.

**Décompte** : impact business **24**/25 (rentrée de mandat = cœur du CA agent) · utilité quotidienne
**20**/20 (usage matinal) · effet démontrable **15**/15 (flux visible immédiat) · avantage agentique
**12**/15 (scoring + pré-calcul Inngest, mais l'action reste humaine) · faisabilité **15**/15 (tout existe) ·
disponibilité données **10**/10. Pénalités : **0** (pas de refonte, pas d'infra, données présentes, aucun
contact non consenti). **Total 96 brut → 90** après décote de prudence sur avantage agentique/qualité signal.

---

### C2 — Historique de prix par annonce *(timeline + Δ marché)* — **86/100** — S

- **Problème métier exact** : quand l'agent regarde une annonce, il ne voit qu'un prix instantané. Il ne
  sait pas si le prix a déjà baissé 2 fois, depuis combien de temps, ni comment il se situe vs le marché DVF.
  Il ne peut pas argumenter « votre bien a déjà baissé, republions avec une estimation pro ».
- **Utilisateur concerné** : agent en préparation d'appel/RDV de rentrée de mandat.
- **Moment du parcours** : détail d'une annonce (depuis annonces OU Radar).
- **Écran/emplacement précis** : `AnnonceDetailDialog` (composant EXISTANT), nouvelle section « Historique
  de prix » sous les données normalisées. Extension d'un écran couvert par **M04-09/M04-10**, mais capacité
  NOUVELLE (la timeline de prix n'existe pas) — pas de la densité.
- **Comportement du widget** : mini-timeline verticale des lignes `prosp_annonce_versions` (prix, date,
  hausse/baisse), + le prix courant, + Δ total depuis publication, + (si estimation dispo) badge
  « surcoté +8 % / dans le marché / sous le marché » vs valeur DVF (réutilise le moteur d'estimation).
- **Action disponible** : boutons existants du dialog (Estimer, Contact brouillon) contextualisés par
  l'historique (« proposer une ré-estimation »).
- **Automatisation éventuelle** : aucune (lecture pure). L'archivage est déjà automatique à l'ingestion.
- **Étape de validation humaine** : n/a (affichage). Toute action reste HITL.
- **Données nécessaires** : lignes de versions + estimation optionnelle du bien.
- **Données DÉJÀ dispo (repo)** : `prosp_annonce_versions` (`prix, statut, observed_at`, index
  `annonce_id, observed_at desc` — 0040:44), `prix_precedent`, moteur `/api/prospection/annonces/[id]/estimate`.
- **Données manquantes** : aucune.
- **Routes/tables/composants** : `GET /api/prospection/annonces/[id]/versions` (nouvelle, lit la table) +
  section dans `AnnonceDetailDialog.tsx`. Optionnel : réutiliser `estimate` pour le Δ marché.
- **Dépendances externes** : aucune.
- **Taille** : **S** (1-2 j) — 1 route de lecture + 1 section UI + timeline légère.
- **Risques** : peu de lignes de versions au début (base jeune) → afficher un état vide honnête
  (« pas encore de changement observé »).
- **Preuve concurrentielle** : MoteurImmo (historique par paliers avec dates), Castorus (variations
  hebdo). PROUVÉ.
- **Scénario de démo** : ouvrir un bien qui a baissé 2×→ timeline « 349 000 → 335 000 (−4 %, 12 j) →
  319 000 (−4,8 %, hier) » + badge « surcoté +6 % vs DVF ». Argument d'appel prêt.
- **Indicateur de succès** : % d'ouvertures de détail affichant ≥1 version ; corrélation
  timeline-consultée → contact créé.

**Décompte** : impact **20**/25 · utilité **17**/20 · effet démontrable **14**/15 (timeline très parlante) ·
agentique **10**/15 (peu d'auto, surtout affichage) · faisabilité **15**/15 · données **10**/10.
Pénalités : 0. **Total 86.**

---

### C3 — Opportunités de mandat sur l'accueil *(tâches auto depuis signaux)* — **83/100** — M

- **Problème métier exact** : l'agent ne revient pas forcément dans `/prospection` chaque jour ; les
  opportunités de mandat les plus chaudes devraient remonter à l'accueil, là où il commence sa journée.
- **Utilisateur concerné** : agent, sur son écran d'accueil (hiérarchie urgent→aujourd'hui→ensuite).
- **Moment du parcours** : ouverture de `/` le matin.
- **Écran/emplacement précis** : `/` accueil, **action center existant** (`rea_tasks`). Frontière avec
  **M04-08** (qui construit la hiérarchie de l'accueil + action center) : M04-08 fait le CONTENANT ; C3
  fournit une **SOURCE de tâches nouvelle** (opportunités de mandat détectées), qui n'existe pas —
  capacité, pas densité. À coordonner avec M04-08 pour ne pas dupliquer le rendu.
- **Comportement du widget** : un job Inngest quotidien, après ingestion, sélectionne les annonces à score
  d'opportunité ≥ seuil et **insère des `rea_tasks`** (`entity_type='annonce'`, `kind='appel'`,
  `priority='haute'` si signal fort, `title` = « Opportunité mandat : baisse −6 % · PAP 75011 »),
  idempotent (une tâche par annonce/jour, dédoublonnée sur `entity_id`).
- **Action disponible** : depuis la tâche → lien vers le détail annonce → contact brouillon / estimer /
  créer lead (câblés). Marquer done/snooze (déjà supporté par `rea_tasks.status`).
- **Automatisation éventuelle** : **génération** de tâche automatique (mutation NON sensible : crée une
  tâche interne, aucun contact externe) — cohérent avec CLAUDE.md « mutations simples sans confirmation ».
- **Étape de validation humaine** : la tâche est une SUGGESTION ; aucun message externe. Le contact reste
  HITL `confirmed:true`. L'agent peut snoozer/fermer.
- **Données nécessaires** : score d'opportunité + `rea_tasks`.
- **Données DÉJÀ dispo (repo)** : `rea_tasks` (`entity_type` accepte `'annonce'` — 0043:42 ;
  `priority`, `due_at`, `status`, index de scope 0043:57), `scoreMandat`, Inngest (`app/api/inngest`).
- **Données manquantes** : aucune. Seuil de génération → `prosp_config`.
- **Routes/tables/composants** : fonction Inngest `prospection/daily-opportunities` (lib/jobs/inngest/functions)
  + insertion `rea_tasks` ; rendu par le composant action center de l'accueil (M04-08).
- **Dépendances externes** : aucune (Inngest déjà câblé + `INNGEST_SIGNING_KEY` en infra).
- **Taille** : **M** (3-5 j) — job + logique de sélection idempotente + coordination affichage M04-08.
- **Risques** : sur-génération de tâches (bruit) → cap quotidien + seuil configurable + dédup stricte sur
  `entity_id`. Dépendance de séquencement avec M04-08 (mitigé : n'insère que des données, ne code pas l'UI).
- **Preuve concurrentielle** : Offrs/SmartZip poussent des « Seller Score leads » dans le CRM agent ;
  Casafari envoie un digest matinal. Ici, version HITL, sans dataset US. PROUVÉ (analogie de flux).
- **Scénario de démo** : lancer le job manuellement → l'accueil affiche « 3 opportunités de mandat » en
  priorité haute → clic → détail → brouillon de contact. Aucun envoi.
- **Indicateur de succès** : nb de tâches d'opportunité créées vs traitées (done) ; délai
  signal→premier contact ; part des mandats rentrés issus d'une tâche Radar.

**Décompte** : impact **23**/25 · utilité **18**/20 · effet démontrable **13**/15 · agentique **14**/15
(job autonome + génération de tâche) · faisabilité **13**/15 (coordination M04-08, idempotence à soigner) ·
données **10**/10. Pénalités : 0 (la génération de tâche interne n'est pas un contact non consenti).
**Total 91 brut → 83** après décote sur dépendance de séquencement M04-08.

---

### C4 — Détecteur « bien retiré / republié » — **78/100** — S

- **Problème métier exact** : un bien qui **disparaît** d'un portail (retiré) = vente conclue ailleurs OU
  vendeur découragé (opportunité de mandat déçu) ; un bien **republié** après retrait = nouveau départ
  (fenêtre de contact). L'agent ne voit ni l'un ni l'autre : `actif=false` est posé silencieusement.
- **Utilisateur concerné** : agent en veille de secteur.
- **Moment du parcours** : Radar / détail annonce.
- **Écran/emplacement précis** : ligne/badge dans le Radar (C1) + section dans `AnnonceDetailDialog`.
  Capacité nouvelle, aucun recoupement M04.
- **Comportement du widget** : détecte les transitions d'état à l'ingestion (présent→absent = « retiré » ;
  absent→présent = « republié »), archivées dans `prosp_annonce_versions.statut`. Badge « Retiré du marché
  il y a X j » / « Republié » + date.
- **Action disponible** : sur « retiré », suggérer une tâche de relance vendeur (« le bien a disparu —
  était-ce vous ? proposition d'accompagnement ») en brouillon HITL ; sur « republié », prioriser le contact.
- **Automatisation éventuelle** : marquage automatique du statut à l'ingestion (déjà partiellement fait via
  `actif=false` — `ingest.ts:150-161`) ; il faut ARCHIVER la transition + la surfacer.
- **Étape de validation humaine** : contact toujours HITL. Respect `prosp_optout`.
- **Données nécessaires** : transitions d'état + horodatage.
- **Données DÉJÀ dispo (repo)** : `prosp_annonces.actif` (posé 0040), `prosp_annonce_versions.statut`
  (colonne libre : ajouter `'retiree'|'republiee'` — pas de contrainte CHECK sur `statut`, extensible).
- **Données manquantes** : rien de bloquant (il faut détecter l'absence à l'ingestion — comparer
  l'ensemble ingéré au set actif précédent par source ; l'`ingest.ts` charge déjà l'état existant :51-96).
- **Routes/tables/composants** : logique de transition dans `lib/prospection/ingest.ts` (extension) +
  lecture par la route versions (C2) + badges Radar/dialog.
- **Dépendances externes** : aucune.
- **Taille** : **S** (1-2 j) — extension de la détection à l'ingestion + surfaçage.
- **Risques** : « retiré » peut être un simple hoquet de scraping (annonce non revue ce run) → n'affirmer
  « retiré » qu'après N runs sans revoir l'annonce (fenêtre de confiance). Éviter le faux positif d'urgence.
- **Preuve concurrentielle** : Casafari (« properties removed from the market », alertes de sortie de
  marché), MoteurImmo (historique préservé même si désactivé/republié). PROUVÉ.
- **Scénario de démo** : Radar → filtre « Retirés cette semaine » → « Maison 78, retirée il y a 3 j après
  61 j en ligne » → tâche de relance brouillon.
- **Indicateur de succès** : nb de « retirés/republiés » détectés → contacts brouillon → mandats
  reconquis ; précision de la détection (faux positifs < seuil).

**Décompte** : impact **18**/25 · utilité **15**/20 · effet démontrable **13**/15 · agentique **11**/15 ·
faisabilité **13**/15 (détection d'absence fiable = le point délicat) · données **9**/10 (statut à archiver).
Pénalités : 0. **Total 79 brut → 78.**

---

### C5 — Fusion multi-portail (dédoublonnage inter-source) — **74/100** — M

- **Problème métier exact** : le même bien est diffusé sur plusieurs portails (SeLoger + LeBonCoin + PAP…)
  → l'agent voit N annonces pour 1 bien, croit à N opportunités, perd du temps, et ne repère pas qu'un PAP
  est aussi mandaté ailleurs (signal de vendeur multi-canal = motivé). Le dédup ACTUEL est **intra-source**
  (`hash_dedup` par `tenant_id,hash_dedup`), pas **inter-source**.
- **Utilisateur concerné** : agent sur l'onglet annonces.
- **Moment du parcours** : parcours de la liste d'annonces.
- **Écran/emplacement précis** : onglet annonces EXISTANT — regroupement visuel « 1 bien · 3 annonces ».
  Frontière **M04-09** : M04-09 densifie l'affichage ; C5 apporte une **capacité de regroupement** (donnée
  dérivée nouvelle), pas du polish.
- **Comportement du widget** : clef de similarité (surface ± tolérance + prix ± bucket + code postal +
  type) regroupe les annonces cross-source ; carte « bien » avec sources multiples et le meilleur prix.
- **Action disponible** : contact/estimation au niveau du bien groupé ; badge « diffusé sur 3 portails ».
- **Automatisation éventuelle** : calcul de la clef de regroupement à l'ingestion.
- **Étape de validation humaine** : n/a (regroupement d'affichage). Contact HITL.
- **Données nécessaires** : clef de similarité robuste.
- **Données DÉJÀ dispo (repo)** : `prosp_annonces` (surface, prix, code_postal, type_bien, source),
  `hash_dedup` (bucket prix 5000 € déjà en place — base de la clef).
- **Données manquantes** : une clef inter-source fiable (heuristique à définir/valider — risque de
  faux-groupes) → **P** (partiel). Idéalement une colonne `groupe_bien_id` calculée.
- **Routes/tables/composants** : logique de clustering dans `lib/prospection/` + colonne dérivée ou
  regroupement à la lecture dans `annonces/route.ts` + rendu groupé.
- **Dépendances externes** : aucune.
- **Taille** : **M** (3-5 j) — heuristique de similarité + validation anti-faux-positif + rendu.
- **Risques** : faux regroupements (2 biens voisins quasi identiques) — d'où le score plus bas ; nécessite
  du réglage. Ne PAS fusionner agressivement (garder les annonces sources visibles).
- **Preuve concurrentielle** : Casafari/Yanport/Realyse se vendent sur l'agrégation dé-doublonnée
  multi-portail (Casafari : « Every Property, Every Detail », détection multi-brokers). PROUVÉ (Casafari) /
  INFÉRÉ (Yanport/Realyse : pages non atteintes par WebFetch, croisé WebSearch — dit honnêtement).
- **Scénario de démo** : liste → « Appartement 68 m² 75018 · diffusé sur SeLoger + LeBonCoin + PAP · prix
  min 412 000 € » au lieu de 3 lignes.
- **Indicateur de succès** : taux de regroupement, précision (faux-groupes signalés), réduction du nb de
  lignes redondantes.

**Décompte** : impact **17**/25 · utilité **16**/20 · effet démontrable **12**/15 · agentique **8**/15
(peu agentique, surtout data) · faisabilité **12**/15 · données **7**/10 (clef inter-source à construire).
Pénalités : **−0** mais notation prudente sur qualité de clef. **Total 72 brut → 74** (léger rehaussement :
capacité différenciante et concurrentiellement prouvée). *Reste le plus risqué de la shortlist.*

---

### C6 — Écart prix demandé ↔ estimation sur la liste annonces — **72/100** — S

- **Problème métier exact** : l'agent ne sait pas, en balayant les annonces, lesquelles sont **surcotées**
  (→ vendeur bientôt contraint de baisser = futur mandat) ou **sous-évaluées**. Le `ValuationBlock` existe
  mais **seulement côté match acquéreur**, pas comme flag d'acquisition vendeur sur la liste.
- **Utilisateur concerné** : agent en repérage d'opportunités de mandat.
- **Moment du parcours** : onglet annonces + Radar.
- **Écran/emplacement précis** : badge sur `AnnonceCard` (page prospection) + section détail. Extension
  d'écran couvert par M04-09, mais capacité nouvelle (flag prix vs marché côté vendeur).
- **Comportement du widget** : pour les annonces estimables, calcule Δ (prix demandé − valeur DVF) →
  badge « Surcoté +9 % » / « Dans le marché » / « Sous le marché ». Priorise les « surcotés depuis
  longtemps » comme cibles de mandat (croise avec anciennité).
- **Action disponible** : *Estimer* (déjà câblé) → matérialise le Δ ; *Préparer contact* argumenté.
- **Automatisation éventuelle** : estimation à la demande (route existante) ou pré-calcul batch pour les
  annonces prioritaires (coûteux → limiter au top Radar).
- **Étape de validation humaine** : n/a (affichage) ; contact HITL.
- **Données nécessaires** : estimation par bien.
- **Données DÉJÀ dispo (repo)** : moteur d'estimation complet (`lib/estimation/`, DVF/ADEME/cadastre),
  `POST /api/prospection/annonces/[id]/estimate` (existe), `ValuationBlock` (logique de Δ déjà écrite,
  `AnnonceDetailDialog.tsx:488-533`).
- **Données manquantes** : rien de bloquant. Coût de calcul si généralisé (mitigé : cibler top Radar).
- **Routes/tables/composants** : réutilise `estimate` ; badge dans `AnnonceCard` + réemploi `ValuationBlock`
  hors contexte match.
- **Dépendances externes** : aucune (moteur DVF local).
- **Taille** : **S** (1-2 j) — réemploi du bloc Δ + badge liste + gestion du coût de calcul.
- **Risques** : estimer chaque annonce à la volée est coûteux → ne l'appliquer qu'aux annonces prioritaires
  (ou sur demande). Confiance d'estimation variable → afficher `low_confidence` honnêtement.
- **Preuve concurrentielle** : MoteurImmo relie explicitement baisse de prix ↔ « mauvaise estimation
  initiale » ; PriceHubble/Meilleurs Agents Pro vendent le positionnement prix vs marché. PROUVÉ (MoteurImmo).
- **Scénario de démo** : onglet annonces → badge « Surcoté +11 % » sur un bien en ligne depuis 60 j →
  détail → estimation DVF → contact argumenté brouillon.
- **Indicateur de succès** : nb d'annonces flaggées surcotées → estimations générées → contacts → mandats.

**Décompte** : impact **18**/25 · utilité **15**/20 · effet démontrable **13**/15 · agentique **9**/15 ·
faisabilité **13**/15 (coût de calcul) · données **9**/10. Pénalités : 0. **Total 77 brut → 72** (décote sur
coût d'estimation à généraliser).

---

### C7 — Assistant : outils signaux vendeur *(le chat sait agir sur les opportunités)* — **71/100** — S

- **Problème métier exact** : le chat Cockpit sait gérer critères/matchs (**côté acheteur**) mais ne sait
  PAS répondre à « quelles opportunités de mandat aujourd'hui ? » ni « prépare un contact pour cette
  annonce » — alors que toute la donnée et le moteur de contact HITL existent.
- **Utilisateur concerné** : agent qui pilote sa journée par le chat.
- **Moment du parcours** : conversation Cockpit, n'importe quand.
- **Écran/emplacement précis** : chat Cockpit (registre d'outils `lib/agent/tools/`). Aucun écran nouveau.
  Aucun recoupement M04.
- **Comportement du widget** : 2 nouveaux tools — `list_mandate_opportunities` (lecture : top annonces
  scorées `scoreMandat`, filtres cp/pap/signal) et `prepare_seller_contact` (crée un **brouillon**
  `prosp_contact_attempts` via la route `/api/prospection/contact` avec `confirmed:false`).
- **Action disponible** : réponse listée + création de brouillon ; jamais d'envoi.
- **Automatisation éventuelle** : le modèle enchaîne lecture→brouillon sur demande explicite de l'agent.
- **Étape de validation humaine** : `prepare_seller_contact` est **borné à `confirmed:false`** (brouillon
  seul) — comme la doctrine HITL du repo. Un envoi réel resterait une action UI humaine séparée. Respect
  `prosp_optout` hérité de la route.
- **Données nécessaires** : les mêmes que C1.
- **Données DÉJÀ dispo (repo)** : `scoreMandat`, `prosp_annonces`, route `/api/prospection/contact`
  (HITL complet), pattern d'outil (`lib/agent/tools/prospection.ts`, `registry.ts`).
- **Données manquantes** : aucune.
- **Routes/tables/composants** : 2 entrées dans `lib/agent/tools/prospection.ts` + `registry.ts` ;
  réutilise routes existantes. Owner-check user+tenant hérité.
- **Dépendances externes** : OpenAI (déjà le moteur du chat).
- **Taille** : **S** (1-2 j) — 2 tools + schémas Kimi-safe + tests.
- **Risques** : borne stricte à respecter (jamais `confirmed:true` par un tool) — garde-fou dur dans
  l'`execute()` du tool (comme `delete_lead`). Prompt injection sur données annonce (déjà traité : données
  métier = non fiables).
- **Preuve concurrentielle** : kvCORE/Lofty poussent des assistants IA qui agissent sur les leads ; ici
  version bornée HITL sur l'acquisition vendeur. PROUVÉ (kvCORE all-in-one AI CRM) / INFÉRÉ (portée exacte).
- **Scénario de démo** : « quelles opportunités de mandat à Lyon 6 aujourd'hui ? » → top 3 scorées →
  « prépare un contact WhatsApp pour la 1ʳᵉ » → brouillon créé (non envoyé, badge).
- **Indicateur de succès** : nb d'appels aux 2 tools ; brouillons créés via chat → conversions.

**Décompte** : impact **16**/25 · utilité **15**/20 · effet démontrable **12**/15 (démo chat parlante) ·
agentique **15**/15 (cœur agentique, borné HITL) · faisabilité **13**/15 · données **10**/10.
Pénalités : 0. **Total 81 brut → 71** (décote : dépend de C1 pour la valeur du scoring ; sans Radar, le
list-tool est moins utile — synergie mais dépendance).

---

## 5. Idées rejetées

- **Prédiction de vendeurs à 6-12 mois type SmartZip/Offrs (Seller Score sur occupation/hypothèque)** —
  données de propriété US (durée de possession, statut hypothécaire, 250 pts/bien) **INDISPONIBLES en
  France** dans ce repo (aucun MLS, aucun dataset cadastral d'occupation). Pénalité −15 données absentes.
  Malhonnête à promettre (brief §106). *Rejeté.*
- **Envoi automatique d'alertes de baisse de prix par SMS/WhatsApp au vendeur** — transport `dispatch`
  **non branché** (badge « Aperçu »), et surtout **contact non consenti** = pénalité −20 RGPD. Le repo
  interdit tout envoi non-HITL. *Rejeté* (mes candidats restent brouillon/HITL).
- **Densification/relooking des 5 onglets prospection existants** — = **M04-09** exactement. Duplication →
  élimination immédiate. *Rejeté.*
- **RLS / matrice de permissions prospection** — = **M04-03**. *Rejeté.*
- **Câblage `leads.financement` côté acquéreur** — = **M04-06**. Hors domaine + duplication. *Rejeté.*
- **Extension navigateur type Castorus (scraper SeLoger/LeBonCoin côté client)** — nouvelle surface
  (extension Chrome), hors périmètre desktop/web, infra majeure −20, et l'ingestion Apify serveur couvre
  déjà la collecte. *Rejeté.*
- **Scoring prédictif ML maison sur les signaux** — au-delà d'`scoreMandat` (pondération transparente),
  un modèle entraîné = R&D longue, boîte noire, données d'entraînement absentes. XL déguisé, non
  démontrable en 48 h/7 j/21 j. *Rejeté* (le scoring pondéré existant suffit à la démo).
- **Détection d'exclusivité rompue (bien mandaté à moi listé ailleurs)** façon Casafari — dépend d'un
  référentiel « mes mandats ↔ annonces portails » à apparier finement ; intéressant mais faisabilité
  incertaine sans clef inter-source fiable (dépend de C5). *Reporté*, pas retenu en shortlist (sous 70).
- **Alerte concurrentielle (suivre le portefeuille d'une agence rivale)** — Casafari le fait, mais faible
  utilité quotidienne pour un agent solo français vs la rentrée de mandat, et nécessite d'identifier les
  agences par annonce (donnée partielle). Sous 70. *Rejeté.*

---

### Note d'honnêteté
Aucune donnée ni intégration présentée comme disponible ne l'est à tort : `prosp_annonce_versions`,
`prix_precedent`, `republication`, `scoreMandat`, `rea_tasks(annonce)`, Inngest, moteur d'estimation et
route de contact HITL sont **tous vérifiés dans le worktree** (chemins cités). Les seules zones « P » sont
la clef de regroupement inter-source (C5) et l'archivage explicite des transitions retiré/republié (C4) —
signalées comme telles. Le transport d'envoi réel reste hors périmètre (CONFIG) : **tout contact demeure
brouillon/HITL**, `prosp_optout` respecté par construction.
