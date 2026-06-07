-- ═══════════════════════════════════════════════════════════════════════════
-- 0103 — TOKENISATION : cap_table_entries (DEEP, source de vérité) + token_mints (miroir on-chain)
-- ═══════════════════════════════════════════════════════════════════════════
-- DUALITÉ ON-CHAIN / OFF-CHAIN — règle d'or de l'étude (P9) :
--   • Le REGISTRE LÉGAL DEEP (Ord. 2017-1674) est la SOURCE DE VÉRITÉ. Il vaut
--     inscription en compte-titres. → cap_table_entries.
--   • Le token ERC-3643 on-chain est un MIROIR. → token_mints décrit chaque
--     opération on-chain (mint/burn/transfer/freeze) et son état de
--     RÉCONCILIATION avec le registre légal.
--   • En cas de divergence, le DEEP prime (champ reconciliation_status).
--
-- cap_table_entries modélise les POSITIONS de créanciers obligataires par
-- (tranche, investisseur). C'est l'état courant + l'historique des mouvements
-- légaux (event-sourced léger : chaque mouvement est une ligne, la position
-- courante est dérivable / dénormalisée).
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- CAP_TABLE_ENTRIES — registre légal des positions obligataires (DEEP)
-- ═══════════════════════════════════════════════════════════════════════════
-- Chaque ligne = un MOUVEMENT inscrit au registre (issuance/transfer/redemption).
-- L'unicité d'une position « courante » se reconstruit par agrégation ; on
-- maintient aussi un solde courant pour requêtes rapides.
create table if not exists public.cap_table_entries (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         text not null default 'real-estate-agent'
                    references public.tenants(id) on delete restrict,

  -- la tranche obligataire concernée + son deal/spv (dénormalisé pour requêtes)
  bond_tranche_id   uuid not null references public.bond_tranches(id) on delete restrict,
  deal_id           uuid not null references public.deals(id) on delete restrict,

  -- le détenteur : investisseur (profil) — peut être null pour l'émetteur SPV
  -- (ex: obligations non encore placées détenues par la SPV).
  holder_profile_id uuid references public.investor_profiles(id) on delete restrict,
  holder_user_id    uuid references auth.users(id) on delete restrict,

  -- la souscription d'origine (pour issuance ; null pour transfert secondaire)
  subscription_id   uuid references public.subscriptions(id) on delete set null,

  -- nature du mouvement légal
  entry_type        text not null
                    check (entry_type in (
                      'issuance',     -- émission primaire (au closing)
                      'transfer_in',  -- entrée par transfert secondaire (P2P whitelisté)
                      'transfer_out', -- sortie par transfert secondaire
                      'redemption',   -- remboursement (exit) → extinction
                      'correction'    -- correction administrative (rare, tracée)
                    )),

  -- quantité d'obligations et nominal (signé selon in/out géré par entry_type)
  units             bigint not null check (units > 0),
  nominal_eur       numeric(16,2) not null check (nominal_eur > 0),

  -- SOLDE COURANT du détenteur sur cette tranche APRÈS ce mouvement
  -- (dénormalisé pour éviter de ré-agréger ; maintenu applicativement/service-role)
  balance_units_after bigint not null check (balance_units_after >= 0),

  -- ── ANCRAGE LÉGAL (DEEP = source de vérité) ──
  deep_register_ref text,                       -- réf de l'inscription DEEP du mouvement
  legal_recorded_at timestamptz not null default now(),

  -- ── LIEN MIROIR ON-CHAIN ──
  -- pointe vers l'opération on-chain correspondante (token_mints), si reflétée.
  -- FK ajoutée après création de token_mints (dépendance circulaire) → en bas.
  token_mint_id     uuid,

  -- état de réconciliation off-chain ↔ on-chain (le DEEP prime)
  reconciliation_status text not null default 'legal_only'
                    check (reconciliation_status in (
                      'legal_only',   -- inscrit DEEP, pas encore reflété on-chain
                      'synced',       -- DEEP et on-chain concordent
                      'divergent',    -- divergence détectée → investigation (DEEP prime)
                      'onchain_only'  -- détecté on-chain sans pendant légal (anomalie à régulariser)
                    )),

  notes             text,
  created_at        timestamptz not null default now()
  -- NB : pas d'updated_at : registre append-only (cf. correction = nouvelle ligne).
);

-- ═══════════════════════════════════════════════════════════════════════════
-- TOKEN_MINTS — opérations on-chain (miroir ERC-3643)
-- ═══════════════════════════════════════════════════════════════════════════
-- Journal des opérations du contrat ERC-3643 : mint/burn/transfer/freeze, avec
-- hash de transaction, statut on-chain, et lien vers l'entrée légale source.
create table if not exists public.token_mints (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         text not null default 'real-estate-agent'
                    references public.tenants(id) on delete restrict,

  bond_tranche_id   uuid not null references public.bond_tranches(id) on delete restrict,
  deal_id           uuid not null references public.deals(id) on delete restrict,

  -- le détenteur on-chain (wallet) + profil si connu
  holder_profile_id uuid references public.investor_profiles(id) on delete set null,
  to_wallet_address text check (to_wallet_address is null or to_wallet_address ~ '^0x[a-fA-F0-9]{40}$'),
  from_wallet_address text check (from_wallet_address is null or from_wallet_address ~ '^0x[a-fA-F0-9]{40}$'),

  -- type d'opération on-chain
  operation         text not null
                    check (operation in ('mint','burn','transfer','forced_transfer','freeze','unfreeze')),

  -- quantité on-chain (en unités d'obligation ; decimals porté par la tranche)
  units             bigint not null check (units > 0),

  -- ── ANCRAGE ON-CHAIN ──
  chain             text not null check (chain in ('polygon','base','ethereum','permissioned')),
  chain_id          int,
  contract_address  text check (contract_address is null or contract_address ~ '^0x[a-fA-F0-9]{40}$'),
  tx_hash           text check (tx_hash is null or tx_hash ~ '^0x[a-fA-F0-9]{64}$'),
  block_number      bigint,
  log_index         int,

  -- statut de l'opération on-chain
  status            text not null default 'pending'
                    check (status in ('pending','submitted','confirmed','failed','reverted')),
  confirmed_at      timestamptz,

  -- lien vers l'entrée légale source (DEEP = vérité)
  cap_table_entry_id uuid references public.cap_table_entries(id) on delete set null,

  -- compliance ERC-3643 : la vérification canTransfer/isVerified a-t-elle passé ?
  compliance_checked boolean not null default false,

  error_message     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- un même event on-chain est unique (tx_hash + log_index) quand renseignés
  constraint uq_token_mint_onchain_event unique (tx_hash, log_index)
);

create trigger trg_token_mints_updated_at
  before update on public.token_mints
  for each row execute function public.set_updated_at();

-- ─── FK circulaire : cap_table_entries.token_mint_id → token_mints.id ─────────
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'fk_cap_table_token_mint'
  ) then
    alter table public.cap_table_entries
      add constraint fk_cap_table_token_mint
      foreign key (token_mint_id) references public.token_mints(id) on delete set null;
  end if;
end $$;

-- ─── INDEX (un par FK + tenant + filtres) ────────────────────────────────────
create index if not exists idx_cap_table_tenant     on public.cap_table_entries(tenant_id);
create index if not exists idx_cap_table_tranche     on public.cap_table_entries(bond_tranche_id);
create index if not exists idx_cap_table_deal        on public.cap_table_entries(deal_id);
create index if not exists idx_cap_table_holder_prof on public.cap_table_entries(holder_profile_id);
create index if not exists idx_cap_table_holder_user on public.cap_table_entries(holder_user_id);
create index if not exists idx_cap_table_subscription on public.cap_table_entries(subscription_id);
create index if not exists idx_cap_table_token_mint  on public.cap_table_entries(token_mint_id);
create index if not exists idx_cap_table_recon       on public.cap_table_entries(reconciliation_status);
-- position courante par (tranche, holder) : requête la plus fréquente
create index if not exists idx_cap_table_position    on public.cap_table_entries(bond_tranche_id, holder_profile_id);

create index if not exists idx_token_mints_tenant    on public.token_mints(tenant_id);
create index if not exists idx_token_mints_tranche   on public.token_mints(bond_tranche_id);
create index if not exists idx_token_mints_deal      on public.token_mints(deal_id);
create index if not exists idx_token_mints_holder    on public.token_mints(holder_profile_id);
create index if not exists idx_token_mints_cap_entry on public.token_mints(cap_table_entry_id);
create index if not exists idx_token_mints_status    on public.token_mints(status);
create index if not exists idx_token_mints_tx        on public.token_mints(tx_hash);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- cap_table_entries : l'investisseur voit SES positions (holder_user_id) ;
-- l'écriture (inscription au registre) est service-role exclusivement.
alter table public.cap_table_entries enable row level security;
alter table public.token_mints       enable row level security;

drop policy if exists "tenant cap_table read" on public.cap_table_entries;
create policy "tenant cap_table read" on public.cap_table_entries for select
  using ((select auth.uid()) = holder_user_id and tenant_id = (select public.current_tenant_id()));

-- token_mints : l'investisseur voit les opérations liées à SON profil.
drop policy if exists "tenant token_mints read" on public.token_mints;
create policy "tenant token_mints read" on public.token_mints for select
  using (
    tenant_id = (select public.current_tenant_id())
    and exists (
      select 1 from public.investor_profiles p
      where p.id = token_mints.holder_profile_id
        and p.user_id = (select auth.uid())
        and p.tenant_id = (select public.current_tenant_id())
    )
  );

-- ─── COMMENTAIRES ────────────────────────────────────────────────────────────
comment on table public.cap_table_entries is 'Registre LÉGAL des positions obligataires (DEEP = SOURCE DE VÉRITÉ, Ord. 2017-1674). Append-only. Le DEEP prime sur l''on-chain.';
comment on table public.token_mints is 'Journal des opérations on-chain ERC-3643 (MIROIR). Réconcilié au registre légal via cap_table_entry_id. En cas de divergence, le DEEP prime.';
comment on column public.cap_table_entries.reconciliation_status is 'legal_only=inscrit DEEP non reflété; synced=concordant; divergent=anomalie (DEEP prime); onchain_only=détecté on-chain sans pendant légal.';
comment on column public.cap_table_entries.balance_units_after is 'Solde courant du détenteur sur la tranche après ce mouvement (dénormalisé pour requêtes rapides).';
