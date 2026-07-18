# REA-GAMECHANGER-005 — Opus 01 · Journée de l'agent immobilier (intelligence de priorisation)

> Domaine : next-best-actions FIABLES, détection de fraîcheur/refroidissement, réactivation intelligente,
> briefing quotidien généré, chronologie unifiée. **Frontière permanente avec M04-08** (« cockpit quotidien +
> agenda » = hiérarchie urgent→aujourd'hui→ensuite + densification de l'action center `rea_tasks` existant) :
> M04-08 ORGANISE et DENSIFIE ce que `lib/actions/derive.ts` produit déjà ; moi je cherche l'INTELLIGENCE
> AU-DELÀ — des SCORES/RÈGLES dérivés de signaux réels aujourd'hui NON exploités, un briefing GÉNÉRÉ, la
> détection d'OUBLIS, une chronologie CONSTRUITE. Chaque candidat cite sa frontière avec M04-08.

## Synthèse coordinateur

| # | Candidat | Écran | Taille | Score | Données prêtes | Effet business (1 ligne) |
|---|----------|-------|--------|-------|----------------|--------------------------|
| C1 | **Comptes rendus de visite manquants** (détection d'oubli `visits.feedback` + relance vendeur) | `/` action center + `/visits` + fiche bien | S | **89** | O | Sécurise le mandat : <20% des agents FR envoient un CR, et « c'est dans ce vide que s'installe le doute puis la tentation de retirer le mandat » (Journal de l'Agence). |
| C2 | **Score de priorité unifié** (weighted next-best-action, remplace le tri à 3 niveaux) | `/` action center | S | **86** | O | Une liste courte VRAIMENT ordonnée par valeur/urgence/risque, pas un empilement par catégorie → l'agent traite le bon dossier en premier. |
| C3 | **Radar mandats à expiration** (`mandates.expires_at`, fenêtre 30/15/7 j) | `/` action center + `/mandates` | XS | **85** | O | Zéro mandat perdu par oubli de renouvellement ; c'est LA feature phare de Hektor (8 500 agences FR). |
| C4 | **Estimations sans suite → relance propriétaire** (`estimations.decision='a_relancer'` + `next_action` remontés au cockpit) | `/` action center | XS | **83** | O | Rebranche un moteur de continuité DÉJÀ en base mais invisible le matin → transforme l'estimation gratuite en mandat. |
| C5 | **Fraîcheur du portefeuille** (score de refroidissement lead/bien + tuile « qui refroidit ») | `/` (nouvelle tuile) + fiches | S | **80** | O | Rend visible en un coup d'œil qui se refroidit ; la réactivation de base est « le ROI le plus élevé pour décrocher des mandats sans acheter de leads » (2026). |
| C6 | **Réactivation sur baisse de prix** (exploite `prosp_annonce_versions` : vendeur qui baisse = motivé) | `/prospection` + `/` action center | S | **78** | O | Un signal de motivation vendeur 100% inexploité aujourd'hui (table écrite, jamais lue hors tests) → prise de mandat au bon moment. |
| C7 | **Briefing quotidien généré** (cron Inngest → 1 tâche `rea_tasks` « brief du jour » + synthèse 5 lignes) | `/` (bandeau haut) | M | **76** | O | « Un brief chaque matin résumant ce qui est en attente » (alfred_) — l'agent ouvre l'app et sait quoi faire en 10 s. |
| C8 | **Chronologie unifiée client/bien** (fusion visites+estim+mandats+tâches+notes, dérivée, zéro table) | fiche `/leads/[id]` + `/properties/[id]` | M | **74** | O | Fin du « je cherche où j'en suis » : toute l'histoire d'un dossier sur une seule frise, source de vérité avant chaque appel. |

Les 8 candidats sont ≥70 et **exploitent uniquement des données/routes déjà présentes dans le repo** (vérifié fichier par fichier ci-dessous). Aucun ne duplique M04-08 : tous ajoutent une CAPACITÉ nouvelle (score pondéré, détection d'oubli, signal non lu, génération), pas de la densité/polish.

---

## Lecture du terrain (vérifié dans le worktree)

### Ce que le cockpit dérive DÉJÀ (cœur de M04-08 — à NE PAS refaire)
`lib/actions/derive.ts` (522 lignes) est un moteur de dérivation **à règles binaires + tri plat 3 niveaux** (`haute/normale/basse`). Il couvre 11 catégories, toutes LIVE :

- `deriveOverdueTasks` / `deriveTodayTasks` / `deriveOpenTasks` / `deriveValidationTasks` ← `rea_tasks` (lignes 170-244).
- `deriveRelances` ← leads acheteur non touchés ≥ `RELANCE_STALE_DAYS = 7` sur `updated_at` (l. 247-273).
- `deriveProprietaires` ← leads vendeur ouverts (l. 276-297).
- `deriveRdv` ← visites à venir / du jour (l. 300-334).
- `deriveEstimations` ← estimations `status ∈ {draft, interviewing, recap, valuating}` (l. 337-352). **⚠️ statut MOTEUR, pas la `decision` commerciale.**
- `deriveMandats` ← mandats `status='brouillon'` UNIQUEMENT (l. 355-370). **⚠️ jamais les mandats qui EXPIRENT.**
- `deriveAcquereursSansProposition` / `deriveMatchs` ← critères/matchs prospection (l. 376-431).
- `buildActionCenter` : concatène, dédoublonne 2×, trie par `PRIORITY_RANK` puis `when` (l. 466-521). `CATEGORY_ORDER` fige l'ordre des GROUPES (l. 446-458).

Rendu par `components/cockpit/ActionCenter.tsx` (filtres par catégorie, quick-actions honnêtes : `call` → `tel:`, `message` → crée une tâche `rea_tasks`, `done/snooze` → `PATCH /api/tasks/[id]`). Alimenté dans `app/(dashboard)/page.tsx` (l. 124-258, 12 requêtes owner-scopées `user_id+tenant_id`).

**Le plafond de M04-08** : tri par palier discret (pas de score continu), aucun signal issu de `visits.feedback`, `mandates.expires_at`, `estimations.decision`, `prosp_annonce_versions`, `leads.urgence`. C'est exactement là que se loge mon intelligence.

### Signaux réels DÉJÀ en base mais NON exploités par la journée de l'agent (le gisement)

| Signal | Où (fichier / migration) | Exploité aujourd'hui ? | Candidat |
|--------|--------------------------|------------------------|----------|
| `visits.feedback` (text) + `visits.status ∈ {realisee, no_show, annulee}` | `supabase/migrations/0008_crm.sql` l. 82-90 | **NON** — `derive.ts` ne lit jamais feedback | C1 |
| `mandates.expires_at` (date) | `0008_crm.sql` l. 118 | **NON** — `deriveMandats` ne filtre que `brouillon` (l. 356) | C3 |
| `estimations.decision ∈ {en_attente, a_relancer, mandat_signe, refuse, perdu}` + `estimations.next_action` (text) + `owner_lead_id` | `0043_platform_augmented_002.sql` l. 24-32 ; logique `lib/estimation/continuity.ts` ; UI `estimations/_components/ContinuityPanel.tsx` (l. 123-249) | **Partiellement** — écrit/affiché sur la fiche estimation, JAMAIS remonté au cockpit | C4 |
| `leads.urgence ∈ {faible, normale, haute, urgente}` | `0043` l. 20-22 | **NON** dans le tri (relance = `updated_at` seul, l. 267) | C2, C5 |
| `prosp_annonce_versions` (prix, statut, observed_at ; index `annonce_id, observed_at desc`) | `0040_prospection_industrialization.sql` l. 31-47 | **NON** — écrit par ingestion, lu SEULEMENT dans `lib/prospection/ingest.test.ts` | C6 |
| `leads.budget_min/max` vs `properties.asking_price` | `0008_crm.sql` l. 27,62-63 | partiellement (matching prospection) — pas dans la journée | C2, C8 |
| Cron Inngest (`prospIngestion` horaire, `prospScoring` 15 min) | `lib/jobs/inngest/functions.ts` ; `app/api/inngest/route.ts` | infra prête, aucun job « journée agent » | C7 |
| `/api/tasks` POST/PATCH (Zod, owner-check, `crypto.randomUUID`) | `app/api/tasks/route.ts` l. 60-70 | oui pour message/validation | matérialisation C1/C7 |

### Matrice de capacités de MON domaine

- **AVAILABLE persisté, sous-exploité UI** : `visits.feedback`, `mandates.expires_at`, `estimations.decision/next_action`, `leads.urgence`, `prosp_annonce_versions` → **le cœur de mes candidats : pur calcul dérivé, zéro nouvelle donnée.**
- **AVAILABLE (moteur/infra prêts)** : `lib/actions/derive.ts` (à ÉTENDRE, pas refaire), Inngest cron, `/api/tasks`, `filterSeed` (masque le seed comme les listes).
- **CONFIG SEULEMENT** : envoi email/SMS/WhatsApp (Resend côté infra, aucun transport branché). → toute « relance » de mes candidats reste **brouillon/tâche**, jamais « envoyé » (règle dure respectée).
- **UNAVAILABLE** : MLS, MoteurImmo/Twilio (clés absentes), moteur agents interne. → aucun candidat n'en dépend.
- **Couvert par M04-08** : hiérarchie urgent→aujourd'hui→ensuite + densité de l'action center. → mes candidats l'ÉTENDENT (score, oubli, signal, génération, frise).
- **Réutilisation données existantes** : 100% des 8 candidats. **Zéro nouvelle intégration externe requise.**

---

## Preuves concurrentielles

| Produit | Capacité observée | URL | Date | Prouvé / Inféré |
|---------|-------------------|-----|------|------------------|
| Journal de l'Agence | « moins de 20% des agents envoient systématiquement un compte rendu » ; « c'est dans ce vide que s'installe le doute, puis la tentation de retirer le mandat » ; « un compte rendu envoyé dans les deux heures » | journaldelagence.com/1411374-agents-immobiliers-apres-chaque-visite-un-compte-rendu | 2026-07-18 | **Prouvé** (phrases citées) |
| Hektor / La Boîte Immo | « vous rappelle l'ensemble des mandats arrivant à expiration afin d'anticiper leur renouvellement » ; « envoi de mails 100% automatiques » ; 8 500 agences / 45 000 pros | la-boite-immo.com/actualites/toutes-les-actions-crm-centralisees ; /logiciel-immobilier/relation-client-crm | 2026-07-18 | **Prouvé** (alertes mandat via extrait recherche) ; page CRM générique (Inféré sur le détail) |
| Netty | « IA intégrée pour relances automatisées et comptes rendus de visite automatiques » ; « ROI dès le premier mandat récupéré » | ia-lab-immo.com/blog/netty-crm-immobilier-prix-avis-guide | 2026-07-18 | **Prouvé** (extrait), Inféré sur l'implémentation |
| Apimo Pro | « si un bien reste sans visite pendant 15 jours, déclenche une campagne SMS ciblée » ; « si un acheteur consulte 5 biens similaires, alerte l'agent » ; envoi CR + relance J+3 auto | mbmaisonsbois.fr/apimo-pro-avis ; ia-lab-immo.com/blog/automatisation-agence-immobiliere | 2026-07-18 | **Prouvé** (règles citées), Inféré sur le moteur |
| Follow Up Boss | « Smart Lists » = 5-7 listes-recherches quotidiennes (Leads, Hot, Nurture, PC/SOI) pour prioriser le temps ; API `/smartLists` | followupboss.com/features/smart-list ; help.followupboss.com/.../1500008374882 | 2026-07-18 | **Prouvé** (listes manuelles, PAS de score généré unique) |
| BoldTrail (ex-kvCORE) | Smart CRM « suit ce que chaque lead consulte sur l'IDX et alerte l'agent quand l'activité augmente » (behavioral lead scoring) | boldtrail.com/blog/kvcore-vs-lofty ; aiandrealtors.com/review-kvcore | 2026-07-18 | **Prouvé** (extrait recherche), Inféré sur l'algo |
| Lofty (RISE) | « fait remonter les opportunités relationnelles de façon proactive, avant que l'agent y pense » | kdsdevelopment.net/articles/lofty-vs-kvcore-ai-agent-crm-showdown | 2026-07-18 | **Prouvé** (extrait), Inféré |
| Rechat (Lucy) | Copilote IA « largement réactif : l'agent doit initier, fournir le contexte » (≠ next-best-action proactif) | rechat.ai ; get-alfred.ai/blog/best-ai-tools-for-real-estate-agents | 2026-07-18 | **Prouvé** (positionnement) — **la faille à battre** |
| alfred_ | « délivre un Daily Brief chaque matin résumant ce qui est en attente » | get-alfred.ai/blog/best-ai-tools-for-real-estate-agents | 2026-07-18 | **Prouvé** (extrait) |
| ActivePipe | Lead scoring = « thermomètre de la base : qui refroidit, qui se réchauffe, qui est chaud » | activepipe.com/blog/lead-scoring-real-estate | 2026-07-18 | **Prouvé** |
| Mile High Title / H&H Synapse | « la réactivation de base est le moyen au ROI le plus élevé pour décrocher des mandats sans payer de nouveaux leads en 2026 » | milehightitleguy.com/post/database-reactivation... ; hhsynapse.com/blog/database-reactivation-for-real-estate | 2026-07-18 | **Prouvé** |

**Découverte marquante** : le compte rendu de visite est un point de douleur MÉTIER documenté et chiffré en France (Journal de l'Agence : <20% de systématisation, lien direct au retrait de mandat), ET le champ `visits.feedback` existe DÉJÀ dans la base sans qu'aucun code ne détecte son absence. Le gagnant du marché n'est pas celui qui envoie le CR à ma place (transport non branché) — c'est celui qui, chaque matin, **me dit lesquels manquent avant que le vendeur ne s'inquiète**. C'est la feature à plus fort effet démontrable × plus faible coût du lot.

**Angle stratégique transverse** : Follow Up Boss (leader US) repose sur des Smart Lists **construites à la main** ; Rechat/Lucy est **réactif**. Azigo peut se différencier avec une **liste unique GÉNÉRÉE et SCORÉE** (C2+C7) à partir de données déjà structurées — le créneau « proactif » que Lofty occupe côté US et que personne n'occupe proprement côté FR.

---

## Candidats

### C1 — Comptes rendus de visite manquants (détection d'oubli + relance vendeur) · S · **89/100**

- **Problème métier exact** : une visite a eu lieu (`status='realisee'`) mais l'agent n'a jamais saisi de compte rendu (`feedback IS NULL`). Le vendeur, sans nouvelle, doute et menace de retirer le mandat ; l'acheteur intéressé n'est pas recontacté. C'est l'oubli n°1 du terrain FR.
- **Utilisateur concerné** : agent (mandataire du bien) + implicitement le vendeur et l'acheteur.
- **Moment du parcours** : le matin (revue quotidienne) et le lendemain d'une visite.
- **Écran / emplacement précis** : nouvelle catégorie dans l'**action center existant** de `/` (`components/cockpit/ActionCenter.tsx`), + badge sur `/visits`, + rappel sur la fiche bien `/properties/[id]`. **Aucun nouveau menu.**
- **Comportement du widget** : ligne d'action « Compte rendu à faire — visite du {date} · {bien} · {acheteur} ». Priorité montante avec l'âge (haute > 48 h). Deux dérivations : (a) `visits.status='realisee' AND feedback IS NULL` → « CR manquant » ; (b) `visits.status='realisee' AND feedback IS NOT NULL AND` lead vendeur non recontacté depuis le CR → « informer le vendeur ».
- **Action disponible** : « Saisir le CR » (ouvre la fiche visite/bien), « Appeler le vendeur » (`tel:` si `phone`), « Créer une tâche relance vendeur ».
- **Automatisation éventuelle** : à la clôture d'une visite sans feedback sous 24 h, le cockpit crée automatiquement une `rea_tasks` `kind='note'` « CR de visite à rédiger » (via `/api/tasks`). Aucun envoi automatique.
- **Étape de validation humaine** : l'envoi effectif du CR au vendeur reste **manuel** (transport non branché) — le widget ne fait que rappeler et pré-rédiger une tâche.
- **Données nécessaires** : visites réalisées + feedback + lien bien/lead.
- **Données DÉJÀ dispo (repo)** : `visits.feedback`, `visits.status` (`0008_crm.sql` l. 82-90) ; jointures `properties(title,city)` + `leads(full_name)` déjà faites dans `app/(dashboard)/page.tsx` l. 190-197 ; `daysSince` dans `lib/crm/format.ts`.
- **Données manquantes** : aucune. (Optionnel : horodatage de saisie du CR = `visits.updated_at`.)
- **Routes / tables / composants concernés** : nouvelle fonction `deriveComptesRendus()` dans `lib/actions/derive.ts` + catégorie dans `types.ts` + `ActionCenter.tsx` ; requête visites `status='realisee'` ajoutée dans `page.tsx` ; `/api/tasks` pour la matérialisation.
- **Dépendances externes** : aucune.
- **Frontière avec M04-08** : M04-08 organise les tâches EXISTANTES ; C1 crée une catégorie de tâche INEXISTANTE (détection d'un champ vide = oubli) — capacité nouvelle, pas de la densité.
- **Taille** : S (1-2 j : dérivation + catégorie UI + auto-tâche).
- **Risques** : sur-signalement si beaucoup de visites anciennes sans feedback → borner à N derniers jours + snooze. RGPD nul (données internes).
- **Preuve concurrentielle** : Journal de l'Agence (<20% systématisent, lien retrait mandat, « dans les deux heures ») ; Netty/Apimo automatisent le CR (validation marché).
- **Scénario de démo** : marquer une visite d'hier `realisee` sans feedback → recharger `/` → la ligne « Compte rendu à faire » apparaît en tête, priorité haute ; saisir le feedback → elle disparaît.
- **Indicateur de succès** : % de visites `realisee` avec `feedback` renseigné sous 48 h ; nombre de CR-tâches créées puis traitées.
- **Décompte du score** : impact business 24/25 (sécurise le mandat, douleur FR documentée) · utilité quotidienne 19/20 (chaque visite concernée) · effet démontrable 14/15 (démo instantanée) · avantage agentique 11/15 (auto-tâche, mais pas d'envoi) · faisabilité 15/15 (champ existant, dérivation pure) · dispo données 10/10. **Brut 93. Pénalité −4** (dépend d'une saisie disciplinée du statut `realisee`, sinon pas de détection). **= 89.**

### C2 — Score de priorité unifié (weighted next-best-action) · S · **86/100**

- **Problème métier exact** : le cockpit trie par palier discret (`haute/normale/basse`) puis par catégorie figée. Un mandat qui expire dans 3 j, un lead `urgente` refroidi depuis 12 j et un match à 92 tombent tous en « haute » sans départage : l'agent ne sait pas lequel traiter EN PREMIER. Il lui faut UN ordre continu fiable.
- **Utilisateur concerné** : agent, chaque matin.
- **Moment du parcours** : ouverture de l'app / revue quotidienne.
- **Écran / emplacement précis** : l'**action center existant** de `/` — même liste, tri remplacé par un score. Optionnel : petit indicateur de score/raison au survol.
- **Comportement du widget** : chaque `ActionItem` reçoit un `score` continu = somme pondérée de facteurs dérivés : urgence temporelle (échéance/expiration proche), risque (mandat qui expire, vendeur silencieux post-visite), valeur (`leads.urgence`, montant mandat/bien, score de match), fraîcheur (jours depuis contact). Tri par score décroissant ; les paliers `haute/normale` restent pour le style visuel.
- **Action disponible** : inchangée (les quick-actions existantes) — c'est l'ORDRE qui change.
- **Automatisation éventuelle** : calcul serveur pur dans `buildActionCenter`. Réversible (facteurs et poids dans `config/` — respecte « pas de magic number »).
- **Étape de validation humaine** : aucune (ré-ordonnancement d'affichage, non destructif). L'agent peut toujours filtrer par catégorie (M04-08).
- **Données nécessaires** : les lignes déjà chargées + `mandates.expires_at`, `leads.urgence`, `score_match`, montants.
- **Données DÉJÀ dispo (repo)** : tout est chargé dans `app/(dashboard)/page.tsx` l. 124-254 ; `mandates.expires_at` (`0008` l. 118), `leads.urgence` (`0043` l. 20), `prosp_matchs.score_match` déjà lu (l. 224).
- **Données manquantes** : aucune (les poids sont un choix produit, pas une donnée).
- **Routes / tables / composants concernés** : `lib/actions/derive.ts` (fonction `scoreItem()` + tri) ; `types.ts` (`ActionItem.score?`) ; `config/` (barème). `ActionCenter.tsx` : afficher la raison de priorité.
- **Dépendances externes** : aucune.
- **Frontière avec M04-08** : M04-08 = hiérarchie urgent→aujourd'hui→ensuite (buckets temporels) + densité. C2 = MOTEUR DE SCORE continu **à l'intérieur** de ces buckets — l'intelligence de départage que M04-08 ne fournit pas. Complémentaire, non concurrent (M04-08 pose les colonnes, C2 ordonne dans chacune).
- **Taille** : S (1-2 j : fonction de score + barème + tests déterministes ; `nowMs` déjà injecté pour tests stables).
- **Risques** : score opaque → afficher la raison (« expire dans 3 j », « urgente + 12 j sans contact »). Poids mal calibrés → externaliser dans `config/` et itérer.
- **Preuve concurrentielle** : BoldTrail (behavioral lead scoring) ; Follow Up Boss repose sur des listes MANUELLES (Azigo génère l'ordre) ; ActivePipe (« thermomètre »).
- **Scénario de démo** : créer 3 items « haute » (mandat J+3, lead urgente 12 j, match 92) → aujourd'hui ils s'affichent dans l'ordre de catégorie ; après C2, le mandat J+3 remonte n°1 avec la raison affichée.
- **Indicateur de succès** : temps jusqu'à traitement du 1er item ; taux de traitement des items en tête de liste (top 3) vs bas.
- **Décompte du score** : impact business 22/25 · utilité quotidienne 20/20 (chaque matin, tous les items) · effet démontrable 13/15 (visible mais moins « waouh » qu'une nouvelle carte) · avantage agentique 13/15 (raisonnement dérivé) · faisabilité 14/15 · dispo données 10/10. **Brut 92. Pénalité −6** (calibrage des poids = risque de départage contesté au départ, itératif). **= 86.**

### C3 — Radar mandats à expiration · XS · **85/100**

- **Problème métier exact** : un mandat non renouvelé qui expire = un bien qui sort du portefeuille, souvent capté par un concurrent. `deriveMandats` ne surface QUE les brouillons — les mandats `actif` proches de `expires_at` sont invisibles dans la journée.
- **Utilisateur concerné** : agent (mandataire).
- **Moment du parcours** : revue quotidienne, 30/15/7 j avant échéance.
- **Écran / emplacement précis** : catégorie « Mandat à renouveler » dans l'**action center** de `/` + bandeau sur `/mandates`. Aucun nouveau menu.
- **Comportement du widget** : `mandates.status='actif' AND expires_at` dans une fenêtre glissante (30/15/7 j) → priorité montante à l'approche. Ligne « Mandat {réf} expire le {date} — {bien} · dans {n} j ».
- **Action disponible** : « Ouvrir le mandat », « Appeler le vendeur », « Créer une tâche renouvellement ».
- **Automatisation éventuelle** : à J-15, création auto d'une `rea_tasks` `kind='relance'` « préparer le renouvellement ». Aucun email auto.
- **Étape de validation humaine** : renouvellement = acte manuel (signature). Le widget rappelle et pré-trace.
- **Données nécessaires** : mandats actifs + `expires_at`.
- **Données DÉJÀ dispo (repo)** : `mandates.expires_at`, `status`, jointure `properties(title,city)` déjà utilisée dans `page.tsx` l. 208-213 (requête `brouillon` — à étendre au filtre expiration).
- **Données manquantes** : aucune. (Beaucoup de mandats n'ont pas `expires_at` saisi → le widget n'agit que sur ceux renseignés, et peut inciter à saisir la date.)
- **Routes / tables / composants concernés** : `deriveMandatsExpiration()` dans `derive.ts` + catégorie `types.ts` ; requête mandats `actif` + fenêtre dans `page.tsx` ; `ActionCenter.tsx`.
- **Dépendances externes** : aucune.
- **Frontière avec M04-08** : M04-08 densifie l'action center ; C3 ajoute une SOURCE d'action absente (expiration mandat) — capacité nouvelle.
- **Taille** : XS (<1 j : une dérivation + une requête filtrée).
- **Risques** : `expires_at` souvent vide → couverture partielle ; l'atténuer par un rappel « renseigner la date d'expiration ». RGPD nul.
- **Preuve concurrentielle** : Hektor — « rappelle l'ensemble des mandats arrivant à expiration afin d'anticiper leur renouvellement » (feature emblématique, 8 500 agences FR). Parité directe attendue par le marché.
- **Scénario de démo** : poser `expires_at = today+5` sur un mandat actif → recharger `/` → « Mandat expire dans 5 j » apparaît, priorité haute.
- **Indicateur de succès** : nb de mandats traités avant expiration ; taux de renouvellement ; baisse des `status='expire'`.
- **Décompte du score** : impact business 24/25 (perte de bien = perte sèche) · utilité quotidienne 17/20 (pas tous les jours, mais critique) · effet démontrable 14/15 · avantage agentique 10/15 (rappel + auto-tâche) · faisabilité 15/15 (trivial) · dispo données 8/10 (`expires_at` inégalement rempli). **Brut 88. Pénalité −3** (couverture dépend de la saisie de la date). **= 85.**

### C4 — Estimations sans suite → relance propriétaire · XS · **83/100**

- **Problème métier exact** : une estimation livrée est le DÉBUT d'un parcours mandat. Le champ `estimations.decision='a_relancer'` + `next_action` existe et s'édite sur la fiche estimation (`ContinuityPanel.tsx`), mais rien ne le remonte au cockpit du matin → l'estimation « à relancer » se perd, le mandat file au concurrent.
- **Utilisateur concerné** : agent, côté prise de mandat.
- **Moment du parcours** : jours suivant une estimation, revue quotidienne.
- **Écran / emplacement précis** : catégorie « Estimation à relancer » dans l'**action center** de `/`. Aucun nouveau menu.
- **Comportement du widget** : dérive les estimations `decision='a_relancer'` (et `en_attente` anciennes) ; affiche `next_action` comme raison si présent, sinon « relancer le propriétaire ». Lien vers `owner_lead_id` si rattaché.
- **Action disponible** : « Ouvrir l'estimation », « Appeler le propriétaire » (via `owner_lead_id` → `leads.phone`), « Créer une tâche relance ».
- **Automatisation éventuelle** : aucune donnée fabriquée — lecture directe d'une décision saisie par l'agent. Option : auto-tâche à N jours d'inaction.
- **Étape de validation humaine** : la décision est DÉJÀ un choix humain (l'agent l'a posée dans le ContinuityPanel).
- **Données nécessaires** : estimations avec `decision`/`next_action`/`owner_lead_id`.
- **Données DÉJÀ dispo (repo)** : `estimations.decision`, `next_action`, `owner_lead_id` (`0043` l. 24-32) ; logique `lib/estimation/continuity.ts` ; enum `DECISIONS` réutilisable. La requête estimations existe déjà dans `page.tsx` l. 199-205 (sélectionne `status` — à étendre à `decision, next_action, owner_lead_id`).
- **Données manquantes** : aucune.
- **Routes / tables / composants concernés** : `deriveEstimationsARelancer()` dans `derive.ts` (distincte de `deriveEstimations` qui vise le statut MOTEUR) ; `types.ts` ; `page.tsx` (colonnes) ; `ActionCenter.tsx`.
- **Dépendances externes** : aucune.
- **Frontière avec M04-08** : M04-08 densifie ; M04-06 = financement (autre champ). C4 rebranche la CONTINUITÉ commerciale (decision) au cockpit — capacité nouvelle, ni densité ni financement.
- **Taille** : XS (<1 j : une dérivation + extension de la requête estimations).
- **Risques** : nécessite que l'agent renseigne `decision` (adoption). Faible risque technique.
- **Preuve concurrentielle** : Netty « ROI dès le premier mandat récupéré » (relance) ; la continuité estimation→mandat est un axe de valeur reconnu.
- **Scénario de démo** : poser `decision='a_relancer'` sur une estimation via le ContinuityPanel → recharger `/` → « Estimation à relancer » apparaît avec le `next_action` en raison.
- **Indicateur de succès** : nb d'estimations `a_relancer` traitées ; taux de conversion estimation → `mandat_signe`.
- **Décompte du score** : impact business 23/25 (mandat = revenu) · utilité quotidienne 16/20 · effet démontrable 14/15 (rebranche un existant caché, démo nette) · avantage agentique 10/15 · faisabilité 15/15 (données + logique déjà là) · dispo données 10/10. **Brut 88. Pénalité −5** (dépend de l'usage du champ `decision`, aujourd'hui peu peuplé). **= 83.**

### C5 — Fraîcheur du portefeuille (score de refroidissement + tuile « qui refroidit ») · S · **80/100**

- **Problème métier exact** : l'agent ne voit pas d'un coup d'œil QUELS dossiers (leads ET biens) se refroidissent. `deriveRelances` traite les leads acheteur au fil de l'eau mais n'offre pas de VUE d'ensemble de la température, ni ne pondère par `urgence`, ni ne couvre les biens sans activité.
- **Utilisateur concerné** : agent, pilotage hebdomadaire + coup d'œil quotidien.
- **Moment du parcours** : revue du matin / gestion de portefeuille.
- **Écran / emplacement précis** : nouvelle tuile compacte sur `/` (à côté des KPI existants — même bandeau `dl` l. 294-311), pas de nouveau menu. Chaque fiche `/leads/[id]` et `/properties/[id]` peut afficher un badge de fraîcheur.
- **Comportement du widget** : score de fraîcheur 0-100 dérivé de `daysSince(updated_at)` pondéré par `leads.urgence` et le stade (`status`) ; un bien `en_vente` sans visite depuis N jours = « refroidit ». Tuile « 3 dossiers refroidissent » → clic = liste filtrée.
- **Action disponible** : ouvrir la fiche, appeler, créer une tâche réactivation.
- **Automatisation éventuelle** : calcul dérivé pur. Pas d'envoi.
- **Étape de validation humaine** : aucune (indicateur), toute relance reste manuelle.
- **Données nécessaires** : leads + biens + visites (dernière activité), `urgence`.
- **Données DÉJÀ dispo (repo)** : `leads.updated_at/urgence/status` (déjà chargés), `properties.updated_at/status`, `visits.scheduled_at` ; `ratio()`/agrégats dans `lib/crm/aggregate.ts`.
- **Données manquantes** : idéalement un vrai « dernier contact » (aujourd'hui `updated_at` est un proxy imparfait — toute édition le remet à zéro). Acceptable en V1, à affiner avec C8.
- **Routes / tables / composants concernés** : `lib/crm/aggregate.ts` (fonction `freshnessScore`) ; nouvelle tuile dans `page.tsx` ; badge dans fiches ; réutilise les requêtes existantes.
- **Dépendances externes** : aucune.
- **Frontière avec M04-08** : M04-08 = liste d'actions ordonnée. C5 = VUE agrégée de température (analytique, pas une file d'actions) — angle distinct.
- **Taille** : S (1-2 j : fonction de score + tuile + badges).
- **Risques** : `updated_at` comme proxy de contact = imprécis → afficher « dernière activité » honnêtement, pas « dernier contact ». Pas de RGPD.
- **Preuve concurrentielle** : ActivePipe (« thermomètre : qui refroidit ») ; réactivation base = « ROI le plus élevé 2026 ».
- **Scénario de démo** : forcer 3 leads `updated_at` à −20 j → la tuile affiche « 3 refroidissent » ; clic → liste triée par fraîcheur.
- **Indicateur de succès** : nb de dossiers réactivés (repassés « chauds ») ; réduction de l'âge moyen des leads ouverts.
- **Décompte du score** : impact business 21/25 · utilité quotidienne 18/20 · effet démontrable 13/15 · avantage agentique 11/15 · faisabilité 13/15 · dispo données 8/10 (proxy contact). **Brut 84. Pénalité −4** (`updated_at` proxy imparfait du « dernier contact »). **= 80.**

### C6 — Réactivation sur baisse de prix (exploite `prosp_annonce_versions`) · S · **78/100**

- **Problème métier exact** : quand un vendeur baisse le prix d'une annonce que l'agent prospecte, c'est un signal fort de MOTIVATION (le bien ne part pas, le vendeur cède) — le meilleur moment pour proposer un mandat. `prosp_annonce_versions` enregistre chaque changement de prix mais n'est LU nulle part hors tests.
- **Utilisateur concerné** : agent en prospection vendeur.
- **Moment du parcours** : suivi prospection, revue quotidienne.
- **Écran / emplacement précis** : bandeau « Baisses de prix récentes » dans `/prospection` (onglet annonces) + éventuelle catégorie dans l'action center de `/`. Aucun nouveau menu.
- **Comportement du widget** : compare les 2 dernières versions par `annonce_id` (index `observed_at desc` déjà en place) ; si `prix` a baissé, affiche « −X% depuis {date} — {annonce} » avec le delta. Trie par ampleur/récence de la baisse.
- **Action disponible** : ouvrir l'annonce, « Contacter le vendeur » via `lib/prospection/contact.ts` (respecte `prosp_optout`), créer une tâche prospection.
- **Automatisation éventuelle** : détection dérivée au chargement ; contact vendeur passe par le flux existant (brouillon/approbation, jamais d'envoi direct non consenti).
- **Étape de validation humaine** : tout contact vendeur reste soumis au flux d'approbation existant + `prosp_optout` (RGPD).
- **Données nécessaires** : versions d'annonces avec prix + horodatage.
- **Données DÉJÀ dispo (repo)** : `prosp_annonce_versions` (prix, statut, observed_at ; `0040` l. 31-47), index `annonce_id, observed_at desc` ; `lib/prospection/contact.ts` + `prosp_optout` (`0040`/`0042`).
- **Données manquantes** : aucune (dépend du volume d'historique accumulé par l'ingestion).
- **Routes / tables / composants concernés** : `lib/prospection/` (fonction `priceDrops()`) ; `app/api/prospection/` (endpoint lecture) ; panneau dans `prospection/page.tsx` ; optionnel `derive.ts`.
- **Dépendances externes** : aucune (l'ingestion Apify existe déjà ; ne nécessite PAS MoteurImmo/Twilio).
- **Frontière avec M04-08** : M04-08 ne touche pas la prospection ; hors de son périmètre. Capacité entièrement nouvelle.
- **Taille** : S (1-2 j : requête comparative versions + panneau).
- **Risques** : peu d'historique tant que l'ingestion n'a pas tourné plusieurs cycles → effet faible au démarrage (données temporelles à accumuler). RGPD couvert par `prosp_optout`.
- **Preuve concurrentielle** : Apimo (« si un acheteur consulte 5 biens similaires, alerte l'agent » = logique de signal comportemental) ; BoldTrail (alerte sur pic d'activité). Le signal « baisse de prix vendeur » n'est explicitement proposé par aucun concurrent FR observé → **différenciateur**.
- **Scénario de démo** : insérer 2 versions d'une annonce (prix J-10 puis −8% aujourd'hui) → `/prospection` affiche « −8% depuis {date} ».
- **Indicateur de succès** : nb de vendeurs contactés suite à baisse ; taux de conversion mandat sur ces contacts.
- **Décompte du score** : impact business 20/25 · utilité quotidienne 15/20 · effet démontrable 12/15 (dépend du volume d'historique pour « briller ») · avantage agentique 13/15 (signal non exploité) · faisabilité 14/15 · dispo données 9/10. **Brut 83. Pénalité −5** (effet réel conditionné à l'accumulation d'historique d'ingestion). **= 78.**

### C7 — Briefing quotidien généré · M · **76/100**

- **Problème métier exact** : l'agent qui ouvre l'app doit reconstituer mentalement sa journée. Un BRIEFING court, généré chaque matin (« 2 mandats expirent cette semaine, 3 CR de visite manquants, 5 relances chaudes, 2 estimations à relancer »), donne le cap en 10 secondes.
- **Utilisateur concerné** : agent, à la première ouverture du jour.
- **Moment du parcours** : ouverture matinale.
- **Écran / emplacement précis** : bandeau compact en haut de `/` (au-dessus de l'action center, sous le header). Aucun nouveau menu.
- **Comportement du widget** : synthèse déterministe (5 lignes max) construite à partir des mêmes dérivations (C1-C5) ; chaque ligne est cliquable vers le filtre correspondant de l'action center. Généré côté serveur, rafraîchi une fois par jour (marque temporelle).
- **Action disponible** : cliquer une ligne → action center filtré ; « tout voir ».
- **Automatisation éventuelle** : un cron Inngest quotidien (matin) matérialise une `rea_tasks` `kind='note'` « Brief du jour » et/ou pré-calcule la synthèse. **La synthèse reste FACTUELLE/déterministe (comptages), pas de texte LLM** (respecte l'interdiction d'appel API payant et évite le gadget).
- **Étape de validation humaine** : aucune (lecture seule) ; les actions sous-jacentes gardent leurs gardes (C1-C6).
- **Données nécessaires** : les mêmes que C1-C5.
- **Données DÉJÀ dispo (repo)** : toutes (voir C1-C5) ; cron Inngest (`lib/jobs/inngest/functions.ts`, patterns `prospIngestion`/`prospScoring`) ; `/api/tasks` pour matérialiser.
- **Données manquantes** : aucune.
- **Routes / tables / composants concernés** : nouvelle fonction Inngest `dailyBrief` (cron) ; `lib/actions/derive.ts` (agrégat de comptages → `buildBrief()`) ; composant bandeau dans `page.tsx`.
- **Dépendances externes** : aucune (Inngest déjà branché).
- **Frontière avec M04-08** : M04-08 = ORGANISATION de l'action center (buckets, densité). C7 = COUCHE DE SYNTHÈSE générée + planification cron au-dessus — capacité nouvelle (génération + scheduling), pas de la mise en page.
- **Taille** : M (3-5 j : job cron + agrégat + bandeau + garde-fous d'idempotence).
- **Risques** : redondance visuelle avec l'action center → garder le brief à 5 lignes, purement navigationnel. Si tenté par du LLM → interdit ici (coût + gadget) : rester déterministe.
- **Preuve concurrentielle** : alfred_ « Daily Brief chaque matin résumant ce qui est en attente » (validation directe) ; Lofty RISE (proactivité).
- **Scénario de démo** : peupler quelques mandats expirants + CR manquants → le bandeau du haut affiche « 2 mandats expirent, 3 CR manquants… » ; clic → action center filtré.
- **Indicateur de succès** : taux de clic sur les lignes du brief ; corrélation brief lu → items traités le jour même.
- **Décompte du score** : impact business 19/25 · utilité quotidienne 19/20 · effet démontrable 13/15 · avantage agentique 12/15 (agrégat + cron, sans LLM) · faisabilité 13/15 · dispo données 10/10. **Brut 86. Pénalité −10** (recouvre en partie l'action center → risque de perception « doublon de mise en page » ; taille M la plus lourde du lot). **= 76.**

### C8 — Chronologie unifiée client/bien · M · **74/100**

- **Problème métier exact** : avant d'appeler un client ou de traiter un bien, l'agent doit reconstituer « où on en est » en ouvrant plusieurs onglets. Aucune frise unifiée n'existe : la fiche `/leads/[id]` liste les visites à plat (`page.tsx` l. 414-416) mais ne fusionne pas estimations, mandats, tâches, notes.
- **Utilisateur concerné** : agent, avant chaque interaction client.
- **Moment du parcours** : préparation d'un appel / d'un RDV, consultation d'un dossier.
- **Écran / emplacement précis** : nouveau bloc « Chronologie » sur les fiches EXISTANTES `/leads/[id]` et `/properties/[id]`. Aucun nouveau menu.
- **Comportement du widget** : frise verticale antéchronologique qui FUSIONNE des événements dérivés de tables existantes : visites (`scheduled_at`, feedback), estimations (`created_at`, decision), mandats (`signed_at`, `expires_at`), tâches (`rea_tasks`), messages (`cockpit_messages`/`estimation_messages`), changement de statut lead. Chaque item : date, type, résumé, lien.
- **Action disponible** : cliquer un événement → sa fiche ; ajouter une note/tâche depuis la frise.
- **Automatisation éventuelle** : purement dérivée (union + tri par date) — **aucune table d'événements à créer** (le brief confirme qu'aucune table timeline n'existe : uniquement des audit-logs auth/gateway/invest).
- **Étape de validation humaine** : aucune (lecture) ; ajout de note/tâche = action explicite.
- **Données nécessaires** : les tables métier déjà rattachées au lead/bien.
- **Données DÉJÀ dispo (repo)** : `visits`, `estimations`, `mandates`, `rea_tasks` (`entity_type`/`entity_id`), `cockpit_messages`, `estimation_messages` — toutes owner-scopées et déjà interrogées ailleurs. La fiche lead charge déjà visites (`leads/[id]/page.tsx` l. 164-189).
- **Données manquantes** : idéalement un horodatage explicite « contact effectué » (sinon on infère depuis les événements) — non bloquant.
- **Routes / tables / composants concernés** : `lib/crm/timeline.ts` (fonction pure d'union/tri, dans l'esprit de `aggregate.ts`) ; composant `Timeline` ; intégration dans les deux fiches `[id]`.
- **Dépendances externes** : aucune.
- **Frontière avec M04-08** : M04-08 vit sur `/` (accueil/agenda). C8 vit sur les FICHES `/leads/[id]` et `/properties/[id]` — écran différent, capacité différente (histoire d'UN dossier vs file d'actions globale). Aucun recouvrement.
- **Taille** : M (3-5 j : fonction d'union multi-source + composant frise + 2 intégrations).
- **Risques** : requêtes multiples par fiche → borner (N derniers événements, pagination). Pas de RGPD (données internes).
- **Preuve concurrentielle** : les CRM US (Follow Up Boss, BoldTrail) affichent une « activity timeline » par contact (standard attendu) ; Rechat/Lucy centralise l'historique. Parité + base d'un futur contexte agent.
- **Scénario de démo** : ouvrir un lead ayant visite + estimation + mandat → la frise affiche les 3 dans l'ordre, cliquables ; ajouter une note → elle s'insère en tête.
- **Indicateur de succès** : temps de préparation avant appel ; usage du bloc (ouvertures/fiche) ; feedback qualitatif « je sais où j'en suis ».
- **Décompte du score** : impact business 18/25 · utilité quotidienne 17/20 · effet démontrable 13/15 · avantage agentique 10/15 (dérivation, peu d'agentique) · faisabilité 12/15 (union multi-tables, plus de plomberie) · dispo données 10/10. **Brut 80. Pénalité −6** (plomberie multi-source + risque de N+1 à maîtriser). **= 74.**

---

## Idées rejetées

- **Réordonner/densifier l'action center par buckets temporels (urgent/aujourd'hui/ensuite)** — *doublon direct M04-08 (élimination immédiate).*
- **Câbler le financement acquéreur dans la priorisation** — *réservé M04-06 (`leads.financement`).*
- **Envoi automatique du CR de visite au vendeur (email/SMS)** — *transport non branché + règle dure « communication = brouillon/validation » ; on détecte et pré-rédige, on n'envoie pas.*
- **Résumé LLM du dossier / du brief matinal généré par GPT** — *appel API payant interdit dans cette mission + risque « gadget » ; le brief reste déterministe (C7).*
- **Score de propension à vendre / « seller likelihood » prédictif** — *nécessiterait un modèle ML entraîné + données comportementales absentes ; XL / données non accessibles.*
- **Alerte sur activité IDX du lead (comme BoldTrail)** — *pas de site IDX ni de tracking de navigation acquéreur dans le repo ; donnée inexistante.*
- **Coaching / recommandation de « meilleur horaire d'appel »** — *aucune donnée d'historique d'appels/réponses ; inventé.*
- **Détection de doublons de leads / dédup CRM** — *utile mais hors « journée de l'agent » (hygiène de base), et proche du périmètre densité CRM M04-11.*
- **Widget météo/trafic pour planifier les visites** — *gadget hors données métier, aucune valeur de priorisation.*
- **File d'attente d'appels « power dialer »** — *nécessite intégration téléphonie (Twilio absent) ; dépendance externe indispo.*
- **Nouvelle table `activity_events` persistée pour la chronologie** — *inutile : C8 se dérive de l'union des tables existantes ; créer une table = sur-ingénierie (le brief confirme qu'aucune table timeline n'est requise).*
- **Rappels d'anniversaire / dates clés client (nurture SOI)** — *pas de champ date d'anniversaire ; donnée absente + faible effet démontrable.*

---

### Note d'honnêteté
Tous les candidats reposent sur des colonnes/tables **vérifiées présentes** dans le worktree (chemins cités). Trois signaux clés (`estimations.decision`, `mandates.expires_at`, `visits.feedback`, `leads.urgence`) existent mais sont **inégalement peuplés** en pratique — d'où des pénalités de disponibilité assumées : la capacité technique est prête, l'effet dépend de la discipline de saisie (que C1/C3/C4 aident justement à instaurer). Aucun candidat ne dépend d'une intégration externe indisponible (MLS/MoteurImmo/Twilio) ni ne franchit une ligne RGPD (contact vendeur = flux `prosp_optout` existant, communications = brouillon).
