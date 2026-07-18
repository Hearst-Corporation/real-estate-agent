-- 0051_visit_report.sql
-- ADDITIF, NON DESTRUCTIF, IDEMPOTENT — compte-rendu de visite structuré.
-- Crée une table dédiée `visit_reports` (1 CR par visite) au lieu d'étendre
-- `visits` (qui ne porte que du texte libre notes/feedback) : le CR structuré
-- est réutilisable (timeline, tableau propriétaire) et ne pollue pas la ligne visite.
-- Ne MODIFIE / ne SUPPRIME aucune table existante. Re-jouable à froid.
--
-- ⚠️ NON APPLIQUÉ SUR GPU1 par ce worker (REA-PRODUCT-007 / W7) — SQL versionné
--    uniquement. Application + reload PostgREST (SIGUSR1) = étape d'intégration / QA.
--
-- ── ENUMS structurés (CHECK DB miroir des enums Zod côté route) ──────────────
--   report_interest  : niveau d'intérêt de l'acquéreur
--   report_outcome   : probabilité de suite (issue attendue)
-- ── OWNER-SCOPE ──────────────────────────────────────────────────────────────
--   La table porte user_id + tenant_id : owner-check applicatif (service-role
--   bypasse la RLS) ET policy RLS tenant+user (deny anon).

begin;

create table if not exists public.visit_reports (
  id                    uuid primary key default gen_random_uuid(),
  visit_id              uuid not null unique
                          references public.visits(id) on delete cascade,
  tenant_id             text not null,
  user_id               uuid,
  interest              text not null
                          check (interest in ('tres_interesse','interesse','mitige','peu_interesse','non_interesse')),
  positives             text,
  objections            text,
  price_discussed       numeric(14,2)
                          check (price_discussed is null or price_discussed >= 0),
  next_action           text,
  outcome               text not null
                          check (outcome in ('offre_probable','a_relancer','reflexion','abandon')),
  reported_at           timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Index sur les colonnes de filtre / jointure (FK visit_id, scope tenant+user).
create unique index if not exists visit_reports_visit_id_key
  on public.visit_reports (visit_id);
create index if not exists visit_reports_tenant_user_idx
  on public.visit_reports (tenant_id, user_id);
create index if not exists visit_reports_tenant_idx
  on public.visit_reports (tenant_id);

-- ── RLS : deny anon, tenant+user pour authenticated (service-role bypass) ─────
alter table public.visit_reports enable row level security;
drop policy if exists "tenant visit_reports" on public.visit_reports;
create policy "tenant visit_reports" on public.visit_reports
  for all to authenticated
  using      (tenant_id = (select public.current_tenant_id())
              and ((select auth.uid()) = user_id or user_id is null))
  with check (tenant_id = (select public.current_tenant_id())
              and ((select auth.uid()) = user_id or user_id is null));

commit;
