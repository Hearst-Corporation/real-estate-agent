-- 0054_post_visit_signals.sql
-- ADDITIF, NON DESTRUCTIF, IDEMPOTENT — signaux prospect dérivés du compte-rendu
-- de visite (boucle post-visite, REA-PRODUCT-008 / W3).
--
-- Persiste les SIGNAUX (niveau d'intérêt, objections, prix évoqué) déduits d'un
-- `visit_reports` (0051), 1 ligne par visite. Sépare le SIGNAL persistant du CR
-- brut : le CR est saisi une fois ; le signal est la vue exploitable (relances,
-- suggestions de critères, recalcul de matchs) et peut être re-dérivé.
--
-- Ne MODIFIE / ne SUPPRIME aucune table existante. Re-jouable à froid.
--
-- ⚠️ NON APPLIQUÉ SUR GPU1 par ce worker (W3) — SQL versionné uniquement.
--    Application + reload PostgREST (SIGUSR1) = étape d'intégration / QA.
--
-- ── OWNER-SCOPE ──────────────────────────────────────────────────────────────
--   user_id + tenant_id : owner-check applicatif (service-role bypasse la RLS)
--   ET policy RLS tenant+user (deny anon). Enums = miroir des CHECK Zod 0051.

begin;

create table if not exists public.post_visit_signals (
  id               uuid primary key default gen_random_uuid(),
  visit_id         uuid not null unique
                     references public.visits(id) on delete cascade,
  lead_id          uuid references public.leads(id) on delete set null,
  tenant_id        text not null,
  user_id          uuid,
  interest         text not null
                     check (interest in ('tres_interesse','interesse','mitige','peu_interesse','non_interesse')),
  outcome          text not null
                     check (outcome in ('offre_probable','a_relancer','reflexion','abandon')),
  objections       text,
  price_discussed  numeric(14,2)
                     check (price_discussed is null or price_discussed >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Index sur les colonnes de filtre / jointure (FK visit_id/lead_id, scope tenant+user).
create unique index if not exists post_visit_signals_visit_id_key
  on public.post_visit_signals (visit_id);
create index if not exists post_visit_signals_tenant_user_idx
  on public.post_visit_signals (tenant_id, user_id);
create index if not exists post_visit_signals_lead_idx
  on public.post_visit_signals (lead_id);

-- ── RLS : deny anon, tenant+user pour authenticated (service-role bypass) ─────
alter table public.post_visit_signals enable row level security;
drop policy if exists "tenant post_visit_signals" on public.post_visit_signals;
create policy "tenant post_visit_signals" on public.post_visit_signals
  for all to authenticated
  using      (tenant_id = (select public.current_tenant_id())
              and ((select auth.uid()) = user_id or user_id is null))
  with check (tenant_id = (select public.current_tenant_id())
              and ((select auth.uid()) = user_id or user_id is null));

commit;
