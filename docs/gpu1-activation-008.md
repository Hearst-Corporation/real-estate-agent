# Activation GPU1 — vague REA-PRODUCT-007/008 (migrations 0049→0058)

Procédure d'application **manuelle** des migrations `0049`→`0058` sur la base
Postgres self-hostée gpu1, avec vérification post-application et rollback par
migration.

> ⚠️ **Aucun worker n'applique de migration sur gpu1.** Ce document décrit
> l'étape d'**intégration / QA** (l'intégrateur ou Adrien), pas une action de
> worker. Les scripts `scripts/preflight-gpu1.mjs` (plan) et
> `scripts/test-migrations-coherence.mjs` (cohérence statique) ne touchent
> jamais le réseau.

## Contexte infra

| Élément | Valeur |
|---|---|
| Conteneur Postgres | `nexus-postgres` |
| Base | `real-estate-agent` |
| Conteneur PostgREST | `real-estate-agent-postgrest` |
| Reload cache (après tout DDL) | `docker kill -s SIGUSR1 real-estate-agent-postgrest` |
| Accès | `ssh gpu1 '…'` |

## 1. Générer le plan (lecture seule, sans réseau)

```bash
node scripts/test-migrations-coherence.mjs   # doit être VERT avant toute application
node scripts/preflight-gpu1.mjs              # plan ordonné 0049+ (attendues vs optionnelles)
node scripts/preflight-gpu1.mjs --sh > /tmp/apply-008.sh   # script shell copiable
```

Le préflight classe chaque migration :

- **ATTENDUE** — une table/colonne qu'elle crée est **référencée par le code**
  (`lib/**`, `app/**`). Tant qu'elle n'est pas appliquée, la feature dégrade en
  `UNAVAILABLE` honnête (code `42P01` → `database_not_configured`). **À appliquer
  pour activer la vague.**
- **OPTIONNELLE** — aucune référence code (cache d'agrégats ou table réservée).
  Le runtime dérive du réel sans elle → application **différable** sans dégrader.

### Classement de cette vague

| Migration | Objet(s) | Classe | Dépend de |
|---|---|---|---|
| `0049_alert_approvals_pending_decision` | `alter agent_alert_approvals` (CHECK + `decided_by/at` + index) | **ATTENDUE** | `agent_alert_approvals` (0045, déjà en base) |
| `0050_outbox` | `outbox_drafts` | **ATTENDUE** | `leads` (soft FK) |
| `0051_visit_report` | `visit_reports` | **ATTENDUE** | `visits` |
| `0052_offmarket_selection` | `offmarket_selections`, `offmarket_selection_items`, `offmarket_feedback` | **ATTENDUE** | `leads`, `properties`, `prosp_criteres_acquereur` |
| `0053_reactivation` | `reactivation_log` | optionnelle | `leads`, `outbox_drafts` (soft FK — appliquer 0050 avant pour la FK dure) |
| `0054_post_visit_signals` | `post_visit_signals` | **ATTENDUE** | `visits`, `leads` |
| `0055_mandate_renewal` | `mandate_renewal_proposals` | optionnelle | `mandates`, `properties` |
| `0056_share_events` | `share_events` | **ATTENDUE** | (aucune FK) |
| `0057_value_snapshots` | `value_snapshots` | optionnelle | `properties`, `estimations` (soft FK) |
| `0058_learning_signals` | `learning_signals` | optionnelle | `prosp_criteres_acquereur` |

**Ordre d'application recommandé : numérique croissant** `0049 → 0050 → … → 0058`.
L'ordre numérique satisfait toutes les dépendances (`0053` référence
`outbox_drafts` créée en `0050`). Les migrations sont **toutes idempotentes**
(`IF NOT EXISTS`, `drop … if exists` sur triggers/policies, gardes `DO $$`), donc
rejouables sans effet de bord ; un ré-run est sûr.

## 2. Sauvegarde AVANT application (obligatoire)

```bash
ssh gpu1 'docker exec nexus-postgres pg_dump -U postgres -d real-estate-agent -Fc' \
  > backups/rea-pre-008-$(date +%Y%m%d-%H%M%S).dump
```

## 3. Appliquer (dans l'ordre numérique)

Minimum pour activer la vague = les **6 ATTENDUES**. Les 4 optionnelles peuvent
suivre immédiatement (aucun risque, idempotentes) ou être différées.

```bash
cd "$(git rev-parse --show-toplevel)"
for f in \
  0049_alert_approvals_pending_decision \
  0050_outbox \
  0051_visit_report \
  0052_offmarket_selection \
  0053_reactivation \
  0054_post_visit_signals \
  0055_mandate_renewal \
  0056_share_events \
  0057_value_snapshots \
  0058_learning_signals ; do
  echo "── application $f"
  ssh gpu1 'docker exec -i nexus-postgres psql -U postgres -d real-estate-agent -v ON_ERROR_STOP=1' \
    < "supabase/migrations/$f.sql"
done

# Reload du cache PostgREST — OBLIGATOIRE après le DDL, une seule fois suffit.
ssh gpu1 'docker kill -s SIGUSR1 real-estate-agent-postgrest'
```

> Le plan copiable équivalent : `node scripts/preflight-gpu1.mjs --sh`.
> Pour n'appliquer que les attendues : `node scripts/preflight-gpu1.mjs --sh --expected`.

## 4. Vérification post-application

```bash
# 4a. Les tables existent (attendues + optionnelles appliquées).
ssh gpu1 "docker exec nexus-postgres psql -U postgres -d real-estate-agent -c \
  \"select table_name from information_schema.tables
    where table_schema='public'
      and table_name in ('outbox_drafts','visit_reports','offmarket_selections',
        'offmarket_selection_items','offmarket_feedback','reactivation_log',
        'post_visit_signals','mandate_renewal_proposals','share_events',
        'value_snapshots','learning_signals') order by 1;\""

# 4b. 0049 : le CHECK de statut admet bien pending/rejected + colonnes de décision.
ssh gpu1 "docker exec nexus-postgres psql -U postgres -d real-estate-agent -c \
  \"select column_name from information_schema.columns
    where table_name='agent_alert_approvals'
      and column_name in ('decided_by','decided_at');\""

# 4c. PostgREST voit les nouvelles tables (cache rechargé) — depuis la machine app :
#     curl -s -H \"Authorization: Bearer <service-role>\" \
#       https://real-estate-agent-db.hearst.app/rest/v1/outbox_drafts?limit=0 -I
#     → 200 attendu (et non 404 : sinon le SIGUSR1 n'a pas été émis).

# 4d. Diagnostic global du schéma (compare attendu/réel, teste RLS).
node scripts/db-diagnose.mjs
```

**Critères de succès** : 4a liste les 6 tables attendues (+ optionnelles
appliquées) ; 4b liste `decided_by` + `decided_at` ; PostgREST répond `200` sur
les nouvelles routes REST (cache rechargé). Côté app, les pages qui affichaient
`UNAVAILABLE` passent en `LIVE`/`DRAFT`.

## 5. Rollback par migration

Rollback en **ordre inverse** (0058 → 0049). Chaque bloc est idempotent
(`drop … if exists`). **Le rollback détruit les données** des tables concernées :
restaurer plutôt le dump de l'étape 2 si des données de prod ont été écrites.

> Restauration complète (préférée si des données existent) :
> ```bash
> ssh gpu1 'docker exec -i nexus-postgres pg_restore -U postgres -d real-estate-agent --clean --if-exists' \
>   < backups/rea-pre-008-<timestamp>.dump
> ssh gpu1 'docker kill -s SIGUSR1 real-estate-agent-postgrest'
> ```

Rollback DDL migration par migration (si pas de données à préserver) :

```sql
-- 0058 learning_signals
drop table if exists public.learning_signals cascade;

-- 0057 value_snapshots
drop table if exists public.value_snapshots cascade;

-- 0056 share_events
drop table if exists public.share_events cascade;

-- 0055 mandate_renewal_proposals
drop table if exists public.mandate_renewal_proposals cascade;

-- 0054 post_visit_signals
drop table if exists public.post_visit_signals cascade;

-- 0053 reactivation_log
drop table if exists public.reactivation_log cascade;

-- 0052 offmarket (ordre : feedback → items → selections à cause des FK)
drop table if exists public.offmarket_feedback cascade;
drop table if exists public.offmarket_selection_items cascade;
drop table if exists public.offmarket_selections cascade;

-- 0051 visit_reports
drop table if exists public.visit_reports cascade;

-- 0050 outbox_drafts
drop table if exists public.outbox_drafts cascade;

-- 0049 : revenir au CHECK d'origine (0045) et retirer les colonnes de décision.
--        NE PAS drop la table (agent_alert_approvals préexiste à la vague).
drop index if exists idx_agent_alert_approval_pending;
alter table public.agent_alert_approvals drop column if exists decided_at;
alter table public.agent_alert_approvals drop column if exists decided_by;
alter table public.agent_alert_approvals
  drop constraint if exists agent_alert_approvals_status_check;
alter table public.agent_alert_approvals
  add constraint agent_alert_approvals_status_check
  check (status in ('approved','consumed','revoked'));
```

Appliquer le rollback via le même canal, puis **recharger PostgREST** :

```bash
ssh gpu1 'docker exec -i nexus-postgres psql -U postgres -d real-estate-agent -v ON_ERROR_STOP=1' < /tmp/rollback-008.sql
ssh gpu1 'docker kill -s SIGUSR1 real-estate-agent-postgrest'
```

Après rollback, les features de la vague redeviennent `UNAVAILABLE` proprement
(le code dégrade sur `42P01`) — aucun crash attendu.

## Notes de cohérence (vérifiées par `test-migrations-coherence.mjs`)

- Numérotation `0049→0058` continue, unique, sans collision de nom de table.
- Toutes les FK référencent une table connue (préexistante ou créée plus tôt),
  ou sont gardées par un test d'existence `information_schema.tables` (soft FK).
- Idempotence prouvée sur chaque objet (tables, index, triggers, policies).
- Cosmétique (sans impact application) : les en-têtes de commentaire de
  `0050_outbox.sql` et `0052_offmarket_selection.sql` citent un ancien numéro
  (`0049`/`0050`) — le **nom de fichier** fait foi pour l'ordre d'application.
