-- 0055_mandate_renewal.sql
-- ADDITIF, NON DESTRUCTIF, IDEMPOTENT — journal des propositions de renouvellement.
-- W4 (REA-PRODUCT-008) : trace les propositions de prochaine action générées pour
-- un mandat proche de l'expiration (renew / adjust_price / change_strategy), avec
-- le brouillon propriétaire associé (outbox). PUREMENT OPTIONNEL : la feature
-- fonctionne SANS cette table (analyse + brouillon calculés à la volée). Elle sert
-- uniquement à conserver un historique des recommandations émises.
--
-- Ne MODIFIE / ne SUPPRIME aucune table existante. Re-jouable à froid.
--
-- ⚠️ NON APPLIQUÉ SUR GPU1 par ce worker — SQL versionné uniquement.
--    Application + reload PostgREST (SIGUSR1) = étape d'intégration / QA.
--
-- ── OWNER-SCOPE ──────────────────────────────────────────────────────────────
--   user_id + tenant_id : owner-check applicatif (service-role bypasse la RLS)
--   ET policy RLS tenant+user (deny anon).

begin;

create table if not exists public.mandate_renewal_proposals (
  id                uuid primary key default gen_random_uuid(),
  mandate_id        uuid not null
                      references public.mandates(id) on delete cascade,
  property_id       uuid
                      references public.properties(id) on delete set null,
  tenant_id         text not null,
  user_id           uuid,
  action            text not null
                      check (action in ('renew','adjust_price','change_strategy')),
  reasons           jsonb not null default '[]'::jsonb,
  suggested_price   numeric(14,2)
                      check (suggested_price is null or suggested_price >= 0),
  -- Brouillon propriétaire lié (outbox_drafts) quand il a été généré.
  outbox_draft_id   uuid,
  created_at        timestamptz not null default now()
);

-- Index sur les colonnes de filtre / jointure (FK mandate, scope tenant+user).
create index if not exists mandate_renewal_proposals_mandate_idx
  on public.mandate_renewal_proposals (mandate_id);
create index if not exists mandate_renewal_proposals_tenant_user_idx
  on public.mandate_renewal_proposals (tenant_id, user_id);
create index if not exists mandate_renewal_proposals_property_idx
  on public.mandate_renewal_proposals (property_id);

-- ── RLS : deny anon, tenant+user pour authenticated (service-role bypass) ─────
alter table public.mandate_renewal_proposals enable row level security;
drop policy if exists "tenant mandate_renewal_proposals"
  on public.mandate_renewal_proposals;
create policy "tenant mandate_renewal_proposals"
  on public.mandate_renewal_proposals
  for all to authenticated
  using      (tenant_id = (select public.current_tenant_id())
              and ((select auth.uid()) = user_id or user_id is null))
  with check (tenant_id = (select public.current_tenant_id())
              and ((select auth.uid()) = user_id or user_id is null));

commit;
