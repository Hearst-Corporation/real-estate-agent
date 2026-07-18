# REA-GAMECHANGER-005 — Opus 03 · Acquéreurs, Recherche & Matching

> Domaine : intelligence du matching **côté agent** (au-delà du moteur de filtres).
> Frontières respectées : M04-06 possède `leads.financement` (je bâtis dessus en le citant) · M04-09 = densité UI prospection · Opus 09 = expérience partagée côté client (sélection interactive). Moi = INTELLIGENCE serveur du rapprochement.
> Worktree lu : `…/scratchpad/wt-gamechanger`. Recherche web : 2026-07-18.

---

## 1. Synthèse coordinateur

| # | Candidat | Écran | Taille | Score | Données prêtes (O/P/N) | Effet business (1 ligne) |
|---|----------|-------|--------|-------|------------------------|--------------------------|
| 1 | **Off-market push : proposer le portefeuille aux acquéreurs** | `/prospection` onglet Matching (+ carte `/properties/[id]`) | M | **88** | O | À chaque mandat signé, tous les acquéreurs compatibles remontent en 1 clic → vente inter-mandats sans portail, la promesse n°1 de matchimo. |
| 2 | **Alerte baisse de prix → acquéreurs (signal d'opportunité)** | `/prospection` onglet Matching + Alertes | M | **84** | P | En marché 2026 (8/10 ventes négociées), une annonce déjà matchée qui baisse devient une opportunité chaude poussée à l'acquéreur — capacité premium de Casafari/Lofty. |
| 3 | **Apprentissage des feedbacks (boost/malus par profil)** | `/prospection` onglets Matching + Feedback | M | **82** | O | Les 👍/👎 déjà collectés arrêtent de mourir : ils repondèrent les prochains matchs → le moteur s'améliore visiblement, argument central de vente. |
| 4 | **Réveil des acquéreurs dormants sur nouveauté** | `/` accueil (action center) + `/prospection` | S | **80** | O | Un acquéreur silencieux depuis 60 j dont un critère matche une nouveauté ≥ seuil = relance ciblée ; 40 % des dormants finissent par transiger. |
| 5 | **Critères déclarés → réellement pris en compte (exclusions/urgence/secondaires)** | `/prospection` onglet Matching (moteur) | S | **79** | O | Aujourd'hui l'agent saisit exclusions/urgence/critères secondaires mais le moteur les IGNORE : les brancher rend le score honnête et priorise par urgence. |
| 6 | **Élargissement intelligent quand 0 match** | `/prospection` onglet Matching (par profil) | S | **74** | O | « 0 résultat » devient « 3 en élargissant le budget de 8 % / une commune limitrophe » → l'agent garde l'acquéreur au lieu de le perdre. |
| 7 | **Score de compatibilité travaux (rénovation vs rafraîchissement)** | `/prospection` onglet Matching (badge match) | S | **72** | P | Différencier un acquéreur « prêt à rénover » d'un « clé en main » (DPE + année + prix/m² sous marché) = le facteur exact que matchimo met en avant. |

Shortlist = 7 candidats ≥ 70. Aucun ne duplique une mission M04 (justifié par candidat). Tout envoi externe reste brouillon/HITL via la gateway existante.

---

## 2. Lecture du terrain (vérifié dans le worktree)

### 2.1 Fichiers lus et faits établis
- **Schéma critères** `supabase/migrations/0016_prosp_prospects_criteres.sql:23-54` : `prosp_criteres_acquereur` = budget/surface/pièces min-max, `zones` jsonb, prefs souples (`terrasse/parking/ascenseur/jardin/piscine` en `requis|exclu|indifferent`), `dpe_max`, `alerte_email/whatsapp`. **0043** (`0043_platform_augmented_002.sql:9-16`) AJOUTE `alerte_frequence` (`immediate|quotidien|hebdo|off`), `urgence` (`faible…urgente`), `exclusions` (jsonb), `criteres_secondaires` (jsonb).
- **Moteur de matching** `lib/prospection/matching/match.ts` : filtres durs (type/zone/budget/surface/pièces/prefs/DPE) → score pondéré (`weights.ts` : zone 40, budget 20, surface 15, pièces 10, type 10, confort 5), plafond 60 si donnée essentielle absente, `recommandation` (high ≥75 / review ≥50), `ValuationComparison` (prix vs estimation : below/within/above range). **Moteur PUR, déterministe.**
- **⚠️ Gap critique #1** — `lib/prospection/mappers.ts:121-149` `dbRowToCritere` NE MAPPE PAS `urgence`, `exclusions`, `criteres_secondaires`, `alerte_frequence`. Donc `match.ts` ne peut PAS les voir. `grep` confirme : `exclusions|urgence|criteres_secondaires` n'apparaissent QUE dans `criteres-update.ts` (CRUD) + la route `criteres/route.ts`, **jamais dans le moteur**. L'agent les saisit (form `AcquereurProfiles.tsx:40-42` les affiche), mais le matching les ignore → promesse cassée.
- **Matchs & feedback** `0017_prosp_matchs_feedback.sql` : `prosp_matchs` (score_match, score_breakdown jsonb, features_snapshot jsonb, engine_version via 0040) + `prosp_match_feedback` (`signal ∈ like|dislike|contact|visite`). FK repointées vers `prosp_criteres_acquereur` (0032-0033).
- **⚠️ Gap critique #2** — le feedback est écrit (`app/api/prospection/matchs/route.ts:124-174`) et LU pour l'historique (`history/route.ts`), mais **rien ne le réinjecte dans le scoring**. Table à sens unique. Aucun `feedback` dans `match.ts`/`functions.ts`.
- **Cron de matching** `lib/jobs/inngest/functions.ts:110-224` `prospScoring` (15 min) : boucle critères actifs × `prosp_annonces` (24 h) → `matchAnnonce` → upsert `prosp_matchs` → alerte si ≥70 (claim atomique anti-doublon). **Ne matche QUE `prosp_annonces` (externe), jamais `properties`.**
- **⚠️ Gap critique #3 (off-market)** — le portefeuille agence `properties` (`0008_crm.sql` : `property_type`, `city`, `postal_code`, `surface`, `rooms`, `asking_price`, `status ∈ …en_vente…`) n'est JAMAIS confronté aux critères acquéreurs. `grep matchAnnonce` ne touche jamais `properties`. Un mandat rentré ne déclenche aucune proposition aux acquéreurs.
- **Historique de prix** `0040_prospection_industrialization.sql:31-47` crée `prosp_annonce_versions` (prix/surface/statut/observed_at par changement). **⚠️ `grep` : JAMAIS écrite en prod** (seulement `ingest.test.ts`). Le champ `prix_precedent`/`prixPrecedent` EST mappé du provider (`mappers.ts:77,113`) mais n'est utilisé QUE par le scoring mandat (`scoring/mandat.ts`), jamais côté acquéreur.
- **Explication de match** `lib/prospection/explain.ts` : `buildExplanation` dérive honnêtement du breakdown + features réels (le « Pourquoi ce match » existe déjà — je ne le refais pas, je l'ÉTENDS).
- **Gateway (AVAILABLE)** `app/api/agent-gateway/v1/` : `matching/compute` (lecture pure, `matchAnnonce`), `matching/persist`, `alerts/prepare` (contenu + `content_hash` HITL), `alerts/dispatch` (approbation), `buyers/list|get-profile|update-preferences`. Auth par clé, scopes, idempotence, approbations (`agent_alert_approvals`). **`matching/compute/route.ts:48-60` limite `prosp_annonces` — même angle mort off-market.**
- **Action center** `lib/actions/derive.ts:376-406` `deriveAcquereursSansProposition` : critère actif sans `prosp_matchs` < N jours → item d'accueil. C'est un RAPPEL statique (territoire M04-08), PAS une détection de nouveauté ni un réveil sur match frais → mes candidats 4/6 ajoutent une capacité, pas de la densité.
- **`leads.financement`** ajouté en 0043 (`0043:21`), réservé M04-06. Je le CITE comme source de la « capacité travaux » (candidat 7) sans en câbler l'UI.

### 2.2 Matrice de capacités — mon domaine

| Capacité | État réel | Preuve (fichier) |
|----------|-----------|------------------|
| Matching multi-critères + score + explication | **AVAILABLE persisté** | `match.ts`, `explain.ts`, `prosp_matchs` |
| Feedback 👍/👎/contact/visite | **AVAILABLE persisté mais MORT** (jamais réinjecté) | `matchs/route.ts`, `history/route.ts` |
| Champs urgence/exclusions/critères secondaires | **CONFIG (schéma + form) mais IGNORÉS par le moteur** | 0043 ; absents de `mappers.ts`/`match.ts` |
| Off-market (matcher `properties`) | **UNAVAILABLE (données prêtes, code absent)** | `functions.ts`, `compute/route.ts` |
| Historique de prix / baisse | **CONFIG (table `prosp_annonce_versions` vide) + `prix_precedent` mappé** | 0040 ; `mappers.ts:77,113` |
| Élargissement de critères / réveil dormant | **UNAVAILABLE (à construire, données présentes)** | néant côté prosp |
| Alertes email/SMS/WhatsApp | **CONFIG (préparé, transport non branché)** | `alerts/dispatch`, badge « Aperçu » |
| Gateway compute/persist/prepare/dispatch/buyers | **AVAILABLE** | `agent-gateway/v1/**` |

**Conclusion de terrain** : le socle (moteur pur, gateway HITL, feedback, versions de prix, portefeuille structuré) est déjà là. Ce qui manque n'est pas de l'infra — c'est **brancher ce qui pend dans le vide** : le feedback dans le score, le portefeuille dans le matching, la baisse de prix en signal, et les champs déclarés dans le moteur. C'est exactement ce qui transforme « moteur de filtres » en « agent qui rapproche ».

---

## 3. Preuves concurrentielles

| Produit | Capacité observée | URL | Date | Prouvé / Inféré |
|---------|-------------------|-----|------|-----------------|
| **Matchimo** (FR) | « Rapproche biens & acquéreurs 24h/24 par IA » ; « Score > 90 % → l'email part automatiquement ; 75-90 % → validez d'un clic » ; « Mandat signé à 19h → à 7h vos acquéreurs ont reçu un email sur mesure » | matchimo.fr | 2026-07-18 | **Prouvé** (texte page + interview maformationimmo.fr) |
| **Matchimo** | « Notre algorithme va au-delà des filtres : différence entre un client prêt à rafraîchir et un capable de gérer une rénovation complète » ; « Matchimo explique pourquoi ce match a du sens » | matchimo.fr | 2026-07-18 | **Prouvé** (valide candidats 1, 7 et l'explicabilité) |
| **Casafari** | Alertes « price change », « back on market », « new listings matching your criteria » ; 1 record/bien avec « full listing history » | casafari.com/products/alerts | 2026-07-18 | **Prouvé** (page Alerts) |
| **Lofty** (ex-Chime) | « Churn prediction : l'IA repère les leads qui vont se désengager » ; « new, reduced price, back on market listings » ; « Homeowner Agent : identifie l'intention vendeur dans le CRM » | lofty.com/feature/crm-automation ; inman.com 2026-04-03 | 2026-07-18 | **Prouvé** (valide candidats 2, 4) |
| **kvCORE** | « Behavioral matching au-delà des critères déclarés » ; « cherche 3× cette semaine → flag hot + relance » ; signaux « days since last activity » | via US Tech Automations comparatif 2026 | 2026-07-18 | **Inféré** (source tierce, pas la page kvCORE ; croisé WebSearch) |
| **SweepBright** (BE/FR) | « Match clients avec biens selon besoins/budget, smart & instantané, réduit le spam » | cuspera.com/sweepbright ; sweepbright.com/blog automation | 2026-07-18 | **Prouvé** (fiche produit + blog) |
| **WinImmobilier** (FR) | Module « rapprochement bien » vendeur↔acquéreur intégré au CRM | winimmobilier.com/…/rapprochement-bien | 2026-07-18 | **Prouvé** (page produit) |
| **Marché FR 2026** | « Deux baisses de prix en 30 j = signal des acheteurs malins » ; « 8/10 transactions négociées au Q1, marge moyenne 10 % sur l'ancien » ; « +3 mois sur le marché affaiblit le vendeur » | esspace.fr ; score-immo.fr ; mysweetimmo.com 2026-03-31 | 2026-07-18 | **Prouvé** (contexte candidat 2) |
| **DB reactivation** | « 40 % des dormants finissent par transiger » ; « campagne systématique récupère 5-15 % » ; « inclure 2-3 biens matchant les critères dans la relance » | hhsynapse.com ; realscout academy | 2026-07-18 | **Prouvé** (contexte candidat 4) |

Note d'honnêteté : les sites JS-lourds (kvCORE, Lofty) n'ont été confirmés que par recoupement WebSearch + comparatifs tiers ; signalé « Inféré » quand la page source n'a pas été vue directement.

---

## 4. Candidats (format obligatoire + décompte de score)

### Candidat 1 — Off-market push : proposer le portefeuille aux acquéreurs · Taille M · **Score 88**

- **Problème métier exact** : quand un mandat est signé (ou un bien passe `en_vente`), l'agent doit se souvenir de tête quels acquéreurs pourraient l'acheter. Résultat : des ventes ratées entre son propre stock et sa propre base — la vente off-market, la plus rentable (pas de portail, discrétion), lui échappe.
- **Utilisateur concerné** : agent (négociateur) qui gère à la fois du portefeuille et des acquéreurs.
- **Moment du parcours** : (a) mandat rentré / bien mis en vente ; (b) revue quotidienne des acquéreurs.
- **Écran/emplacement** : `/prospection` onglet **Matching** — nouveau segment « Vos biens » à côté des annonces externes (même liste de matchs, badge « Portefeuille »). Rappel sur `/properties/[id]` : encart « N acquéreurs compatibles ».
- **Comportement du widget** : pour un bien du portefeuille, exécute `matchAnnonce` contre les `prosp_criteres_acquereur` actifs et affiche les acquéreurs triés par score, avec le « Pourquoi ce match » existant (`explain.ts`).
- **Action disponible** : « Préparer un message » (brouillon via `alerts.prepare`) · « Créer une visite » (tool existant) · « Marquer proposé » (écrit `prosp_match_feedback` signal `contact`).
- **Automatisation éventuelle** : à la signature d'un mandat, un job (Inngest, `functions.ts`) calcule les matchs portefeuille et pousse un item d'accueil « X acquéreurs pour [bien] ». Aligné matchimo « mandat 19h → 7h ».
- **Étape de validation humaine** : aucun envoi auto — brouillon + HITL via gateway (`content_hash` + `agent_alert_approvals`). L'agent valide avant tout contact.
- **Données nécessaires** : caractéristiques bien + critères acquéreurs → déjà toutes présentes.
- **Données DÉJÀ dispo** : `properties` (`0008_crm.sql` : `property_type/city/postal_code/surface/rooms/asking_price/status`), `prosp_criteres_acquereur` (0016+0043), moteur `matchAnnonce` (`match.ts`), explication (`explain.ts`), gateway `alerts.prepare`.
- **Données manquantes** : un **adaptateur `property → Annonce`** (mapper les colonnes `properties` vers le type `Annonce` de `types.ts`) — trivial, aucune nouvelle table.
- **Routes/tables/composants concernés** : nouvel adaptateur dans `lib/prospection/` ; route `app/api/prospection/matchs` (ajouter source portefeuille) OU nouvelle `properties/[id]/buyers` ; `matching/compute` (étendre à `properties`) ; UI `page.tsx` + `AcquereurProfiles`/carte propriété.
- **Dépendances externes** : aucune.
- **Risques** : confondre biens externes et internes dans l'UI (mitigé par badge « Portefeuille ») ; RGPD contact → couvert par HITL + `prosp_optout`.
- **Preuve concurrentielle** : matchimo (rapprochement 24/7, mandat→email), WinImmobilier (module rapprochement), SweepBright (match instantané). Off-market = argument marché FR 2026.
- **Scénario de démo** : signer un mandat 3P Antibes 450k → onglet Matching → « 4 acquéreurs compatibles » avec raisons → « Préparer message » → brouillon HITL. 30 s.
- **Indicateur de succès** : # biens portefeuille avec ≥1 match proposé / semaine ; # visites créées depuis un match portefeuille.
- **Décompte** : impact 25/25 · utilité 18/20 · démontrable 15/15 · agentique 14/15 · faisabilité 12/15 (adaptateur + UI) · données 10/10 = **94 brut**. Pénalité −6 (léger risque de confusion UI biens int/ext, à cadrer) → **88**.

### Candidat 2 — Alerte baisse de prix → acquéreurs (signal d'opportunité) · Taille M · **Score 84**

- **Problème métier exact** : une annonce qui a déjà matché un acquéreur mais était un peu chère devient PERTINENTE dès qu'elle baisse. Aujourd'hui rien ne le détecte : l'agent ne repère la baisse que par hasard, et l'opportunité (marché 2026 très négocié) passe.
- **Utilisateur concerné** : agent qui suit des acquéreurs sur zones tendues.
- **Moment du parcours** : après ré-ingestion d'une annonce déjà connue avec un prix inférieur.
- **Écran/emplacement** : `/prospection` onglet **Matching** (badge « Baisse -X % » sur le match) + onglet **Alertes** (file « Opportunités prix »).
- **Comportement du widget** : à l'ingestion, si `prix < prix_precedent` sur une annonce liée à des matchs existants, recalcule le score (le budget repasse « in range »), écrit une ligne `prosp_annonce_versions` et remonte le match avec l'ampleur de baisse + statut valuation (`below_range` si sous l'estimation).
- **Action disponible** : « Prévenir l'acquéreur » (brouillon HITL) · « Créer tâche relance » (`rea_tasks`).
- **Automatisation éventuelle** : `prospScoring` (`functions.ts`) détecte la baisse et crée un item d'accueil « [Bien] a baissé de X %, matche [acquéreur] ».
- **Étape de validation humaine** : brouillon + HITL avant tout contact.
- **Données nécessaires** : prix courant + prix précédent + matchs existants.
- **Données DÉJÀ dispo** : `prix_precedent`/`prixPrecedent` mappé (`mappers.ts:77,113`), `prosp_annonce_versions` (0040, à alimenter), `prosp_matchs`, `ValuationComparison` (`match.ts:86-119`), `rea_tasks` (0043).
- **Données manquantes** : **alimentation réelle de `prosp_annonce_versions` à l'ingestion** (aujourd'hui absente — cf. gap #3) ; sinon fallback immédiat sur `prix_precedent`.
- **Routes/tables/composants** : `lib/prospection/ingest.ts` (snapshot version au changement de prix) ; `functions.ts` (détection baisse) ; `page.tsx`/`MatchReasons.tsx` (badge baisse) ; `AlertsPanel.tsx`.
- **Dépendances externes** : ingestion Apify déjà en place ; aucun nouveau provider.
- **Risques** : bruit si micro-baisses → seuil minimal (ex. ≥3 %). Ne pas afficher de baisse fantôme si `prix_precedent` absent (honnêteté).
- **Preuve concurrentielle** : Casafari (« price change / back on market »), Lofty (« reduced price listings »). Marché FR 2026 : « deux baisses en 30 j = signal des acheteurs malins », négociation 10 %.
- **Scénario de démo** : re-scraper une annonce passée de 460k→435k → match remonte « Baisse -5 %, sous votre estimation » → brouillon acquéreur. 30 s.
- **Indicateur de succès** : # opportunités baisse détectées ; taux de contact déclenché sur baisse.
- **Décompte** : impact 22/25 · utilité 17/20 · démontrable 14/15 · agentique 13/15 · faisabilité 12/15 · données 8/10 (versions à alimenter) = **86 brut**. Pénalité −2 (dépend d'un petit ajout ingestion) → **84**.

### Candidat 3 — Apprentissage des feedbacks (boost/malus par profil) · Taille M · **Score 82**

- **Problème métier exact** : l'agent note déjà 👍/👎 sur les matchs, mais ce signal ne change RIEN : les prochains matchs répètent les mêmes erreurs. Le produit se vend « intelligent » mais n'apprend pas.
- **Utilisateur concerné** : agent qui trie ses matchs régulièrement.
- **Moment du parcours** : après quelques feedbacks sur un profil.
- **Écran/emplacement** : `/prospection` onglet **Matching** (matchs re-triés + micro-libellé « ajusté d'après vos retours ») et onglet **Feedback** (résumé « ce profil aime / évite »).
- **Comportement du widget** : agrège `prosp_match_feedback` par `critere_id` → dérive des tendances sur `features_snapshot` déjà persistées (ex. 👎 récurrent sur RDC / DPE F / une commune). Applique un **ajustement borné et explicable** au score (ex. ±10 pts max), affiché comme facteur du breakdown (respecte la doctrine d'honnêteté de `explain.ts`).
- **Action disponible** : « Voir pourquoi ajusté » · « Ignorer cet apprentissage » (réversible).
- **Automatisation éventuelle** : recalcul à chaque nouveau feedback ou au cron `prospScoring`.
- **Étape de validation humaine** : l'ajustement est transparent et désactivable ; aucune décision cachée. Pas d'envoi impliqué.
- **Données nécessaires** : feedbacks + snapshots de features des matchs notés.
- **Données DÉJÀ dispo** : `prosp_match_feedback` (`signal`, 0017), `prosp_matchs.features_snapshot`/`score_breakdown` (0017/0040), `engine_version` (0040) pour tracer, `explain.ts` pour l'exposition.
- **Données manquantes** : aucune — 100 % dérivable de l'existant. (Option : colonne `learning_adjustments` jsonb pour cacher les poids dérivés, mais calculable à la volée.)
- **Routes/tables/composants** : nouveau `lib/prospection/learning.ts` (pur, testable) consommé par `match.ts`/`functions.ts`/`matchs/route.ts` ; UI `MatchReasons.tsx`.
- **Dépendances externes** : aucune. Pas d'appel LLM (dérivation statistique déterministe → respecte §8).
- **Risques** : sur-apprentissage sur peu de données → borne dure + seuil minimal de feedbacks (ex. ≥3) avant tout ajustement ; toujours réversible.
- **Preuve concurrentielle** : kvCORE (« behavioral matching au-delà des critères déclarés, ajuste le matching futur »), matchimo (« au-delà des filtres classiques »).
- **Scénario de démo** : 3× 👎 sur du RDC → le prochain match RDC descend de 8 pts avec facteur visible « pénalité apprise : rez-de-chaussée ». 40 s.
- **Indicateur de succès** : ratio 👍/👎 en hausse au fil des runs par profil ; # profils avec ajustement actif.
- **Décompte** : impact 21/25 · utilité 17/20 · démontrable 13/15 · agentique 14/15 · faisabilité 13/15 · données 10/10 = **88 brut**. Pénalité −6 (risque statistique sur faible volume, à borner soigneusement) → **82**.

### Candidat 4 — Réveil des acquéreurs dormants sur nouveauté · Taille S · **Score 80**

- **Problème métier exact** : un acquéreur qu'on n'a pas relancé depuis 2 mois est probablement en train de chercher ailleurs. S'il y a une nouveauté qui matche fort son critère, c'est le moment exact de le rappeler — mais l'agent l'a oublié.
- **Utilisateur concerné** : agent avec un portefeuille d'acquéreurs qui vieillit.
- **Moment du parcours** : ouverture de la journée (accueil) ; après ingestion d'annonces.
- **Écran/emplacement** : `/` accueil (action center `rea_tasks`, catégorie dédiée « Réveil acquéreur ») + `/prospection` onglet Matching (filtre « nouveauté sur dormant »).
- **Comportement du widget** : croise (a) acquéreurs dont le dernier `prosp_contact_attempts`/feedback date de > N jours (dormance) et (b) un `prosp_matchs` FRAIS ≥ seuil élevé (ex. 80) créé récemment. Différence clé avec `deriveAcquereursSansProposition` (M04-08) : ici c'est un match neuf ET fort qui déclenche, pas l'absence.
- **Action disponible** : « Relancer » (brouillon HITL, réutilise `alerts.prepare`) · « Snoozer » (`rea_tasks.snoozed_until`).
- **Automatisation éventuelle** : job quotidien qui pose l'item d'accueil ; jamais d'envoi auto.
- **Étape de validation humaine** : brouillon + HITL, respect `prosp_optout`.
- **Données nécessaires** : dernière interaction acquéreur + matchs récents + fraîcheur.
- **Données DÉJÀ dispo** : `prosp_contact_attempts` (0040, `created_at/sent_at`), `prosp_match_feedback.created_at`, `prosp_matchs.created_at`+`score_match`, `rea_tasks` (0043), `deriveAcquereursSansProposition` (`derive.ts:376`) comme base à étendre.
- **Données manquantes** : aucune.
- **Routes/tables/composants** : `lib/actions/derive.ts` (nouvelle dérivation « dormant + match frais »), `app/api/tasks`, UI accueil.
- **Dépendances externes** : aucune.
- **Risques** : chevauchement avec M04-08 → différenciation nette (déclencheur = nouveauté forte, pas l'absence). Éviter le doublon d'item (dédup par `id` d'action).
- **Preuve concurrentielle** : Lofty (churn prediction), DB reactivation (40 % des dormants transigent, relance avec 2-3 biens matchés), kvCORE (« days since last activity »).
- **Scénario de démo** : acquéreur silencieux 65 j → nouvelle annonce score 86 → accueil « Réveillez [nom] : nouveauté 86/100 » → brouillon. 30 s.
- **Indicateur de succès** : # réveils déclenchés ; taux de réponse acquéreur post-relance.
- **Décompte** : impact 20/25 · utilité 17/20 · démontrable 13/15 · agentique 13/15 · faisabilité 14/15 · données 10/10 = **87 brut**. Pénalité −7 (proximité M04-08, à démarquer proprement) → **80**.

### Candidat 5 — Critères déclarés → réellement pris en compte (exclusions/urgence/secondaires) · Taille S · **Score 79**

- **Problème métier exact** : l'agent renseigne des exclusions (« pas de RDC »), une urgence et des critères secondaires — mais le moteur les IGNORE totalement (gap #1 vérifié). Le produit ment implicitement : il collecte des infos qu'il n'utilise pas.
- **Utilisateur concerné** : agent qui qualifie finement ses acquéreurs.
- **Moment du parcours** : à chaque scoring (cron + à la demande).
- **Écran/emplacement** : moteur `match.ts` (pas de nouvel écran) ; effet visible onglet Matching (exclusions appliquées, tri par urgence) + facteurs dans `MatchReasons`.
- **Comportement du widget** : (1) `mappers.ts` mappe enfin `urgence/exclusions/criteres_secondaires` ; (2) `match.ts` applique les `exclusions` comme filtre dur souple (ex. mots-clés dans titre/description → malus ou exclusion), les `criteres_secondaires` comme bonus pondéré, et `urgence` comme facteur de TRI (pas de score) pour prioriser l'affichage/alerte.
- **Action disponible** : inchangée ; les matchs deviennent simplement justes.
- **Automatisation éventuelle** : s'applique automatiquement au cron `prospScoring` et à `matching.compute`.
- **Étape de validation humaine** : aucune (lecture/scoring). Exclusions = protection acquéreur.
- **Données nécessaires** : les 4 champs 0043 + features annonce.
- **Données DÉJÀ dispo** : `urgence/exclusions/criteres_secondaires/alerte_frequence` (0043), schéma Zod déjà défini (`criteres-update.ts:32-38`), form qui les affiche (`AcquereurProfiles.tsx`).
- **Données manquantes** : aucune — pur câblage du déjà-saisi.
- **Routes/tables/composants** : `lib/prospection/mappers.ts` (mapping), `lib/prospection/types.ts` (étendre `CritereAcquereur`), `lib/prospection/matching/match.ts` + `weights.ts` (facteurs), `MatchReasons.tsx`.
- **Dépendances externes** : aucune.
- **Risques** : exclusions en texte libre → matching approximatif ; borner (mots-clés simples, insensible casse) et l'expliquer honnêtement dans le breakdown.
- **Preuve concurrentielle** : matchimo (« au-delà des filtres »), kvCORE (critères comportementaux). Ici c'est surtout **tenir la promesse déjà affichée**.
- **Scénario de démo** : profil avec exclusion « rez-de-chaussée » + urgence « urgente » → matchs RDC écartés/malussés, profil urgent en tête. 30 s.
- **Indicateur de succès** : # profils dont exclusions/secondaires influencent le score ; réduction des 👎 « ne correspond pas ».
- **Décompte** : impact 18/25 · utilité 18/20 · démontrable 12/15 · agentique 12/15 · faisabilité 14/15 · données 10/10 = **84 brut**. Pénalité −5 (matching texte libre à borner) → **79**.

### Candidat 6 — Élargissement intelligent quand 0 match · Taille S · **Score 74**

- **Problème métier exact** : un critère trop serré = 0 match = l'agent croit qu'il n'y a rien et laisse l'acquéreur filer. Or élargir légèrement (budget +8 %, commune limitrophe, 1 pièce de moins) révèle souvent des biens vendables.
- **Utilisateur concerné** : agent bloqué sur un profil sans résultat.
- **Moment du parcours** : consultation d'un profil à 0 (ou très peu de) matchs.
- **Écran/emplacement** : `/prospection` onglet Matching, bloc contextuel sous un profil vide : « En élargissant : +3 biens ».
- **Comportement du widget** : re-exécute `matchAnnonce` avec des variantes bornées et déterministes du critère (budget ±10 %, surface/pièces −1 cran, zones voisines par préfixe CP) et affiche combien de matchs chaque assouplissement débloque, avec l'écart exact au critère d'origine.
- **Action disponible** : « Voir ces biens » · « Proposer d'ajuster le critère » (brouillon message à l'acquéreur, HITL) · « Élargir le critère » (PATCH via `criteres-update.ts`).
- **Automatisation éventuelle** : proposition seulement, jamais de modif auto du critère.
- **Étape de validation humaine** : toute modif de critère ou message = action explicite de l'agent.
- **Données nécessaires** : critère + annonces + moteur.
- **Données DÉJÀ dispo** : `matchAnnonce` (`match.ts`), `prosp_annonces`, `buildCriterePatch` (`criteres-update.ts:182`) pour appliquer l'élargissement proprement.
- **Données manquantes** : aucune (logique de variantes = code pur).
- **Routes/tables/composants** : `lib/prospection/widen.ts` (pur), route matchs (mode « widen »), `page.tsx`/`AcquereurProfiles.tsx`.
- **Dépendances externes** : aucune.
- **Risques** : proposer des biens hors budget réel → toujours afficher l'écart et laisser l'agent juger ; ne jamais élargir en silence.
- **Preuve concurrentielle** : pratique standard des moteurs de saved-search (RealScout/kvCORE proposent des résultats proches) ; différenciant ici = explicite et actionnable côté agent.
- **Scénario de démo** : profil 3P Cannes 500k → 0 match → « Budget 540k : 2 biens · Le Cannet : 1 bien ». 30 s.
- **Indicateur de succès** : # profils sauvés d'un 0-résultat ; # critères ajustés depuis la suggestion.
- **Décompte** : impact 17/25 · utilité 16/20 · démontrable 12/15 · agentique 12/15 · faisabilité 13/15 · données 10/10 = **80 brut**. Pénalité −6 (valeur moindre si peu d'annonces en base, borne des variantes à cadrer) → **74**.

### Candidat 7 — Score de compatibilité travaux (rénovation vs rafraîchissement) · Taille S · **Score 72**

- **Problème métier exact** : deux acquéreurs au même budget ne veulent pas le même bien — l'un veut du clé-en-main, l'autre un projet à rénover moins cher. Le moteur actuel les traite pareil, donc propose mal.
- **Utilisateur concerné** : agent qui connaît le profil « travaux » de ses acquéreurs.
- **Moment du parcours** : scoring d'un bien nécessitant (ou non) des travaux.
- **Écran/emplacement** : `/prospection` onglet Matching, badge sur le match « Bien projet / Clé en main » aligné au profil.
- **Comportement du widget** : dérive un indice « état/travaux » de l'annonce à partir de signaux DÉJÀ présents (`dpe` faible F/G, `annee_construction` ancienne, prix/m² sensiblement sous la médiane de zone via l'engine estimation, mots-clés « à rafraîchir/rénover » dans description) et le confronte à un critère secondaire « appétence travaux » (dans `criteres_secondaires`, 0043) → bonus/malus explicable.
- **Action disponible** : filtrer/trier par adéquation travaux ; « Pourquoi » détaillé.
- **Automatisation éventuelle** : intégré au scoring standard.
- **Étape de validation humaine** : aucune (scoring). L'indice reste indicatif et affiché comme tel.
- **Données nécessaires** : DPE + année + prix/m² + mots-clés + préférence travaux acquéreur.
- **Données DÉJÀ dispo** : `prosp_annonces.dpe/annee_construction/description/prix/surface` (0015/mappers), engine estimation prix/m² (`lib/estimation/`), `criteres_secondaires` (0043). **`leads.financement`** (M04-06) peut affiner « capacité à financer des travaux » — CITÉ, non câblé par moi (frontière respectée).
- **Données manquantes** : la préférence « travaux » doit exister dans `criteres_secondaires` (déjà supporté comme champ libre par le schéma).
- **Routes/tables/composants** : `lib/prospection/matching/match.ts` + `weights.ts` (facteur travaux), `MatchReasons.tsx`.
- **Dépendances externes** : aucune (pas de LLM ; heuristique déterministe).
- **Risques** : indice imparfait (données annonce lacunaires) → le présenter comme estimation, jamais comme vérité ; plafonner son poids.
- **Preuve concurrentielle** : matchimo (« différence entre rafraîchir et rénovation complète ») — argument exact et récent d'un concurrent FR.
- **Scénario de démo** : acquéreur « projet travaux » → un F 1970 à -12 %/m² remonte avec badge « Bien projet, marge travaux ». 40 s.
- **Indicateur de succès** : # matchs enrichis d'un indice travaux ; adéquation perçue (👍) sur ces matchs.
- **Décompte** : impact 17/25 · utilité 15/20 · démontrable 12/15 · agentique 11/15 · faisabilité 12/15 · données 8/10 = **75 brut**. Pénalité −3 (fiabilité de l'indice sur données lacunaires) → **72**.

---

## 5. Idées rejetées

- **Scoring comportemental sur le trafic web de l'acquéreur (vues/clics IDX)** — aucun site IDX ni tracking acquéreur dans le repo (pas de saved-search public, pas d'analytics visiteur). Données absentes → −15. Rejeté.
- **Enrichissement LLM du profil acquéreur (résumé « ce qu'il veut vraiment »)** — appellerait OpenAI en boucle sur chaque profil (coût, §8) et n'ajoute pas de capacité de matching mesurable. Gadget IA. Rejeté.
- **Connexion MLS / portails pour élargir l'offre** — aucun MLS en France, MoteurImmo/Twilio hors service (clés absentes, brief). Dépendance indispo → −15. Rejeté.
- **Alertes SMS/WhatsApp acquéreur en direct** — transport non branché (CONFIG only, badge « Aperçu ») et contact acquéreur direct = risque RGPD/consentement → −20. Reste brouillon/HITL dans mes candidats. Rejeté en tant que feature autonome.
- **Refonte du barème de scoring (nouveau modèle ML entraîné)** — refonte profonde (−25) + volume de données insuffisant. Le candidat 3 (ajustement borné explicable) capture la valeur sans la refonte. Rejeté.
- **« Anniversaire de recherche » (relance à date fixe du critère)** — plus faible que le candidat 4 (déclencheur temporel arbitraire vs. déclencheur par nouveauté forte, plus pertinent commercialement) ; absorbé comme variante mineure de #4. Rejeté en candidat séparé.
- **Carte géographique interactive des matchs** — densité/UI (M04-09) + pas de tuiles carto en place ; effort UI sans capacité nouvelle d'intelligence. Hors domaine. Rejeté.
- **Détection de doublons d'acquéreurs entre agents du tenant** — valeur marginale mono-agent, complexité de rapprochement d'identités, risque RGPD inter-users. Rejeté.
