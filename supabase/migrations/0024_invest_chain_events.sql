-- ═══════════════════════════════════════════════════════════════════════════
-- 0024 — INVEST : inv_chain_events (events on-chain indexés — réconciliation §5.2)
-- ═══════════════════════════════════════════════════════════════════════════
-- Epic 1.4 (SAGA DE CLOSING / DvP). Les ports/types référençaient déjà
-- `inv_chain_events` (lib/invest/ports/chain.ts : "aligné inv_chain_events / I1
-- unique tx_hash+log_index") mais la table n'existait pas. Cette migration la
-- crée — c'est la seule table absente nécessaire à la saga de closing.
--
-- RÔLE : journal LECTURE-SEULE des events ERC-3643 observés on-chain (mint/burn/
-- transfer). Alimenté par le webhook signé `/api/invest/webhooks/chain`
-- (Pattern B) — JAMAIS source de vérité (I1 : le DEEP/inv_cap_table_entries prime).
-- La passe de réconciliation (inv_reconciliation_runs) compare
--   Σ inv_cap_table_entries (DEEP, vérité)  vs  Σ inv_chain_events (chaîne, miroir).
-- chaîne > DEEP ⇒ anomalie → pause + escalade ; chaîne < DEEP ⇒ mint_missing.
--
-- Conventions identiques à 0018/0021 : tenant_id text ; RLS tenant-read,
-- écriture service-role ; index par FK + filtres ; unicité (tx_hash, log_index).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists inv_chain_events (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         text not null default 'real-estate-agent',

  -- rattachement métier (dénormalisé pour la réconciliation par deal/tranche)
  deal_id           uuid references inv_deals(id) on delete set null,
  bond_tranche_id   uuid references inv_bond_tranches(id) on delete set null,

  -- ── ANCRAGE ON-CHAIN ──
  contract_address  text check (contract_address is null or contract_address ~ '^0x[a-fA-F0-9]{40}$'),
  chain             text,
  chain_id          int,
  tx_hash           text not null check (tx_hash ~ '^0x[a-fA-F0-9]{64}$'),
  log_index         int not null default 0,
  block_number      bigint,

  -- type d'event indexé (Transfer/Mint/Burn… selon l'ABI ERC-3643)
  event_name        text not null,
  -- wallet & quantité extraits du log (réflexion de la position on-chain)
  from_wallet       text check (from_wallet is null or from_wallet ~ '^0x[a-fA-F0-9]{40}$'),
  to_wallet         text check (to_wallet is null or to_wallet ~ '^0x[a-fA-F0-9]{40}$'),
  units             bigint check (units is null or units >= 0),

  -- corps brut indexé (après vérif signature webhook)
  payload           jsonb,

  -- gate confirmations (≥ N avant prise en compte par la réconciliation)
  confirmations     int not null default 0 check (confirmations >= 0),

  observed_at       timestamptz not null default now(),
  created_at        timestamptz not null default now(),

  -- I1 : un même event on-chain est unique (tx_hash + log_index)
  constraint uq_inv_chain_event_onchain unique (tx_hash, log_index)
);

-- ─── INDEX (un par FK + tenant + filtres) ────────────────────────────────────
create index if not exists idx_inv_chain_events_tenant     on inv_chain_events(tenant_id);
create index if not exists idx_inv_chain_events_deal       on inv_chain_events(deal_id);
create index if not exists idx_inv_chain_events_tranche    on inv_chain_events(bond_tranche_id);
create index if not exists idx_inv_chain_events_contract   on inv_chain_events(contract_address);
create index if not exists idx_inv_chain_events_tx         on inv_chain_events(tx_hash);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- Observabilité du tenant en LECTURE ; écriture réservée au service-role (webhook).
alter table inv_chain_events enable row level security;

drop policy if exists "tenant chain_events read" on inv_chain_events;
create policy "tenant chain_events read" on inv_chain_events for select
  using (tenant_id = (select public.current_tenant_id()));

-- ─── COMMENTAIRES ────────────────────────────────────────────────────────────
comment on table inv_chain_events is 'Journal LECTURE-SEULE des events ERC-3643 on-chain (réconciliation §5.2). MIROIR, jamais source de vérité (I1 : DEEP prime). Unicité (tx_hash, log_index).';
comment on column inv_chain_events.units is 'Quantité d''obligations reflétée par l''event on-chain (sommée par la réconciliation et comparée à Σ DEEP).';
comment on column inv_chain_events.confirmations is 'Nb de confirmations à l''observation : gate ≥ N avant prise en compte (jamais d''écriture de propriété depuis un event — I1).';
