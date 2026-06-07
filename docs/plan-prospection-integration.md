# PLAN FINAL — Prospection & Matching (clone BienCible)
## Real Estate Agent · Next.js 16 App Router · Supabase RLS multi-tenant · Inngest · Cockpit DS

> **Date : 2026-06-06** · Architecte en chef · Version EXÉCUTABLE (v2, post-revue)
> Statut : plan auto-suffisant, prêt à exécuter. Toutes les références (fichiers, fonctions, migrations) ont été vérifiées dans le code réel. Les contradictions entre reviewers sont tranchées en ligne.

> **Note sur les revues** : les 10 revues automatisées ont toutes échoué sur rate-limit serveur (`API Error: Server is temporarily limiting requests`). Aucun finding P0/P1/P2 textuel n'a donc été produit par les reviewers. **Conséquence factuelle (règle d'honnêteté) : je n'ai PAS appliqué de findings de reviewers car il n'y en a aucun.** À la place, j'ai conduit moi-même la revue P0/P1/P2 du PLAN v1 contre la CARTE DE CODE et contre une **vérification directe du code source** (lectures réelles : `lib/invest/shared/audit.ts`, `lib/invest/shared/dlq-drain.ts`, `supabase/migrations/0020_invest_documents_audit.sql`, `lib/providers/scrub.ts`). Les corrections issues de cette vérification sont en §14. Les contradictions documentées (barème mandat doc vs API, ingestion MoteurImmo vs Apify vs MySwarms, prefs souples) sont tranchées ci-dessous.

---

## 1. CONTEXTE & OBJECTIF

**Objectif** : intégrer dans la plateforme Real Estate Agent les capacités prospection/matching de BienCible (scan live `canvas/biencible-integration.html` : 835 annonces actives, 543 matchs, 8 pages produit) — 1 pipeline data commun (ingestion multi-sources), 2 moteurs de score (mandat = chasse vendeur, match = matching acquéreur), alertes WhatsApp/email, fiches HTML/PDF, screening Tinder, import/export Excel, veille concurrentielle.

**Pivot technique** (gotcha #10 carte swarms-llm-target) : `lib/estimation/listings.ts::fetchListingComparables` calcule déjà des comparables Apify/MySwarms mais **les jette**. Tout le système repose sur leur **persistance** dans `prosp_annonces`. Sans persistance, aucun moteur ne fonctionne.

**Principe directeur** : réutiliser au maximum l'existant vérifié (estimation DVF/comparables/DPE, brochure PDF→R2, CRM leads, jobs Inngest, providers cost-guard/scrub/idempotency, audit). Net-new strictement limité au cœur prospection : `lib/prospection/*`, `lib/providers/{moteurimmo,twilio,resend}.ts`, tables `prosp_*`, pages/routes `prospection/*`, jobs Inngest. Discipline architecturale calquée sur `lib/invest/` : cores purs sans IO testables, ports/adapters, idempotence, audit, observabilité.

**Objectifs data chiffrés** :

| Dimension | Cible | Mécanisme |
|---|---|---|
| Volume | 200-2000 annonces/h/tenant, table 100k+ lignes | Ingestion fan-out par zone (`step.run`), pagination DB `.range()` |
| Dedup multi-sources | 1 bien physique = 1 ligne, `duplicate_count` agrégé | `hash_dedup` déterministe bucketé + `ON CONFLICT (tenant_id, hash_dedup)` |
| Fraîcheur | annonce ≤ 1h, re-scan prospects 15 min | cron horaire ingestion + cron 15 min scoring/alertes |
| Idempotence | rejeu ingestion = 0 doublon, 0 alerte double | `(tenant_id, hash_dedup)` UNIQUE + `withIdempotency` + cooldown |
| Coût | cap MoteurImmo/jour, cap Twilio 10/j, cooldown 24h | `paidCall` (fail-closed) + `rateLimit` (fail-open) en série |
| Observabilité | `captureFatal` partout, ledger `prosp_ingestion_runs`, advisors | table ledger + Sentry + scrub PII |
| Exactitude scores | 2 barèmes mandat configurables, breakdown JSONB auditable | `prosp_config` JSONB + formules pures testées |
| Futur ML | feedback 👍/👎 horodaté + features figées par match | `prosp_match_feedback` + `features_snapshot` JSONB |

### Conflit tranché — INGESTION

**Décision : MoteurImmo API primaire + Apify LBC fallback ; MySwarms exclu de l'ingestion de masse.**
Justification (1 ligne) : l'actor Apify existant ne couvre que LeBonCoin avec `MAX_LISTINGS=12` figé (gotcha #1/#4 carte listings) → insuffisant pour 200+/h multi-sources, alors que MoteurImmo est l'agrégateur natif (seloger/leboncoin/bienici/paruvendu/figaro/gensdeconfiance) utilisé par BienCible ; MySwarms est opaque (Browserbase, gotcha #3 carte listings) et réservé à l'estimation.
Implémentation : `lib/providers/moteurimmo.ts` (clé `MOTEURIMMO_API_KEY`) primaire derrière `moteurImmoIsConfigured()` ; sinon fallback `lib/prospection/apify-bulk.ts` (pagine l'actor LBC sans le cap 12). Flag `PROSP_INGEST_PROVIDER=moteurimmo|apify`. Sans clé MoteurImmo, le fallback Apify LBC démontre déjà la valeur (MVP non bloqué).

### Conflit tranché — BARÈME MANDAT

**Décision : poids 100 % configurables en DB ; les deux barèmes (doc + API observée) sont des presets ; default = preset API.**
Justification (1 ligne) : le `score_breakdown` réel de l'API BienCible (`{pap:50, zone_prioritaire:20, republication_recente:25, description_pap:10}`) contredit leur doc (`{pap:30, anciennete>45j:20, baisse:15, zone:20}`) — `scoreMandat` lit `config.weights`, agnostique du preset (gotcha #7 carte swarms).

### Conflit tranché — PRÉFÉRENCES CONFORT (souples vs durs)

**Décision : terrasse/parking/ascenseur/jardin/piscine sont SOUPLES par défaut (bonifient le score sans exclure), sauf valeur explicite `requis` ou `exclu` (filtre dur).**
Justification (1 ligne) : le TARGET impose "prefs SOUPLES : améliorent le score sans filtrer dur" mais conserve le besoin métier `requis/exclu` → tristate `requis|exclu|indifferent`, seuls `requis`/`exclu` filtrent dur.

---

## 2. ARCHITECTURE + FLUX

Préfixe tables = `prosp_` (isolé du domaine `inv_`, gotcha #10 carte db-migrations). Séparation **catalogue tenant** (annonces, runs, écriture service-role) vs **owner agent** (prospects, critères, matchs).

```
                          ┌──────────── PORTS / ADAPTERS (fail-soft, jamais appelés par les cores) ───────┐
                          │  lib/providers/moteurimmo.ts  (ingestion agrégateur, paidCall dailyCap)        │
                          │  lib/providers/twilio.ts      (WhatsApp out, dry-run si absent)                │
                          │  lib/providers/resend.ts      (email out, extrait du pattern inline)           │
                          │  lib/estimation/{geocode,cadastre,dvf,comparables,price-index,ademe,valuation} │
                          └────────────────────────────────────────────────────────────────────────────────┘
                                                       │
   CRON 0 * * * *          ┌────────────────────────────┴─────────────────────────────┐
   prosp-ingest-tick ─────▶│ INGESTION (Inngest, service-role, concurrency:{limit:2})   │
                           │  zones actives (prosp_zones) → step.run("zone:{cp}")        │
                           │   ├─ moteurImmo.fetchAnnonces  OU  apify-bulk fallback      │
                           │  → normalizeAnnonce → hashDedup → withIdempotency           │
                           │  → upsertAnnonces ON CONFLICT(tenant_id,hash_dedup)         │
                           │  → ledger prosp_ingestion_runs ; émet prosp/annonce.ingested│
                           └───────────────┬────────────────────────────────────────────┘
                                           │
   CRON */15 * * * *        ┌──────────────┴────────────────────────────────────────────┐
   prosp-score-tick ───────▶│ ENRICH + SCORE (Inngest, concurrency:{limit:1})            │
                            │  enrichAnnonce (geocode·DVF·comparables·ademe, best-effort) │
                            │  → prix_gap_median (NULL si DVF vide) · rentabilite_estimee │
                            │  scoreMandat (core pur) → upsert prosp_prospects            │
                            │  scoreMatch  (core pur) × prosp_criteres → upsert prosp_matchs│
                            │  set scored_at ; émet prosp/alert.requested si ≥ seuil      │
                            └───────────────┬────────────────────────────────────────────┘
                                            │ event-driven
   event prosp/alert.requested ┌────────────┴────────────────────────────────────────────┐
   prosp-alert-dispatch ───────▶│ ALERTES (paidCall cap 10/j PUIS rateLimit cooldown 24h)  │
                                │  mandat → Twilio WA agent (fallback URL si PAP sans tel) │
                                │  acquéreur instant → match → email/WA selon canal        │
                                │  échec → prosp_failed_operations (DLQ, payload scrubé)   │
                                └───────────────┬────────────────────────────────────────────┘
   CRON 0 8 * * *  prosp-alert-daily ──▶ digest acquéreurs alert_frequency=daily
   CRON 0 7 * * *  prosp-veille-tick  ──▶ annonces des SIREN/agences surveillés
   CRON 0 */1 * * * prosp-dlq-drain   ──▶ drainProspFailedOperations(store dédié, onError:captureFatal)

   UI Cockpit (server components) ──▶ API /api/prospection/* (service-role, double filtre) ──▶
   /prospection · /matchs(+Tinder) · /acquereurs · /envois · /veille · /prospection/config
```

**Séparation des policies** (gotcha #5 carte db-migrations) :
- **Catalogue tenant** (pas de `user_id`, écriture service-role only via jobs, RLS `for select`) : `prosp_annonces`, `prosp_ingestion_runs`.
- **Owner agent** (`user_id`, RLS `for all` owner+tenant) : `prosp_prospects`, `prosp_criteres`, `prosp_matchs`, `prosp_match_feedback`, `prosp_envois`, `prosp_veille_agences`, `prosp_config`, `prosp_zones`.
- **Service-role only** (RLS activée, policy lecture tenant pour debug UI mais aucune écriture) : `prosp_idempotency_keys`, `prosp_failed_operations`.

> **DÉVIATION RLS ASSUMÉE vs `inv_*` (tranchée explicitement, ne PAS laisser implicite)** : le pattern source `inv_idempotency_keys` (0021 l.29/294) ET `inv_failed_operations` (0021 l.29/305) portent une colonne `user_id` + une policy de lecture `using ((select auth.uid()) = user_id and tenant_id = ...)`. Côté prospection, l'ingestion est un **flux machine sans propriétaire** (`prospIngestTick`/`prospScoreTick` écrivent en service-role, sans `user_id` métier) → on NE peut PAS calquer la policy `auth.uid() = user_id`. Décision : (a) `prosp_idempotency_keys` reste **service-role only avec RLS activée et AUCUNE policy** (table volontairement illisible hors service-role — debug via `mcp__supabase__execute_sql` qui bypass RLS) ; (b) `prosp_failed_operations` reçoit une **policy de lecture tenant** (`using (tenant_id = current_tenant_id())`, sans `user_id`) pour permettre le back-office DLQ en UI. Cette divergence est intentionnelle (absence de propriétaire utilisateur sur le flux d'ingestion), pas un oubli du calque `inv_*`. `mcp__supabase__get_advisors` peut signaler `prosp_idempotency_keys` (RLS sans policy) → finding **attendu et accepté**.

---

## 3. MODÈLE DE DONNÉES — SQL DDL CONCRET (RLS + index)

**Conventions inviolables vérifiées dans le code (carte db-migrations)** : `tenant_id text not null default 'real-estate-agent'` FK-less ; enums via `check()` (jamais `CREATE TYPE`) ; `drop policy if exists` avant chaque `create policy` ; trigger `public.set_updated_at()` (existe depuis 0007, nom unique `trg_<table>_updated_at`) ; fonction `public.current_tenant_id()` (existe depuis 0003) ; index sur **chaque** FK + `tenant_id` + `status`. **Prochaine migration = 0025** (dernière vérifiée = `0024_invest_chain_events.sql`).

> **Après CHAQUE `mcp__supabase__apply_migration`** : `mcp__supabase__generate_typescript_types` → écraser `lib/supabase/database.types.ts` (gotcha #9 carte db-migrations). Versionner en parallèle dans `supabase/migrations/NNNN_*.sql`. `mcp__supabase__get_advisors` avant prod.

### Migration `0025_prosp_annonces.sql` (catalogue tenant + ledger)

```sql
-- ─── prosp_annonces : catalogue d'annonces tenant (écriture service-role only) ─
create table if not exists public.prosp_annonces (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'real-estate-agent',
  -- Source / provenance / dedup
  source_platform text not null,                -- seloger|leboncoin|bienici|paruvendu|figaro|gensdeconfiance
  source_url text,
  source_id text,
  mi_origin text,                               -- 'moteurimmo'|'apify'|'myswarms'
  hash_dedup text not null,                     -- sha256(type|cp|bucket(surface,5)|pieces|bucket(prix,5k))
  duplicate_count integer not null default 1,
  duplicate_sources jsonb not null default '[]'::jsonb,
  -- Bien
  type_bien text check (type_bien in ('appartement','maison','terrain','immeuble','local','parking','autre')),
  title text,
  description text,
  prix numeric,
  prix_m2 numeric,
  surface_m2 numeric,
  surface_terrain_m2 numeric,
  nb_pieces integer,
  nb_chambres integer,
  etage integer,
  annee_construction integer,
  code_postal text,
  commune text,
  latitude double precision,
  longitude double precision,
  photos_urls jsonb not null default '[]'::jsonb,
  -- Confort
  terrasse boolean,
  parking boolean,
  ascenseur boolean,
  jardin boolean,
  piscine boolean,
  -- DPE / charges
  dpe_note text,
  ges_note text,
  conso_energie_kwh numeric,
  charges_mensuelles numeric,
  taxe_fonciere numeric,
  -- Annonceur (PII — scrub avant tout log)
  type_annonceur text not null default 'inconnu' check (type_annonceur in ('pap','pro','inconnu')),
  telephone_vendeur text,
  email_vendeur text,
  nom_annonceur text,
  siren_annonceur text,
  phone_removed_at timestamptz,
  -- Dynamique prix / fraîcheur
  premiere_parution_at timestamptz,
  prix_original numeric,
  prix_baisse_delta numeric,                    -- prix_original - prix (>0 = baisse)
  baisse_detectee_at timestamptz,
  derniere_republication_at timestamptz,
  first_seen_at timestamptz not null default now(),
  date_collecte timestamptz not null default now(),
  age_hours integer,
  -- Flags marché
  vendeur_refuse_demarchage boolean not null default false,
  sous_compromis boolean not null default false,
  is_auction_sale boolean not null default false,
  is_viager boolean not null default false,
  is_under_mandate boolean not null default false,
  actif boolean not null default true,
  -- Dérivés (enrich — null si incalculable, JAMAIS 0 — gotcha #3 carte valuation)
  prix_gap_median numeric,
  rentabilite_estimee numeric,
  enriched_at timestamptz,
  scored_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_prosp_annonces_dedup unique (tenant_id, hash_dedup)
);
create index if not exists idx_prosp_annonces_tenant       on public.prosp_annonces(tenant_id);
create index if not exists idx_prosp_annonces_actif        on public.prosp_annonces(tenant_id, actif);
create index if not exists idx_prosp_annonces_scored       on public.prosp_annonces(tenant_id, scored_at);
create index if not exists idx_prosp_annonces_cp           on public.prosp_annonces(tenant_id, code_postal);
create index if not exists idx_prosp_annonces_type_ann     on public.prosp_annonces(tenant_id, type_annonceur);
create index if not exists idx_prosp_annonces_siren        on public.prosp_annonces(siren_annonceur);
create index if not exists idx_prosp_annonces_first_seen   on public.prosp_annonces(first_seen_at);
create index if not exists idx_prosp_annonces_source       on public.prosp_annonces(source_platform);
create trigger trg_prosp_annonces_updated_at before update on public.prosp_annonces
  for each row execute function public.set_updated_at();
alter table public.prosp_annonces enable row level security;
drop policy if exists "tenant prosp_annonces read" on public.prosp_annonces;
create policy "tenant prosp_annonces read" on public.prosp_annonces for select
  using (tenant_id = (select public.current_tenant_id()));
-- Écriture exclusivement service-role (jobs Inngest) → pas de policy insert/update/delete.

-- ─── prosp_ingestion_runs : ledger observabilité (catalogue tenant) ────────────
create table if not exists public.prosp_ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'real-estate-agent',
  kind text not null default 'ingest' check (kind in ('ingest','score','alert','veille')),
  source text,
  status text not null default 'running' check (status in ('running','done','failed')),
  scanned integer not null default 0,
  inserted integer not null default 0,
  updated_count integer not null default 0,
  skipped integer not null default 0,
  alerts_sent integer not null default 0,
  cost_estimate numeric not null default 0,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists idx_prosp_runs_tenant   on public.prosp_ingestion_runs(tenant_id);
create index if not exists idx_prosp_runs_kind      on public.prosp_ingestion_runs(tenant_id, kind);
create index if not exists idx_prosp_runs_started   on public.prosp_ingestion_runs(started_at);
alter table public.prosp_ingestion_runs enable row level security;
drop policy if exists "tenant prosp_runs read" on public.prosp_ingestion_runs;
create policy "tenant prosp_runs read" on public.prosp_ingestion_runs for select
  using (tenant_id = (select public.current_tenant_id()));
```

### Migration `0026_prosp_prospects_criteres.sql` (owner agent)

```sql
-- ─── prosp_prospects : chasse mandat (owner) ──────────────────────────────────
create table if not exists public.prosp_prospects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id text not null default 'real-estate-agent',
  annonce_id uuid not null references public.prosp_annonces(id) on delete cascade,
  statut text not null default 'nouveau'
    check (statut in ('nouveau','a_appeler','contacte','rdv_pris','mandat_signe','refuse','perdu')),
  score_mandat integer not null default 0 check (score_mandat between 0 and 100),
  score_breakdown jsonb not null default '{}'::jsonb,
  notes text,
  rappel_at timestamptz,
  seen_at timestamptz,
  first_call_at timestamptz,
  mandat_signed_at timestamptz,
  alerted_at timestamptz,
  lead_id uuid references public.leads(id) on delete set null,    -- conversion CRM (0008)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_prosp_prospect unique (user_id, tenant_id, annonce_id)
);
create index if not exists idx_prosp_prospects_user     on public.prosp_prospects(user_id);
create index if not exists idx_prosp_prospects_tenant    on public.prosp_prospects(tenant_id);
create index if not exists idx_prosp_prospects_annonce   on public.prosp_prospects(annonce_id);
create index if not exists idx_prosp_prospects_statut    on public.prosp_prospects(statut);
create index if not exists idx_prosp_prospects_score     on public.prosp_prospects(tenant_id, score_mandat desc);
create index if not exists idx_prosp_prospects_lead      on public.prosp_prospects(lead_id);
create trigger trg_prosp_prospects_updated_at before update on public.prosp_prospects
  for each row execute function public.set_updated_at();
alter table public.prosp_prospects enable row level security;
drop policy if exists "tenant prosp_prospects" on public.prosp_prospects;
create policy "tenant prosp_prospects" on public.prosp_prospects for all
  using ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()))
  with check ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()));

-- ─── prosp_criteres : acquéreur (owner) ───────────────────────────────────────
create table if not exists public.prosp_criteres (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id text not null default 'real-estate-agent',
  lead_id uuid references public.leads(id) on delete set null,    -- acquéreur CRM (0008)
  label text not null,
  actif boolean not null default true,
  communes jsonb not null default '[]'::jsonb,
  type_bien text check (type_bien in ('appartement','maison','terrain','immeuble','local','parking','autre')),
  prix_min numeric,
  prix_max numeric,
  surface_min numeric,
  pieces_min integer,
  chambres_min integer,
  -- Préférences confort TRISTATE (SOUPLES par défaut : 'indifferent' bonifie sans filtrer ;
  --  'requis'/'exclu' = filtre dur). Décision tranchée §1.
  pref_terrasse text not null default 'indifferent' check (pref_terrasse in ('requis','exclu','indifferent')),
  pref_parking text not null default 'indifferent' check (pref_parking in ('requis','exclu','indifferent')),
  pref_ascenseur text not null default 'indifferent' check (pref_ascenseur in ('requis','exclu','indifferent')),
  pref_jardin text not null default 'indifferent' check (pref_jardin in ('requis','exclu','indifferent')),
  pref_piscine text not null default 'indifferent' check (pref_piscine in ('requis','exclu','indifferent')),
  accepte_travaux boolean not null default true,
  source text not null default 'direct' check (source in ('direct','enrichi_ia','import_excel')),
  -- Poids scoring PAR CLIENT (override config tenant), somme renormalisée à 100 côté core
  poids jsonb not null default '{"prix":30,"surface":25,"localisation":20,"pieces":15,"dpe":10}'::jsonb,
  seuil_match integer not null default 60 check (seuil_match between 0 and 100),
  alert_frequency text not null default 'daily' check (alert_frequency in ('instant','daily','off')),
  alert_canal text not null default 'email' check (alert_canal in ('email','whatsapp')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_prosp_critere_label unique (user_id, tenant_id, label)
);
create index if not exists idx_prosp_criteres_user     on public.prosp_criteres(user_id);
create index if not exists idx_prosp_criteres_tenant    on public.prosp_criteres(tenant_id);
create index if not exists idx_prosp_criteres_lead      on public.prosp_criteres(lead_id);
create index if not exists idx_prosp_criteres_actif     on public.prosp_criteres(tenant_id, actif);
create trigger trg_prosp_criteres_updated_at before update on public.prosp_criteres
  for each row execute function public.set_updated_at();
alter table public.prosp_criteres enable row level security;
drop policy if exists "tenant prosp_criteres" on public.prosp_criteres;
create policy "tenant prosp_criteres" on public.prosp_criteres for all
  using ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()))
  with check ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()));
```

### Migration `0027_prosp_matchs_feedback.sql` (owner agent)

```sql
-- ─── prosp_matchs : acquéreur × annonce (owner) ───────────────────────────────
create table if not exists public.prosp_matchs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id text not null default 'real-estate-agent',
  annonce_id uuid not null references public.prosp_annonces(id) on delete cascade,
  critere_id uuid not null references public.prosp_criteres(id) on delete cascade,
  score_match integer not null default 0 check (score_match between 0 and 100),
  bonus_breakdown jsonb not null default '{}'::jsonb,    -- {sous_prix_mi, baisse_prix, republication}
  features_snapshot jsonb not null default '{}'::jsonb,  -- features figées au calcul (reproductible ML)
  statut text not null default 'nouveau'
    check (statut in ('nouveau','selectionne','ecarte','envoye','archive')),
  proposed_to_others jsonb not null default '[]'::jsonb, -- critere_ids déjà sollicités
  date_match timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_prosp_match unique (user_id, tenant_id, annonce_id, critere_id)
);
create index if not exists idx_prosp_matchs_user      on public.prosp_matchs(user_id);
create index if not exists idx_prosp_matchs_tenant     on public.prosp_matchs(tenant_id);
create index if not exists idx_prosp_matchs_annonce    on public.prosp_matchs(annonce_id);
create index if not exists idx_prosp_matchs_critere    on public.prosp_matchs(critere_id);
create index if not exists idx_prosp_matchs_statut     on public.prosp_matchs(statut);
create index if not exists idx_prosp_matchs_score      on public.prosp_matchs(tenant_id, score_match desc);
create trigger trg_prosp_matchs_updated_at before update on public.prosp_matchs
  for each row execute function public.set_updated_at();
alter table public.prosp_matchs enable row level security;
drop policy if exists "tenant prosp_matchs" on public.prosp_matchs;
create policy "tenant prosp_matchs" on public.prosp_matchs for all
  using ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()))
  with check ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()));

-- ─── prosp_match_feedback : signal ML (owner) ─────────────────────────────────
create table if not exists public.prosp_match_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id text not null default 'real-estate-agent',
  match_id uuid not null references public.prosp_matchs(id) on delete cascade,
  critere_id uuid references public.prosp_criteres(id) on delete set null,
  verdict text not null check (verdict in ('up','down')),
  features_snapshot jsonb not null default '{}'::jsonb,   -- copie features du match (dataset ML)
  score_at_feedback integer,
  created_at timestamptz not null default now()
);
create index if not exists idx_prosp_fb_user      on public.prosp_match_feedback(user_id);
create index if not exists idx_prosp_fb_tenant     on public.prosp_match_feedback(tenant_id);
create index if not exists idx_prosp_fb_match       on public.prosp_match_feedback(match_id);
create index if not exists idx_prosp_fb_critere     on public.prosp_match_feedback(critere_id);
create index if not exists idx_prosp_fb_verdict     on public.prosp_match_feedback(verdict);
alter table public.prosp_match_feedback enable row level security;
drop policy if exists "tenant prosp_match_feedback" on public.prosp_match_feedback;
create policy "tenant prosp_match_feedback" on public.prosp_match_feedback for all
  using ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()))
  with check ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()));
```

### Migration `0028_prosp_config_zones_veille_envois_infra.sql` (owner + service-role infra)

```sql
-- ─── prosp_config : barèmes scoring configurables (owner, 1 ligne/agent) ───────
create table if not exists public.prosp_config (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id text not null default 'real-estate-agent',
  mandat_preset text not null default 'api' check (mandat_preset in ('doc','api','custom')),
  mandat_poids jsonb not null default
    '{"pap":50,"zone_prioritaire":20,"republication_recente":25,"description_pap":10}'::jsonb,
  mandat_seuil integer not null default 60 check (mandat_seuil between 0 and 100),
  zones_prioritaires jsonb not null default '[]'::jsonb,        -- codes postaux
  siren_blacklist jsonb not null default '[]'::jsonb,           -- agences partenaires exclues
  pap_keywords jsonb not null default
    '["pas d''agence","particulier","sans agence","de particulier à particulier","entre particuliers","direct propriétaire"]'::jsonb,
  bareme_match jsonb not null default '{"prix":30,"surface":25,"localisation":20,"pieces":15,"dpe":10}'::jsonb,
  wa_daily_cap integer not null default 10 check (wa_daily_cap between 0 and 100),
  wa_cooldown_h integer not null default 24,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_prosp_config_owner unique (user_id, tenant_id)
);
create index if not exists idx_prosp_config_user    on public.prosp_config(user_id);
create index if not exists idx_prosp_config_tenant   on public.prosp_config(tenant_id);
create trigger trg_prosp_config_updated_at before update on public.prosp_config
  for each row execute function public.set_updated_at();
alter table public.prosp_config enable row level security;
drop policy if exists "tenant prosp_config" on public.prosp_config;
create policy "tenant prosp_config" on public.prosp_config for all
  using ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()))
  with check ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()));

-- ─── prosp_zones : zones à scraper (owner, pilote l'ingestion) ─────────────────
create table if not exists public.prosp_zones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id text not null default 'real-estate-agent',
  code_postal text not null,
  commune text,
  type_bien text,
  actif boolean not null default true,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_prosp_zone unique (user_id, tenant_id, code_postal, type_bien)
);
create index if not exists idx_prosp_zones_user    on public.prosp_zones(user_id);
create index if not exists idx_prosp_zones_tenant   on public.prosp_zones(tenant_id);
create index if not exists idx_prosp_zones_actif    on public.prosp_zones(tenant_id, actif);
create trigger trg_prosp_zones_updated_at before update on public.prosp_zones
  for each row execute function public.set_updated_at();
alter table public.prosp_zones enable row level security;
drop policy if exists "tenant prosp_zones" on public.prosp_zones;
create policy "tenant prosp_zones" on public.prosp_zones for all
  using ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()))
  with check ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()));

-- ─── prosp_veille_agences : suivi concurrents nommés (owner) ───────────────────
create table if not exists public.prosp_veille_agences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id text not null default 'real-estate-agent',
  nom_agence text not null,
  siren text,
  patterns_nom jsonb not null default '[]'::jsonb,
  actif boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_prosp_veille_user    on public.prosp_veille_agences(user_id);
create index if not exists idx_prosp_veille_tenant   on public.prosp_veille_agences(tenant_id);
create index if not exists idx_prosp_veille_siren    on public.prosp_veille_agences(siren);
create index if not exists idx_prosp_veille_actif    on public.prosp_veille_agences(tenant_id, actif);
create trigger trg_prosp_veille_updated_at before update on public.prosp_veille_agences
  for each row execute function public.set_updated_at();
alter table public.prosp_veille_agences enable row level security;
drop policy if exists "tenant prosp_veille_agences" on public.prosp_veille_agences;
create policy "tenant prosp_veille_agences" on public.prosp_veille_agences for all
  using ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()))
  with check ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()));

-- ─── prosp_envois : regroupement matchs envoyés au client (owner) ──────────────
create table if not exists public.prosp_envois (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id text not null default 'real-estate-agent',
  critere_id uuid not null references public.prosp_criteres(id) on delete cascade,
  match_ids jsonb not null default '[]'::jsonb,
  canal text not null check (canal in ('email','whatsapp')),
  destinataire text,                                     -- email/tel client (PII)
  pdf_key text,                                          -- clé R2
  pdf_url text,
  statut text not null default 'queued'
    check (statut in ('queued','sent','failed','dry_run')),
  provider_ref text,                                     -- id Resend / sid Twilio
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_prosp_envois_user    on public.prosp_envois(user_id);
create index if not exists idx_prosp_envois_tenant   on public.prosp_envois(tenant_id);
create index if not exists idx_prosp_envois_critere  on public.prosp_envois(critere_id);
create index if not exists idx_prosp_envois_statut   on public.prosp_envois(statut);
create trigger trg_prosp_envois_updated_at before update on public.prosp_envois
  for each row execute function public.set_updated_at();
alter table public.prosp_envois enable row level security;
drop policy if exists "tenant prosp_envois" on public.prosp_envois;
create policy "tenant prosp_envois" on public.prosp_envois for all
  using ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()))
  with check ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()));

-- ─── prosp_idempotency_keys : dédup ingestion (calque inv_idempotency_keys 0021, SANS user_id) ─
-- DÉVIATION ASSUMÉE vs inv_idempotency_keys : flux d'ingestion machine sans propriétaire
-- utilisateur → pas de colonne user_id, donc pas de policy "auth.uid()=user_id". RLS activée
-- sans AUCUNE policy = table service-role only (debug via execute_sql qui bypass RLS).
create table if not exists public.prosp_idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'real-estate-agent',
  idem_key text not null,
  body_hash text,
  response jsonb,
  status text not null default 'in_progress' check (status in ('in_progress','succeeded','failed')),
  created_at timestamptz not null default now(),
  unique (tenant_id, idem_key)
);
create index if not exists idx_prosp_idem_tenant on public.prosp_idempotency_keys(tenant_id);
alter table public.prosp_idempotency_keys enable row level security;
-- service-role only (jobs) → aucune policy.

-- ─── prosp_failed_operations : DLQ prospection (schéma aligné inv_failed_operations 0021) ─
-- DLQ dédiée : ne PAS polluer inv_failed_operations (gotcha #10 carte db-migrations).
create table if not exists public.prosp_failed_operations (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'real-estate-agent',
  op_kind text not null,                                 -- 'mandat_alert'|'match_alert'|'envoi'|'ingest_zone'
  payload jsonb not null default '{}'::jsonb,            -- déjà scrubé (pas de tel/email en clair)
  attempts integer not null default 0,
  last_error text,
  status text not null default 'open' check (status in ('open','retrying','resolved','abandoned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_prosp_failed_tenant   on public.prosp_failed_operations(tenant_id);
create index if not exists idx_prosp_failed_status    on public.prosp_failed_operations(tenant_id, status);
create index if not exists idx_prosp_failed_kind      on public.prosp_failed_operations(op_kind);
create trigger trg_prosp_failed_updated_at before update on public.prosp_failed_operations
  for each row execute function public.set_updated_at();
alter table public.prosp_failed_operations enable row level security;
drop policy if exists "tenant prosp_failed read" on public.prosp_failed_operations;
create policy "tenant prosp_failed read" on public.prosp_failed_operations for select
  using (tenant_id = (select public.current_tenant_id()));
```

> **CORRECTION POST-REVUE (vérif source)** : `prosp_failed_operations` utilise désormais les colonnes `attempts` + `last_error` (et non `error`), **alignées exactement sur le schéma réel de `inv_failed_operations` lu dans `lib/invest/shared/dlq-drain.ts` (select : `id, tenant_id, deal_id, subscription_id, op_kind, payload, attempts, last_error, status`)**. C'était une divergence du PLAN v1 (qui nommait la colonne `error`).

**Note dedup (cœur scale)** : `hash_dedup = sha256(type_bien | code_postal | bucket(surface_m2,5m²) | nb_pieces | bucket(prix,5k€))`. Le bucketing tolère les micro-variations entre plateformes (249 900 € SeLoger ≈ 250 000 € LBC → même hash). À l'upsert : `duplicate_count++`, `duplicate_sources` distinct append, détection baisse prix vs ligne existante. N'utilise PAS `source_url` (gotcha #8 carte jobs : trop variable entre republications).

**Note audit (vérif source)** : il n'y a **aucune migration SQL nécessaire pour l'audit**. La colonne `inv_audit_log.entity_type` est un `text` SANS CHECK (vérifié ligne 111 de `0020_invest_documents_audit.sql` ; le CHECK ligne 35 porte sur `inv_documents`, pas sur l'audit log). La RPC `inv_append_audit_log` (seule voie d'écriture, hardenée en 0023) insère `entity_type` librement. → Étendre uniquement le type TS `AuditEntityType` (§4). Ceci **résout** la question ouverte #3 du PLAN v1.

---

## 4. MODULES `lib/` — FICHIER PAR FICHIER + SIGNATURES

### Cores purs (`lib/prospection/`) — zéro IO, zéro LLM, 100 % testables

**`lib/prospection/types.ts`** (source de vérité TS du domaine)
```ts
export type SourcePlatform = "seloger"|"leboncoin"|"bienici"|"paruvendu"|"figaro"|"gensdeconfiance";
export type AnnonceurType = "pap"|"pro"|"inconnu";
export type ProspectStatut = "nouveau"|"a_appeler"|"contacte"|"rdv_pris"|"mandat_signe"|"refuse"|"perdu";
export type MatchStatut = "nouveau"|"selectionne"|"ecarte"|"envoye"|"archive";
export type PrefValue = "requis"|"exclu"|"indifferent";
export interface RawAnnonce { /* shape brut provider, ~40 champs optionnels */ }
export interface AnnonceInsert { /* miroir 1:1 colonnes prosp_annonces sauf id/timestamps */ }
export interface MandatConfig { weights: Record<string,number>; seuil: number; zonesPrioritaires: string[]; blacklistSiren: string[]; papKeywords: string[]; ancienneteSeuilJours?: number }
export interface MandatScore { score: number; breakdown: Record<string,number>; eligible: boolean }
export interface MatchWeights { prix: number; surface: number; localisation: number; pieces: number; dpe: number }
export interface MatchScore { score: number; breakdown: Record<string,number>; bonus_breakdown: Record<string,number>; features_snapshot: Record<string,number>; eligible: boolean; hardExcluded: boolean; rejets: string[] }
export interface CritereView { communes: string[]; type_bien: string|null; prix_min: number|null; prix_max: number|null; surface_min: number|null; pieces_min: number|null; chambres_min: number|null; pref_terrasse: PrefValue; pref_parking: PrefValue; pref_ascenseur: PrefValue; pref_jardin: PrefValue; pref_piscine: PrefValue; accepte_travaux: boolean; poids: Partial<MatchWeights>; seuil_match: number }
export const PROSPECT_STATUSES: readonly ProspectStatut[];
export const MATCH_STATUSES: readonly MatchStatut[];
```

**`lib/prospection/normalize.ts`** (core pur — normalisation + dédup)
```ts
export function normalizeAnnonce(raw: RawAnnonce, source: SourcePlatform, miOrigin: string): AnnonceInsert | null;
export function normalizeListingToAnnonce(l: ListingComparable, source: SourcePlatform): AnnonceInsert; // pont fallback Apify
export function hashDedup(a: Pick<AnnonceInsert,"type_bien"|"code_postal"|"surface_m2"|"nb_pieces"|"prix">): string; // sha256, buckets
export function detectAnnonceurType(description: string|null, telephone: string|null, siren: string|null, papKeywords: string[]): AnnonceurType;
export function detectBaissePrix(prev: number|null, current: number): { delta: number|null; detected: boolean };
export function mergeAnnonce(existing: AnnonceInsert, incoming: AnnonceInsert): { merged: AnnonceInsert; baisseDetected: boolean };
```
> `hashDedup` réutilise `createHash("sha256")` (même approche que `hashBody` de `lib/invest/shared/idempotency.ts`). NE PAS toucher `normalizeApify` existant dans `listings.ts` (gotcha #1 carte listings). `ListingComparable` importé de `lib/estimation/types.ts`.

**`lib/prospection/pap.ts`** (core pur — garde RGPD)
```ts
export function canEnrichAnnonceur(type: AnnonceurType): boolean; // pro → true, pap/inconnu → false (gotcha #8 carte valuation)
```

**`lib/prospection/scoring/mandat.ts`** (core pur — moteur score mandat) — formules §6
```ts
export function scoreMandat(annonce: AnnonceInsert, config: MandatConfig, now?: Date): MandatScore; // now injectable pour tests
```

**`lib/prospection/scoring/presets.ts`** (core pur — barèmes livrés)
```ts
export const MANDAT_PRESET_DOC: Record<string,number>;   // {pap:30, anciennete_45j:20, baisse_prix:15, zone_prioritaire:20}
export const MANDAT_PRESET_API: Record<string,number>;   // {pap:50, zone_prioritaire:20, republication_recente:25, description_pap:10}
```

**`lib/prospection/matching/match.ts`** (core pur — moteur score match) — formules §6
```ts
export function scoreMatch(annonce: AnnonceInsert, critere: CritereView, defaultWeights: MatchWeights): MatchScore;
export function explainMatch(score: MatchScore, annonce: AnnonceInsert, critere: CritereView): string[]; // déterministe, ZÉRO LLM (gotcha #12 carte ui-cockpit)
export function isAlreadyProposed(proposedToOthers: string[], critereId: string): boolean; // anti-doublon : annonce déjà proposée à un autre acquéreur ?
export function markProposed(proposedToOthers: string[], critereId: string): string[]; // append critereId distinct (peuple prosp_matchs.proposed_to_others)
```
> **Exploitation de `prosp_matchs.proposed_to_others` (colonne sinon morte)** : à l'envoi d'un match (`POST /api/prospection/envois` ou Tinder `selectionne→envoye`), `markProposed` ajoute le `critere_id` à `proposed_to_others` de l'annonce concernée (via update des autres `prosp_matchs` portant le même `annonce_id`). Au tri/affichage, `isAlreadyProposed` permet un badge "Déjà proposé à un autre acquéreur" et un tri dépriorisant (évite d'envoyer 2× le même bien à 2 clients concurrents sans le savoir). Pur, testable, ZÉRO LLM.

**`lib/prospection/matching/weights.ts`** (core pur — curseurs + feedback)
```ts
export const DEFAULT_MATCH_WEIGHTS: MatchWeights;   // {prix:30,surface:25,localisation:20,pieces:15,dpe:10}
export const WEIGHT_PRESETS: Record<"faible"|"normal"|"fort", number>; // 0.5 / 1.0 / 1.5
export function resolveWeights(critere: CritereView, fallback: MatchWeights): MatchWeights; // renormalisé à 100
export function adjustWeightsFromFeedback(current: MatchWeights, verdict: "up"|"down", feature: keyof MatchWeights): MatchWeights; // borné ±20%, somme=100
export function exportTrainingSet(feedback: { verdict:"up"|"down"; features_snapshot:Record<string,number> }[]): { X: number[][]; y: number[] };
```

**`lib/prospection/enrich.ts`** (core pur + orchestrateur — calcul dérivés)
```ts
export interface DvfContext { medianPricePerSqm: number|null }
export function computeAnnonceEnrichment(a: AnnonceInsert, ctx: DvfContext): Pick<AnnonceInsert,"prix_gap_median"|"rentabilite_estimee">; // null si DVF vide, JAMAIS 0
export async function enrichAnnonce(sb: SupabaseClient<Database>, a: AnnonceInsert): Promise<Partial<AnnonceInsert>>; // orchestre geocode→DVF→ademe puis core
export { canEnrichAnnonceur } from "./pap"; // ré-export
```
> Orchestre `geocode()` → `resolveParcelle()` → `capSections()` → `fetchMutationsMultiSection()` → `buildComparables()` → `indexComparable()` → `computeValuation()`. `prix_gap_median = (prix - marketValue)/marketValue`, **null si `marketValue===0`** (gotcha #3 carte valuation). `fetchDpeForAddress()` fail-soft. `safeFetch` interdit pour MoteurImmo (hôte non allowlisté) mais OK pour geocode/DVF/ademe (hôtes gouv déjà allowlistés).

**`lib/prospection/ingest.ts`** (orchestrateur ingestion — IO, service-role)
```ts
export async function ingestZone(sb: SupabaseClient<Database>, opts: { tenantId:string; userId:string; codePostal:string; typeBien?:string|null }): Promise<{ scanned:number; inserted:number; updated:number; skipped:number; cost:number }>;
export async function upsertAnnonces(sb: SupabaseClient<Database>, tenantId: string, annonces: AnnonceInsert[]): Promise<{ inserted:number; updated:number }>; // ON CONFLICT (tenant_id, hash_dedup)
export async function bumpDuplicate(sb: SupabaseClient<Database>, tenantId: string, hash: string, source: string): Promise<void>;
```
> MoteurImmo primaire si `moteurImmoIsConfigured()`, sinon fallback `apify-bulk`. `paidCall("moteurimmo"|"apify-prosp", key, fn, {ttlSec:3600, dailyCap})` (`lib/providers/cost-guard.ts`). `scrubObject` avant tout log.

**`lib/prospection/apify-bulk.ts`** (fallback Apify multi-pages, IO)
```ts
export async function fetchListingsBulk(q: { codePostal:string; typeBien?:string|null; maxItems:number }): Promise<RawAnnonce[]>; // call Apify direct sans cap 12
```
> Pagine l'actor LBC existant sans passer par `fetchListingComparables` (cap 12 figé, gotcha #4 carte listings). NE PAS modifier `fetchListingComparables` (path estimation).

**`lib/prospection/store.ts`** (adaptateurs Supabase service-role — filtre tenant explicite)
```ts
export function prospIdempotencyStore(tenantId: string): IdempotencyStore;   // table prosp_idempotency_keys, copie de supabaseIdempotencyStore
export async function loadActiveCriteres(sb: SupabaseClient<Database>, tenantId: string): Promise<Array<{ id:string; user_id:string } & CritereView>>;
export async function loadConfig(sb: SupabaseClient<Database>, tenantId: string, userId: string): Promise<MandatConfig & { baremeMatch: MatchWeights; waDailyCap:number; waCooldownH:number }>;
```
> `prospIdempotencyStore` réutilise **le pattern** de `supabaseIdempotencyStore` (`lib/invest/shared/idempotency.ts`) pointé sur `prosp_idempotency_keys`. `IdempotencyStore` + `withIdempotency` + `hashBody` importés tels quels de `lib/invest/shared/idempotency.ts`.

**`lib/prospection/dlq.ts`** (adaptateur DLQ prospection — CORRECTION POST-REVUE)
```ts
export function prospDlqStore(tenantId: string): DlqDrainStore;   // store dédié table prosp_failed_operations
export async function drainProspFailedOperations(sb: SupabaseClient<Database>, tenantId: string): Promise<{ scanned:number; resolved:number; retrying:number; abandoned:number; skipped:number }>;
```
> **CORRECTION** : `supabaseDlqDrainStore` (`lib/invest/shared/dlq-drain.ts`) **hardcode `.from("inv_failed_operations")` dans toutes ses méthodes** (vérifié source). On NE PEUT PAS le rediriger vers `prosp_failed_operations`. → `prospDlqStore` est une **copie** du store qui pointe `prosp_failed_operations`, implémentant l'interface `DlqDrainStore` (importée de `dlq-drain.ts`). De plus, `drainFailedOperations` ne rejoue QUE `op_kind === 'refund'` (vérifié source) — inutilisable tel quel pour la prospection. → `drainProspFailedOperations` est un drain dédié qui rejoue les `op_kind` prospection (`mandat_alert`, `match_alert`, `envoi`) via les handlers du dispatcher, en réutilisant l'interface `DlqDrainStore` (`listOpen`/`markResolved`/`markRetry`/`markAbandoned`) + `onError: captureFatal`.

**`lib/prospection/owned.ts`** (isolation tenant — calque `lib/estimation/owned.ts`)
```ts
export async function loadOwnedAnnonce(sb, id, tenant): Promise<AnnonceRow|null>;          // catalogue : filtre tenant seul (pas de user_id)
export async function loadOwnedCritere(sb, id, userId, tenant): Promise<CritereRow|null>;
export async function loadOwnedProspect(sb, id, userId, tenant): Promise<ProspectRow|null>;
```

**`lib/prospection/fiche.ts`** (fiche HTML autonome — pattern brochure, firewall propre)
```ts
export function renderFicheHtml(critere: CritereView, matchs: { annonce: AnnonceRow; score: number }[]): string; // CSS inline, copier-coller CMS
```
> Calque `lib/brochure/render-html.ts` (vérifié : `renderBrochureHtml(estimation)` l.73, CSS **inline dans le template HTML** — il n'existe AUCUN fichier `brochure-css.ts` séparé dans `lib/brochure/`). On reproduit ce pattern : le CSS de la fiche est inline (constante `FICHE_CSS` dans `fiche.ts` ou fichier `fiche-css.ts` dédié au choix de l'implémenteur), JAMAIS d'import de `cockpit.css` (gotcha #2 carte brochure). PAS de firewall brochure (gotcha #3 carte brochure : firewall propre, pas de mentions "avis indicatif").

**`lib/prospection/fiche-css.ts`** (CSS inline autonome)
```ts
export const FICHE_CSS: string; // tokens --ct-* copiés-collés (même approche que le CSS inline de render-html.ts), aucun import runtime DS
```

**`lib/prospection/generate-fiche.ts`** (render PDF + cache R2 — calque `lib/brochure/generate.ts`)
```ts
export async function renderAndCacheFichePdf(sb: SupabaseClient<Database>, envoiId: string): Promise<Buffer>;
```
> Réutilise `renderEstimationPdf(html)` (`lib/brochure/pdf.ts`, singleton browser, import dynamique `await import(...)`) + `putObject`/`publicUrl`/`r2IsConfigured` (`lib/storage/r2.ts`). Clé R2 : `prospection/envois/${envoiId}/fiche-${Date.now()}.pdf`.

**`lib/prospection/excel.ts`** (import/export acquéreurs — Phase 3, **CONDITIONNÉ à l'ajout de `xlsx`**)
```ts
export function parseCriteresXlsx(buf: Buffer): { criteres: Partial<CritereView & { label:string }>[]; errors: string[] };
export function exportCriteresXlsx(criteres: Array<CritereView & { label:string }>): Buffer;
```
> **Dépendance net-new `xlsx` (SheetJS) ABSENTE du `package.json` (vérifié)**. Ce module + les routes import/export + le test E2E associé sont **bloqués** tant que `npm i xlsx` n'est pas exécuté (décision Phase 3, question ouverte §15.9 sur licence/poids bundle). Tant que la dépendance n'est pas ajoutée : module non livré, routes répondent 501, test E2E `import Excel` **marqué `test.skip`** (cf. §13). Parsing pur, zéro IO réseau une fois la dépendance présente.

**`lib/prospection/critere-ia.ts`** (générateur de critères enrichi-IA — orchestrateur, IO LLM via `lib/llm`)
```ts
export async function suggestCritereFromBrief(brief: string): Promise<Partial<CritereView & { label:string }>>; // brief libre acquéreur → critère structuré (source='enrichi_ia')
export async function analyzeFeedbackReturns(matchs: Array<{ features_snapshot: Record<string,number>; verdict: "up"|"down" }>): Promise<{ resume: string; ajustements: Partial<MatchWeights> }>; // synthèse FR des retours + suggestion de poids
```
> Couvre les 2 features TARGET "Suggérer critères (IA)" et "Analyser retours (IA)" (canvas BienCible `/acquereurs`, card net-new #5). SEUL endroit où le LLM est appelé côté prospection — via `kimi`/`kimiIsConfigured` (`lib/llm/kimi.ts`), JAMAIS de client LLM hors `lib/llm/`. `suggestCritereFromBrief` ne fait que **proposer** un brouillon de critère (l'agent valide avant insert, `source='enrichi_ia'`). `analyzeFeedbackReturns` est un **résumé optionnel** : il NE remplace PAS `adjustWeightsFromFeedback` (déterministe, non-LLM, source de vérité des poids) — il ne fait que suggérer en langage naturel. `kimiIsConfigured()===false` → ces fonctions retournent un fallback vide sans throw (feature dégradée, jamais bloquante). Le scoring reste 100 % déterministe (gotcha #12 carte ui-cockpit) ; l'IA est cantonnée à la saisie assistée et au reporting.

### Ports / adapters (`lib/providers/`)

**`lib/providers/moteurimmo.ts`** (net-new — pattern `search.ts`)
```ts
export function moteurImmoIsConfigured(): boolean;   // envPresent("MOTEURIMMO_API_KEY")
export interface MoteurImmoQuery { codePostal: string; typeBien?: string|null; page?: number; pageSize?: number; depuis?: string }
export async function fetchAnnonces(q: MoteurImmoQuery): Promise<RawAnnonce[]>; // fetchJson, fail-soft []
```
> Utilise `fetchJson<T>()` (`lib/providers/types.ts`) — PAS `safeFetch` (hôte non allowlisté, gotcha #1 carte valuation). Wrappé `paidCall("moteurimmo", key, fn, {ttlSec:3600, dailyCap:Number(process.env.MOTEURIMMO_DAILY_CAP)||500, enabled:moteurImmoIsConfigured()})`. Env lue paresseusement (gotcha carte providers).

**`lib/providers/twilio.ts`** (net-new — pattern `apollo.ts`, fail-soft total)
```ts
export function twilioIsConfigured(): boolean;   // envPresent("TWILIO_ACCOUNT_SID","TWILIO_AUTH_TOKEN","TWILIO_WHATSAPP_FROM")
export interface WhatsAppResult { sid: string|null; dryRun: boolean; skipped?: "no_recipient"|"not_configured" }
export async function sendWhatsApp(to: string|null, body: string, opts?: { fallbackUrl?: string }): Promise<WhatsAppResult>;
```
> Vérifie `to != null` avant POST (gotcha #9 carte server-auth : erreur Twilio 21211). Non configuré → `{sid:null, dryRun:true, skipped:"not_configured"}` sans throw. `to===null` (PAP sans tel) → `fallbackUrl` dans le body, `skipped:"no_recipient"`, pas d'appel Twilio. Erreurs scrubées (`scrubSecrets`).

**`lib/providers/resend.ts`** (net-new — extrait du pattern inline `app/api/estimations/[id]/share/route.ts`)
```ts
export function resendIsConfigured(): boolean;   // envPresent("RESEND_API_KEY")
export async function sendEmail(opts: { to:string; subject:string; html:string; attachments?:{filename:string;content:string}[] }): Promise<{ id:string|null; dryRun:boolean }>;
```

### Modif modules existants

- **`lib/providers/index.ts`** : ajouter `twilio`, `resend`, `moteurimmo` à `providersStatus()`.
- **`lib/providers/scrub.ts`** : ajouter `telephone_vendeur`, `email_vendeur`, `nom_annonceur` au `Set PII_KEYS` (gotcha #5 carte server-auth / carte providers — sans ça `scrubObject` ne les redacte pas dans audit/Sentry/DLQ).
- **`lib/invest/shared/audit.ts`** : étendre l'union `AuditEntityType` avec `"prosp_annonce"|"prosp_prospect"|"prosp_match"|"prosp_envoi"`. **Vérifié : aucune migration SQL nécessaire** (`inv_audit_log.entity_type` est `text` sans CHECK, RPC écrit librement).
- **`lib/ui-strings.ts`** : ajouter `UI.prospection`, `UI.matching`, `UI.acquereurs`, `UI.envois`, `UI.veille`, `UI.tinder`, clés `UI.nav.*` (après `swarms:`).
- **`components/cockpit/RailLeft.tsx`** : ajouter entrées `NAV_ITEMS` (`/prospection`, `/matchs`, `/acquereurs`).
- **`components/cockpit/nav-icons.tsx`** : `IconProspection`, `IconMatchs`, `IconAcquereurs`.
- **`lib/crm/statusTone.ts`** : étendre l'union entity avec `"prospect"|"match"` + listes positive/negative (gotcha #4 carte ui-cockpit). Mapping : prospect positive=`["mandat_signe"]`, negative=`["refuse","perdu"]` ; match positive=`["envoye"]`, negative=`["ecarte","archive"]`.

---

## 5. JOBS INNGEST (`lib/jobs/inngest/functions.ts`)

Tous **ajoutés à l'export `functions[]`** (gotcha #1/#8 carte jobs, sinon non enregistrés par `serve()`). Pattern exact `invReconcileTick`/`invRefundWatchdog`. Service-role via `getSupabaseAdmin()` → `{skipped:"no_db"}` si null. `captureFatal` sur erreur infra (`throw` pour retry Inngest). `tenant_id` passé explicitement dans le payload event (jobs bypass RLS, ne dépendent jamais de `current_tenant_id()`).

| Fonction | id | Trigger | Concurrency / Retries | Rôle |
|---|---|---|---|---|
| `prospIngestTick` | `prosp-ingest-tick` | cron `0 * * * *` | `{limit:2}` / 2 | Zones `prosp_zones` actives → `step.run("zone:{cp}")` parallèle (gotcha #5 carte listings) → `ingestZone` (`normalizeAnnonce`→`hashDedup`→`withIdempotency(prospIdempotencyStore)`→`upsertAnnonces`/`bumpDuplicate`) → ledger `prosp_ingestion_runs`. Émet `prosp/annonce.ingested`. |
| `prospScoreTick` | `prosp-score-tick` | cron `*/15 * * * *` | `{limit:1}` / 2 | Annonces `actif AND (scored_at IS NULL OR scored_at < updated_at)` (pagination `.range`) → `enrichAnnonce` → update → `scoreMandat` (config tenant) upsert `prosp_prospects` → `scoreMatch` × `loadActiveCriteres` upsert `prosp_matchs` (idempotent via unique `(user_id,tenant_id,annonce_id,critere_id)`) → set `scored_at`. Émet `prosp/alert.requested` si mandat/match ≥ seuil. Détecte baisses prix. |
| `prospAlertDispatch` | `prosp-alert-dispatch` | event `prosp/alert.requested` | `{limit:2}` / 3 | Mandat → `sendWhatsApp` agent : `paidCall("twilio-whatsapp", "{tenant}:{day}", fn, {dailyCap:waDailyCap, ttlSec:86400})` PUIS `rateLimit("prosp-alert:{tenant}:{prospectId}", 1, waCooldownH*3600)` (cost-guard fail-closed d'abord, rate-limit fail-open ensuite — gotcha cost-guard carte providers). PAP sans tel → fallback URL. Acquéreur `instant` → email/WA selon `alert_canal`. Échec → `prosp_failed_operations` (payload scrubé). |
| `prospAlertDaily` | `prosp-alert-daily` | cron `0 8 * * *` | `{limit:1}` / 2 | Digest acquéreurs `alert_frequency=daily` : regroupe matchs `nouveau` par critère → email/WA. |
| `prospVeilleTick` | `prosp-veille-tick` | cron `0 7 * * *` | `{limit:1}` / 2 | Chaque `prosp_veille_agences` actif → annonces dont `siren_annonceur`/`nom_annonceur` matche, depuis `last_seen_at`. |
| `prospDlqDrain` | `prosp-dlq-drain` | cron `0 */1 * * *` | `{limit:1}` / 3 | `drainProspFailedOperations(sb, tenantId)` (store dédié `prospDlqStore`, `onError: captureFatal` — gotcha #4 carte jobs : injecter `captureFatal`). |

**Modif `app/api/inngest/route.ts`** : aucune (importe `functions` qui contient déjà les nouvelles). `/api/inngest` est déjà dans `OPEN_ROUTES` du `proxy.ts`.

**Prérequis env (gotcha #10 carte jobs)** : `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY` requis pour que `inngest.send()` n'échoue pas silencieusement (question ouverte §15).

---

## 6. MOTEURS DE SCORE — FORMULES EXACTES + CONFIG

### 6.1 Score mandat (`scoreMandat`) — POIDS CONFIGURABLES (conflit tranché §1)

`scoreMandat` lit `config.weights` (agnostique du preset). Default = preset API. Les deux presets vivent dans `presets.ts`.

```
breakdown = {}
// Gardes (court-circuit AVANT calcul)
si blacklistSiren.includes(siren_annonceur)        → {score:0, eligible:false, breakdown:{blacklisted:0}}
si vendeur_refuse_demarchage === true              → {score:0, eligible:false, breakdown:{refus_demarchage:0}}
si sous_compromis OR is_under_mandate              → {score:0, eligible:false}
// Contributions additives (breakdown[clé] = poids[clé] si satisfait, sinon 0)
pap                   : type_annonceur === 'pap'                                   → +weights.pap
zone_prioritaire      : zonesPrioritaires.includes(code_postal)                    → +weights.zone_prioritaire
republication_recente : joursDepuis(derniere_republication_at ?? premiere_parution_at) <= 7 → +weights.republication_recente
description_pap        : papKeywords match description (regex)                      → +weights.description_pap
anciennete_45j         : (now - premiere_parution_at) > (ancienneteSeuilJours||45) → +weights.anciennete_45j
baisse_prix            : prix_baisse_delta > 0                                      → +weights.baisse_prix
score = clamp(somme, 0, 100)
eligible = score >= config.seuil  (défaut 60)
```
Déterministe, pur, `now` injectable. Prospect créé/maj seulement si `eligible`.

### 6.2 Score match (`scoreMatch`) — pondération configurable par client

Barème base `{prix:30, surface:25, localisation:20, pieces:15, dpe:10}` (=100). Override `prosp_criteres.poids`. Curseurs UI Prix/Loc/DPE → multiplicateurs `faible/normal/fort` (×0.5/1/1.5), renormalisés à 100 par `resolveWeights`.

**Filtres durs (`hardExcluded=true, score=0, rejets[]`)** :
```
type_bien défini et ≠ annonce                                     → rejet
prix > prix_max*1.10  OU  prix < prix_min*0.90  (tolérance 10%)   → rejet
communes non vide et code_postal/commune ∉ communes              → rejet
pref_X === 'exclu' ET annonce a X                                 → rejet
pref_X === 'requis' ET annonce n'a pas X                          → rejet
```
> NB (décision tranchée §1 — prefs souples) : `surface_min` / `pieces_min` PÉNALISENT le score sans exclure. Seuls type_bien, fourchette prix, `exclu` et `requis` sont durs.

**Sous-scores (∈[0,1] × poids)** :
```
sPrix   = clamp(1 - |prix - milieu(prix_min,prix_max)| / (prix_max - prix_min), 0, 1)
sSurf   = surface_m2 >= surface_min ? 1 : clamp(surface_m2/surface_min, 0, 1)
sLoc    = commune ∈ communes || code_postal ∈ communes ? 1 : (même département par préfixe CP 2 chiffres ? 0.5 : 0)
sPieces = nb_pieces >= pieces_min ? 1 : clamp(nb_pieces/pieces_min, 0, 1)
sDpe    = mapDpe(dpe_note)  // A=1 B=0.9 C=0.75 D=0.6 E=0.4 F=0.2 G=0.0, null=0.5
base    = round( (sPrix*W.prix + sSurf*W.surface + sLoc*W.localisation + sPieces*W.pieces + sDpe*W.dpe) / (W.prix+W.surface+W.localisation+W.pieces+W.dpe) * 100 )
```
**Confort souple** : chaque pref `requis` satisfaite → +2 (cap +10 total). `chambres_min` satisfait → +2.
**Bonus marché (`bonus_breakdown`, capé +15 total)** :
```
sous_prix_mi  : prix_gap_median < -0.05 (sous marché >5%, null → 0, gotcha #3 valuation) → +8
baisse_prix   : prix_baisse_delta > 0                                                      → +5
republication : joursDepuis(derniere_republication_at) <= 7                                → +3
score = clamp(base + confort + sum(bonus), 0, 100)
eligible = score >= critere.seuil_match
```
**`features_snapshot`** (figé au calcul, jamais recalculé → reproductibilité ML) : `{sPrix, sSurf, sLoc, sPieces, sDpe, prix_gap_median, age_hours, has_baisse}`.

**`explainMatch()`** : tableau de strings FR **déterministe, ZÉRO LLM** (gotcha #12 carte ui-cockpit), depuis `UI.matching.explain.*` ("Prix dans le budget (+30)", "Localisation exacte (+20)", "Sous le prix marché (+8)").

### 6.3 Feedback → poids (pré-ML)
`prosp_match_feedback` (verdict + `features_snapshot` figées) → `adjustWeightsFromFeedback` (gradient borné ±20 %, renormalisé 100, **non-LLM**) → maj `prosp_criteres.poids`. `exportTrainingSet` produit `{X,y}` pour un modèle offline futur. Aucune dépendance LLM : scoring déterministe et auditable.

### 6.4 Config par défaut (preset API)
`prosp_config` 1 ligne/agent (créée à la 1ʳᵉ visite `/prospection/config` ou lazy en lecture). `mandat_preset='api'`, `mandat_poids` = preset API, `mandat_seuil=60`, `bareme_match` = base, `wa_daily_cap=10`, `wa_cooldown_h=24`. Tous configurables UI.

---

## 7. PROVIDER TWILIO + DÉCISION INGESTION

### 7.1 Twilio (`lib/providers/twilio.ts`)
- `twilioIsConfigured()` via `envPresent` → dry-run permanent si absent (gotcha #6 carte swarms / gotcha #9 carte valuation : zéro infra Twilio existante, créée from scratch).
- **Cap 10/j (fail-closed, EN PREMIER)** : `paidCall("twilio-whatsapp", "{tenant}:{day}", fn, {ttlSec:86400, dailyCap:waDailyCap, enabled:twilioIsConfigured()})`. Bucket UTC-day (gotcha cost-guard carte providers) → "10 / UTC-day".
- **Cooldown 24h (fail-open, ENSUITE)** : `rateLimit("prosp-alert:{tenant}:{prospectId}", 1, waCooldownH*3600)` (`lib/ratelimit.ts`) + `alerted_at` DB (double garde).
- **Dry-run** : non configuré → `prosp_envois.statut='dry_run'`, jamais throw.
- **Fallback PAP sans tel** (0 % ont un tel, gotcha #5 carte providers/swarms) : `to===null` → `fallbackUrl=source_url` "Ouvrir sur {source}", `skipped:"no_recipient"`, pas d'appel Twilio (évite 21211).

### 7.2 Décision ingestion (tranchée — cf. §1)
| Critère | MoteurImmo API (primaire) | Apify LBC (fallback) | MySwarms (exclu) |
|---|---|---|---|
| Multi-sources | **Oui (agrégateur)** | Non (LBC seul) | Opaque |
| Volume/h | élevé (pagination) | 12 (cap contourné via `apify-bulk`) | 12 |
| Champs (~40) | **complet** | 8 (`normalizeApify`) → mappés via `normalizeListingToAnnonce` | 8 |
| Coût | abonnement SaaS (`paidCall`) | crédits Apify | infra GPU |

`ingestZone()` : MoteurImmo si `moteurImmoIsConfigured()`, sinon `apify-bulk`. MySwarms reste réservé à l'estimation (gotcha #3 carte listings). Flag `PROSP_INGEST_PROVIDER`.

---

## 8. API ROUTES (`app/api/prospection/*`)

Pattern obligatoire (carte server-auth-tenant) : `runtime="nodejs"`, `dynamic="force-dynamic"`, `getSession()`→401, `getSupabaseAdmin()`→503, double filtre `.eq("user_id", claims.sub).eq("tenant_id", tenantOf(claims))`, `captureFatal`. Routes PDF : `maxDuration=60`. Master gate : `if (process.env.PROSP_ENABLED !== 'true') return NextResponse.json({error:"not_found"},{status:404})`.

| Méthode + chemin | Rôle |
|---|---|
| `GET /api/prospection/annonces` | Liste annonces — pagination `.range(offset, offset+49)` (gotcha #3 carte ui-cockpit), filtres `?type_annonceur`,`?cp`,`?actif`. Catalogue : filtre `tenant_id` seul. |
| `GET /api/prospection/annonces/[id]` | Détail annonce + comparables enrichis (`loadOwnedAnnonce`). |
| `GET /api/prospection/annonces/[id]/fiche` | PDF fiche annonce (cache R2, `rateLimit("fiche:{user}",10,60)`). |
| `GET/POST /api/prospection/prospects` | Liste / crée prospect manuel depuis annonce. |
| `PATCH /api/prospection/prospects/[id]` | MAJ statut/notes/rappel (whitelist champs). `mandat_signe` → `mandat_signed_at` + `recordAudit`. |
| `POST /api/prospection/prospects/[id]/convert-lead` | Convertit prospect → `leads` (`kind='vendeur'`, `source='moteurImmo'`) → set `lead_id` (gotcha #1/#2 carte crm : entité distincte, on NE modifie PAS l'enum `leads.status`). |
| `GET/POST /api/prospection/criteres` | CRUD critères acquéreur (+ poids/seuil). |
| `PATCH/DELETE /api/prospection/criteres/[id]` | MAJ/suppression critère/curseurs. |
| `POST /api/prospection/criteres/import` | Import Excel (`parseCriteresXlsx`) — Phase 3. **501 tant que `xlsx` absent du `package.json`** (`if (!xlsxAvailable) return NextResponse.json({error:"xlsx_not_installed"},{status:501})`). |
| `GET /api/prospection/criteres/export` | Export Excel (`exportCriteresXlsx`) — Phase 3. **501 tant que `xlsx` absent.** |
| `POST /api/prospection/criteres/suggest` | "Suggérer critères (IA)" : brief libre → `suggestCritereFromBrief` (`lib/prospection/critere-ia.ts`, Kimi via `lib/llm/kimi.ts`) → brouillon critère `source='enrichi_ia'`. `kimiIsConfigured()===false` → 200 avec brouillon vide (jamais 500). |
| `POST /api/prospection/criteres/[id]/analyze` | "Analyser retours (IA)" : `analyzeFeedbackReturns` sur le feedback du critère → résumé FR + ajustements suggérés (n'écrit PAS les poids ; suggestion seulement). |
| `GET /api/prospection/matchs` | Liste matchs (filtres statut/critère/score). |
| `PATCH /api/prospection/matchs/[id]` | MAJ statut (Tinder V/X → selectionne/ecarte/archive). |
| `GET /api/prospection/matchs/[id]/explain` | `explainMatch()` (déterministe, ZÉRO LLM). |
| `POST /api/prospection/matchs/[id]/feedback` | 👍/👎 → `prosp_match_feedback` + `adjustWeightsFromFeedback`. |
| `POST /api/prospection/envois` | Envoi 1 clic : génère fiche PDF → `prosp_envois` → `inngest.send`/inline email/WA. |
| `GET /api/prospection/envois` | Historique envois. |
| `GET/POST /api/prospection/zones` | CRUD zones à scraper. |
| `GET/POST /api/prospection/veille` | CRUD agences surveillées (SIREN/nom). |
| `GET/PUT /api/prospection/config` | Lire/MAJ `prosp_config` (barèmes, zones, blacklist, caps). |
| `POST /api/prospection/ingest/run` | Déclenche `prosp/ingest.now` manuel (admin). |

`proxy.ts` : **pas** d'ajout à `OPEN_ROUTES` (toutes exigent session). Webhook push MoteurImmo éventuel (Phase 3) : `OPEN_ROUTES += "/api/prospection/webhooks"` (gotcha #2 carte server-auth) + `verifyHmacSignature` (`lib/invest/shared/webhooks.ts`) avec `req.text()` pas `req.json()` (gotcha #6 carte jobs).

---

## 9. PAGES UI COCKPIT (`app/(dashboard)/...`)

Pattern server-component (carte ui-cockpit) : `getSession`→`getSupabaseAdmin`→double filtre→primitives `components/cockpit/`. Strings via `UI.*`. Tokens `--ct-*` uniquement, `data-product` seul switch accent, zéro magic number. Seule exception inline tolérée : `style={{width:"X%"}}` dans `BarList` (gotcha #7 carte ui-cockpit).

> **NOTE PRIMITIVES (vérifié `ls components/cockpit/`)** : il n'existe **AUCUN composant `Funnel.tsx`** (le commentaire "ex-Funnel" dans `lib/crm/aggregate.ts` l.23 confirme sa suppression). Toute visualisation par statut utilise **`BarList`** alimenté par **`barsByStatus`** (`lib/crm/aggregate.ts`, vérifié exporté). Aucune référence à `Funnel`/`countByStatus` dans ce plan (symboles inexistants → import error immédiat).

**Nav** : `RailLeft.tsx` (`NAV_ITEMS`) + `nav-icons.tsx` (`IconProspection`/`IconMatchs`/`IconAcquereurs`) + `UI.nav.*`.

| Route | Composants | Contenu |
|---|---|---|
| `/prospection` | `PageHeader`, `KpiGrid/KpiCard`, `BarList`, `DataTable`, `StatusSelect` | KPIs (annonces actives, PAP, mandats potentiels, fraîcheur dernier `prosp_ingestion_runs`). Répartition statuts prospects via `BarList` alimenté par `barsByStatus(prospects, "statut")` (`lib/crm/aggregate.ts`, applique déjà `statusTone`). Table prospects triée `score_mandat`, `StatusSelect` inline (`/api/prospection/prospects/[id]`). Pagination server `.range`. |
| `/prospection/[annonceId]` | `Card` | Détail annonce : prix_gap, DVF, signaux mandat, `score_breakdown`, boutons "Démarcher"/"Convertir en lead". |
| `/matchs` | `DataTable`, `Donut`, bouton "Mode Tri" | Liste matchs + filtres. `Donut` taux mandat signé (`ratio`). |
| `/matchs/tinder` | `MatchTinder.tsx` (`"use client"`, net-new) | 1 bien/écran, photo, KPIs, touches V/X (`useEffect` keydown) + boutons Valider/Décliner, compteur, `explainMatch` au tap → `PATCH matchs/[id]` + feedback. |
| `/acquereurs` | `DataTable`, modal critère, `KpiGrid` | Liste critères. Formulaire (communes, prix, surface, prefs tristate, **curseurs poids** Prix/Loc/DPE faible/normal/fort, seuil, `alert_frequency`/`alert_canal`). Boutons **"Suggérer critères (IA)"** (`POST criteres/suggest` → pré-remplit le formulaire, `source='enrichi_ia'`) et **"Analyser retours (IA)"** (`POST criteres/[id]/analyze` → résumé FR + ajustements suggérés). Boutons grisés si `kimiIsConfigured()===false`. Import/Export Excel (Phase 3, boutons grisés tant que `xlsx` absent). |
| `/acquereurs/[critereId]` | `Card`, `WeightSliders.tsx` (`"use client"`), `BarList` | Curseurs poids, prefs, top matchs, `explainMatch`, boutons "Générer fiche"/"Envoyer". |
| `/envois` | `DataTable`, `StatusSelect` | Historique envois (statut queued/sent/failed/dry_run, canal, lien fiche PDF). Bouton "Envoi groupé". |
| `/veille` | `DataTable`, `PageHeader`, modal | Agences surveillées (SIREN/nom), leurs nouvelles annonces (`topByCategory`), toggle `actif`. |
| `/prospection/config` | `ct-form`, `ct-seg-track` | Barèmes mandat (preset doc/api/custom), zones prioritaires, blacklist SIREN, garde-fous alertes. |
| Dashboard (`app/(dashboard)/page.tsx`, modif) | `KpiCard`, `Donut`, `BarList` | Widgets : prospects chauds, matchs du jour, top communes/sources (`topByCategory`), répartition statuts (`barsByStatus`→`BarList`), taux mandat signé (`ratio`), fraîcheur ingestion. |

**Gotchas UI scale** (gotcha #2/#3 carte ui-cockpit) : `DataTable` ne pagine pas → pagination server-side `searchParam` + `.range` obligatoire dès le départ (annonces 10k+). `StatusSelect` fait `router.refresh()` → paginer d'abord. Scores : `String(score)+"/100"` (PAS `eur()` qui renvoie "—" pour 0, gotcha #6 carte ui-cockpit).

---

## 10. RGPD / LÉGAL

1. **Démarchage PAP** : `prosp_annonces.vendeur_refuse_demarchage` → court-circuit `scoreMandat` (`eligible=false`) ET blocage alerte dans `prospAlertDispatch`. UI : badge "Démarchage refusé" + bouton "Démarcher" désactivé.
2. **Garde enrichissement** : `canEnrichAnnonceur(type_annonceur)` (`lib/prospection/pap.ts`) — PAP/inconnu = particulier → JAMAIS Apollo/PDL (gotcha #8 carte valuation, allow-list `isEnrichable` carte crm-leads). Enrichissement B2B (`apollo`/`pdl`) réservé à la **veille agences** (SIREN pro) avec garde `if (!siren) throw`.
3. **PII scrub** : `telephone_vendeur`/`email_vendeur`/`nom_annonceur` ajoutés à `PII_KEYS` (`lib/providers/scrub.ts`) → auto-redactés logs/Sentry/audit/DLQ. `scrubObject` avant tout `captureFatal`/log/insert DLQ.
4. **Rétention** : job mensuel (cron `0 3 1 * *`, Phase 3) — annonces `actif=false` depuis >`PROSP_RETENTION_DAYS`(90)j supprimées (FK `on delete cascade` → prospects/matchs nettoyés) ; `phone_removed_at` set si une annonce republiée perd son tel ; tel PAP non contacté conservé ≤ 13 mois (CNIL prospection, à confirmer §15). Feedback ML conservé anonymisé (features sans PII).
5. **Conciliation B2B** : la veille concurrentielle (SIREN d'agences) = usage B2B légal (registre public). Le vendeur particulier n'est JAMAIS profilé via data broker — uniquement les données publiques de l'annonce.
6. **Audit** : `recordAudit(sb, {tenantId, action:"prospect.alerted"|"envoi.sent", actorRole:"system"|"user", entityType:"prosp_prospect"|"prosp_match", entityId, metadata})` (`lib/invest/shared/audit.ts`). Best-effort, PII scrubée. Aucune migration SQL (entity_type sans CHECK).
7. **Droit d'effacement** : suppression annonce → cascade prospects/matchs (FK `on delete cascade`).

---

## 11. CARTE DE RÉUTILISATION (chemins EXACTS existants)

| Besoin | Chemin exact | Usage |
|---|---|---|
| Auth + tenant route | `lib/server/session.ts::getSession` + `lib/tenant.ts::tenantOf`/`DEFAULT_TENANT` | Toutes routes/pages |
| DB service-role | `lib/server/supabase.ts::getSupabaseAdmin` | Filtrer user_id+tenant_id systématiquement |
| Observabilité | `lib/server/observe.ts::captureFatal` | Jobs + routes |
| Scraping LBC (fallback) | `lib/estimation/listings.ts::fetchListingComparables`/`apifyIsConfigured`/`normalizeApify` (pattern) | `apify-bulk.ts` (sans cap 12) ; ne pas modifier le path estimation |
| Géocode | `lib/estimation/geocode.ts::geocode` | enrich.ts (lat/lon/INSEE/CP) |
| Cadastre | `lib/estimation/cadastre.ts::resolveParcelle` | sections DVF |
| DVF | `lib/estimation/dvf.ts::fetchMutationsMultiSection`/`capSections` | enrich.ts |
| Comparables | `lib/estimation/comparables.ts::buildComparables` | `medianPricePerSqm` |
| Index temporel | `lib/estimation/price-index.ts::indexComparable`/`indexFactor` | corriger DVF vers aujourd'hui |
| Valorisation | `lib/estimation/valuation.ts::computeValuation` | `prix_gap_median` (null si vide) |
| DPE | `lib/estimation/ademe.ts::fetchDpeForAddress` | enrich.ts (fail-soft) |
| Cost-guard | `lib/providers/cost-guard.ts::paidCall` | MoteurImmo + cap Twilio 10/j |
| Rate-limit | `lib/ratelimit.ts::rateLimit` | Cooldown 24h alertes ; rate-limit routes PDF |
| Scrub PII | `lib/providers/scrub.ts::scrubObject`/`scrubSecrets`/`safeUrl` | Logs annonces (ajouter tel/email/nom à PII_KEYS) |
| Provider socle | `lib/providers/types.ts::envPresent`/`fetchJson`/`ProviderUnavailableError` + `search.ts`/`apollo.ts` (modèle) | twilio.ts, resend.ts, moteurimmo.ts |
| Statut providers | `lib/providers/index.ts::providersStatus` | + twilio/moteurimmo/resend |
| Enrich B2B veille | `lib/providers/apollo.ts` + `pdl.ts` | Veille SIREN agences (pro only) |
| Garde RGPD | `lib/crm/enrichable.ts::isEnrichable`/`ENRICHABLE_TYPES` | `canEnrichAnnonceur` |
| Idempotence/dédup | `lib/invest/shared/idempotency.ts::hashBody`/`withIdempotency`/`supabaseIdempotencyStore`/`IdempotencyStore` | `normalize.hashDedup`, `prospIdempotencyStore` |
| DLQ interface + drain | `lib/invest/shared/dlq-drain.ts::DlqDrainStore`/`drainFailedOperations` (interface réutilisée, store recopié) | `prospDlqStore` + `drainProspFailedOperations` (table `prosp_failed_operations`, op_kind prosp) |
| Webhook HMAC (Phase 3) | `lib/invest/shared/webhooks.ts::verifyHmacSignature` | Si MoteurImmo push |
| Circuit breaker | `lib/invest/server/circuit-breaker.ts::runWithBreaker` | Protéger appels MoteurImmo |
| Erreurs domaine | `lib/invest/shared/errors.ts::DomainError` | base `ProspectionError` |
| Audit | `lib/invest/shared/audit.ts::recordAudit`/`AuditEntityType` | Alertes/envois (étendre union TS, pas de SQL) |
| PDF render | `lib/brochure/pdf.ts::renderEstimationPdf` | fiche.ts (accepte tout HTML autonome, import dynamique) |
| PDF+R2 orchestration | `lib/brochure/generate.ts::renderAndCacheEstimationPdf` (l.44, pattern) + `render-html.ts::renderBrochureHtml` (l.73, CSS **inline** — PAS de `brochure-css.ts`, fichier inexistant) | `generate-fiche.ts`/`fiche.ts` calqués (CSS inline) |
| R2 | `lib/storage/r2.ts::putObject`/`publicUrl`/`getObject`/`r2IsConfigured` | stockage fiches PDF |
| Email inline → wrapper | `app/api/estimations/[id]/share/route.ts` (pattern Resend) | `lib/providers/resend.ts` |
| Jobs Inngest | `lib/jobs/inngest/client.ts::inngest`/`inngestIsConfigured` + `functions.ts::functions[]` (pattern `invReconcileTick`/`invRefundWatchdog`) | 6 fonctions prosp |
| Agrégats viz | `lib/crm/aggregate.ts::barsByStatus`/`topByCategory`/`distributeByBand`/`autoBands`/`ratio`/`average` (+ types `BarItem`/`Band`, const `PRICE_BANDS` — exports réels vérifiés ; `countByStatus` N'EXISTE PAS) | Répartitions statut (`BarList`)/dashboards |
| Statut tone | `lib/crm/statusTone.ts::statusTone` | Étendre entity `"prospect"/"match"` |
| Format | `lib/crm/format.ts::eur`/`sqm`/`dateFr` | Tables/fiches (`eur(0)`="—", utiliser `String(score)+"/100"` pour scores) |
| UI primitives | `components/cockpit/{primitives,DataTable,BarList,Donut,StatusSelect}.tsx` (vérifiés existants ; `Funnel.tsx` N'EXISTE PAS — supprimé, cf. "ex-Funnel" `aggregate.ts` l.23 → utiliser `BarList`) | Toutes pages |
| Nav | `components/cockpit/RailLeft.tsx::NAV_ITEMS` + `nav-icons.tsx` | 3 entrées |
| Strings | `lib/ui-strings.ts::UI` | Sections prospection/matching/acquereurs/envois/veille |
| Owned loader (modèle) | `lib/estimation/owned.ts::loadOwnedEstimation` | `lib/prospection/owned.ts` |
| CRM leads (conversion) | `app/api/leads/route.ts` (kind=vendeur) | prospect→lead |
| LLM (jamais hors lib/llm) | `lib/llm/kimi.ts::kimi` (client OpenAI exporté) + `kimiIsConfigured` | SEUL consommateur prospection = `lib/prospection/critere-ia.ts` (suggérer critères / analyser retours). `explainMatch` + scoring restent déterministes, ZÉRO LLM (gotcha #12 ui-cockpit) |
| NDJSON stream (modèle) | `app/api/estimations/[id]/value/route.ts` | Si scoring long → frames progress/error/done |

---

## 12. ORDRE ROLLOUT + FEATURE FLAGS

**Feature flags** (`.env.local`, jamais hardcodés, lus paresseusement) :
```
PROSP_ENABLED=false                 # master switch UI + jobs + routes (404 si off)
PROSP_INGEST_PROVIDER=moteurimmo    # moteurimmo|apify
PROSP_INGEST_CRON_ENABLED=false     # garde cron tant que volume non validé
MOTEURIMMO_API_KEY=                 # absent → fallback Apify LBC
MOTEURIMMO_DAILY_CAP=500
TWILIO_ACCOUNT_SID= TWILIO_AUTH_TOKEN= TWILIO_WHATSAPP_FROM=   # absent → dry-run
RESEND_API_KEY=                     # existant
PROSP_WA_DAILY_CAP=10
PROSP_RETENTION_DAYS=90
```
Providers auto-gated : `twilioIsConfigured`, `moteurImmoIsConfigured`, `resendIsConfigured`. Chaque étape déployable et réversible (flags off instantané ; migrations idempotentes `if not exists`/`drop policy if exists`).

**Phase 1 — MVP chasse mandat (cœur)**
1. Migrations `0025` + `0026` via `mcp__supabase__apply_migration` → `generate_typescript_types` → `get_advisors`.
2. `lib/prospection/{types,normalize,pap,scoring/mandat,scoring/presets,owned,store}.ts` + `lib/providers/scrub.ts` (PII_KEYS) + tests unit.
3. `lib/providers/moteurimmo.ts` + `lib/prospection/apify-bulk.ts` + `lib/prospection/{ingest,enrich}.ts` + `lib/providers/index.ts` (status).
4. Jobs `prospIngestTick` + `prospScoreTick` (mandat seul) derrière flag.
5. Routes annonces/prospects/zones/config + pages `/prospection`, `/prospection/[id]`, `/prospection/config`, nav.
6. **Démo** : ingestion 1 zone (run manuel `/api/prospection/ingest/run`) → annonces PAP scorées → liste. Valeur démontrée.

**Phase 2 — matching acquéreur + fiches**
7. Migration `0027` → types.
8. `lib/prospection/{scoring/match,matching/weights,fiche,fiche-css,generate-fiche}.ts` + tests unit (`isAlreadyProposed`/`markProposed` inclus).
9. `prospScoreTick` étendu (matchs) + routes criteres/matchs/feedback/fiche. `lib/prospection/critere-ia.ts` + routes `criteres/suggest` + `criteres/[id]/analyze` (IA, fail-soft si Kimi absent).
10. Pages `/acquereurs`, `/matchs`, `/matchs/tinder`, `/acquereurs/[id]`.
11. **Démo** : critère → matchs → fiche HTML/PDF.

**Phase 3 — alertes + veille + Excel + MoteurImmo prod + ML + DLQ**
12. Migration `0028` → types.
13. `lib/providers/{twilio,resend}.ts` + `lib/prospection/dlq.ts`. **`lib/prospection/excel.ts` + routes import/export UNIQUEMENT après `npm i xlsx`** (sinon routes 501, test E2E skip — cf. §13/§15.9).
14. Jobs `prospAlertDispatch`, `prospAlertDaily`, `prospVeilleTick`, `prospDlqDrain`.
15. Routes envois/veille/import-export + pages `/envois`, `/veille` + widgets dashboard.
16. Activer flags alertes ; brancher MoteurImmo (clé) si contrat signé ; activation graduelle 1 zone pilote → monitoring `prosp_ingestion_runs` + `get_advisors` → généralisation.
17. Job rétention RGPD (cron `0 3 1 * *`).

**Rollback** : flags off ; tables `prosp_*` isolées d'invest/CRM (aucun couplage destructif).

---

## 13. PLAN DE TEST

**Unit (cores purs — Vitest, pattern `deal-engine.test.ts`/`cost-guard.test.ts`/`valuation.test.ts`)** :
- `normalize.test.ts` : `hashDedup` déterministe (2 plateformes même bien → même hash ; bucketing prix ±5k/surface ±5 → même hash ; bien différent → hash différent ; url ignorée) ; `detectAnnonceurType` (SIREN→pro, keyword→pap, rien→inconnu) ; `detectBaissePrix` ; `mergeAnnonce` (baisse → `prix_baisse_delta`, `duplicate_count++`).
- `scoring/mandat.test.ts` : preset DOC (PAP+ancienneté+baisse+zone=85 éligible) ; preset API (PAP+zone+repub+desc=105→clamp 100) ; blacklist SIREN→0 ; `vendeur_refuse_demarchage`→0 ; `sous_compromis`→non éligible ; seuil custom ; `now` injecté pour ancienneté.
- `scoring/match.test.ts` : hard exclude (type_bien/prix±10%/communes/pref exclu/requis) ; souplesse surface/pieces (pénalise sans exclure) ; curseurs faible/normal/fort renormalisés 100 ; bonus capé +15 ; `prix_gap_median=null`→0 ; `score=105`→clamp 100 ; `features_snapshot` présent ; `explainMatch` strings sans LLM ; `isAlreadyProposed`/`markProposed` (append distinct, anti-doublon multi-acquéreurs).
- `matching/weights.test.ts` : `resolveWeights` renormalisé 100 ; `adjustWeightsFromFeedback` borné ±20 % + somme=100.
- `pap.test.ts` : `canEnrichAnnonceur('pap')=false`, `('pro')=true`, `('inconnu')=false`.
- `critere-ia.test.ts` (mock `kimi`) : `kimiIsConfigured()===false`→`suggestCritereFromBrief` retourne brouillon vide sans throw ; `analyzeFeedbackReturns` ne mute PAS les poids (suggestion seule) ; jamais d'appel LLM hors `lib/llm`.
- `enrich.test.ts` : gap=(prix-market)/market ; DVF vide → `prix_gap_median=null` (pas 0).
- `twilio.test.ts` : dry-run si non configuré (null), `to=null`+fallbackUrl→`skipped`, jamais throw.

**Intégration (mocks providers)** :
- `ingest.test.ts` : `withIdempotency`+`prospIdempotencyStore` mocké → ré-ingestion même hash → `bumpDuplicate`, pas de doublon ; baisse prix détectée.
- `prospAlertDispatch` : cooldown bloque 2e alerte <24h ; cap bloque la 11e/j ; Twilio absent → `dry_run` ; PAP sans tel → fallback URL, pas d'appel Twilio.
- `dlq.test.ts` : `drainProspFailedOperations` rejoue `mandat_alert`/`match_alert`/`envoi` ; `onError` appelé sur échec ; payload déjà scrubé.

**E2E Playwright (`npm run test:e2e`, port 3002)** :
- `prospection.spec.ts` : login → `/prospection` → liste annonces affichée → pagination → changer statut prospect (StatusSelect) → refresh persiste.
- `matchs-tinder.spec.ts` : `/matchs/tinder` → touche V → statut `selectionne` → compteur incrémente → touche X → `ecarte` → `explainMatch` affiché.
- `acquereurs.spec.ts` : créer critère + curseurs → matchs apparaissent → générer fiche PDF (200 + content-type pdf). **L'assertion import/export Excel (fixture .xlsx → export téléchargé) est `test.skip(!process.env.XLSX_INSTALLED)`** : la dépendance `xlsx` étant absente du `package.json` (§4/§15.9), ce sous-test ne peut PAS être vert tant que `npm i xlsx` n'est pas exécuté. Ne jamais asserter une feature dont la dépendance est encore une question ouverte.
- `envois.spec.ts` : envoi groupé → `prosp_envois` statut `dry_run` (Twilio/Resend absents en CI, asserter statut DB) → lien PDF présent → jamais d'erreur.
- `veille.spec.ts` : ajouter agence (SIREN) → run veille manuel → annonces listées.
- `rgpd.spec.ts` : annonce `vendeur_refuse_demarchage` → bouton Démarcher désactivé.
- Garde RLS : 2e utilisateur ne voit pas les prospects/critères du 1er (double filtre code).

**Data quality (post-déploiement)** : `mcp__supabase__get_advisors` après chaque migration (RLS/index manquants) ; doublons résiduels (`group by hash_dedup having count>1`) ; ledger `prosp_ingestion_runs` (skipped/inserted, dérive coût) ; fraîcheur `max(age_hours)` par zone < 2h.

---

## 14. CORRECTIONS APPLIQUÉES DEPUIS LA REVUE

> Les 10 revues automatisées ayant échoué (rate-limit serveur, voir préambule), je liste ici les corrections issues de **ma propre revue + vérification directe du code source** appliquées au PLAN v1.

**C1 (P0) — DLQ : `supabaseDlqDrainStore` hardcode `inv_failed_operations`.** Vérification source (`lib/invest/shared/dlq-drain.ts`) : toutes les méthodes font `.from("inv_failed_operations")`. Le PLAN v1 prétendait "réutiliser `dlq-drain.ts`" en pointant le store sur une autre table — **impossible**. Corrigé : `prospDlqStore` est une **copie** du store visant `prosp_failed_operations` ; un drain dédié `drainProspFailedOperations` rejoue les op_kind prospection (le `drainFailedOperations` générique ne rejoue QUE `op_kind==='refund'`, vérifié source). Seules l'interface `DlqDrainStore` et la signature de résultat sont réutilisées.

**C2 (P0) — Schéma `prosp_failed_operations` désaligné.** Le PLAN v1 nommait la colonne d'erreur `error` + ajoutait `op_kind`/`error`. Vérification source : `inv_failed_operations` expose `attempts` + `last_error` (select réel dans dlq-drain.ts). Corrigé : DDL aligné sur `attempts` + `last_error` pour que le store recopié fonctionne sans réécriture du mapping.

**C3 (P1) — Audit : aucune migration SQL nécessaire.** Le PLAN v1 listait en question ouverte "ajouter prosp_* au CHECK de `inv_audit_log.entity_type`". Vérification source (`0020_invest_documents_audit.sql`) : le CHECK ligne 35 porte sur **`inv_documents`**, pas sur l'audit log ; `inv_audit_log.entity_type` (ligne 111) est `text` SANS CHECK, et la RPC `inv_append_audit_log` insère librement. Corrigé : étendre uniquement le type TS `AuditEntityType` (membres réels confirmés : `inv_deal|inv_subscription|inv_kyc_case|inv_distribution|inv_operator|inv_investor_profile|inv_secondary_order|inv_tenant`). Question ouverte #3 du v1 supprimée.

**C4 (P1) — PII scrub : champs custom non couverts.** Vérification source (`lib/providers/scrub.ts`) : `PII_KEYS` est un `Set` ne contenant ni `telephone_vendeur`, ni `email_vendeur`, ni `nom_annonceur`. Confirmé : ces champs DOIVENT être ajoutés au Set, sinon fuite PII en audit/Sentry/DLQ. Action explicitée en §4.

**C5 (P1) — Cores `enrich.ts` re-export.** Clarifié : `enrich.ts` ré-exporte `canEnrichAnnonceur` depuis `pap.ts` via `export { ... } from "./pap"` (et non re-déclaration), pour éviter la double définition.

**C6 (P2) — Master gate 404.** Explicité : `if (process.env.PROSP_ENABLED !== 'true') return NextResponse.json(..., {status:404})` sur chaque route (le PLAN v1 disait "return 404" sans forme concrète).

**C7 (P2) — `statusTone` mappings concrets.** Ajouté : prospect positive=`["mandat_signe"]`/negative=`["refuse","perdu"]` ; match positive=`["envoye"]`/negative=`["ecarte","archive"]` (le v1 disait "+ listes" sans valeurs).

**C8 (P2) — Prérequis Inngest env.** Rappelé en §5 : `INNGEST_EVENT_KEY` requis sinon `inngest.send()` échoue silencieusement (gotcha #10 carte jobs).

---

> **CORRECTIONS POST-REVUE v2 (spot-checks Grep sur le code réel — hallucinations purgées)**

**C9 (P0) — `Funnel.tsx` INEXISTANT.** `ls components/cockpit/Funnel.tsx` → absent ; `lib/crm/aggregate.ts` l.23 contient "ex-Funnel" (composant supprimé). Le v1 le citait comme primitive (§9 `/prospection`, Dashboard ; §11 "UI primitives"). Corrigé partout : toute répartition par statut passe par **`BarList` + `barsByStatus`** (exports réels vérifiés). Aucune mention résiduelle de `Funnel`.

**C10 (P0) — `countByStatus` INEXISTANT dans `lib/crm/aggregate.ts`.** Grep sur `lib/ components/ app/` → 0 résultat. Exports réels : `barsByStatus`/`topByCategory`/`distributeByBand`/`autoBands`/`ratio`/`average` (+ `BarItem`/`Band`/`PRICE_BANDS`). Corrigé §9 et §11 : `countByStatus`→`barsByStatus`.

**C11 (P1) — `brochure-css.ts` INEXISTANT.** `ls lib/brochure/` → `generate.ts`, `pdf.ts`, `render-html.ts` seulement. Le CSS brochure est **inline** dans `render-html.ts::renderBrochureHtml` (l.73). Corrigé §4 et §11 : le "pattern" pointe vers le CSS inline de `render-html.ts`, pas un fichier séparé.

**C12 (P1) — `prosp_idempotency_keys` : déviation RLS rendue EXPLICITE.** Le v1 disait "calque inv_idempotency_keys 0021" puis "aucune policy" sans assumer la divergence (le vrai `inv_idempotency_keys` 0021 l.294 A une policy `auth.uid()=user_id`). Tranché §2/§3 : flux d'ingestion sans propriétaire → pas de `user_id`, RLS sans policy assumée (finding `get_advisors` attendu). `prosp_failed_operations` garde une policy de lecture tenant (sans `user_id`) pour le back-office DLQ.

**C13 (P1) — Contradiction test E2E Excel vs dépendance `xlsx` non installée.** `grep xlsx package.json` → absent (question ouverte §15.9). Le v1 assertait l'import/export Excel en E2E comme acquis. Corrigé : routes import/export → **501** tant que `xlsx` absent ; sous-test E2E → **`test.skip`** ; module `excel.ts` non livré avant `npm i xlsx` (Phase 3 conditionnée, §12).

**C14 (P2) — Features IA TARGET "Suggérer critères" / "Analyser retours" spécifiées.** Le v1 mentionnait `kimi.ts` "réservé résumé IA" sans route ni signature. Ajouté : `lib/prospection/critere-ia.ts` (`suggestCritereFromBrief`/`analyzeFeedbackReturns`, SEUL consommateur LLM prospection, fail-soft si Kimi absent) + routes `criteres/suggest` & `criteres/[id]/analyze` + boutons UI §9 + test §13. Scoring/`explainMatch` restent déterministes.

**C15 (P2) — `prosp_matchs.proposed_to_others` doté d'un moteur.** Colonne sinon morte. Ajouté `isAlreadyProposed`/`markProposed` (cores purs §4) + exploitation à l'envoi (anti-doublon "déjà proposé à un autre acquéreur") + badge/tri §9 + test §13.

---

## 15. QUESTIONS OUVERTES

1. **MoteurImmo** : abonnement actif ? Format API (REST/GraphQL, pagination, multipart) ? Sans clé → MVP = Apify LBC seul (mono-source dégradé). Périmètre sources acceptable pour la démo ?
2. **Twilio WhatsApp** : compte + numéro WA approuvé (template Meta requis pour sortant hors fenêtre 24h) ? Sans approbation Meta, alertes WA bloquées même Twilio configuré.
3. **Barème mandat par défaut** : preset API (proposé, observé en prod) confirmé, ou DOC à l'install ?
4. **Curseurs poids match** : 3 crans (×0.5/1/1.5) sur Prix/Loc/DPE seulement (comme BienCible) ou les 5 axes ?
5. **`sLoc=0.5` (limitrophe)** : heuristique préfixe CP 2 chiffres (= même département, retenu par défaut) ou table CP limitrophes ?
6. **Rétention** : 90j annonces inactives + ≤13 mois tel PAP non contacté (CNIL) — seuils à valider juridiquement.
7. **Volume cible réel/tenant** : 200 ou 2000 annonces/h ? Impacte `concurrency` Inngest + pagination MoteurImmo + `dailyCap`.
8. **`INNGEST_EVENT_KEY`** présent dans `.env.local` ? (sinon `inngest.send` silencieux).
9. **Dépendance `xlsx` (SheetJS)** : ajout au `package.json` acceptable (licence/poids bundle) ?
10. **`prosp_config` global tenant vs par-agent** : modélisé par-agent (`user_id`). Si l'agence veut un barème unique partagé → basculer en catalogue tenant.
11. **`drainProspFailedOperations` — handlers de rejeu** : confirmer que le rejeu d'une alerte échouée passe par les mêmes fonctions que `prospAlertDispatch` (extraction d'un handler partagé `dispatchAlert(payload)` réutilisé par le job event ET le drain).
