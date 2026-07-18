# LAST_REPORT — REA-PLATFORM-002 · Cockpit immobilier augmenté, CRM & automatisations

> Orchestrateur. Squad parallèle A1/A2/A3 + A4. Règle de vérité respectée (LIVE/SNAPSHOT/DEMO/CONFIG/UNAVAILABLE).

> **⚠️ ARCHIVE — état figé au moment de la passe REA-PLATFORM-002, PAS l'état courant.**
> Les mentions `SUPABASE_*` / `supabase_not_configured` / `lib/supabase/*` ci-dessous
> décrivent une configuration **révolue** : elles ont été supprimées depuis (DB = Postgres
> self-hosté GPU1 via PostgREST, `getGpu1Admin()` de `@/lib/gpu1`, gate
> `scripts/check-no-supabase.mjs`). Conservé tel quel comme trace de la passe — ne rien
> en déduire sur la configuration actuelle.

## 1. Verdict
**RÉUSSI**. Parcours métier réellement augmentés et **persistés LIVE** (migration additive 0043 appliquée gpu1) : acquéreurs multi-profils + matching expliqué + alertes honnêtes ; estimation → propriétaire → mandat ; centre d'actions dérivé + tâches. Intégration Aigent = **frontière propre en état UNAVAILABLE** (Aigent non connecté — jamais de faux agent). **Gate définitive verte** (check + 312 tests + build), branche poussée, **12 captures WebP anonymisées** + captures PII publiques remplacées. **Non « production ready »** (build vert ≠ prod ready ; réserves §12 — auth à durcir, preview data-limitée, alertes/messages sans transport).

## 2. État Git initial observé
- Remote `github.com/Hearst-Corporation/real-estate-agent`. Base = `feature/rea-presentation-premium-001` HEAD **`90fd423`** (poussé).
- Working tree principal : **seul le delta `/agents` d'une autre session** (Icon.tsx, config/nav.ts, lib/ui-strings.ts modifiés + `app/(dashboard)/agents/`, `lib/agents/` non trackés) — **jamais touché, jamais intégré, jamais supprimé**.
- Un seul worktree au départ.

## 3. Worktrees & branches
- Jamais travaillé dans le working tree partagé.
- Branche orchestratrice **`feature/rea-platform-augmented-002`** créée depuis `90fd423`.
- 5 worktrees isolés (scratchpad, hors repo) : `plat-int` (intégration, sur la branche orchestratrice), `plat-a1`/`plat-a2`/`plat-a3`/`plat-a4` (branches `plat/a1..a4`), chacun son index/périmètre.
- **Migration 0043** commitée sur l'orchestrateur (`33e6076`) puis appliquée sur gpu1.

## 4. Livraisons
### Migration 0043 (additive, backward-compatible, appliquée gpu1 + PostgREST rechargé)
Colonnes : `prosp_criteres_acquereur`(alerte_frequence/urgence/exclusions/criteres_secondaires) · `leads`(urgence/financement) · `estimations`(owner_lead_id/decision/next_action/manual_adjustments) ; table **`rea_tasks`** (+index+RLS). Vérifiée exposée (200) sur toutes les nouvelles colonnes/table.

### A1 — Acquéreurs, matching, alertes (`e91a41f`)
- **Profils de recherche multiples** par acquéreur (essentiels/secondaires/exclusions/urgence) créés/édités **LIVE** (0043).
- **Matching expliqué** : critères satisfaits / imparfaits / bloquants / **prochaine action** (dérivé de `score_breakdown`+`features_snapshot`, jamais inventé).
- **Historique des propositions** LIVE (`prosp_match_feedback.signal` + `prosp_contact_attempts`).
- **Préférences d'alertes** : fréquence immédiate/quotidien/hebdo/off **LIVE** ; **ENVOI = CONFIG/APERÇU honnête** (aucun transport, badge « Aperçu — envoi non branché », cooldown/plafond/désinscription en config, **zéro faux envoi**).
- **Bug réel corrigé** : `prosp_match_feedback.signal` (≠ `verdict`) — les 👍/👎 étaient cassés (500). 5 onglets (Profils/Matching/Annonces/Historique/Alertes). +104 tests prospection.

### A2 — Estimation → propriétaire → mandat (`b66b7f0`)
- Depuis le résultat : **rattacher/créer un PROPRIÉTAIRE** (lead vendeur, `owner_lead_id`) LIVE ; **créer une OPPORTUNITÉ de mandat** (`mandates.status='brouillon'` au prix conseillé moteur) LIVE ; **suivi DÉCISION** (en_attente/a_relancer/mandat_signe/refusé/perdu) + `next_action` LIVE.
- **Ajustements manuels tracés** (label/pct-ou-eur/raison/auteur/date) ; **composition de la valeur** distingue clairement **Calculé** / **Saisi** / **Manquant** / **À vérifier**. Pipeline visuel Estimation→Propriétaire→Opportunité→Décision. Moteur de valorisation **non touché**. +12 tests.

### A3 — CRM, agenda, centre d'actions (`347a50c`)
- **Accueil = centre d'actions** (« que faire maintenant, pour qui, pourquoi ») : **11 catégories dérivées de données LIVE** (retard/du-jour/relances/RDV/estimations-à-reprendre/acquéreurs-sans-proposition/matchs/propriétaires/opportunités-mandat/validation), **chaque action rattachée à une vraie entité** → fiche cliquable, zéro action orpheline.
- **Tâches persistées `rea_tasks`** LIVE (créer/marquer-traité/reporter-snooze/demander-validation) via `/api/tasks` (owner-check + Zod, lifecycle prouvé).
- **Actions rapides** : appeler (`tel:`), planifier (visite LIVE), note, ouvrir fiche. **Message = brouillon persisté, jamais « envoyé »**. Agenda : visites liées à leur bien + contact, navigation directe.

### A4 — Frontière Aigent + cohérence DS/QA (`97fc025`)
- **Frontière Aigent honnête** : `lib/aigent/` (types + client `server-only`, feature-détection `AIGENT_*` → `available:false`, zéro requête/secret) + `components/aigent/AigentPanel.tsx` monté en **page Profil** (section « Copilotes IA (Aigent) »). État **« Non connecté / En spécification »** ; **7 capacités PRÉVUES désactivées** (voir copilotes / lancer / état réel / résultats sourcés / validation humaine / reprendre-refuser / historique) ; section **« Ce que ce workspace NE FAIT PAS »** (créer/éditer agent, graph/nodes, déployer/promouvoir, runtime local). **Zéro faux agent/run/score.** Aucune route `/agents`, `config/nav.ts`/`Icon.tsx` **intouchés** (territoire concurrent préservé).
- **QA transversale** @375/@768/@1440 sur toutes les routes de démo : **console 0 erreur, 0 scroll horizontal body**, focus clavier visible. **A1/A2/A3 déjà propres → 0 fix nécessaire** (2 « offenders » investigués = non-bugs : table Catalyst scroll interne, carte OSM clippée par carte arrondie).

## 5. Parcours réellement fonctionnels (LIVE)
1. **Nouvel acquéreur** → profils de recherche → matching → **explication** (satisfaits/bloquants/action) → historique propositions. ✅ LIVE
2. **Prospect propriétaire** → estimation → **rattacher propriétaire** → **opportunité de mandat** → décision/next_action. ✅ LIVE
3. **Début de journée** → **centre d'actions** (priorités/relances/RDV/validations) → chaque item → fiche entité → tâche (traité/reporté). ✅ LIVE

## 6. Capacités préparées / indisponibles (honnêteté)
- **Alertes immobilières — ENVOI** : préparé (config fréquence LIVE + garde-fous cooldown/plafond/désinscription) mais **UNAVAILABLE** (aucun transport email/WhatsApp branché) → aperçu, jamais « envoyé ».
- **Message / relance externe** : **brouillon** persisté (rea_tasks), jamais envoyé.
- **Intégration Aigent** : **UNAVAILABLE / En spécification** (voir §7).

## 7. État exact de l'intégration Aigent
Aigent (où sont créés les agents métier) **n'est PAS connecté** à ce repo : **aucune config `AIGENT_*`/endpoint contrat** (vérifié ; seul `HEARST_ENABLE_PLANNER=false`). Frontière `lib/aigent` propre (feature-détection `AIGENT_BASE_URL`+`AIGENT_API_KEY` absents → `available:false`, aucune requête émise, aucun secret loggé), montée en **Profil** en état **« Non connecté / En spécification »** ; capacités PRÉVUES présentées **désactivées** (afficher agents / lancer / état réel / résultats sourcés / validation humaine / reprendre-refuser / historique) ; frontières dures affichées : **jamais** créer/modifier-graph/déployer/runtime local ; **jamais** de faux agent/run/résultat. Le 4e parcours (intervention Aigent) reste **UNAVAILABLE** — état explicite, l'app ne ment pas, parcours immobiliers classiques non bloqués. Câblage LIVE = mission future dès publication du contrat Aigent.

## 8. Validations
- Gate intégrée A1+A2+A3 (plat-int) : `tsc` ✓ · `check:catalyst` ✓ · `lint:strings` ✓ · `lint:nav` ✓ · `eslint` **0 erreur** · **vitest 312/312** (37 fichiers, +17 nouveaux).
- **Gate finale définitive sur le snapshot livré `97fc025`** (worktree propre `pnpm install --frozen-lockfile`, = ce que Vercel build) : **`pnpm check` EXIT 0** · **`pnpm test` EXIT 0 — 312/312 tests (37 fichiers)** · **`pnpm build` EXIT 0 (18 pages)**.
- Backend : chaque route mutante (criteres PATCH, tasks, estimations owner/mandate/PATCH) = **auth 401 avant DB + owner-check user+tenant + Zod** (prouvé : 401/400/404 sur cas invalides).

## 9. Captures + manifest
**12 captures WebP anonymisées** (`docs/qa/REA-PLATFORM-002/`) + `manifest.md` (route · viewport · données/état · console · overflow · statut) : accueil centre-d'actions (desktop+mobile) · prospection profils · **matching expliqué** (desktop+mobile) · alertes (fréquence LIVE + **envoi Aperçu**) · historique · **estimation continuité** (pipeline propriétaire/mandat/décision, desktop+mobile) · fiche acquéreur · agenda · **frontière Aigent (UNAVAILABLE)**.
- **12/12 : 0 erreur console, 0 scroll horizontal** (desktop 1440 ET mobile 390 ; A4 a aussi couvert 768). Données = démo anonymisé Antibes (SNAPSHOT ; features 0043 LIVE). Faux positifs PII vérifiés (placeholders `06 00 00 00 0X` + email du compte admin de l'app).
- **Confidentialité** : les 7 `docs/screenshots/*.png` (dont **`03-clients.png`** + **`07-prospection.png`** qui exposaient des PII réelles) **remplacées par des versions anonymisées** de l'UI actuelle dans cette branche. Suite Playwright exhaustive non commitée (temporaire supprimée, zéro pollution repo).

## 10. Confidentialité & sécurité
- **Données démo** = anonymisées Antibes (emails `@demo-*.local`, tél `06 00 00 00 0X`) ; propriétaire lié à l'estimation = « Propriétaire Démo Antibes » (anonyme). Zéro PII réelle introduite. Zéro secret loggé.
- **Captures publiques PII** : les 7 `docs/screenshots/*.png` (dont `03-clients.png` + `07-prospection.png` qui exposaient noms/téléphones réels) **remplacées par des versions anonymisées** dans CETTE branche. **Historique Git NON réécrit** → les anciens blobs PII restent dans l'historique et sur `main` : **purge complète de l'historique = mission dédiée urgente** (git-filter-repo/BFG, autorisation explicite requise).
- Migration 0043 = **additive/idempotente** (aucune opération destructive). Aucun secret Vercel modifié.

## 11. Commits & branche
- `33e6076` migration 0043 · `e91a41f` prospection (A1) · `b66b7f0` estimation (A2) · `347a50c` CRM (A3) · `97fc025` Aigent/QA (A4) · `ab1d8b6` captures + report (ce commit).
- Branche **`feature/rea-platform-augmented-002`** **poussée** sur origin. **Pas de merge dans `main`.**

### Preview Vercel
- **URL : https://real-estate-agent-92655hkmo-hearst-corporation.vercel.app** — `READY`, code final. Déploy PREVIEW (non-prod, production intacte, **aucun secret modifié**).
- **Data-limitée (documenté honnêtement)** : `/auth/login` rend (200) mais `POST /api/auth/login` → **503 `supabase_not_configured`** ; `/api/health` → `db:down`, `auth:down`. **Variables manquantes au scope *Preview* Vercel** : `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `TENANT_ID`/`NEXT_PUBLIC_TENANT_ID`, `TOKEN_ENCRYPTION_KEY`, `OPENAI_API_KEY` (elles existent en scope *Production*). **Non corrigé** : ajouter des secrets au scope Preview = interdit sans accord. **Démo data-fonctionnelle = serveur local.**

## 12. Limites restantes
- `lib/supabase/database.types.ts` **désync 0043** (colonnes/table absentes) → accès via casts narrow (pattern voisin existant) ; **régénération des types = cleanup différé** (pas de CLI supabase local + DB derrière tunnel). Non bloquant (tsc vert).
- Envoi d'alertes / messages : transport à brancher (Resend/WhatsApp) — hors périmètre.
- Financement acquéreur (`leads.financement` jsonb) : colonne posée par 0043 mais **UI non construite** dans cette passe (A1 a priorisé urgence/exclusions/critères secondaires/alertes) → à câbler ultérieurement.
- 3 `prosp_match_feedback` + tâches/enrichissements démo laissés pour peupler les captures (supprimables).
- **Non « production ready »** : sécurité/auth à durcir, preview Vercel data-limitée (§ ci-dessous).

## 13. Prochaine mission recommandée
**REA-PROD-003 — durcissement production** : régénérer database.types.ts, brancher un transport d'alertes réel (validation humaine + cooldown + plafond + opt-out déjà spécifiés), câbler l'env DB/auth sur le scope Preview Vercel, durcir auth/révocation, **purge de l'historique Git des captures PII** (mission dédiée), et intégration Aigent réelle quand le contrat est publié.
