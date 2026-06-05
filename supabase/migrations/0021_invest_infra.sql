-- ═══════════════════════════════════════════════════════════════════════════
-- 0021 — INVEST : infrastructure transverse (robustesse, jobs, 4-eyes, lifecycle)
-- ═══════════════════════════════════════════════════════════════════════════
-- NOUVEAU (conçu d'après docs/produit/04-architecture-technique.md §6-7, blueprint
-- C1 point 5). Tables d'infrastructure absentes de 06 mais nécessaires aux
-- patterns de robustesse de l'archi :
--   inv_idempotency_keys   — Pattern A : idempotence de commande (I8)
--   inv_webhook_events     — Pattern B : webhooks signés + dédup (provider_event_id UNIQUE)
--   inv_failed_operations  — Pattern C : Dead Letter Queue (retries épuisés)
--   inv_reconciliation_runs— passe DEEP↔chaîne (Edge inv-reconciliation-tick 5 min)
--   inv_approvals          — 4-eyes (publish/close/transfert > seuil)
--   inv_deal_milestones    — jalons travaux/LTV (⑦ Distribution & Lifecycle)
--   inv_reports            — reporting trimestriel + IFU (⑦)
--
-- Conventions : tenant_id text FK-less ; RLS tenant (owner si pertinent) ; index
-- sur chaque FK ; set_updated_at()/current_tenant_id() existants (non redéfinis).
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- INV_IDEMPOTENCY_KEYS — Pattern A : idempotence de commande (04 §7 Pattern A)
-- ═══════════════════════════════════════════════════════════════════════════
-- Toute commande mutante vers un tiers (startCase, createEscrowInstruction, mint,
-- requestSignature) prend une clé déterministe (ex. mint:{subscription_id}).
-- INSERT ... ON CONFLICT DO NOTHING ; si la clé existe → réponse mémorisée
-- rejouée, on NE ré-appelle PAS. Garantit I8 (pas de double acte juridique).
create table if not exists inv_idempotency_keys (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         text not null default 'real-estate-agent',
  user_id           uuid references auth.users(id) on delete set null,

  idem_key          text not null,                 -- clé d'idempotence déterministe
  scope             text,                          -- ex: 'mint','escrow_instruction','esign'
  body_hash         text,                          -- sha256 du body de la requête (anti-collision sémantique)
  response          jsonb,                         -- réponse mémorisée à rejouer
  status            text not null default 'in_progress'
                    check (status in ('in_progress','succeeded','failed')),

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- 1 clé unique par tenant (le ON CONFLICT s'appuie dessus)
  constraint uq_inv_idempotency_key unique (tenant_id, idem_key)
);

create trigger trg_inv_idempotency_keys_updated_at
  before update on inv_idempotency_keys
  for each row execute function public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- INV_WEBHOOK_EVENTS — Pattern B : webhooks signés + dédup (04 §7 Pattern B)
-- ═══════════════════════════════════════════════════════════════════════════
-- Tout webhook entrant : (1) vérifie la signature HMAC/eIDAS (rejet 401 sinon) ;
-- (2) INSERT (provider, provider_event_id UNIQUE) — si conflit = doublon → 200
-- no-op ; (3) traduit en événement de domaine Inngest. Le webhook ne fait JAMAIS
-- la logique métier inline.
create table if not exists inv_webhook_events (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         text not null default 'real-estate-agent',

  provider          text not null,                 -- 'sumsub','yousign','escrow_emi','circle','monerium','chain_indexer'
  provider_event_id text not null,                 -- id de l'événement côté provider (clé de dédup)
  event_type        text,                          -- type d'événement provider
  signature_valid   boolean not null default false,
  payload           jsonb,                         -- corps brut (après vérif signature)

  status            text not null default 'received'
                    check (status in ('received','processed','ignored','failed')),
  processed_at      timestamptz,
  error_message     text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- dédup : un même événement provider n'est traité qu'une fois
  constraint uq_inv_webhook_provider_event unique (provider, provider_event_id)
);

create trigger trg_inv_webhook_events_updated_at
  before update on inv_webhook_events
  for each row execute function public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- INV_FAILED_OPERATIONS — Pattern C : Dead Letter Queue (04 §7 Pattern C)
-- ═══════════════════════════════════════════════════════════════════════════
-- Échec définitif d'un appel sortant (après retries back-off Inngest) → DLQ +
-- alerte compliance. Les retries sont sûrs car les commandes sont idempotentes.
create table if not exists inv_failed_operations (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         text not null default 'real-estate-agent',

  -- rattachement optionnel (souvent un deal ou une souscription)
  deal_id           uuid references inv_deals(id) on delete set null,
  subscription_id   uuid references inv_subscriptions(id) on delete set null,

  op_kind           text not null,                 -- 'mint','escrow_release','refund','esign','kyc_start'...
  payload           jsonb,                         -- contexte de l'op (pour rejeu manuel)
  attempts          int not null default 0 check (attempts >= 0),
  last_error        text,

  status            text not null default 'open'
                    check (status in ('open','retrying','resolved','abandoned')),
  resolved_at       timestamptz,
  resolved_by       uuid references auth.users(id) on delete set null,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger trg_inv_failed_operations_updated_at
  before update on inv_failed_operations
  for each row execute function public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- INV_RECONCILIATION_RUNS — passe DEEP↔chaîne (04 §5.2 / Edge inv-reconciliation-tick)
-- ═══════════════════════════════════════════════════════════════════════════
-- Pour chaque deal, toutes les 5 min : compare SUM(inv_cap_table_entries) [vérité]
-- vs balances ERC-3643 (inv_token_mints/chain). Écrit le drift + actions. Règle
-- d'or : DEEP gagne ; chaîne > DEEP ⇒ pause() (anomalie de sécurité).
create table if not exists inv_reconciliation_runs (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         text not null default 'real-estate-agent',

  deal_id           uuid not null references inv_deals(id) on delete cascade,
  bond_tranche_id   uuid references inv_bond_tranches(id) on delete set null,

  -- résultat de la passe
  result            text not null default 'in_sync'
                    check (result in ('in_sync','mint_missing','chain_exceeds_deep','transfer_unmirrored','error')),
  drift             jsonb,                         -- détail de l'écart par wallet/position
  actions           jsonb,                         -- corrections appliquées (mint idempotent, pause, etc.)

  status            text not null default 'completed'
                    check (status in ('running','completed','failed')),
  -- anomalie grave (chaîne > DEEP) → contrat mis en pause + escalade
  triggered_pause   boolean not null default false,
  error_message     text,

  started_at        timestamptz not null default now(),
  finished_at       timestamptz,

  created_at        timestamptz not null default now()
  -- append-only de fait (un run = une ligne) : pas d'updated_at.
);

-- ═══════════════════════════════════════════════════════════════════════════
-- INV_APPROVALS — 4-eyes (04 §6.3 / blueprint) : double validation
-- ═══════════════════════════════════════════════════════════════════════════
-- Actions à risque (publish deal, close, transfert au-delà d'un seuil) exigent
-- une double validation (operator + compliance). approver_1 ≠ approver_2.
create table if not exists inv_approvals (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         text not null default 'real-estate-agent',

  -- l'action soumise à 4-eyes et son sujet (polymorphe)
  action            text not null
                    check (action in ('deal_publish','deal_close','transfer_over_threshold',
                                      'kiis_publish','refund_override','operator_activate')),
  subject_type      text not null,                 -- 'inv_deal','inv_secondary_order',...
  subject_id        uuid not null,

  -- les deux valideurs distincts
  approver_1        uuid references auth.users(id) on delete set null,
  approver_1_at     timestamptz,
  approver_2        uuid references auth.users(id) on delete set null,
  approver_2_at     timestamptz,

  status            text not null default 'pending'
                    check (status in ('pending','approved','rejected','expired')),
  reason            text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- garde 4-eyes : les deux approbateurs doivent être différents
  constraint chk_inv_approval_distinct
    check (approver_1 is null or approver_2 is null or approver_1 <> approver_2)
);

create trigger trg_inv_approvals_updated_at
  before update on inv_approvals
  for each row execute function public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- INV_DEAL_MILESTONES — jalons opérationnels (⑦ Distribution & Lifecycle, 04 §3)
-- ═══════════════════════════════════════════════════════════════════════════
-- Avancement travaux, photos, LTV temps réel. Suivi de l'opération post-closing.
create table if not exists inv_deal_milestones (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         text not null default 'real-estate-agent',

  deal_id           uuid not null references inv_deals(id) on delete cascade,

  label             text not null,                 -- ex: 'Acquisition signée','Permis purgé','Travaux 50%'
  milestone_type    text not null default 'works'
                    check (milestone_type in ('acquisition','permit','works','marketing','sale','exit','other')),
  status            text not null default 'planned'
                    check (status in ('planned','in_progress','done','delayed','cancelled')),
  progress_pct      numeric(5,2) check (progress_pct is null or (progress_pct >= 0 and progress_pct <= 100)),

  -- snapshot LTV au jalon (suivi du risque)
  ltv_pct_snapshot  numeric(5,2) check (ltv_pct_snapshot is null or (ltv_pct_snapshot >= 0 and ltv_pct_snapshot <= 200)),

  planned_date      date,
  actual_date       date,
  notes             text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger trg_inv_deal_milestones_updated_at
  before update on inv_deal_milestones
  for each row execute function public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- INV_REPORTS — reporting trimestriel investisseur + IFU (⑦, 04 §3)
-- ═══════════════════════════════════════════════════════════════════════════
-- Reporting de suivi par deal exposé aux investisseurs (distinct du reporting
-- réglementaire PSFP/AMF qui vit dans inv_regulatory_reports — 0022).
create table if not exists inv_reports (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         text not null default 'real-estate-agent',

  deal_id           uuid references inv_deals(id) on delete cascade,

  report_type       text not null
                    check (report_type in ('quarterly_update','annual_update','ifu','milestone_update','final_report')),
  period_start      date,
  period_end        date,
  title             text not null,
  payload           jsonb,                         -- contenu structuré du rapport
  -- lien vers le PDF généré (GED)
  document_id       uuid references inv_documents(id) on delete set null,

  status            text not null default 'draft'
                    check (status in ('draft','published','archived')),
  published_at      timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger trg_inv_reports_updated_at
  before update on inv_reports
  for each row execute function public.set_updated_at();

-- ─── INDEX (un par FK + tenant + filtres) ────────────────────────────────────
create index if not exists idx_inv_idem_tenant            on inv_idempotency_keys(tenant_id);
create index if not exists idx_inv_idem_user              on inv_idempotency_keys(user_id);
create index if not exists idx_inv_idem_status            on inv_idempotency_keys(status);

create index if not exists idx_inv_webhook_tenant         on inv_webhook_events(tenant_id);
create index if not exists idx_inv_webhook_provider       on inv_webhook_events(provider);
create index if not exists idx_inv_webhook_status         on inv_webhook_events(status);

create index if not exists idx_inv_failed_ops_tenant      on inv_failed_operations(tenant_id);
create index if not exists idx_inv_failed_ops_deal        on inv_failed_operations(deal_id);
create index if not exists idx_inv_failed_ops_sub         on inv_failed_operations(subscription_id);
create index if not exists idx_inv_failed_ops_resolved_by on inv_failed_operations(resolved_by);
create index if not exists idx_inv_failed_ops_status      on inv_failed_operations(status);

create index if not exists idx_inv_recon_tenant           on inv_reconciliation_runs(tenant_id);
create index if not exists idx_inv_recon_deal             on inv_reconciliation_runs(deal_id);
create index if not exists idx_inv_recon_tranche          on inv_reconciliation_runs(bond_tranche_id);
create index if not exists idx_inv_recon_result           on inv_reconciliation_runs(result);

create index if not exists idx_inv_approvals_tenant       on inv_approvals(tenant_id);
create index if not exists idx_inv_approvals_subject      on inv_approvals(subject_type, subject_id);
create index if not exists idx_inv_approvals_approver1    on inv_approvals(approver_1);
create index if not exists idx_inv_approvals_approver2    on inv_approvals(approver_2);
create index if not exists idx_inv_approvals_status       on inv_approvals(status);

create index if not exists idx_inv_milestones_tenant      on inv_deal_milestones(tenant_id);
create index if not exists idx_inv_milestones_deal        on inv_deal_milestones(deal_id);
create index if not exists idx_inv_milestones_status      on inv_deal_milestones(status);

create index if not exists idx_inv_reports_tenant         on inv_reports(tenant_id);
create index if not exists idx_inv_reports_deal           on inv_reports(deal_id);
create index if not exists idx_inv_reports_document       on inv_reports(document_id);
create index if not exists idx_inv_reports_status         on inv_reports(status);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table inv_idempotency_keys   enable row level security;
alter table inv_webhook_events     enable row level security;
alter table inv_failed_operations  enable row level security;
alter table inv_reconciliation_runs enable row level security;
alter table inv_approvals          enable row level security;
alter table inv_deal_milestones    enable row level security;
alter table inv_reports            enable row level security;

-- inv_idempotency_keys : artefact de robustesse côté service-role. On expose une
-- LECTURE owner+tenant (debug self) ; l'écriture passe par le service-role.
drop policy if exists "tenant idempotency read" on inv_idempotency_keys;
create policy "tenant idempotency read" on inv_idempotency_keys for select
  using ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()));

-- inv_webhook_events : interne (service-role). Lecture restreinte au tenant
-- (back-office / debug) ; pas d'écriture client.
drop policy if exists "tenant webhook events read" on inv_webhook_events;
create policy "tenant webhook events read" on inv_webhook_events for select
  using (tenant_id = (select public.current_tenant_id()));

-- inv_failed_operations : DLQ back-office. Lecture tenant ; écriture service-role.
drop policy if exists "tenant failed ops read" on inv_failed_operations;
create policy "tenant failed ops read" on inv_failed_operations for select
  using (tenant_id = (select public.current_tenant_id()));

-- inv_reconciliation_runs : observabilité du tenant en lecture ; écriture Edge/service-role.
drop policy if exists "tenant reconciliation read" on inv_reconciliation_runs;
create policy "tenant reconciliation read" on inv_reconciliation_runs for select
  using (tenant_id = (select public.current_tenant_id()));

-- inv_approvals : visibilité tenant (les valideurs doivent voir la file 4-eyes) ;
-- l'écriture (acte d'approbation) passe par le back-office service-role.
drop policy if exists "tenant approvals read" on inv_approvals;
create policy "tenant approvals read" on inv_approvals for select
  using (tenant_id = (select public.current_tenant_id()));

-- inv_deal_milestones : catalogue de suivi → lecture tenant ; écriture service-role.
drop policy if exists "tenant milestones read" on inv_deal_milestones;
create policy "tenant milestones read" on inv_deal_milestones for select
  using (tenant_id = (select public.current_tenant_id()));

-- inv_reports : reporting investisseur → lecture des rapports publiés du tenant ;
-- écriture service-role/back-office.
drop policy if exists "tenant reports read" on inv_reports;
create policy "tenant reports read" on inv_reports for select
  using (tenant_id = (select public.current_tenant_id()) and status = 'published');

-- ─── COMMENTAIRES ────────────────────────────────────────────────────────────
comment on table inv_idempotency_keys is 'Pattern A (04 §7) : idempotence de commande vers les tiers (mint/escrow/esign). INSERT ON CONFLICT DO NOTHING. Garantit I8.';
comment on table inv_webhook_events is 'Pattern B (04 §7) : webhooks signés + dédup par (provider, provider_event_id) UNIQUE. Le webhook enfile un event, ne fait pas la logique inline.';
comment on table inv_failed_operations is 'Pattern C (04 §7) : Dead Letter Queue des appels sortants échoués après retries. Rejeu sûr car commandes idempotentes.';
comment on table inv_reconciliation_runs is 'Passe DEEP↔chaîne (Edge inv-reconciliation-tick, 5 min). Règle d''or : DEEP gagne ; chaîne>DEEP ⇒ pause() (triggered_pause).';
comment on table inv_approvals is '4-eyes : double validation (operator+compliance) sur publish/close/transfert>seuil. approver_1 ≠ approver_2 (CHECK).';
comment on table inv_deal_milestones is 'Jalons opérationnels post-closing (travaux, permis, LTV temps réel). Contexte ⑦ Distribution & Lifecycle.';
comment on table inv_reports is 'Reporting de suivi investisseur (trimestriel/IFU) par deal. Distinct du reporting réglementaire PSFP (inv_regulatory_reports, 0022).';
