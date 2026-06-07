-- ═══════════════════════════════════════════════════════════════════════════
-- 0102 — TOKENISATION : subscriptions, escrow_movements
-- ═══════════════════════════════════════════════════════════════════════════
-- Modélise le parcours de souscription (P5) et le flux de fonds (P10) :
--   réservation NON engageante (soft-commit, AUCUN versement)
--     → signature eIDAS (bulletin + contrat d'émission)
--     → dépôt en SÉQUESTRE TIERS (notaire/EMI) — la plateforme n'encaisse JAMAIS
--     → closing (levée atteinte + prêt accordé) → déblocage + mint
--     → si échec : remboursement intégral depuis le séquestre.
--
-- Anti-FIA : une subscription cible TOUJOURS une tranche d'un deal PRÉCIS, déjà
-- choisi par l'investisseur. Aucun versement avant choix d'un deal = pas de
-- pré-collecte. Le séquestre est un TIERS (escrow_provider) ; la plateforme ne
-- détient pas les fonds → escrow_movements référence un compte externe.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- SUBSCRIPTIONS — engagement d'un investisseur sur UNE tranche d'UN deal
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.subscriptions (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         text not null default 'real-estate-agent'
                    references public.tenants(id) on delete restrict,

  -- l'investisseur (owner de la souscription) + son profil
  user_id           uuid not null references auth.users(id) on delete cascade,
  investor_profile_id uuid not null references public.investor_profiles(id) on delete restrict,

  -- la cible : UNE tranche d'UN deal (deal-by-deal réel)
  deal_id           uuid not null references public.deals(id) on delete restrict,
  bond_tranche_id   uuid not null references public.bond_tranches(id) on delete restrict,

  -- montant & quantité d'obligations
  amount_eur        numeric(16,2) not null check (amount_eur > 0),
  units             bigint not null check (units > 0),          -- nb d'obligations souscrites
  unit_price_eur    numeric(16,2) not null check (unit_price_eur > 0),  -- = nominal_unit au pair

  -- règlement choisi
  settlement_currency text not null default 'EUR'
                    check (settlement_currency in ('EUR','EURC','EURe')),

  -- ── MACHINE À ÉTATS du parcours (P5/P10) ──
  status            text not null default 'reserved'
                    check (status in (
                      'reserved',     -- soft-commit, AUCUN versement (clé anti-collecte)
                      'signed',       -- bulletin + contrat signés (eIDAS)
                      'funded',       -- fonds reçus en SÉQUESTRE TIERS
                      'allocated',    -- alloué au closing (déblocage + inscription DEEP)
                      'minted',       -- token ERC-3643 minté (miroir)
                      'refunded',     -- remboursé (deal annulé / échec levée)
                      'cancelled',    -- annulé avant versement
                      'withdrawn'     -- retrait pendant délai de réflexion (4j ECSP)
                    )),

  -- conformité ECSP : délai de réflexion 4 jours (non-avertis)
  -- after signature, l'investisseur peut se rétracter sans pénalité.
  cooling_off_ends_at timestamptz,
  withdrawn_at      timestamptz,

  -- signature électronique (eIDAS — Yousign/DocuSign)
  esign_provider    text check (esign_provider in ('yousign','docusign','other')),
  esign_envelope_id text,
  signed_at         timestamptz,

  -- jalons
  reserved_at       timestamptz not null default now(),
  funded_at         timestamptz,
  allocated_at      timestamptz,
  minted_at         timestamptz,
  refunded_at       timestamptz,

  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- cohérence montant = units * prix unitaire (tolérance arrondi)
  constraint chk_subscription_amount
    check (abs(amount_eur - (units * unit_price_eur)) < 0.01)
);

create trigger trg_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- ESCROW_MOVEMENTS — mouvements sur le compte SÉQUESTRE TIERS
-- ═══════════════════════════════════════════════════════════════════════════
-- [FAIT] Détenir des fonds clients en propre = service de paiement → la
-- plateforme ne détient JAMAIS les fonds. Tout transite par un séquestre tiers
-- (notaire / CARPA / cantonnement EMI). Cette table est un MIROIR comptable des
-- mouvements réels chez le tiers (réconciliation), pas un wallet interne.
create table if not exists public.escrow_movements (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         text not null default 'real-estate-agent'
                    references public.tenants(id) on delete restrict,

  -- rattachement : la souscription concernée (et donc le deal/tranche)
  subscription_id   uuid not null references public.subscriptions(id) on delete restrict,
  deal_id           uuid not null references public.deals(id) on delete restrict,
  user_id           uuid not null references auth.users(id) on delete restrict,

  -- nature du mouvement
  direction         text not null
                    check (direction in ('inflow','outflow')),
  movement_type     text not null
                    check (movement_type in (
                      'deposit',          -- investisseur → séquestre (inflow)
                      'release_to_spv',   -- séquestre → SPV au closing (outflow)
                      'refund',           -- séquestre → investisseur (outflow, deal annulé)
                      'fee'               -- séquestre → plateforme/opérateur (outflow, frais)
                    )),

  amount_eur        numeric(16,2) not null check (amount_eur > 0),
  currency          text not null default 'EUR'
                    check (currency in ('EUR','EURC','EURe')),

  -- IDENTITÉ DU SÉQUESTRE TIERS (jamais un compte plateforme)
  escrow_provider   text not null
                    check (escrow_provider in ('notaire','carpa','emi','psp_segregated')),
  escrow_account_ref text not null,                 -- réf compte séquestre (IBAN masqué / id EMI)

  -- traçabilité du virement / on-chain tx
  bank_reference    text,                           -- réf SEPA si EUR
  onchain_tx_hash   text check (onchain_tx_hash is null or onchain_tx_hash ~ '^0x[a-fA-F0-9]{64}$'),  -- si stablecoin

  -- statut de réconciliation avec le relevé du tiers
  status            text not null default 'pending'
                    check (status in ('pending','confirmed','reconciled','reversed','failed')),
  value_date        date,
  reconciled_at     timestamptz,

  -- LCB-FT : screening sur entrée stablecoin (Travel Rule)
  travel_rule_ok    boolean,                        -- null si EUR pur

  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger trg_escrow_movements_updated_at
  before update on public.escrow_movements
  for each row execute function public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGER — maintien de deals.raised_eur (montant confirmé en séquestre)
-- ═══════════════════════════════════════════════════════════════════════════
-- raised_eur = somme des subscriptions du deal dont le statut implique des
-- fonds réellement engagés/débloqués (funded/allocated/minted). Les statuts
-- reserved/signed (soft-commit, pas de versement) NE comptent PAS → anti
-- « collecte affichée » trompeuse. Recalcul complet (robuste, faible volume
-- par deal).
create or replace function public.recompute_deal_raised()
returns trigger language plpgsql set search_path = '' as $$
declare target_deal uuid;
begin
  target_deal := coalesce(new.deal_id, old.deal_id);
  update public.deals d
     set raised_eur = coalesce((
           select sum(s.amount_eur)
             from public.subscriptions s
            where s.deal_id = target_deal
              and s.status in ('funded','allocated','minted')
         ), 0)
   where d.id = target_deal;
  return null;  -- AFTER trigger
end; $$;

drop trigger if exists trg_subscriptions_recompute_raised on public.subscriptions;
create trigger trg_subscriptions_recompute_raised
  after insert or update of status, amount_eur or delete on public.subscriptions
  for each row execute function public.recompute_deal_raised();

-- ─── INDEX (un par FK + tenant + filtres) ────────────────────────────────────
create index if not exists idx_subscriptions_tenant   on public.subscriptions(tenant_id);
create index if not exists idx_subscriptions_user      on public.subscriptions(user_id);
create index if not exists idx_subscriptions_profile   on public.subscriptions(investor_profile_id);
create index if not exists idx_subscriptions_deal      on public.subscriptions(deal_id);
create index if not exists idx_subscriptions_tranche   on public.subscriptions(bond_tranche_id);
create index if not exists idx_subscriptions_status    on public.subscriptions(status);

create index if not exists idx_escrow_movements_tenant on public.escrow_movements(tenant_id);
create index if not exists idx_escrow_movements_sub    on public.escrow_movements(subscription_id);
create index if not exists idx_escrow_movements_deal   on public.escrow_movements(deal_id);
create index if not exists idx_escrow_movements_user   on public.escrow_movements(user_id);
create index if not exists idx_escrow_movements_status on public.escrow_movements(status);
create index if not exists idx_escrow_movements_type   on public.escrow_movements(movement_type);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.subscriptions    enable row level security;
alter table public.escrow_movements enable row level security;

-- subscriptions : owner + tenant (l'investisseur voit/gère ses souscriptions).
drop policy if exists "tenant subscriptions" on public.subscriptions;
create policy "tenant subscriptions" on public.subscriptions for all
  using ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()))
  with check ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()));

-- escrow_movements : owner + tenant en LECTURE (l'investisseur suit ses fonds).
-- L'écriture vient du service-role (réconciliation avec le tiers séquestre).
drop policy if exists "tenant escrow_movements read" on public.escrow_movements;
create policy "tenant escrow_movements read" on public.escrow_movements for select
  using ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()));

-- ─── COMMENTAIRES ────────────────────────────────────────────────────────────
comment on table public.subscriptions is 'Engagement sur UNE tranche d''UN deal précis (deal-by-deal). Statut reserved = soft-commit SANS versement (clé anti-pré-collecte). Délai 4j ECSP.';
comment on table public.escrow_movements is 'Miroir comptable du SÉQUESTRE TIERS (notaire/EMI). La plateforme ne détient JAMAIS les fonds. Réconciliation avec le relevé du tiers.';
comment on column public.subscriptions.cooling_off_ends_at is 'Délai de réflexion 4 jours (Règl. ECSP 2020/1503) pour non-avertis. Rétractation sans pénalité.';
comment on column public.escrow_movements.escrow_provider is 'TIERS uniquement (notaire/carpa/emi/psp_segregated). Jamais un compte plateforme (= service de paiement non autorisé).';
comment on function public.recompute_deal_raised is 'Maintient deals.raised_eur = somme des subscriptions funded/allocated/minted. Exclut reserved/signed (pas de versement).';
