-- 0047_rls_prospection.sql
-- ADDITIF, NON DESTRUCTIF, IDEMPOTENT — matrice d'accès RLS du module Prospection.
-- NE MODIFIE / NE SUPPRIME AUCUNE TABLE. N'ajoute aucune colonne. Ne touche qu'aux
-- policies RLS (ENABLE RLS + drop-if-exists + create policy). Re-jouable à froid.
--
-- ⚠️ NON APPLIQUÉ SUR GPU1 par ce worker (REA-M04-03) — SQL versionné uniquement.
--    Application + reload PostgREST (SIGUSR1) = étape d'intégration / QA.
--
-- ── PROBLÈME RÉSOLU ──────────────────────────────────────────────────────────
-- Les tables prospection créées par 0040_prospection_industrialization
--   • prosp_annonce_versions
--   • prosp_optout            (contient des HASH email/téléphone — données perso)
--   • prosp_contact_attempts  (journal de démarchage — RGPD)
--   • prosp_idempotency_keys
-- ont été créées SANS `enable row level security` ni policy. Exposées via
-- PostgREST à un JWT `anon` ou `authenticated`, elles laissaient lire/écrire les
-- lignes de TOUS les tenants → fuite cross-tenant. Cette migration ferme ce trou.
--
-- Les tables déjà protégées (prosp_prospects, prosp_criteres_acquereur,
-- prosp_matchs, prosp_match_feedback, prosp_annonces, prosp_config,
-- prosp_ingestion_runs) portaient des policies fondées sur
-- `current_setting('app.tenant_id', true)`. Or la GUC `app.tenant_id` n'est JAMAIS
-- posée au runtime : l'isolation réelle passe par `current_tenant_id()` qui lit le
-- JWT (`auth.jwt() -> app_metadata ->> tenant_id`, cf. 0003_tenant_isolation).
-- On RÉ-ALIGNE donc toutes les policies prospection sur le pattern canonique
-- éprouvé (0003 / 0043) :
--     using / with check :
--       tenant_id = (select public.current_tenant_id())
--       [and (select auth.uid()) = user_id]   -- quand la table porte user_id
--
-- ── MATRICE D'ACCÈS GARANTIE (une fois appliqué) ─────────────────────────────
--   • anon                       → 0 ligne (aucune policy ne matche : deny-all).
--   • authenticated, même tenant → lignes de SON tenant (et de SON user_id
--                                  quand la table est owner-scopée).
--   • authenticated, cross-tenant→ 0 ligne (tenant_id ne matche jamais).
--   • service-role               → BYPASS RLS (rôle serveur) — l'isolation repose
--                                  alors sur l'owner-check APPLICATIF user+tenant
--                                  (jamais le service-role côté client).
--
-- Toutes les policies sont recréées via `drop policy if exists` → `create policy`
-- (idempotent, re-jouable). Tables ciblées via `to authenticated` : le rôle anon
-- n'est cité par AUCUNE policy → refus total pour anon, explicitement.

begin;

-- ── 1. Tables SANS RLS (0040) — on ACTIVE + policy tenant-scoped ──────────────

-- 1a. prosp_annonce_versions (tenant_id, pas de user_id → scope tenant seul).
alter table public.prosp_annonce_versions enable row level security;
drop policy if exists "tenant prosp_annonce_versions" on public.prosp_annonce_versions;
create policy "tenant prosp_annonce_versions" on public.prosp_annonce_versions
  for all to authenticated
  using      (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));

-- 1b. prosp_optout (tenant_id, pas de user_id ; contient des hash perso).
alter table public.prosp_optout enable row level security;
drop policy if exists "tenant prosp_optout" on public.prosp_optout;
create policy "tenant prosp_optout" on public.prosp_optout
  for all to authenticated
  using      (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));

-- 1c. prosp_contact_attempts (tenant_id + user_id NULLABLE).
--     user_id peut être NULL (tentative système). On scope au tenant et, quand
--     user_id est renseigné, on exige qu'il corresponde à l'appelant — une ligne
--     système (user_id IS NULL) reste lisible par tout membre du tenant.
alter table public.prosp_contact_attempts enable row level security;
drop policy if exists "tenant prosp_contact_attempts" on public.prosp_contact_attempts;
create policy "tenant prosp_contact_attempts" on public.prosp_contact_attempts
  for all to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and (user_id is null or user_id = (select auth.uid()))
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and (user_id is null or user_id = (select auth.uid()))
  );

-- 1d. prosp_idempotency_keys (tenant_id, pas de user_id).
alter table public.prosp_idempotency_keys enable row level security;
drop policy if exists "tenant prosp_idempotency_keys" on public.prosp_idempotency_keys;
create policy "tenant prosp_idempotency_keys" on public.prosp_idempotency_keys
  for all to authenticated
  using      (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));

-- ── 2. Tables déjà RLS — RÉ-ALIGNEMENT sur current_tenant_id() (owner-scopées) ─
-- RLS déjà activée en 0016/0017 (no-op réaffirmé ici pour lisibilité).

-- 2a. prosp_prospects (tenant_id + user_id NOT NULL).
alter table public.prosp_prospects enable row level security;
drop policy if exists "owner_all" on public.prosp_prospects;
drop policy if exists "tenant prosp_prospects" on public.prosp_prospects;
create policy "tenant prosp_prospects" on public.prosp_prospects
  for all to authenticated
  using      (tenant_id = (select public.current_tenant_id()) and (select auth.uid()) = user_id)
  with check (tenant_id = (select public.current_tenant_id()) and (select auth.uid()) = user_id);

-- 2b. prosp_criteres_acquereur (tenant_id + user_id NOT NULL).
alter table public.prosp_criteres_acquereur enable row level security;
drop policy if exists "owner_all" on public.prosp_criteres_acquereur;
drop policy if exists "tenant prosp_criteres_acquereur" on public.prosp_criteres_acquereur;
create policy "tenant prosp_criteres_acquereur" on public.prosp_criteres_acquereur
  for all to authenticated
  using      (tenant_id = (select public.current_tenant_id()) and (select auth.uid()) = user_id)
  with check (tenant_id = (select public.current_tenant_id()) and (select auth.uid()) = user_id);

-- 2c. prosp_matchs (tenant_id + user_id NOT NULL).
alter table public.prosp_matchs enable row level security;
drop policy if exists "owner_all" on public.prosp_matchs;
drop policy if exists "tenant prosp_matchs" on public.prosp_matchs;
create policy "tenant prosp_matchs" on public.prosp_matchs
  for all to authenticated
  using      (tenant_id = (select public.current_tenant_id()) and (select auth.uid()) = user_id)
  with check (tenant_id = (select public.current_tenant_id()) and (select auth.uid()) = user_id);

-- 2d. prosp_match_feedback (tenant_id + user_id NOT NULL).
alter table public.prosp_match_feedback enable row level security;
drop policy if exists "owner_all" on public.prosp_match_feedback;
drop policy if exists "tenant prosp_match_feedback" on public.prosp_match_feedback;
create policy "tenant prosp_match_feedback" on public.prosp_match_feedback
  for all to authenticated
  using      (tenant_id = (select public.current_tenant_id()) and (select auth.uid()) = user_id)
  with check (tenant_id = (select public.current_tenant_id()) and (select auth.uid()) = user_id);

-- ── 3. Tables tenant-scopées SANS user_id — ré-alignement current_tenant_id() ──
-- Catalogue partagé au sein du tenant (annonces, config, runs d'ingestion).
-- Pas de colonne user_id → isolation au tenant seul (comportement d'origine
-- préservé, GUC corrigée en appel JWT).

-- 3a. prosp_annonces (tenant_id, pas de user_id). Le catalogue d'annonces est
--     alimenté par l'ingestion (service-role) et lu par tout membre du tenant.
--     0016 n'exposait qu'un SELECT ; on garde SELECT en lecture pour authenticated
--     (les écritures passent par le service-role côté serveur, hors RLS).
alter table public.prosp_annonces enable row level security;
drop policy if exists "tenant_select" on public.prosp_annonces;
drop policy if exists "tenant prosp_annonces read" on public.prosp_annonces;
create policy "tenant prosp_annonces read" on public.prosp_annonces
  for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));

-- 3b. prosp_config (tenant_id). 0015 avait select/insert/update séparés ; on
--     conserve exactement ces droits, tenant-scopés. DELETE reste refusé.
alter table public.prosp_config enable row level security;
drop policy if exists "tenant_select" on public.prosp_config;
drop policy if exists "tenant_insert" on public.prosp_config;
drop policy if exists "tenant_update" on public.prosp_config;
drop policy if exists "tenant prosp_config" on public.prosp_config;
drop policy if exists "tenant prosp_config read" on public.prosp_config;
drop policy if exists "tenant prosp_config insert" on public.prosp_config;
drop policy if exists "tenant prosp_config update" on public.prosp_config;
create policy "tenant prosp_config read" on public.prosp_config
  for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));
create policy "tenant prosp_config insert" on public.prosp_config
  for insert to authenticated
  with check (tenant_id = (select public.current_tenant_id()));
create policy "tenant prosp_config update" on public.prosp_config
  for update to authenticated
  using      (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));

-- 3c. prosp_ingestion_runs (tenant_id). Lecture tenant-scopée (écriture = service-role).
alter table public.prosp_ingestion_runs enable row level security;
drop policy if exists "tenant_select" on public.prosp_ingestion_runs;
drop policy if exists "tenant prosp_ingestion_runs read" on public.prosp_ingestion_runs;
create policy "tenant prosp_ingestion_runs read" on public.prosp_ingestion_runs
  for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));

commit;

-- ── ROLLBACK (manuel) ────────────────────────────────────────────────────────
-- Restaure l'état antérieur (policies 0015/0016/0017 fondées sur app.tenant_id,
-- tables 0040 sans RLS). À n'exécuter qu'en cas de régression avérée.
--
--   -- Tables 0040 : on retire RLS (état d'origine = aucune policy).
--   drop policy if exists "tenant prosp_annonce_versions"  on public.prosp_annonce_versions;
--   drop policy if exists "tenant prosp_optout"            on public.prosp_optout;
--   drop policy if exists "tenant prosp_contact_attempts"  on public.prosp_contact_attempts;
--   drop policy if exists "tenant prosp_idempotency_keys"  on public.prosp_idempotency_keys;
--   alter table public.prosp_annonce_versions disable row level security;
--   alter table public.prosp_optout           disable row level security;
--   alter table public.prosp_contact_attempts disable row level security;
--   alter table public.prosp_idempotency_keys disable row level security;
--
--   -- Tables 0016/0017 : restaure les policies owner_all d'origine.
--   drop policy if exists "tenant prosp_prospects"           on public.prosp_prospects;
--   drop policy if exists "tenant prosp_criteres_acquereur"  on public.prosp_criteres_acquereur;
--   drop policy if exists "tenant prosp_matchs"              on public.prosp_matchs;
--   drop policy if exists "tenant prosp_match_feedback"      on public.prosp_match_feedback;
--   create policy "owner_all" on public.prosp_prospects          for all using (tenant_id = current_setting('app.tenant_id', true) and user_id = auth.uid());
--   create policy "owner_all" on public.prosp_criteres_acquereur for all using (tenant_id = current_setting('app.tenant_id', true) and user_id = auth.uid());
--   create policy "owner_all" on public.prosp_matchs            for all using (tenant_id = current_setting('app.tenant_id', true) and user_id = auth.uid());
--   create policy "owner_all" on public.prosp_match_feedback    for all using (tenant_id = current_setting('app.tenant_id', true) and user_id = auth.uid());
--
--   -- Tables 0015 : restaure les policies select/insert/update d'origine.
--   drop policy if exists "tenant prosp_annonces read"       on public.prosp_annonces;
--   drop policy if exists "tenant prosp_config"              on public.prosp_config;
--   drop policy if exists "tenant prosp_config read"         on public.prosp_config;
--   drop policy if exists "tenant prosp_config insert"       on public.prosp_config;
--   drop policy if exists "tenant prosp_config update"       on public.prosp_config;
--   drop policy if exists "tenant prosp_ingestion_runs read" on public.prosp_ingestion_runs;
--   create policy "tenant_select" on public.prosp_annonces       for select using (tenant_id = current_setting('app.tenant_id', true));
--   create policy "tenant_select" on public.prosp_config         for select using (tenant_id = current_setting('app.tenant_id', true));
--   create policy "tenant_insert" on public.prosp_config         for insert with check (tenant_id = current_setting('app.tenant_id', true));
--   create policy "tenant_update" on public.prosp_config         for update using (tenant_id = current_setting('app.tenant_id', true));
--   create policy "tenant_select" on public.prosp_ingestion_runs for select using (tenant_id = current_setting('app.tenant_id', true));
