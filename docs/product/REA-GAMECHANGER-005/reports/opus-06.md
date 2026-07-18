# REA-GAMECHANGER-005 — Rapport OPUS 06

**Domaine : Agents externes Aigent/LangGraph via la gateway existante.**
Ce que des agents EXTERNES peuvent RÉELLEMENT exécuter via les 15 routes gateway,
et le **centre d'approbation / d'observation** comme PRODUIT (pas comme durcissement).
Frontière tenue : M04-02 = durcissement identité/idempotence/HITL de la gateway ;
M04-04 = contrat runtime strict. Moi = **quels agents, quels workflows, quelle surface
humaine** créent de la valeur métier démontrable. Aucun moteur interne, aucun faux run.

---

## Synthèse coordinateur

| # | Candidat | Écran | Taille | Score | Données prêtes | Effet business en une ligne |
|---|----------|-------|--------|-------|:--:|-----------------------------|
| 1 | **Centre d'approbation agent (Boîte à valider)** | `/agents` (onglet) + widget `/` | **M** | **88** | **O** | Débloque `alerts.dispatch` (aujourd'hui DENIED faute de flux humain) : l'agent prépare, l'humain approuve en 1 clic → l'envoi part réellement. C'est le chaînon manquant qui rend TOUTE la chaîne agentique utile. |
| 2 | **Agent Vigie d'opportunités vendeurs (nocturne)** | `/prospection` (onglet) + `/` | **M** | **85** | **O** | Un agent nocturne scrute `prosp_annonce_versions` (baisses de prix, stagnation) et pose des tâches « propriétaire ouvert à négocier » → l'agent démarre sa journée avec des mandats à aller chercher. |
| 3 | **Journal d'activité des agents (observabilité + rejeu)** | `/agents` (onglet) | **S** | **80** | **O** | Rend visible/auditables tous les appels gateway (`agent_gateway_audit_log`) : qui a fait quoi, quand, refusé/abouti. Confiance = condition de l'adoption d'agents autonomes. |
| 4 | **Agent qualificateur de leads entrants (draft ISA)** | `/leads` + `/leads/[id]` | **M** | **78** | **O** | Un lead entrant est qualifié et un 1er message de contact est **rédigé en brouillon** par l'agent (budget/délai/financement) → l'agent valide et envoie, vitesse de réponse ISA sans risque RGPD. |
| 5 | **Copilote « Lancer un agent depuis la fiche »** | `/leads/[id]`, `/properties/[id]`, `/prospection` | **S** | **74** | **O** | Boutons contextuels « Faire tourner l'agent matching / veille / relance » sur les fiches, câblés sur `createRun` — sort les agents de la page `/agents` isolée et les met là où le travail se fait. |
| 6 | **Déclencheur d'agent planifié (cron produit)** | `/agents` (réglages) | **S** | **72** | **P** | Un panneau où l'agent immobilier choisit *quand* ses agents tournent (chaque nuit, toutes les 4 h) via Inngest — l'autonomie devient réglable et lisible, pas une boîte noire. |

Les 6 candidats sont **≥70**. Aucun ne duplique une mission M04 (frontières citées candidat par candidat).
Zéro nouvelle infra majeure : tout s'appuie sur la gateway, le runtime Aigent feature-détecté, Inngest et
des tables **déjà présentes**. Toute communication reste **brouillon / soumise à validation humaine**.

---

## Lecture du terrain

Vérifié dans le worktree (lecture seule). Chemins et lignes réels.

### Gateway — 15 routes, contrat, scopes, idempotence, HITL
- **15 routes** confirmées sous `app/api/agent-gateway/v1/**` : `listings/collect`, `listings/normalize`,
  `buyers/list`, `buyers/get-profile`, `buyers/update-preferences`, `matching/compute`, `matching/persist`,
  `alerts/prepare`, `alerts/dispatch`, `crm/create-lead`, `crm/create-property`, `crm/create-mandate`,
  `crm/create-visit`, `valuations/get`, `valuations/update-interview`.
- **Squelette commun** `lib/agent-gateway/handler.ts` (`defineGatewayRoute`) : ordre de gardes fail-closed
  (auth Bearer → parse → schéma Zod → **authz frontière de confiance** `authz.ts` → handler budgété par
  timeout `Promise.race` → **audit systématique** même en DENIED). L'identité (tenant/acteur) est
  **DÉRIVÉE DE L'AUTH**, jamais du payload (handler.ts L173-185). C'est solide.
- **Scopes** `lib/agent-gateway/scopes.ts` L30-48 : 8 interfaces `read` (buyers.list/get_profile,
  matching.compute, valuations.get, listings.collect/normalize, alerts.prepare) / 8 `write`. Interface
  inconnue → `write` par défaut (fail-closed, L54-56).
- **Idempotence** `lib/agent-gateway/idempotent-write.ts` + table `agent_gateway_idempotency_keys`
  (migration `0044`, reserve→lookup→complete, index unique `(tenant_id, interface, idem_key)`). Un rejeu
  ne produit jamais un 2e effet. `crm.create_lead` renvoie l'id du lead déjà créé (create-lead/route.ts).
- **Audit** `lib/agent-gateway/audit.ts` + table `agent_gateway_audit_log` (`0044`) : **une ligne par
  appel**, tout statut (`AVAILABLE/UNAVAILABLE/DENIED/TIMEOUT`), `interface/tenant/user/agent/request_id/
  reason/duration_ms`. Table forensique service-role only (RLS deny-by-default, aucune policy).
- **HITL dur** `lib/agent-gateway/approval.ts` + table `agent_alert_approvals` (`0045`) : `alerts.dispatch`
  consomme atomiquement une approbation persistée liée à (tenant, acteur, agent, match, canal, **hash du
  contenu**), usage unique, expirable. Fail-closed : table absente / preuve expirée → **DENIED, aucun envoi**.

### Runtime Aigent + page `/agents`
- `lib/aigent/runtime.ts` : client OUTBOUND server-only, **feature-détecté** (`AIGENT_RUNTIME_BASE_URL` +
  `AIGENT_RUNTIME_TOKEN`). Sans config → `runtimeAvailability()={available:false, reason:"not_configured"}`,
  **aucune requête émise**. Ne fabrique JAMAIS d'agent/run/résultat (L60-64, 150-166). Expose `listAgents`,
  `getAgent`, `createRun` (avec `Idempotency-Key`), `getRun`, `getRunEvents`, `resumeRun`.
- `app/api/aigent/**` : proxy 7 routes (agents, agents/[id], .../runs, runs/[id], .../events, .../resume).
- `app/(dashboard)/agents/page.tsx` + `_components/AgentsCockpit.tsx` + `RunTracker.tsx` : cockpit
  **registry-driven**, rend l'état réel (chargé / vide / non connecté / erreur), suit UN run actif, gère la
  décision HITL (`HitlPanel` → `/resume`). État actuel réel du registre = **vide** (skeleton Aigent).
- `swarm_runs` (migrations `0030` pause `paused_hitl`, `0031` snapshot tokens/coût/décision) : table de
  suivi de runs avec pause HITL et snapshot métriques.

### Automatisation & transport
- **Inngest** `lib/jobs/inngest/functions.ts` + `app/api/inngest/route.ts` : `ping`, `generatePdf`,
  **`prospIngestion` (cron horaire)**, **`prospScoring` (cron 15 min : matching + claim atomique anti-double
  alerte)**. La plomberie cron existe et tourne déjà. Le scoring mandat est **désactivé** (commentaire
  functions.ts L116-118 : `prosp_annonces` n'a pas de colonne `score_mandat`).
- **Transport alertes** `lib/prospection/alert.ts` : `sendMatchAlerte` câble Twilio (`sendWhatsApp`) + Resend
  (`sendEmail`). Renvoie `{sent:false, reason:"no_channel"}` si aucun canal. Resend dispo côté infra ;
  Twilio/MoteurImmo = clés absentes (fallback Apify réel pour l'ingestion).

### Centre d'actions (asset transversal majeur)
- `rea_tasks` (migration `0043`) : colonnes `entity_type, entity_id, kind, title, notes, priority, due_at,
  status, snoozed_until`, index `(tenant_id,user_id,status)` + `(entity_type,entity_id)`, RLS par tenant.
- `lib/actions/derive.ts` : dérive le centre d'actions depuis données LIVE (overdue/today/relance/rdv/
  estimation/acquereur/match/proprietaire/mandat/**validation**). `lib/actions/types.ts` : `QuickAction`
  inclut `{kind:"done"}` (écrit `rea_tasks`) et une catégorie **`validation`** déjà prévue. **C'est la
  surface naturelle où un agent DÉPOSE du travail à valider** (mais aucune route gateway n'écrit `rea_tasks`
  aujourd'hui — seul `crm.create_*` existe → manque identifié).

### Matrice de capacités — mon domaine

| Capacité | Statut | Preuve (fichier) |
|----------|--------|------------------|
| 15 routes gateway (auth/scope/idempotence/audit) | **AVAILABLE persisté** | `app/api/agent-gateway/v1/**`, `0044` |
| Runtime Aigent (registre, runs, events, resume) | **AVAILABLE, feature-détecté** | `lib/aigent/runtime.ts`, `app/api/aigent/**` |
| Page `/agents` cockpit + RunTracker + HITL | **AVAILABLE, sous-exploité UI** (registre vide, page isolée) | `agents/_components/*` |
| HITL `alerts.dispatch` (consommation approbation) | **AVAILABLE serveur** MAIS **inutilisable** : flux humain de CRÉATION d'approbation **absent** | `approval.ts`, `0045` (commentaire : « créée hors gateway ») |
| `agent_gateway_audit_log` (journal complet) | **AVAILABLE persisté, AUCUNE UI** | `0044`, `audit.ts` (grep app/ = 0) |
| Cron Inngest (ingestion + scoring) | **AVAILABLE persisté** | `functions.ts` |
| Transport WhatsApp/email | **CONFIG** (Resend ok infra, Twilio absent, badge « envoi non branché ») | `alert.ts` |
| `prosp_annonce_versions` (historique prix/statut) | **AVAILABLE persisté, jamais exploité par un agent** | `database.types.ts` L3226-3236 |
| `rea_tasks` (dépôt de travail à valider) | **AVAILABLE persisté** ; PAS de route gateway `tasks.create` | `0043`, `derive.ts` |
| Route gateway `update-lead` / `create-task` | **MANQUE** (seul `crm.create_*` existe) | `app/api/agent-gateway/v1/crm/` |
| Écrans `/leads /properties /prospection` (couverts M04-06/09/11) | **couvert M04** (densité/câblage) — j'y AJOUTE des capacités agentiques nouvelles, pas de la densité | brief §14 |

**Lecture nette :** l'ossature agentique est **quasi complète côté serveur** (gateway durcie, HITL, audit,
idempotence, runtime honnête) mais **muette côté produit** — aucun humain ne peut approuver, personne ne
voit ce que font les agents, aucun agent ne tourne sur les données déjà stockées. **La valeur game-changer
n'est pas de construire plus de plomberie ; c'est de donner à cette plomberie une SURFACE humaine et des
AGENTS qui l'utilisent.**

---

## Preuves concurrentielles

| Produit | Capacité observée | URL | Date | Prouvé / Inféré |
|---------|-------------------|-----|------|-----------------|
| **Lofty (Homeowner Agent)** | Agent autonome qui scrute le CRM pour l'**intention vendeur** (likely sellers, absentee, pre-foreclosure), nurture perso avec valeur estimée/équité, **escalade sur signaux comportementaux** puis **passe en handoff et met en pause l'outreach** quand le contact demande une estimation/CMA. | inman.com/2026/04/03/lofty-launches-ai-tool-to-turn-crm-contacts-into-seller-leads ; lofty.com/news/lofty-introduces-homeowner-agent | 2026-07-18 | **Prouvé** (contenu article) |
| **Rechat (Lucy)** | Agent qui, **pendant que l'agent dort**, prépare marketing/CMA/emails, **suit les nouvelles annonces et rédige la copie** ; « vous donnez juste le feu vert final » → **HITL par approbation avant publication**. AI Memo (avr. 2026) structure les conversations en next-steps. | rechat.ai/lucy ; realestatenews.com/2026/04/09/shilo-rechat-lofty-add-ai-tools | 2026-07-18 | **Prouvé** (page produit + presse) |
| **Structurely (Aisa Holmes)** | ISA IA qui **qualifie par SMS/appel** (délai, budget, financement, adresse), **handoff chaud** vers l'humain avec historique complet dès qu'un trigger (mot-clé / score) est détecté ; alerte CRM/SMS/email. Critique 2026 : le transfert « rappeler dans une fenêtre » réintroduit le problème de vitesse. | structurely.com/real-estate/conversational-ai-realtor-lead-qualification ; letshackre.com/articles/best-ai-lead-response-2026 | 2026-07-18 | **Prouvé** (page + comparatif daté) |
| **kvCORE / BoldTrail** | **Smart campaigns** qui ajustent le message selon le comportement du lead, alertes « qui est prêt », follow-up autonome ; +15-25 % conversion vs drip générique (rapporté). Pas d'agent nommé isolé. | boldtrail.com/platform ; theprotoolkit.com/boldtrail-review-2026 | 2026-07-18 | Prouvé (capacités) / **Inféré** (chiffres rapportés par tiers) |
| **Ylopo (AI Voice)** | Voix IA qui **appelle 24/7**, qualifie délai/budget, **live-transfer** dès intention confirmée. Autonome, mais **pas** de « brouillon à valider » (envoi direct). | ylopo.com/ylopo-ai-voice ; build.inc/insights/ai-voice-agents-real-estate-2026 | 2026-07-18 | **Prouvé** (page produit) |
| **MoteurImmo (FR)** | **Historique des prix** stocké et affiché sur chaque annonce : repérer les propriétaires qui ont **déjà ajusté leur prix** (« signe d'ouverture à la discussion »), détecter la stagnation, l'urgence. **AUCUNE alerte automatique** — « affiché pour revue manuelle ». | blog.moteurimmo.fr/historique-des-prix-detecter-les-baisses-significatives-dans-le-temps | 2026-07-18 | **Prouvé** (article, absence d'alerte confirmée) |
| **PriceHubble (FR/EU)** | AVM + widget capteur de vendeurs ; « transforme la donnée immo en **signal d'intention** et opportunité de relation » (interview dirigeant). Orienté banques/pro. | pricehubble.com ; inbanque.com/loeiz-bourdic-pricehubble | 2026-07-18 | Prouvé (positionnement) / **Inféré** (pas de démo agent autonome vue) |

**Découverte marquante :** le marché US 2026 (Lofty, Rechat) a basculé vers des **agents autonomes qui
PRÉPARENT pendant la nuit et exigent le feu vert humain avant tout envoi** — exactement la posture
`prepare → approbation HITL → dispatch` que la gateway Azigo **implémente déjà côté serveur mais n'expose
pas**. Côté FR, MoteurImmo **stocke** l'historique de prix (comme Azigo via `prosp_annonce_versions`) mais
**ne pousse aucune alerte** : la détection d'opportunité vendeur reste 100 % manuelle. **Azigo peut être le
premier outil FR à faire tourner un agent nocturne sur cet historique** — capacité que le leader du marché
ne propose pas.

---

## Candidats

### Candidat 1 — Centre d'approbation agent (« Boîte à valider ») · **M · 88/100**

- **Problème métier exact :** la chaîne agentique la plus utile (agent prépare une alerte acquéreur / un
  message vendeur → l'humain valide → ça part) est **impossible aujourd'hui** : `alerts.dispatch` exige une
  approbation persistée dans `agent_alert_approvals`, mais **aucune surface ne permet à l'humain d'en créer
  une**. La migration `0045` le dit noir sur blanc : « l'approbation est CRÉÉE par un flux humain (hors
  périmètre gateway) ». Ce flux **n'existe pas**. Résultat : tout envoi agentique est perpétuellement DENIED.
- **Utilisateur concerné :** l'agent immobilier (valideur) — tout tenant.
- **Moment du parcours :** en début/fin de journée, ou notification ponctuelle quand un agent a préparé
  quelque chose (« 3 messages en attente de ton feu vert »).
- **Écran/emplacement :** **`/agents`** — nouvel onglet « À valider » (la page existe, elle est le lieu
  d'exploitation des agents) + **carte de rappel sur `/`** branchée sur la catégorie `validation` déjà
  présente dans `lib/actions/derive.ts`. Aucun nouveau menu top-level.
- **Comportement du widget :** liste des demandes d'approbation en attente. Chaque carte affiche **le
  contenu EXACT préparé** (déjà renvoyé par `alerts.prepare` : `content`, `proposed_channel`, `content_hash`,
  `annonce_id`, `buyer_id`, `score`), la cible, l'agent émetteur, l'expiration. Le hash affiché = celui qui
  sera vérifié à l'envoi (anti-substitution).
- **Action disponible :** **Approuver** (crée la ligne `agent_alert_approvals` status `approved`, liée au
  hash exact, expirable) / **Refuser** (aucune ligne) / **Éditer avant approbation** (recalcule le hash sur
  le contenu modifié). Approuver **débloque** `alerts.dispatch` qui, lui, existe déjà et enverra réellement.
- **Automatisation éventuelle :** aucune côté approbation (c'est le point humain **par construction**).
  L'automatisation est en amont (l'agent qui prépare) et en aval (le dispatch après feu vert).
- **Étape de validation humaine :** **c'est LE candidat de validation humaine.** Rien ne part sans clic.
- **Données nécessaires :** contenu préparé + contexte du match → déjà fourni par `alerts.prepare`.
- **Données DÉJÀ dispo (repo) :** `alerts.prepare` route (`app/api/agent-gateway/v1/alerts/prepare/route.ts`,
  renvoie `content`+`content_hash`+`proposed_channel`) ; `consumeAlertApproval` + `contentHash`
  (`lib/agent-gateway/approval.ts`) ; table `agent_alert_approvals` (`0045`) ; catégorie `validation` +
  `rea_tasks kind='validation'` (`derive.ts`, `types.ts`). **Il ne manque que le côté CRÉATION + l'UI.**
- **Données manquantes :** une petite route serveur `POST /api/agent-approvals` (INSERT status `approved`,
  owner-check user+tenant, `expires_at` borné) — miroir de la consommation, ~40 lignes. La migration `0045`
  doit être appliquée sur gpu1 (aujourd'hui non déployée → tout est DENIED).
- **Routes/tables/composants concernés :** nouvelle route `app/api/agent-approvals/route.ts` (create+list) ;
  nouveau composant `app/(dashboard)/agents/_components/ApprovalInbox.tsx` ; réutilise `alerts.prepare`,
  `agent_alert_approvals`, `derive.ts` (catégorie validation).
- **Dépendances externes :** aucune pour approuver. L'envoi réel dépend de Resend (dispo) / Twilio (absent) —
  mais l'approbation, le hash, l'audit et le blocage fonctionnent **sans transport** (l'email Resend suffit
  à démontrer un envoi bout-en-bout ; WhatsApp reste « préparé »).
- **Taille estimée :** **M** (3-4 j : route create/list + UI inbox + intégration carte accueil + tests).
- **Risques :** aucun RGPD (rien n'est envoyé sans humain, opt-out revérifié au dispatch). Risque : que
  `0045` reste non déployée → l'UI marche mais l'approbation échoue ; à poser en préalable. Bien scoper
  `expires_at` (défaut court, ex. 24 h) pour ne pas laisser traîner des approbations valides.
- **Preuve concurrentielle :** Rechat/Lucy « vous donnez juste le feu vert final » ; Lofty passe en handoff
  et met en pause ; le pattern « prepare puis approbation humaine avant envoi » est le standard 2026.
- **Scénario de démo :** l'agent nocturne prépare une alerte acquéreur → carte « À valider » sur `/agents`
  avec le message exact → clic **Approuver** → `alerts.dispatch` (déjà en place) envoie l'email Resend →
  ligne d'audit `AVAILABLE`. Refuser sur une autre → aucun envoi, audit `DENIED`.
- **Indicateur de succès :** nombre d'approbations traitées/jour ; part des envois qui passent le HITL sans
  ré-édition ; **zéro `alerts.dispatch` DENIED pour "approval_required"** une fois la boîte adoptée.
- **Frontière M04 :** M04-02 **durcit** la consommation d'approbation (côté gateway) ; moi je livre la
  **surface humaine de CRÉATION + le produit inbox**, qui n'existe dans aucune mission M04.

**Décompte :** impact business 24/25 (débloque toute la chaîne agentique) · utilité quotidienne 17/20 ·
effet démontrable 15/15 · avantage agentique 15/15 · faisabilité 12/15 (dépend du déploiement `0045`) ·
dispo données 8/10 (petite route create manquante). **Pénalités : 0. = 88.**

---

### Candidat 2 — Agent Vigie d'opportunités vendeurs (nocturne) · **M · 85/100**

- **Problème métier exact :** le plus gros levier commercial d'un agent immobilier = **trouver des mandats**.
  Un signal fort de vendeur motivé = **une annonce dont le prix a baissé ou qui stagne**. Azigo **stocke
  déjà cet historique** (`prosp_annonce_versions` : `prix`, `statut`, `observed_at`), mais **personne ne le
  regarde** : aucune détection, aucune alerte. L'agent doit éplucher à la main (comme sur MoteurImmo).
- **Utilisateur concerné :** l'agent immobilier en quête de mandats (prospection vendeur).
- **Moment du parcours :** chaque matin — l'agent ouvre Azigo et trouve « 4 propriétaires potentiellement
  ouverts à la négociation depuis cette nuit ».
- **Écran/emplacement :** **`/prospection`** — nouvel onglet « Opportunités vendeurs » (l'écran prospection
  a déjà 5 onglets, celui-ci est une capacité NOUVELLE, pas de la densité) + items dans le centre d'actions
  `/` (catégorie `proprietaire`/`mandat` déjà dérivée par `derive.ts`).
- **Comportement du widget :** liste des annonces avec **baisse de prix significative** (delta calculé sur
  `prosp_annonce_versions`), **stagnation** (même prix depuis N jours), ou **retrait/re-listing**. Chaque
  ligne : bien, ancien→nouveau prix, ancienneté, lien fiche annonce, **explication du signal** (comme
  l'`explain.ts` du matching : « prix −8 % il y a 3 j », « en ligne depuis 62 j sans changement »).
- **Action disponible :** **Créer une tâche « contacter le propriétaire »** (`rea_tasks`, entity=annonce),
  **Créer un lead vendeur** (`crm.create_lead kind:vendeur` via gateway), ou ouvrir la fiche. Aucun contact
  automatique (RGPD : on ne connaît pas forcément le vendeur, respect `prosp_optout`).
- **Automatisation éventuelle :** **agent nocturne** (LangGraph via runtime Aigent, OU cron Inngest si Aigent
  non raccordé) qui, chaque nuit, lit les versions du jour, calcule les deltas, **pose des `rea_tasks`
  priorité haute**. L'agent PRÉPARE l'opportunité ; l'humain décide d'appeler.
- **Étape de validation humaine :** l'agent ne contacte personne — il **dépose une tâche à traiter**. Tout
  contact vendeur passe par l'humain. (Alignement Lofty « handoff », mais sans outreach auto côté vendeur
  inconnu.)
- **Données nécessaires :** historique prix/statut par annonce (delta, durée) → **déjà en base**.
- **Données DÉJÀ dispo (repo) :** `prosp_annonce_versions` (`database.types.ts` L3226-3236, colonnes
  `prix/statut/observed_at/snapshot`) ; `prosp_annonces` ; pipeline d'ingestion `prospIngestion` cron
  (`functions.ts`) qui **alimente déjà** ces versions ; `rea_tasks` + `derive.ts` (dépôt d'items) ;
  `crm.create_lead` gateway. Le scoring mandat est aujourd'hui **désactivé** faute de colonne — cet agent le
  **remplace par un calcul de delta sur les versions** (aucune colonne à ajouter).
- **Données manquantes :** une petite route gateway **`tasks.create`** (ou réutiliser `crm.create_lead`) pour
  que l'agent EXTERNE dépose la tâche via la gateway auditée (sinon le cron Inngest interne le fait
  directement) — ~50 lignes, même moule `defineGatewayRoute`.
- **Routes/tables/composants concernés :** `lib/prospection/` (nouvel util `detectPriceDrops` sur les
  versions) ; `functions.ts` (nouvelle fonction Inngest nocturne OU run Aigent) ; onglet
  `app/(dashboard)/prospection/` ; option route `app/api/agent-gateway/v1/tasks/create/route.ts`.
- **Dépendances externes :** aucune nouvelle — l'ingestion Apify (fallback réel) alimente déjà les versions.
  MoteurImmo enrichirait mais n'est pas requis.
- **Taille estimée :** **M** (3-5 j : détection deltas + agent/cron + onglet + dépôt tâches).
- **Risques :** faux positifs (baisse cosmétique) → seuil de significativité configurable (pas de magic
  number). RGPD : on ne contacte PAS le vendeur automatiquement, on aide l'agent à décider → conforme.
- **Preuve concurrentielle :** MoteurImmo stocke l'historique mais **n'alerte pas** (prouvé, article
  2026-07-18) → Azigo serait le **premier FR à automatiser la détection d'opportunité vendeur**. Lofty
  Homeowner Agent fait l'équivalent sur le CRM US (intention vendeur → pipeline).
- **Scénario de démo :** injecter une version de baisse de prix sur une annonce existante → l'agent nocturne
  (ou déclenché à la demande) détecte le delta → une `rea_task` « propriétaire ouvert à négocier » apparaît
  sur `/` et dans l'onglet → clic « Créer lead vendeur » → lead en base.
- **Indicateur de succès :** nb d'opportunités détectées/semaine ; nb de leads vendeur créés depuis ces
  signaux ; taux de transformation en mandat (via `mandates`).
- **Frontière M04 :** M04-09 **densifie** l'UI prospection existante (annonces/matching/feedback). Moi
  j'ajoute une **capacité NOUVELLE** (exploitation agentique de l'historique de versions pour la prospection
  VENDEUR), absente des 5 onglets actuels et de M04-09.

**Décompte :** impact business 24/25 (mandats = cœur du revenu) · utilité quotidienne 18/20 · effet
démontrable 13/15 · avantage agentique 15/15 · faisabilité 12/15 · dispo données 9/10 (versions déjà là).
**Pénalités : 0. = 91 brut → ajusté 85** (léger risque faux-positifs + petite route gateway à ajouter).

---

### Candidat 3 — Journal d'activité des agents (observabilité + rejeu) · **S · 80/100**

- **Problème métier exact :** on demande à un agent immobilier de **faire confiance à des agents autonomes**
  qui touchent son CRM et préparent des envois. Or **rien n'est visible** : `agent_gateway_audit_log`
  enregistre chaque appel (interface, statut, agent, durée, raison) mais **aucun écran ne le montre**
  (grep `app/` = 0). Sans traçabilité lisible, l'autonomie est anxiogène et non adoptée.
- **Utilisateur concerné :** l'agent immobilier (confiance/contrôle) + l'admin (supervision multi-tenant).
- **Moment du parcours :** après une exécution (« qu'a fait l'agent cette nuit ? »), ou en cas de doute
  (« pourquoi cet envoi n'est pas parti ? » → réponse : `DENIED / approval_required`).
- **Écran/emplacement :** **`/agents`** — onglet « Journal » (la page cockpit existe et affiche déjà les
  runs ; on ajoute la **couche audit gateway**, complémentaire des runs Aigent).
- **Comportement du widget :** flux chronologique des appels gateway : horodatage, **interface**
  (`crm.create_lead`, `matching.compute`, `alerts.dispatch`…), **statut coloré**
  (AVAILABLE/DENIED/TIMEOUT/UNAVAILABLE), agent émetteur, acteur, durée, raison. Filtres par statut/interface/
  agent. Lien vers l'entité touchée quand identifiable.
- **Action disponible :** consulter, filtrer, **rejouer une lecture** (relancer `matching.compute` /
  `valuations.get` avec les mêmes paramètres — idempotent, sans effet de bord). Le rejeu d'écriture reste
  protégé par l'idempotence (pas de doublon).
- **Automatisation éventuelle :** aucune — surface d'observation pure.
- **Étape de validation humaine :** N/A (lecture). Le rejeu d'écriture, s'il est offert, repasse par le HITL.
- **Données nécessaires :** le log lui-même → **déjà persisté**.
- **Données DÉJÀ dispo (repo) :** `agent_gateway_audit_log` (`0044`, index sur interface/tenant/request_id) ;
  `lib/agent-gateway/audit.ts` ; `swarm_runs` (métriques tokens/coût `0031`) pour croiser avec les runs.
- **Données manquantes :** une route de lecture serveur `GET /api/agent-activity` (service-role, owner-scope
  tenant, `LIMIT` obligatoire, tri `created_at desc`) — la table est service-role only, pas de PostgREST
  direct client.
- **Routes/tables/composants concernés :** `app/api/agent-activity/route.ts` (read paginé) ; composant
  `app/(dashboard)/agents/_components/ActivityLog.tsx` ; lit `agent_gateway_audit_log`.
- **Dépendances externes :** aucune.
- **Taille estimée :** **S** (1-2 j : route read paginée + tableau filtrable ; rejeu lecture optionnel).
- **Risques :** volume du log → pagination + `LIMIT` + index déjà présents. Ne jamais exposer de secret
  (le log ne contient ni payload sensible ni clé — seulement métadonnées). Cast non typé de la table
  (comme `approval.ts`) documenté localement.
- **Preuve concurrentielle :** l'observabilité/replay des agents est un axe explicite du marché agentique
  2026 (Rechat suit les transactions, Structurely fournit l'historique complet au handoff). Aucun concurrent
  FR ne montre un journal d'appels d'agents auditables au niveau interface.
- **Scénario de démo :** faire tourner `matching.compute` + une tentative `alerts.dispatch` sans approbation
  → le journal montre `AVAILABLE` (matching) et `DENIED / approval_required` (dispatch) horodatés → l'agent
  comprend **exactement** pourquoi rien n'est parti.
- **Indicateur de succès :** consultation du journal (adoption) ; réduction des tickets « pourquoi l'agent
  n'a rien envoyé » ; temps de diagnostic d'un run.
- **Frontière M04 :** M04-02 produit/durcit les **écritures** d'audit (côté gateway). Moi je livre la
  **LECTURE / observabilité comme produit** — aucune mission M04 ne rend l'audit visible à l'agent.

**Décompte :** impact business 18/25 · utilité quotidienne 15/20 · effet démontrable 14/15 · avantage
agentique 15/15 · faisabilité 14/15 · dispo données 10/10. **Pénalités : 0. = 86 brut → ajusté 80**
(utilité quotidienne modérée : outil de confiance/diagnostic, pas d'usage horaire).

---

### Candidat 4 — Agent qualificateur de leads entrants (brouillon ISA) · **M · 78/100**

- **Problème métier exact :** un lead entrant non qualifié et non contacté vite = perdu (« speed-to-lead »).
  L'agent immobilier n'est pas toujours dispo pour qualifier (budget/délai/financement) et rédiger un 1er
  message. Les concurrents (Structurely, Ylopo) automatisent ça — mais souvent en **envoyant directement**,
  ce qui est risqué en France (RGPD, ton, erreurs).
- **Utilisateur concerné :** l'agent immobilier (conversion des leads acheteurs).
- **Moment du parcours :** dès qu'un lead entre (`leads` créé, status `nouveau`) — l'agent trouve une fiche
  **pré-qualifiée** avec un **brouillon de message prêt**.
- **Écran/emplacement :** **`/leads`** (badge « à qualifier ») + **`/leads/[id]`** (bloc « Proposé par
  l'agent » : synthèse de qualification + brouillon éditable). Écrans existants.
- **Comportement du widget :** l'agent (LangGraph via runtime) lit le lead + son contexte (budget déclaré,
  critères acquéreur liés s'il y en a via `prosp_criteres_acquereur`), **propose une qualification**
  structurée (délai/budget/financement — champ `financement` réservé M04-06, donc on n'écrit pas ce champ,
  on **suggère** la question) et **rédige un 1er message de prise de contact en BROUILLON**.
- **Action disponible :** **Éditer + envoyer** le brouillon (via `alerts.dispatch`/Gmail Composio après
  approbation), **Marquer qualifié**, **Créer une tâche de relance** (`rea_tasks`). Rien n'est envoyé sans
  clic.
- **Automatisation éventuelle :** déclenchement à la création du lead (event Inngest) OU à la demande depuis
  la fiche. L'agent PRÉPARE ; ne contacte jamais seul.
- **Étape de validation humaine :** **obligatoire** — le message est un brouillon, l'envoi passe par le HITL
  (candidat 1) ou par l'action Gmail explicite.
- **Données nécessaires :** lead + contexte critères → **déjà en base**.
- **Données DÉJÀ dispo (repo) :** `leads` (`kind`, `budget_min/max`, `status`, champ `financement` présent
  mais réservé M04-06) ; `buyers.get_profile` / `buyers.list` gateway ; `prosp_criteres_acquereur` ;
  `rea_tasks` ; tool Gmail Composio (`gmail-estimation.ts`, écriture LIVE historique) ; `alerts.dispatch`
  (envoi après approbation).
- **Données manquantes :** aucune donnée nouvelle ; le brouillon est **calculé**, pas stocké (ou stocké en
  `rea_tasks.notes`). L'agent EXTERNE lit via `buyers.get_profile`, qui existe.
- **Routes/tables/composants concernés :** run Aigent (agent « qualificateur ») ; `buyers.get_profile` ;
  bloc UI `app/(dashboard)/leads/[id]/` ; `rea_tasks` pour la relance ; réutilise candidat 1 pour l'envoi.
- **Dépendances externes :** Aigent raccordé (runtime feature-détecté) OU, à défaut, un agent OpenAI interne
  (mais le brief cadre les agents comme EXTERNES via Aigent). Envoi = Gmail Composio (dispo) ou Resend.
- **Taille estimée :** **M** (3-5 j : agent + lecture profil + bloc fiche + brouillon éditable + tests).
- **Risques :** qualité du brouillon (ton FR) → toujours éditable, jamais auto-envoyé. Ne PAS écrire le champ
  `financement` (frontière M04-06). RGPD : brouillon = zéro contact non consenti.
- **Preuve concurrentielle :** Structurely qualifie délai/budget/financement + handoff ; Ylopo qualifie
  24/7 ; **différenciateur Azigo = brouillon à valider (feu vert humain) plutôt qu'envoi direct** — la
  critique 2026 de Structurely (« rappeler dans une fenêtre ») montre que le tout-auto a ses limites.
- **Scénario de démo :** créer un lead acheteur → l'agent qualifie (budget/délai) + rédige un brouillon
  visible sur la fiche → l'agent édite → envoi via Gmail/Resend après feu vert.
- **Indicateur de succès :** délai lead→1er contact ; part des leads qualifiés < 1 h ; taux de réponse.
- **Frontière M04 :** M04-06 câble **le champ `financement`** bout-en-bout (je n'y touche pas, je le
  suggère seulement) ; M04-08 densifie l'accueil. Moi j'ajoute un **agent de qualification + brouillon**,
  capacité absente de M04.

**Décompte :** impact business 21/25 · utilité quotidienne 17/20 · effet démontrable 12/15 · avantage
agentique 14/15 · faisabilité 11/15 (dépend d'Aigent raccordé pour l'agent externe) · dispo données 9/10.
**Pénalités : 0. = 84 brut → ajusté 78** (dépendance au raccordement Aigent + recouvrement partiel de
surface avec M04-06 sur le lead).

---

### Candidat 5 — Copilote « Lancer un agent depuis la fiche » · **S · 74/100**

- **Problème métier exact :** les agents Aigent sont **enfermés dans la page `/agents`**, loin de là où
  l'agent immobilier travaille (une fiche lead, un bien, l'écran prospection). Personne ne va sur `/agents`
  au milieu d'un dossier. L'autonomie ne sert que si elle est **là où est le travail**.
- **Utilisateur concerné :** l'agent immobilier, en plein dossier.
- **Moment du parcours :** au fil de l'eau — sur une fiche, « fais tourner l'agent matching pour cet
  acquéreur / la veille pour ce bien ».
- **Écran/emplacement :** **`/leads/[id]`, `/properties/[id]`, `/prospection`** — bouton contextuel « Agent »
  (menu discret) selon l'entité. Écrans existants, aucun nouveau menu.
- **Comportement du widget :** bouton qui appelle `createRun(agentId, input)` avec le contexte de l'entité
  (buyer_id, property_id…), puis **remonte le `RunTracker` existant** (états réels + événements + HITL). Si
  Aigent n'est pas raccordé → état honnête « non connecté » (déjà géré).
- **Action disponible :** lancer un run ciblé ; suivre ; valider HITL si le run le demande.
- **Automatisation éventuelle :** déclenchement manuel (le cron reste pour le nocturne). C'est le **pont**
  entre l'humain et les agents.
- **Étape de validation humaine :** le lancement est explicite ; tout effet sensible repasse par le HITL du
  run (`resumeRun`).
- **Données nécessaires :** l'id de l'entité + un agent publié → dépend du registre Aigent.
- **Données DÉJÀ dispo (repo) :** `createRun`/`getRun`/`getRunEvents`/`resumeRun` (`runtime.ts`) ; proxy
  `/api/aigent/**` ; `RunTracker.tsx` (réutilisable tel quel) ; fiches entités existantes.
- **Données manquantes :** aucune donnée ; il faut juste **exposer un déclencheur** hors de `/agents` et
  mapper entité→input. Dépend d'agents réellement publiés côté Aigent (registre vide aujourd'hui).
- **Routes/tables/composants concernés :** petit composant `LaunchAgentButton` réutilisant `AgentCard`/
  `RunTracker` ; intégration dans les 3 fiches ; `POST /api/aigent/agents/[id]/runs` (existe).
- **Dépendances externes :** **Aigent raccordé + au moins un agent publié** (sinon le bouton affiche « non
  connecté »). C'est la principale limite aujourd'hui.
- **Taille estimée :** **S** (1-2 j : bouton + mapping input + réutilisation RunTracker).
- **Risques :** sans agent publié, la valeur est nulle → à livrer **avec** au moins un agent réel (ex.
  l'agent matching du candidat 2/4). Ne jamais fabriquer un run factice (règle dure).
- **Preuve concurrentielle :** Rechat/Lucy et Lofty exposent leurs agents **dans le contexte** (fiche
  contact, transaction), pas dans une page isolée — l'intégration contextuelle est l'attendu 2026.
- **Scénario de démo :** sur une fiche acquéreur, bouton « Lancer le matching » → run réel via Aigent →
  RunTracker montre les événements → HITL si besoin.
- **Indicateur de succès :** nb de runs lancés depuis les fiches vs `/agents` ; adoption contextuelle.
- **Frontière M04 :** M04-04 durcit **le contrat runtime** ; M04-11 densifie les fiches CRM. Moi j'ajoute le
  **déclencheur contextuel** (produit), absent de M04.

**Décompte :** impact business 17/25 · utilité quotidienne 16/20 · effet démontrable 13/15 · avantage
agentique 14/15 · faisabilité 13/15 · dispo données 8/10. **Pénalité : dépendance externe Aigent partielle
−5 (registre vide aujourd'hui). = 76 brut → ajusté 74.**

---

### Candidat 6 — Déclencheur d'agent planifié (cron produit) · **S · 72/100**

- **Problème métier exact :** l'autonomie « nocturne » (candidats 2/4) est aujourd'hui **figée dans le code**
  (`prospIngestion` horaire, `prospScoring` 15 min). L'agent immobilier ne peut ni choisir **quand** ses
  agents tournent, ni voir qu'ils sont programmés → l'autonomie est une **boîte noire**.
- **Utilisateur concerné :** l'agent immobilier (contrôle de l'autonomie) + admin.
- **Moment du parcours :** une fois, au réglage (« je veux la veille chaque nuit à 6 h, le matching toutes
  les 4 h »), puis rassuré au quotidien (« prochaine exécution : 6 h »).
- **Écran/emplacement :** **`/agents`** — section « Planification » (réglages), sous le registre.
- **Comportement du widget :** liste des agents/jobs planifiés avec **fréquence lisible** (chaque nuit /
  toutes les 4 h / manuel), **dernière** et **prochaine** exécution, statut du dernier run
  (`swarm_runs`/audit). Interrupteur activer/désactiver par job.
- **Action disponible :** activer/désactiver un job planifié ; changer la fréquence (choix bornés, pas de
  cron libre) ; « lancer maintenant ».
- **Automatisation éventuelle :** c'est le **panneau de contrôle de l'automatisation** ; Inngest exécute.
- **Étape de validation humaine :** le réglage est humain ; les effets sensibles des runs restent sous HITL.
- **Données nécessaires :** état des jobs + historique d'exécution → dérivable de l'audit / `swarm_runs`.
- **Données DÉJÀ dispo (repo) :** `functions.ts` (jobs Inngest existants) ; `app/api/inngest/route.ts` ;
  `swarm_runs` + `agent_gateway_audit_log` (dernier run/statut). Config par tenant possible via
  `prosp_config` (déjà utilisé pour les zones).
- **Données manquantes :** une petite table/colonnes de **préférences de planification par tenant**
  (fréquence, activé) — ou réutiliser `prosp_config` en JSON. Inngest reste le moteur (pas de nouvelle
  infra).
- **Routes/tables/composants concernés :** `prosp_config` (ou table `agent_schedules`) ; route
  `POST /api/agent-schedules` ; section UI dans `/agents` ; `functions.ts` lit la préférence.
- **Dépendances externes :** Inngest (déjà en place). Rien de neuf.
- **Taille estimée :** **S** (1-2 j si réutilisation `prosp_config` ; M si table dédiée + « lancer
  maintenant »).
- **Risques :** ne pas offrir de cron libre (garde-fou : fréquences bornées). Cohérence des fuseaux (Europe/
  Paris). Éviter de laisser croire qu'un job tourne s'il est désactivé.
- **Preuve concurrentielle :** kvCORE/BoldTrail « follow-up qui se fait tout seul », Rechat « pendant que
  vous dormez » — l'autonomie planifiée et **visible** est un standard ; la rendre **réglable** par l'agent
  est le différenciateur.
- **Scénario de démo :** activer « Veille vendeurs — chaque nuit 6 h » → « prochaine exécution » affichée →
  « lancer maintenant » → run visible dans le journal.
- **Indicateur de succès :** nb de jobs activés par tenant ; régularité des exécutions ; réduction du
  sentiment de « boîte noire » (adoption des agents nocturnes).
- **Frontière M04 :** aucune mission M04 ne touche à la planification agentique visible. M04-05 concerne
  boot/health/CI (infra), pas le contrôle produit des crons d'agents.

**Décompte :** impact business 16/25 · utilité quotidienne 14/20 · effet démontrable 12/15 · avantage
agentique 14/15 · faisabilité 13/15 · dispo données 7/10 (préférence à ajouter). **Pénalités : 0. = 76
brut → ajusté 72** (dépend des candidats 2/4 pour avoir des agents à planifier ; utilité réglage ponctuel).

---

## Idées rejetées

- **Agent voix sortant qui appelle les leads (type Ylopo/Bland)** — dépendance externe indispo (Twilio Voice
  absent, aucune brique voix), risque RGPD appel non consenti. −15 dépendance −20 RGPD. Éliminé.
- **Envoi WhatsApp automatique des alertes de match** — `alerts.dispatch` **existe** mais reste DENIED
  (approbation absente) et Twilio absent ; l'automatiser sans HITL viole la règle dure « brouillon/validation
  ». Le vrai game-changer est le **candidat 1** (créer le flux d'approbation), pas l'auto-envoi. Éliminé.
- **Nouveau moteur d'orchestration multi-agents interne (chaînes/graphes maison)** — le brief l'interdit
  (Swarms/CrewAI RETIRÉ, agents EXTERNES via Aigent). Duplique M04-04 (contrat runtime). Éliminé.
- **Constructeur d'agents dans `/agents` (créer/éditer un graphe/prompt)** — hors périmètre : cette page est
  un **cockpit d'exploitation**, la construction vit dans Aigent (page.tsx L20-22). Refonte + hors scope.
  Éliminé.
- **Agent « estimation de suivi » qui recontacte les propriétaires estimés** — recouvre M04-10 (continuité
  commerciale estimation) + M04-06 (financement) ; contact vendeur = RGPD si non consenti. Duplication +
  risque. Éliminé (l'angle « opportunité vendeur via versions de prix » du candidat 2 est distinct et non
  couvert).
- **Scoring mandat réactivé comme feature** — la colonne `score_mandat` manque (`functions.ts` L116-118) et
  le scoring appartient à `prosp_prospects` (exige `user_id`). Le candidat 2 le **remplace** par un delta
  sur `prosp_annonce_versions` (aucune colonne à ajouter). Rejeté en tant que tel.
- **Streaming temps réel des runs (SSE/WebSocket)** — Realtime Supabase absent (PostgREST-only) ; le
  `RunTracker` poll déjà (2 s) et suffit. Nouvelle infra pour un gain marginal. −20 infra. Éliminé.
- **Tableau de bord coûts/tokens des agents** — `swarm_runs` a `tokens_in/out/cost_usd` (`0031`) mais le
  registre Aigent est vide (aucun run réel), donnée non peuplée aujourd'hui → gadget prématuré. Reporté (à
  intégrer au candidat 3 quand des runs existeront). Éliminé pour l'instant.
- **Route gateway `execute_sql` / `call_any_route` pour agents** — interdit par principe (le modèle ne reçoit
  jamais le service-role, pas de tool générique). Risque sécurité majeur. Éliminé.

---

**Note d'honnêteté :** l'ossature agentique (gateway 15 routes, HITL, audit, idempotence, runtime
feature-détecté) est **réelle et durcie**, mais **trois surfaces produit manquent** et bloquent toute la
valeur : (1) le **flux humain de création d'approbation** (sans lui `alerts.dispatch` est mort), (2)
**l'observabilité** de l'audit, (3) **un agent qui exploite les données déjà stockées** (versions de prix).
Mes candidats 1-3 comblent exactement ces trois manques avec des tailles S/M, zéro moteur interne, zéro faux
run. La migration `0045` (approbations) et un déploiement gpu1 sont un préalable au candidat 1 — signalé,
non contourné.
