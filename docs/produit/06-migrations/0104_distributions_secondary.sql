-- ═══════════════════════════════════════════════════════════════════════════
-- 0104 — TOKENISATION : distributions + secondary_orders (bulletin board)
-- ═══════════════════════════════════════════════════════════════════════════
-- DISTRIBUTIONS (P5 §13-14) : coupons (locatif) ou versement à l'exit (MdB),
--   selon le WATERFALL du deal, en EUR ou stablecoin. VARIABLE, NON garanti.
--   Modèle à 2 niveaux : un « événement » de distribution (au niveau tranche)
--   + des « parts » par détenteur (distribution_payouts), au prorata du solde.
--
-- SECONDARY_ORDERS (P5 §16, P9) : marché secondaire = BULLETIN BOARD UNIQUEMENT
--   (art. 25 ECSP). ⚠️ PAS de matching automatique, PAS de carnet d'ordres
--   apparié, PAS de MTF (sinon DLT Pilot requis). C'est un simple BABILLARD
--   d'intentions ; l'exécution est un transfert P2P whitelisté (token_mints
--   operation='transfer') validé hors-bande. On le matérialise par des
--   « annonces » d'achat/vente sans appariement automatique en base.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- DISTRIBUTIONS — événement de versement au niveau d'une tranche
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.distributions (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         text not null default 'real-estate-agent'
                    references public.tenants(id) on delete restrict,

  deal_id           uuid not null references public.deals(id) on delete restrict,
  bond_tranche_id   uuid not null references public.bond_tranches(id) on delete restrict,

  -- nature du flux (cohérent avec le waterfall)
  distribution_type text not null
                    check (distribution_type in (
                      'coupon',           -- intérêt périodique (locatif)
                      'principal',        -- remboursement du principal (exit/maturity)
                      'principal_partial',-- remboursement partiel
                      'performance',      -- prime de performance au-delà du hurdle
                      'final'             -- versement final combiné (exit MdB)
                    )),

  -- montants au niveau tranche (la répartition est dans distribution_payouts)
  gross_amount_eur  numeric(16,2) not null check (gross_amount_eur >= 0),
  currency          text not null default 'EUR'
                    check (currency in ('EUR','EURC','EURe')),

  -- rang waterfall appliqué (traçabilité de l'ordre de paiement)
  waterfall_rank    int check (waterfall_rank is null or waterfall_rank >= 1),

  -- période couverte (pour coupons)
  period_start      date,
  period_end        date,
  record_date       date,                    -- date d'arrêté des positions (qui est payé)
  payment_date      date,

  status            text not null default 'planned'
                    check (status in ('planned','approved','paid','partial','cancelled')),

  -- déclaratif fiscal (IFU généré ailleurs ; on garde le flag)
  tax_reportable    boolean not null default true,

  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger trg_distributions_updated_at
  before update on public.distributions
  for each row execute function public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- DISTRIBUTION_PAYOUTS — part d'un détenteur dans une distribution
-- ═══════════════════════════════════════════════════════════════════════════
-- Au prorata du solde (cap_table) à la record_date. C'est ce que reçoit
-- réellement chaque investisseur (net de retenues éventuelles).
create table if not exists public.distribution_payouts (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         text not null default 'real-estate-agent'
                    references public.tenants(id) on delete restrict,

  distribution_id   uuid not null references public.distributions(id) on delete cascade,
  -- le bénéficiaire
  holder_profile_id uuid not null references public.investor_profiles(id) on delete restrict,
  holder_user_id    uuid not null references auth.users(id) on delete restrict,
  -- position de référence
  bond_tranche_id   uuid not null references public.bond_tranches(id) on delete restrict,

  units_held        bigint not null check (units_held > 0),    -- solde à la record_date
  gross_amount_eur  numeric(16,2) not null check (gross_amount_eur >= 0),
  withholding_eur   numeric(16,2) not null default 0 check (withholding_eur >= 0),  -- retenue éventuelle
  net_amount_eur    numeric(16,2) not null check (net_amount_eur >= 0),

  -- règlement
  currency          text not null default 'EUR'
                    check (currency in ('EUR','EURC','EURe')),
  -- versé via le séquestre/EMI (EUR) ou on-chain (stablecoin)
  payment_reference text,
  onchain_tx_hash   text check (onchain_tx_hash is null or onchain_tx_hash ~ '^0x[a-fA-F0-9]{64}$'),

  status            text not null default 'pending'
                    check (status in ('pending','paid','failed','reversed')),
  paid_at           timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- net = brut - retenue (cohérence)
  constraint chk_payout_net check (abs(net_amount_eur - (gross_amount_eur - withholding_eur)) < 0.01),
  -- un seul payout par (distribution, détenteur)
  constraint uq_payout_distribution_holder unique (distribution_id, holder_profile_id)
);

create trigger trg_distribution_payouts_updated_at
  before update on public.distribution_payouts
  for each row execute function public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- SECONDARY_ORDERS — BULLETIN BOARD (art. 25 ECSP) — PAS de matching auto
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ CONTRAINTE RÉGLEMENTAIRE FORTE : ceci est un BABILLARD d'annonces, PAS un
-- carnet d'ordres apparié ni une MTF. Aucun appariement automatique n'est
-- réalisé en base. Une annonce exprime une INTENTION (acheter/vendre des
-- obligations d'une tranche). L'exécution = transfert P2P whitelisté hors-bande
-- (token_mints operation='transfer' + nouvelle ligne cap_table_entries), entre
-- investisseurs éligibles (KYC/whitelist). Le champ matched_* ne stocke qu'un
-- RAPPROCHEMENT MANUEL/déclaratif a posteriori, jamais un matching de marché.
create table if not exists public.secondary_orders (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         text not null default 'real-estate-agent'
                    references public.tenants(id) on delete restrict,

  -- l'annonceur + son profil
  user_id           uuid not null references auth.users(id) on delete cascade,
  investor_profile_id uuid not null references public.investor_profiles(id) on delete restrict,

  -- la tranche concernée (toujours rattaché à un instrument précis)
  bond_tranche_id   uuid not null references public.bond_tranches(id) on delete restrict,
  deal_id           uuid not null references public.deals(id) on delete restrict,

  side              text not null check (side in ('buy','sell')),

  -- quantité & prix INDICATIFS (le prix est libre entre parties, non coté)
  units             bigint not null check (units > 0),
  indicative_price_eur numeric(16,2) check (indicative_price_eur is null or indicative_price_eur > 0),

  -- cycle de vie de l'annonce (PAS un statut d'exécution de marché)
  status            text not null default 'open'
                    check (status in ('open','withdrawn','expired','settled')),
  expires_at        timestamptz,

  -- rapprochement DÉCLARATIF a posteriori (transfert P2P réalisé hors-bande) —
  -- NE constitue PAS un matching automatique de plateforme.
  settled_via_token_mint_id uuid references public.token_mints(id) on delete set null,
  counterparty_profile_id   uuid references public.investor_profiles(id) on delete set null,
  settled_at        timestamptz,

  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger trg_secondary_orders_updated_at
  before update on public.secondary_orders
  for each row execute function public.set_updated_at();

-- ─── INDEX (un par FK + tenant + filtres) ────────────────────────────────────
create index if not exists idx_distributions_tenant  on public.distributions(tenant_id);
create index if not exists idx_distributions_deal     on public.distributions(deal_id);
create index if not exists idx_distributions_tranche  on public.distributions(bond_tranche_id);
create index if not exists idx_distributions_status   on public.distributions(status);

create index if not exists idx_payouts_tenant        on public.distribution_payouts(tenant_id);
create index if not exists idx_payouts_distribution   on public.distribution_payouts(distribution_id);
create index if not exists idx_payouts_holder_prof    on public.distribution_payouts(holder_profile_id);
create index if not exists idx_payouts_holder_user    on public.distribution_payouts(holder_user_id);
create index if not exists idx_payouts_tranche        on public.distribution_payouts(bond_tranche_id);
create index if not exists idx_payouts_status         on public.distribution_payouts(status);

create index if not exists idx_secondary_tenant      on public.secondary_orders(tenant_id);
create index if not exists idx_secondary_user         on public.secondary_orders(user_id);
create index if not exists idx_secondary_profile      on public.secondary_orders(investor_profile_id);
create index if not exists idx_secondary_tranche      on public.secondary_orders(bond_tranche_id);
create index if not exists idx_secondary_deal         on public.secondary_orders(deal_id);
create index if not exists idx_secondary_status       on public.secondary_orders(status);
create index if not exists idx_secondary_mint         on public.secondary_orders(settled_via_token_mint_id);
create index if not exists idx_secondary_counterparty on public.secondary_orders(counterparty_profile_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.distributions        enable row level security;
alter table public.distribution_payouts enable row level security;
alter table public.secondary_orders     enable row level security;

-- distributions : événement au niveau tranche → LECTURE pour membres du tenant
-- (un investisseur de la tranche doit voir l'historique des distributions).
drop policy if exists "tenant distributions read" on public.distributions;
create policy "tenant distributions read" on public.distributions for select
  using (tenant_id = (select public.current_tenant_id()));

-- distribution_payouts : strictement le bénéficiaire.
drop policy if exists "tenant payouts read" on public.distribution_payouts;
create policy "tenant payouts read" on public.distribution_payouts for select
  using ((select auth.uid()) = holder_user_id and tenant_id = (select public.current_tenant_id()));

-- secondary_orders : le babillard est VISIBLE par tous les membres du tenant
-- (c'est son objet : afficher les intentions), mais on n'autorise l'écriture
-- (INSERT/UPDATE/DELETE) qu'à l'auteur de l'annonce.
drop policy if exists "tenant secondary read" on public.secondary_orders;
create policy "tenant secondary read" on public.secondary_orders for select
  using (tenant_id = (select public.current_tenant_id()));

drop policy if exists "tenant secondary write own" on public.secondary_orders;
create policy "tenant secondary write own" on public.secondary_orders for insert
  with check ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()));

drop policy if exists "tenant secondary update own" on public.secondary_orders;
create policy "tenant secondary update own" on public.secondary_orders for update
  using ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()))
  with check ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()));

drop policy if exists "tenant secondary delete own" on public.secondary_orders;
create policy "tenant secondary delete own" on public.secondary_orders for delete
  using ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()));

-- ─── COMMENTAIRES ────────────────────────────────────────────────────────────
comment on table public.distributions is 'Événement de versement au niveau tranche (coupon/principal/performance), selon le waterfall. VARIABLE et NON garanti.';
comment on table public.distribution_payouts is 'Part d''un détenteur dans une distribution, au prorata du solde à la record_date. Net = brut - retenue.';
comment on table public.secondary_orders is 'BULLETIN BOARD art. 25 ECSP : babillard d''intentions. PAS de matching auto, PAS de MTF. Exécution = transfert P2P whitelisté hors-bande.';
comment on column public.secondary_orders.settled_via_token_mint_id is 'Rapprochement DÉCLARATIF a posteriori d''un transfert P2P réel. Ne constitue PAS un appariement de marché.';
comment on column public.secondary_orders.indicative_price_eur is 'Prix INDICATIF libre entre parties. Aucune cotation, aucun appariement automatique (sinon MTF/DLT Pilot requis).';
