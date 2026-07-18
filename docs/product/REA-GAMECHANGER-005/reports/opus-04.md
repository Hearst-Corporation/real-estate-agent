# REA-GAMECHANGER-005 — OPUS 04
## Domaine : Estimation → Conversion en mandat (ce qui se passe APRÈS que l'estimation est produite et partagée)

> Angle : je ne touche pas au calcul de valeur (moteur `valuation.ts`, durci par M04-12), ni au polish du parcours estimation
> mobile / continuité de base (M04-10). Je m'attaque à la **conversion commerciale** : rendre visible et travaillable le tunnel
> estimation → propriétaire → mandat signé, tracker l'engagement sur la brochure partagée, exploiter la dérive de marché comme
> prétexte de relance, et boucler la boucle estimation ↔ prix de vente effectif. Tout est vérifié dans le worktree (chemins cités).

---

## 1. Synthèse coordinateur

| # | Candidat | Écran | Taille | Score | Données prêtes | Effet business en une ligne |
|---|----------|-------|--------|-------|:---:|-----------------------------|
| 1 | **Radar d'ouverture de brochure** (tracking + « appelle maintenant ») | ValuationHero (bouton Partager) + Accueil action center | M | **88** | P | Sait QUAND le vendeur ouvre l'avis de valeur → relance à chaud, standard Cloud CMA absent ici |
| 2 | **Veille de valeur & prétexte de relance** (dérive marché sur estimations « à relancer ») | ContinuityPanel + `/estimations` + action center | M | **84** | O | Chaque estimation dormante redevient un motif d'appel daté (« +2,1 % depuis mars ») — le moteur Homebot du marché FR |
| 3 | **Pipeline de conversion estimation→mandat** (vue portefeuille travaillable) | `/estimations` (onglet/vue « Conversion ») | M | **82** | O | Rend visible le tunnel : combien d'avis partagés, combien de mandats, où ça bloque, taux de conversion |
| 4 | **Dossier de rendez-vous mandat** (argumentaire + pièces générés) | ContinuityPanel (bloc « Préparer le RDV mandat ») | M | **79** | O | Transforme l'avis de valeur en support d'entretien mandat : prix, comparables, stratégie, checklist pièces |
| 5 | **Boucle prix conseillé ↔ prix de vente effectif** (calibration honnêteté) | Fiche bien `/properties/[id]` + `/estimations` | S | **74** | P | Compare l'estimation au prix de mise en vente et au réalisé → preuve chiffrée de fiabilité, argument anti-surestimation |
| 6 | **Engagement multi-destinataires de l'avis** (qui, combien de fois, quelle page) | ValuationHero + brochure PDF | S | **72** | P | Un vendeur qui rouvre 4× = signal d'intention chaud ; extension directe du #1 |

Légende « Données prêtes » : O = tout en base aujourd'hui · P = partiel (1 table/colonne à ajouter, données sources présentes) · N = absent.

Shortlist ≥70 : **6 candidats**. Aucun ne duplique une mission M04 (frontières citées candidat par candidat). Tous respectent : communication en brouillon/HITL, RGPD `prosp_optout`, action agentique via la gateway EXISTANTE, honnêteté des données.

---

## 2. Lecture du terrain

### 2.1 Ce que j'ai vérifié (fichiers / lignes)

| Élément vérifié | Fichier | Constat |
|---|---|---|
| Token de partage brochure | `lib/estimation/share.ts` (l.26-57) | **Stateless** : simple JWT signé `{ eid, exp }` (HS256, 30 j). Aucune écriture DB à la signature. |
| Page publique brochure | `app/brochure/[token]/page.tsx` (l.18-82) | Sert le PDF en iframe. **Aucune instrumentation d'ouverture** : pas de ping, pas d'insert. `noindex`. |
| PDF public | `app/api/brochure/[token]/pdf/route.ts` (l.28-118) | Sert le PDF (cache R2 ou re-render). **Aucun log de vue** — hook idéal pour un « ping d'ouverture ». |
| Continuité estimation→mandat | `lib/estimation/continuity.ts` (l.124-216) | Colonnes 0043 : `owner_lead_id`, `decision` (5 valeurs), `next_action`, `manual_adjustments`. Owner-check partout. |
| UI continuité | `app/(dashboard)/estimations/_components/ContinuityPanel.tsx` | Pipeline 4 jalons (estimation→proprio→opportunité→décision), attache proprio, crée mandat brouillon, décision, ajustements manuels. **C'est le socle M04-10 — je bâtis DESSUS.** |
| Création mandat depuis estimation | `app/api/estimations/[id]/mandate/route.ts` (l.45-175) | Crée `properties` (si absente) + `mandates` status `brouillon`, prix = `recommendedListingPrice`. Lie `estimation.property_id`. |
| Rattachement propriétaire | `app/api/estimations/[id]/owner/route.ts` | Crée/lie un lead `kind=vendeur`, `source=estimation`. Écrit `owner_lead_id`. |
| PATCH suivi | `app/api/estimations/[id]/route.ts` (l.87-174) | Décision, next_action, ajustements manuels tracés (auteur+date). |
| Partage + email | `app/api/estimations/[id]/share/route.ts` (l.32-127) | Signe le token, renvoie `shareUrl`, envoie via **Resend** si email + clé (best-effort). |
| Bouton Partager (montage) | `app/(dashboard)/estimations/_components/ValuationHero.tsx` (l.46-59, 249) | `handleShare` → copie l'URL. **Point d'ancrage du radar d'ouverture.** |
| Index prix temporel | `lib/estimation/price-index.ts` (l.18-46) | `NATIONAL_INDEX` déterministe base 100=T1-2020 → **T2-2026 = 122,6**. Offline, aucune API. **Substrat de la veille de valeur.** |
| Schéma estimations | `supabase/migrations/0007_estimations.sql`, `0038`, `0039`, `0043` | `market_value`, `recommended_price`, `property_id`, `insee_code`, `postal_code`, `valued_at`, `owner_lead_id`, `decision`. |
| Schéma properties/mandates | `supabase/migrations/0008_crm.sql` (l.7-115) | `properties.status ∈ {…en_vente, sous_offre, vendu…}`, `asking_price`, `estimated_value`, `estimation_id`. `mandates.status ∈ {brouillon…realise}`, `asking_price`. **Pas de colonne prix de vente réalisé.** |
| Action center | `lib/actions/derive.ts` (l.276-297, 354-370) | Dérive déjà `proprietaire` (leads vendeur à rappeler) et `mandat` (brouillon). Seuils `RELANCE_STALE_DAYS=7`. |
| Tâches persistées | `app/api/tasks/route.ts` (l.65-195) | POST crée `rea_tasks` avec `entity_type=estimation`, owner-check, Zod. **Canal d'écriture pour relances/reprice datées.** |
| Historique annonces (pige) | `supabase/migrations/0040_...` (l.31-47) | `prosp_annonce_versions(prix, statut, observed_at)` = historique prix des annonces piochées. Sépare du mandat mais matchable par adresse. |

### 2.2 Matrice de capacités — MON domaine (conversion post-estimation)

| Capacité | État | Preuve worktree |
|---|---|---|
| Continuité estimation→proprio→mandat (jalons, décision, next_action) | **AVAILABLE persisté** (M04-10) | `continuity.ts`, `ContinuityPanel.tsx`, migration 0043 |
| Création mandat brouillon + fiche bien depuis estimation | **AVAILABLE persisté** | `[id]/mandate/route.ts` |
| Partage brochure signée + envoi email (Resend) | **AVAILABLE persisté** | `share.ts`, `[id]/share/route.ts` |
| Contexte marché (recherche web, hors prix) | **AVAILABLE persisté** (cost-guard) | `[id]/market-context/route.ts` |
| Index prix temporel national déterministe | **AVAILABLE sous-exploité** (jamais rejoué post-estimation) | `price-index.ts` `NATIONAL_INDEX` |
| Tâches persistées + action center (proprio/mandat) | **AVAILABLE persisté** | `derive.ts`, `tasks/route.ts` |
| **Tracking d'ouverture de la brochure partagée** | **UNAVAILABLE — nouvelle table minuscule requise** | share stateless, aucune instrumentation dans `brochure/[token]/pdf` |
| **Vue portefeuille de conversion (tunnel + taux)** | **UNAVAILABLE UI — données 100 % présentes** | `/estimations/page.tsx` = simple table statut |
| **Dérive de valeur comme prétexte de relance daté** | **UNAVAILABLE — recompose des données présentes** | `market_value` + `valued_at` + `NATIONAL_INDEX` |
| **Dossier RDV mandat (argumentaire + pièces)** | **UNAVAILABLE — recompose valuation existante** | `valuation.ts` payload complet déjà en base |
| **Prix conseillé ↔ prix réalisé (calibration)** | **UNAVAILABLE — 1 colonne `sold_price` à ajouter** | `properties` a `asking_price`/`estimated_value`/statut `vendu`, PAS le réalisé |
| Envoi SMS/WhatsApp au vendeur | **CONFIG seulement** (aucun transport branché) | brief §CONFIG ; je reste en brouillon/email |
| Frontière M04-10 (UI mobile + continuité base) | **couvert M04** — je n'y touche pas | — |
| Frontière M04-12 (providers/provenance/PDF/partage durci) | **couvert M04** — je m'appuie dessus | — |

**Fait exploité honnêtement (brief) :** il n'existe **pas** de `lead_id` acheteur sur `estimations`. En revanche `owner_lead_id` (vendeur) **existe** (0043) et est le pivot de toute ma conversion. Je ne prétends jamais un lien acheteur↔estimation.

---

## 3. Preuves concurrentielles

| Produit | Capacité observée | URL | Date | Prouvé / Inféré |
|---|---|---|---|---|
| Cloud CMA | Notification quand un rapport CMA est **ouvert/vu** ; conseil « call within an hour of the view notification » | ustechautomations.com/resources/blog/real-estate-cma-market-reports-comparison-2026 ; marketleader.com/blog/what-is-a-cma-in-real-estate | 2026-07-18 | **Prouvé** (synthèse de recherche ; homepage cloudcma.com JS-lourde n'a pas reconfirmé mot pour mot → dit honnêtement) |
| Homebot | « Home Digest » mensuel valeur+équité ; **75 % d'ouverture** (vs ~20 % marché) ; « one of the most common ways past clients turn into listing appointments » ; **3-5 seller leads / 100 contacts / mois** ; « Likelihood to Sell Score » (89 % des ventes dans le top 50 %) | homebot.ai/blog/what-is-a-home-report... ; ustechautomations.com/...cma-reports-5-minutes | 2026-07-18 | **Prouvé** (blog éditeur + synthèse) |
| PriceHubble | « Property Lead Engine » + « Lead Dashboard » : monitoring de valeur, signaux d'intention issus de l'activité de valorisation (« who's planning to sell »), next-best-action, vue live du parcours enquête→conversion | pricehubble.com/products/property-lead-engine ; pricehubble.com/products/lead-dashboard | 2026-07-18 | **Prouvé** (pages produit) |
| kvCORE / CORE Present (BoldTrail) | « DashCMA » : **20+ perspectives de prix en une vue** ; présentations interactives brandées | theclose.com/kvcore-review ; help.lofty.com (CORE Present) | 2026-07-18 | **Prouvé** (page produit / synthèse) |
| Jestimo (ImmoExpert, Orisha) | **Dossier d'estimation ~20 pages** brandé agence, adaptable au profil client, pages « équipe/services » → « rentrer un mandat au juste prix » | lp.jestimo.fr ; estimationterrain.com/logiciels-immobilier/jestimo-logiciel | 2026-07-18 | **Prouvé** (page éditeur + comparateur FR) |
| MeilleursAgents Pro | Visualisation quotidienne des zones de prospection + RDV d'évaluation avec vendeurs qualifiés ; croise DVF/BIEN/PERVAL + avis de valeur agents | pro.meilleursagents.com/nos-solutions ; lesoutilsimmo.fr/outils/meilleursagents-pro | 2026-07-18 | **Prouvé** (page pro) |
| Horiz.io / MoteurImmo (pige) | Détection de **baisses de prix successives** sur annonces ; filtre « sans baisse depuis 2 mois » ; « 2 baisses en 30 j = signal » | blog.moteurimmo.fr/historique-des-prix... ; horiz.io/...meilleurs-logiciels-agents-immobiliers | 2026-07-18 | **Prouvé** (blog éditeur) |
| Marché FR (contexte business) | Écart prix affiché/vente réel **5-10 %** ; erreur de **+5 % → +3 à 6 mois** de délai ; au-delà de +8 % médiane = invisibilité, décote forcée à 6 mois ; délai moyen IDF >70 j | seloger.com/prix-de-l-immo ; immobilier-danger.com/prix-immobilier ; prealty.fr/blog/...methode-estimation-2026 | 2026-07-18 | **Prouvé** (données marché) |

**Lecture stratégique :** l'écosystème US (Cloud CMA, Homebot, PriceHubble) a industrialisé deux mécaniques que **Azigo n'a pas** : (a) **savoir quand le vendeur consulte l'avis** pour relancer à chaud, (b) **entretenir la valeur dans le temps** pour convertir des estimations dormantes en mandats. Côté FR, Jestimo pousse le **dossier d'entretien** et la pige (Horiz/MoteurImmo) sait lire les **baisses de prix**. Azigo a déjà le moteur, la brochure et la continuité — il lui manque la **couche conversion mesurable** au-dessus. C'est exactement mon lot.

---

## 4. Candidats (format obligatoire + décompte de score)

### Candidat 1 — Radar d'ouverture de brochure (« Votre avis a été consulté → appelez maintenant ») — Score 88 — Taille M

- **Nom court :** Radar d'ouverture de brochure.
- **Problème métier exact :** l'agent partage un avis de valeur signé (`/brochure/[token]`) et **ne sait jamais si le vendeur l'a ouvert**. Il relance à l'aveugle, trop tard ou trop tôt. Or le moment où le vendeur consulte le PDF est le pic d'intérêt : c'est **la** fenêtre d'appel.
- **Utilisateur concerné :** agent (négociateur) qui a produit et partagé une estimation.
- **Moment du parcours :** APRÈS partage de la brochure, AVANT la prise de mandat. Cœur de ma frontière (post-partage).
- **Écran / emplacement précis (existant) :** (a) badge d'état sur le bouton « Partager » dans **ValuationHero** (`_components/ValuationHero.tsx`, l.249) → « Consulté 2× · dernière il y a 3 h » ; (b) carte « Avis consulté » dans le **centre d'actions de l'Accueil** (`lib/actions/derive.ts`, nouvelle catégorie `brochure_ouverte`). Aucun nouveau menu.
- **Comportement du widget :** au premier chargement du PDF public, la route `brochure/[token]/pdf` insère un événement (token, `estimation_id`, `viewed_at`, `ip_hash`, `ua_hash`). L'UI affiche le compteur d'ouvertures + horodatage de la dernière. L'action center fait remonter une carte « X a consulté son avis (il y a Nh) » avec bouton **Appeler** (téléphone `owner_lead_id`) + **Créer une relance**.
- **Action disponible :** appeler le propriétaire (tel du lead vendeur lié), créer une `rea_task` `kind=relance` datée, ouvrir la fiche lead.
- **Automatisation éventuelle :** dépasse un seuil (ex. 2ᵉ ouverture, ou ouverture > 5 min après partage) → **brouillon** de tâche de relance auto-créé dans l'action center (jamais un envoi). Optionnel : brouillon d'email de suivi via Resend, **soumis à validation** (réutilise `[id]/share` déjà branché Resend).
- **Étape de validation humaine :** aucune communication n'part sans clic. La relance est un brouillon de tâche ; l'email est un brouillon HITL.
- **Données nécessaires :** événements de vue horodatés par estimation, rattachés au token.
- **Données DÉJÀ dispo dans le repo :** token signé porteur de `eid` (`lib/estimation/share.ts`) ; route PDF unique point de passage de toute consultation (`app/api/brochure/[token]/pdf/route.ts`) ; téléphone propriétaire via `owner_lead_id` → `leads.phone` (`continuity.ts` l.149-156) ; canal de tâche (`app/api/tasks/route.ts`) ; catégorie action center extensible (`lib/actions/derive.ts`).
- **Données manquantes :** **1 table** `estimation_share_events(id, estimation_id, tenant_id, viewed_at, ip_hash, ua_hash, source)` + index `(estimation_id, viewed_at desc)`, RLS tenant. Rien d'autre.
- **Routes / tables / composants concernés :** table `estimation_share_events` (nouvelle migration) ; `app/api/brochure/[token]/pdf/route.ts` (insert non bloquant) ; `app/api/estimations/[id]/engagement/route.ts` (GET compteur, owner-check) ; `ValuationHero.tsx` (badge) ; `lib/actions/derive.ts` + son loader (carte).
- **Dépendances externes :** aucune. (RGPD : on stocke des **hash** IP/UA, jamais d'identité — cohérent avec `prosp_optout` qui hash déjà email/tel.)
- **Taille estimée :** M (3-5 j) — table + 1 insert + 1 GET + badge + carte action center + dédup anti-rechargement.
- **Risques :** faux positifs (aperçu lien de messagerie qui pré-charge le PDF) → mitigé en comptant les vues > seuil de durée ou distinctes par `ua_hash` ; ne pas ralentir la livraison du PDF (insert *fire-and-forget*).
- **Preuve concurrentielle :** Cloud CMA notifie l'ouverture et conseille « call within an hour » (2026-07-18, prouvé via synthèse) ; PriceHubble transforme l'activité de consultation en signal d'intention (2026-07-18, page produit).
- **Scénario de démo :** je partage un avis, j'ouvre `/brochure/[token]` dans un autre onglet → l'Accueil affiche « Le propriétaire a consulté son avis · il y a 1 min » avec bouton Appeler ; le bouton Partager de la fiche passe à « Consulté 1× ».
- **Indicateur de succès :** % d'estimations partagées ouvertes ; délai médian partage→1ʳᵉ ouverture ; taux de conversion mandat des estimations « ouvertes » vs « jamais ouvertes ».

**Décompte :** impact business 23/25 · utilité quotidienne 18/20 · effet démontrable 15/15 · avantage agentique 12/15 (relance auto = brouillon, pas d'envoi live) · faisabilité 14/15 · dispo données 9/10 → **manque 1 petite table** (P). Pénalités : 0. **= 88**

---

### Candidat 2 — Veille de valeur & prétexte de relance (dérive marché sur estimations dormantes) — Score 84 — Taille M

- **Nom court :** Veille de valeur (le « Homebot du marché français », interne à l'agent).
- **Problème métier exact :** une estimation produite il y a 2-6 mois et non convertie devient un **mort**. L'agent n'a aucun prétexte concret pour rappeler le propriétaire. Or le marché a bougé (`NATIONAL_INDEX` : +0,4 %/trimestre en 2026) : « votre bien vaut ~2,1 % de plus qu'en mars » est un motif d'appel **daté, chiffré, légitime**.
- **Utilisateur concerné :** agent, sur son stock d'estimations vendeur non signées.
- **Moment du parcours :** APRÈS estimation, phase de nurturing du propriétaire (semaines/mois). Hors M04-10 (qui ne fait pas de veille temporelle).
- **Écran / emplacement précis (existant) :** (a) bandeau « Valeur réactualisée » dans **ContinuityPanel** (au-dessus du bloc décision) quand la dérive dépasse un seuil ; (b) colonne « Dérive depuis estimation » dans la liste `/estimations` ; (c) carte action center `proprietaire` enrichie du motif (« +2,1 % depuis l'estimation »).
- **Comportement du widget :** recalcule une valeur indicative = `market_value × (index(aujourd'hui) / index(valued_at))` (100 % offline, `price-index.ts`). Affiche l'écart signé + la période. Ne modifie **jamais** l'estimation d'origine (couche suivi uniquement, comme les ajustements manuels).
- **Action disponible :** « Relancer le propriétaire avec ce chiffre » → pré-remplit une `rea_task` relance ; « Recalculer précisément » → relance le moteur complet (existant) ; ouvrir la fiche vendeur.
- **Automatisation éventuelle :** un job (route Inngest présente, `app/api/inngest/route.ts`) balaie mensuellement les estimations `decision ∈ {en_attente, a_relancer}` dont la dérive franchit un seuil et **crée des brouillons de tâches** de relance datées. Aucun envoi.
- **Étape de validation humaine :** la relance reste une tâche à traiter par l'agent ; tout message est un brouillon HITL. RGPD : on relance **son propre lead vendeur** (consenti à l'estimation), jamais un contact froid.
- **Données nécessaires :** valeur initiale + date de calcul + index temporel.
- **Données DÉJÀ dispo :** `estimations.market_value`, `estimations.valued_at` (0038), `insee_code`/`postal_code` (0007), `NATIONAL_INDEX` T1-2020→T2-2026 (`price-index.ts`), decision (0043), lead vendeur (`owner_lead_id`), canal tâche (`tasks/route.ts`), action center `proprietaire` (`derive.ts` l.276-297).
- **Données manquantes :** rien de bloquant. Amélioration future = série INSEE par département (le fichier price-index le note déjà) — non nécessaire au v1 national.
- **Routes / tables / composants concernés :** `lib/estimation/drift.ts` (pur, dérive index) ; `ContinuityPanel.tsx` (bandeau) ; `/estimations/page.tsx` (colonne) ; `lib/actions/derive.ts` (motif) ; option job `app/api/inngest/route.ts`.
- **Dépendances externes :** aucune (l'index est local ; pas de MoteurImmo requis).
- **Taille estimée :** M (3-5 j).
- **Risques :** l'index national est une **approximation** → afficher « indicatif, national » et proposer le recalcul précis ; ne jamais présenter comme une ré-estimation officielle (honnêteté §brief).
- **Preuve concurrentielle :** Homebot (Home Digest mensuel valeur+équité, 75 % d'ouverture, 3-5 seller leads/100 contacts/mois — 2026-07-18, prouvé) ; PriceHubble Property Apps (« new valuations, market movements » comme signal d'intention — 2026-07-18, prouvé).
- **Scénario de démo :** une estimation `valued_at` en mars 2026 s'ouvre → bandeau « Estimé 320 000 € en mars · ~+2,0 % marché → ~326 400 € aujourd'hui » + bouton « Relancer M. X ». Un clic crée la tâche datée sur l'Accueil.
- **Indicateur de succès :** nb de relances déclenchées par la veille ; taux de réactivation (estimation dormante → mandat) ; part des estimations vendeur avec `decision=a_relancer` traitées.

**Décompte :** impact business 22/25 · utilité quotidienne 18/20 · effet démontrable 13/15 · avantage agentique 13/15 · faisabilité 14/15 · dispo données 10/10 (**tout en base**) → **= 90**, mais **−6** pénalité « approximation de l'index national » (risque de sur-promesse de précision, à cadrer visuellement). **= 84**

---

### Candidat 3 — Pipeline de conversion estimation→mandat (vue portefeuille travaillable) — Score 82 — Taille M

- **Nom court :** Pipeline de conversion (tunnel estimation → mandat).
- **Problème métier exact :** l'agent produit des estimations mais **ne voit pas son tunnel** : combien d'avis partagés, combien avec propriétaire rattaché, combien devenus mandats, où ça bloque. `/estimations` est aujourd'hui une simple table par statut technique (`draft/ready/…`), pas un **funnel commercial**.
- **Utilisateur concerné :** agent (pilotage perso) ; directeur d'agence (lecture de performance).
- **Moment du parcours :** transverse post-estimation — vue d'ensemble de toutes les estimations en cours de conversion.
- **Écran / emplacement précis (existant) :** nouvelle **vue/onglet « Conversion »** dans `/estimations` (les onglets `PageNavTabs`/`TAB_GROUPS` existent déjà, page l.1-2). Pas de nouveau menu top-level.
- **Comportement du widget :** funnel à colonnes basé sur `decision` (0043) + présence `owner_lead_id` + `mandate` : « Estimé → Partagé → Propriétaire lié → Opportunité (brouillon) → Mandat signé / Perdu ». Chaque colonne cliquable liste les estimations concernées avec next_action et ancienneté. Taux de conversion affiché entre étapes.
- **Action disponible :** ouvrir une estimation, sauter à sa continuité, filtrer « à relancer », créer une tâche.
- **Automatisation éventuelle :** met en évidence les estimations **bloquées** (partagées depuis > N jours sans propriétaire lié, ou opportunité brouillon > N jours) → proposition de relance (brouillon de tâche).
- **Étape de validation humaine :** lecture + décision agent ; aucune mutation automatique.
- **Données nécessaires :** décision, owner_lead_id, mandate lié, dates — toutes présentes.
- **Données DÉJÀ dispo :** `estimations.decision` (0043, 5 valeurs `en_attente/a_relancer/mandat_signe/refuse/perdu`), `owner_lead_id`, `property_id`, jointure `mandates` (`continuity.ts` l.159-171), agrégats CRM (`lib/crm/aggregate.ts` déjà importé par la page : `countByStatus`, `average`).
- **Données manquantes :** idéalement un `shared_at` sur estimations pour l'étape « Partagé » — sinon on dérive « Partagé » de la présence d'événements du Candidat 1 (synergie) ou d'un `pdf_generated_at` existant. V1 possible **sans** nouvelle colonne en s'appuyant sur decision + owner + mandate.
- **Routes / tables / composants concernés :** `app/(dashboard)/estimations/page.tsx` (vue) ; `lib/estimation/pipeline.ts` (agrégation pure) ; composants table/Badge Catalyst existants.
- **Dépendances externes :** aucune.
- **Taille estimée :** M (3-5 j).
- **Risques :** doublonner l'action center → le différencier clairement (funnel analytique agrégé vs liste d'actions du jour).
- **Preuve concurrentielle :** PriceHubble Lead Dashboard (« complete, live view of client activity from first enquiry through to conversion », étapes mesurables — 2026-07-18, prouvé) ; kvCORE (pilotage pipeline agent — 2026-07-18).
- **Scénario de démo :** l'onglet Conversion montre « 40 estimées → 22 partagées → 15 propriétaires liés → 8 opportunités → 3 mandats », taux 7,5 %, et clic sur « Opportunité » liste les 8 brouillons vieillissants.
- **Indicateur de succès :** taux de conversion estimation→mandat suivi dans le temps ; nb d'estimations « bloquées » débloquées ; adoption de la vue.

**Décompte :** impact business 22/25 · utilité quotidienne 16/20 (pilotage, pas quotidien pur) · effet démontrable 14/15 · avantage agentique 11/15 · faisabilité 14/15 · dispo données 9/10 → **= 86**, **−4** (chevauchement partiel de lecture avec le centre d'actions M04-08 : à cadrer comme vue analytique distincte, pas une redite). **= 82**

**Frontière M04 :** M04-08 = cockpit quotidien/agenda (hiérarchie urgent→aujourd'hui sur l'accueil) ; M04-11 = CRM/portefeuille denses. Ici = **funnel de conversion spécifique à l'estimation** (taux entre jalons `decision`), capacité analytique nouvelle, pas de la densité d'une liste existante.

---

### Candidat 4 — Dossier de rendez-vous mandat (argumentaire + pièces générés) — Score 79 — Taille M

- **Nom court :** Dossier RDV mandat (le « pitch pack » de prise de mandat).
- **Problème métier exact :** entre l'avis de valeur et la signature, l'agent doit **préparer l'entretien mandat** : justifier le prix, anticiper les objections (« le voisin l'a vendu plus cher »), lister les pièces à demander (DPE, titre, diagnostics), poser la stratégie de mise en vente. Aujourd'hui il refait ça à la main à chaque fois. Jestimo en a fait un argument commercial central (dossier ~20 pages).
- **Utilisateur concerné :** agent qui va rencontrer le propriétaire pour signer.
- **Moment du parcours :** juste AVANT le RDV mandat — après estimation, quand `owner_lead_id` est posé.
- **Écran / emplacement précis (existant) :** bloc « Préparer le RDV mandat » dans **ContinuityPanel** (à côté du bloc « Opportunité de mandat »). Bouton « Générer le dossier ».
- **Comportement du widget :** compose un support d'entretien à partir de la valuation **déjà calculée** : prix conseillé + fourchette, top comparables DVF (avec écarts), points forts/faibles (ajustements calculés + manuels), stratégie de prix (aligné/attractif/haut), et une **checklist de pièces** à réclamer selon le type de bien. Rendu à l'écran + export PDF (réutilise `lib/brochure/pdf.ts`).
- **Action disponible :** générer, imprimer/PDF, cocher les pièces reçues (persistées en `rea_task kind=validation` ou notes), planifier le RDV (`visits`/`agenda` existants).
- **Automatisation éventuelle :** pré-remplit un brouillon d'email de confirmation de RDV avec le dossier en pièce jointe (HITL, Resend existant).
- **Étape de validation humaine :** l'agent relit/édite l'argumentaire avant impression ; tout envoi est un brouillon.
- **Données nécessaires :** valuation, comparables, ajustements, type de bien — tous présents.
- **Données DÉJÀ dispo :** payload `valuation` complet (`lib/estimation/valuation.ts`, `types.ts`), comparables DVF (`comparables.ts`, `dvf.ts`), ajustements calculés + manuels (`valuation.adjustments`, `continuity.manualAdjustments`), stratégies de vente (`estimations.sale_strategies`), moteur PDF (`lib/brochure/pdf.ts`, `render-html.ts`), clarté des données (`clarity.ts`, déjà affiché dans ContinuityPanel).
- **Données manquantes :** la **checklist de pièces par type de bien** = table de référence statique (config `config/`), pas de la donnée utilisateur. Optionnel : quelques comparables « concurrents actuels » via pige si une annonce matche l'adresse (`prosp_annonces`).
- **Routes / tables / composants concernés :** `lib/estimation/pitch.ts` (compose le dossier, pur) ; `config/mandate-checklist.ts` (pièces par type) ; `app/api/estimations/[id]/pitch/route.ts` (rend le PDF) ; `ContinuityPanel.tsx` (bloc + bouton).
- **Dépendances externes :** aucune (LLM non requis — c'est de la composition déterministe ; un résumé narratif optionnel pourrait passer par le stack LLM existant mais n'est pas nécessaire).
- **Taille estimée :** M (3-5 j).
- **Risques :** ne pas re-générer un doublon de la brochure vendeur — celui-ci est **interne/agent** (argumentaire + objections + pièces), pas le PDF client. À différencier visuellement.
- **Preuve concurrentielle :** Jestimo/ImmoExpert (dossier ~20 pages brandé pour « rentrer un mandat au juste prix » — 2026-07-18, prouvé) ; kvCORE CORE Present / DashCMA (présentation de mandat multi-perspectives — 2026-07-18, prouvé).
- **Scénario de démo :** depuis une estimation `ready` avec propriétaire lié, clic « Générer le dossier RDV » → écran argumentaire (prix + 3 comparables + 2 objections traitées + checklist DPE/titre) + export PDF.
- **Indicateur de succès :** nb de dossiers générés avant RDV ; taux de conversion des RDV avec dossier vs sans ; temps de préparation réduit.

**Décompte :** impact business 21/25 · utilité quotidienne 15/20 · effet démontrable 14/15 · avantage agentique 10/15 · faisabilité 13/15 · dispo données 9/10 → **= 82**, **−3** (risque de recouvrement visuel avec la brochure M04-12 → cadrer comme support interne distinct). **= 79**

**Frontière M04 :** M04-12 durcit la **brochure client** (providers/PDF/partage). Ici = un **support d'entretien interne à l'agent** (objections + pièces + stratégie), capacité nouvelle orientée conversion, pas le durcissement du PDF vendeur.

---

### Candidat 5 — Boucle prix conseillé ↔ prix de vente effectif (calibration honnêteté) — Score 74 — Taille S

- **Nom court :** Boucle de calibration (estimation vs réalisé).
- **Problème métier exact :** l'agent (et le moteur) ne se **calibre jamais** contre la réalité : le prix conseillé était-il juste ? Le bien s'est-il vendu à ce prix, ou après décote ? Sans ce retour, impossible de prouver au prochain vendeur « mes estimations tiennent la route » — l'argument #1 contre la surestimation (erreur +5 % = +3 à 6 mois de délai, source marché 2026).
- **Utilisateur concerné :** agent (argument de crédibilité) ; directeur (qualité du moteur).
- **Moment du parcours :** à la clôture (bien passé `sous_offre`/`vendu`), puis réutilisé au prochain RDV mandat.
- **Écran / emplacement précis (existant) :** (a) bloc « Fiabilité de l'estimation » sur la **fiche bien** `/properties/[id]` quand `status=vendu` et `estimation_id` présent ; (b) KPI « Écart médian estimation/vente » sur `/estimations` (bandeau stats existant, page l.72-78).
- **Comportement du widget :** compare `estimations.recommended_price`/`market_value` → `properties.asking_price` (mise en vente) → **prix de vente réalisé**. Affiche les écarts en % et un verdict (« estimé à ±3 % du réalisé »). Agrège un « taux de justesse » sur le portefeuille.
- **Action disponible :** saisir le prix de vente réalisé à la clôture ; réutiliser le chiffre de fiabilité comme argument dans le dossier RDV (Candidat 4).
- **Automatisation éventuelle :** quand un mandat passe `realise`, invite à saisir le prix final (tâche `validation`).
- **Étape de validation humaine :** saisie manuelle du réalisé par l'agent (donnée non déductible automatiquement — honnêteté : on ne l'invente pas).
- **Données nécessaires :** prix conseillé (présent), prix de mise en vente (présent), **prix de vente réalisé (à capturer)**.
- **Données DÉJÀ dispo :** `estimations.recommended_price`/`market_value` (0007), `properties.asking_price`/`estimated_value`/`estimation_id` (0008), statut `vendu`/`mandates.status=realise` (0008), agrégats (`lib/crm/aggregate.ts`).
- **Données manquantes :** **1 colonne** `properties.sold_price numeric` (+ éventuellement `sold_at`). Vérifié : **aucune** colonne de prix réalisé n'existe aujourd'hui (grep sur toutes les migrations → néant hors `asking_price`/`estimated_value`).
- **Routes / tables / composants concernés :** migration `properties.sold_price` ; `app/api/properties/[id]/route.ts` (PATCH sold_price) ; `lib/estimation/calibration.ts` (écarts, pur) ; fiche bien + bandeau `/estimations`.
- **Dépendances externes :** aucune.
- **Taille estimée :** S (1-2 j).
- **Risques :** faible volume de biens `vendu` au début → le KPI portefeuille sera maigre ; l'afficher dès 1 bien, honnêtement (« sur N ventes »).
- **Preuve concurrentielle :** MeilleursAgents Pro / Jestimo croisent DVF+notarial (« only DVF reflects what actually happened », source marché 2026-07-18, prouvé) → la calibration au réalisé est l'argument de fiabilité que ces acteurs vendent ; ici on le rend **propre à l'agent**.
- **Scénario de démo :** un bien `vendu` avec estimation liée affiche « Estimé 320 k€ · vendu 312 k€ · écart −2,5 % » ; `/estimations` montre « Écart médian portefeuille : −3,1 % sur 6 ventes ».
- **Indicateur de succès :** écart médian estimation/réalisé suivi dans le temps ; usage de l'argument fiabilité en RDV ; réduction du taux de surestimation.

**Décompte :** impact business 19/25 · utilité quotidienne 13/20 (ponctuel à la clôture) · effet démontrable 13/15 · avantage agentique 9/15 · faisabilité 13/15 · dispo données 8/10 (**1 colonne + saisie manuelle**) → **= 75**, **−1** (saisie manuelle = friction). **= 74**

**Frontière M04 :** M04-11 densifie le CRM/portefeuille ; M04-12 durcit la provenance. Ici = une **boucle de rétroaction estimation↔réalisé** (capture du prix de vente + calibration), donnée et capacité nouvelles, pas de la densité d'affichage.

---

### Candidat 6 — Engagement multi-destinataires de l'avis (qui, combien de fois) — Score 72 — Taille S

- **Nom court :** Engagement multi-destinataires (extension fine du Candidat 1).
- **Problème métier exact :** un même avis peut être ouvert par plusieurs parties (les deux conjoints vendeurs, un notaire). **La répétition et la multiplicité des ouvertures = signal d'intention chaud** (« ils en parlent en famille »). Le compteur brut du Candidat 1 ne le distingue pas.
- **Utilisateur concerné :** agent en phase de closing de mandat.
- **Moment du parcours :** post-partage, fenêtre de décision du vendeur.
- **Écran / emplacement précis (existant) :** panneau dépliable « Détail des consultations » sous le badge d'ouverture de **ValuationHero** (ou dans `SidePanel.tsx` qui porte déjà share/market-context).
- **Comportement du widget :** liste les sessions de consultation (horodatage, appareil approximatif via `ua_hash`, ré-ouvertures), avec un indicateur « intérêt » (1 ouverture = tiède, ≥3 ou ré-ouverture > 48 h = chaud).
- **Action disponible :** relancer, créer une tâche prioritaire si « chaud », ouvrir la fiche vendeur.
- **Automatisation éventuelle :** seuil « chaud » → priorité `haute` sur la carte action center (brouillon).
- **Étape de validation humaine :** aucune communication auto ; l'agent décide.
- **Données nécessaires :** événements de vue détaillés (mêmes que Candidat 1).
- **Données DÉJÀ dispo :** dépend **entièrement** de la table `estimation_share_events` du Candidat 1 (donc à livrer avec/après lui) ; téléphone vendeur via `owner_lead_id`.
- **Données manquantes :** aucune au-delà du Candidat 1 (pur affichage/agrégation des mêmes lignes).
- **Routes / tables / composants concernés :** `app/api/estimations/[id]/engagement/route.ts` (agrégation par session) ; `ValuationHero.tsx`/`SidePanel.tsx` (panneau).
- **Dépendances externes :** aucune.
- **Taille estimée :** S (1-2 j) — mais **couplée** au Candidat 1 (ne vit pas seule).
- **Risques :** granularité limitée (hash IP/UA, pas d'identité nominative — voulu pour RGPD) → présenter « sessions » et non « personnes nommées ».
- **Preuve concurrentielle :** PriceHubble (patterns d'usage → signaux d'intention avant que le client ne contacte — 2026-07-18, prouvé) ; Homebot (Likelihood-to-Sell dérivé de l'engagement — 2026-07-18, prouvé).
- **Scénario de démo :** un avis ouvert 3 fois sur 2 jours affiche « Intérêt chaud · 3 consultations, 2 appareils » et pousse une carte prioritaire « Appeler maintenant » sur l'Accueil.
- **Indicateur de succès :** corrélation ouvertures répétées → mandat signé ; taux de relance des avis « chauds ».

**Décompte :** impact business 18/25 · utilité quotidienne 14/20 · effet démontrable 13/15 · avantage agentique 11/15 · faisabilité 13/15 · dispo données 7/10 (dépend du C1) → **= 76**, **−4** (ne se démontre pas de façon autonome sans le Candidat 1). **= 72**

---

## 5. Idées rejetées

| Idée | Raison du rejet (une ligne) |
|---|---|
| Envoi automatique d'email/SMS/WhatsApp de relance au vendeur | Règle dure brief : toute communication reste brouillon/HITL ; transport SMS/WA non branché (CONFIG). Je limite aux **brouillons**. |
| Signature électronique du mandat (DocuSign/Yousign in-app) | Dépendance externe indispo (aucune clé e-sign), −15 ; hors périmètre 48 h/7 j ; c'est un projet en soi. |
| Ré-estimation temps réel via API MoteurImmo/portails sur le bien du vendeur | MoteurImmo/Twilio = clés absentes (UNAVAILABLE brief) ; je passe par `NATIONAL_INDEX` **offline** (Candidat 2). |
| Score prédictif « likelihood to sell » façon Homebot (ML) | Nécessite un modèle + historique labellisé absent ; gadget IA sans données. Remplacé par des **signaux déterministes** (ouvertures, dérive, ancienneté). |
| Lien acheteur↔estimation (matcher des acquéreurs sur le bien estimé) | `estimations` n'a **pas** de `lead_id` acheteur (vérifié) ; c'est le domaine prospection/matching (M04-09) — hors ma frontière conversion. |
| Portail vendeur logué (espace propriétaire pour suivre son bien) | Nouvelle surface auth publique = infra majeure (−20) ; la brochure signée `noindex` suffit au v1 ; GoTrue absent (PostgREST-only). |
| Notifications push/temps réel des ouvertures | Realtime Supabase absent (UNAVAILABLE) ; l'action center au chargement + polling léger couvre le besoin sans nouvelle infra. |
| Comparateur « 20 perspectives de prix » façon DashCMA sur l'écran d'estimation | Recoupe le moteur/valuation durci par M04-12 ; risque de doublon de densité, pas une capacité de **conversion** nouvelle. |
| A/B testing des brochures / heatmap de lecture page par page | Nécessite un viewer PDF instrumenté custom (le PDF est servi en iframe/R2) → refonte du rendu, effort XL, hors tranche. |
| Relance auto du propriétaire par l'assistant Cockpit sans tâche visible | Violerait « observable/auditable/réversible/HITL » ; toute relance doit passer par une `rea_task` visible ou un brouillon. |

---

### Note de cohérence

Les 6 candidats forment une **chaîne de conversion** cohérente et incrémentale, qui s'emboîte dans l'existant sans nouveau menu :
**produire** (existant) → **partager** (existant) → **savoir qui/quand ça a été ouvert** (C1, C6) → **entretenir la valeur dans le temps** (C2) → **préparer le RDV** (C4) → **piloter le tunnel** (C3) → **se calibrer sur le réalisé** (C5).
Coût data cumulé minimal : **1 table** (`estimation_share_events`, sert C1+C6) + **1 colonne** (`properties.sold_price`, sert C5) ; C2/C3/C4 se font **sur les données déjà en base**. Zéro dépendance externe indisponible, zéro contact non consenti, tout mesurable en démo.
