-- ═══════════════════════════════════════════════════════════════════════════
-- 0101 — TOKENISATION : deals, spvs, bond_tranches
-- ═══════════════════════════════════════════════════════════════════════════
-- Cœur structurel anti-FIA :
--   • 1 SPV (SAS dédiée) = 1 opération (contrainte UNIQUE deal↔spv).
--   • L'investisseur souscrit une TRANCHE OBLIGATAIRE d'un deal PRÉCIS
--     (deal-by-deal réel) — il n'existe AUCUN agrégat/pool/fonds dans le schéma.
--   • Le token est un MIROIR : la source de vérité juridique est le registre
--     DEEP (cf. cap_table_entries en 0103). Ici on stocke les paramètres
--     d'émission et l'adresse du contrat ERC-3643 (jamais ERC-4626).
--   • La banque prête à la SPV (personne morale), pas au smart contract :
--     la dette senior est modélisée sur la SPV avec rang/hypothèque.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- SPVS — Special Purpose Vehicle : 1 SAS dédiée par opération
-- ═══════════════════════════════════════════════════════════════════════════
-- Détient l'immeuble, porte la dette senior (hypothèque), émet les obligations.
-- Ring-fencing : faillite isolée. SEULE une SAS/SA peut émettre des titres
-- financiers inscriptibles en DEEP (L.211-1 CMF) → legal_form contraint.
create table if not exists public.spvs (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         text not null default 'real-estate-agent'
                    references public.tenants(id) on delete restrict,

  -- opérateur qui pilote la SPV (perçoit le fee opérateur + carried)
  operator_id       uuid not null references public.operators(id) on delete restrict,

  -- identité juridique de la SPV (doit être une société par actions)
  legal_name        text not null,
  legal_form        text not null default 'SAS'
                    check (legal_form in ('SAS','SA')),       -- seules émettrices de titres financiers
  siren             text check (siren is null or siren ~ '^[0-9]{9}$'),
  rcs_city          text,
  share_capital_eur numeric(16,2) check (share_capital_eur is null or share_capital_eur >= 0),
  incorporated_at   date,

  -- l'actif immobilier porté (1 SPV = 1 actif/opération)
  asset_address     text,
  asset_city        text,
  asset_postal_code text,
  asset_type        text check (asset_type in ('residentiel','bureau','commerce','logistique','mixte','terrain','autre')),

  -- dette senior bancaire (prêtée à la SPV, hypothèque 1er rang)
  -- modélisée ici car structurellement liée à la SPV ; alimente LTV/waterfall.
  senior_debt_lender    text,
  senior_debt_amount_eur numeric(16,2) check (senior_debt_amount_eur is null or senior_debt_amount_eur >= 0),
  senior_debt_rank      int not null default 1 check (senior_debt_rank >= 1),
  mortgage_registered   boolean not null default false,        -- hypothèque inscrite (notaire)
  intercreditor_signed  boolean not null default false,        -- subordination obligations<senior

  status            text not null default 'forming'
                    check (status in ('forming','incorporated','funded','operating','liquidating','closed','defaulted')),
  notes             text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger trg_spvs_updated_at
  before update on public.spvs
  for each row execute function public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- DEALS — une opération d'investissement (= une levée sur une SPV)
-- ═══════════════════════════════════════════════════════════════════════════
-- 1 deal ↔ 1 SPV (UNIQUE). Porte l'économie de l'opération, le calendrier, les
-- badges, les paramètres de levée et le statut de souscription. C'est l'unité
-- de CHOIX deal-by-deal de l'investisseur.
create table if not exists public.deals (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         text not null default 'real-estate-agent'
                    references public.tenants(id) on delete restrict,

  -- 1 SPV = 1 opération (verrou anti-mutualisation au niveau du schéma)
  spv_id            uuid not null references public.spvs(id) on delete restrict,
  constraint uq_deal_spv unique (spv_id),

  operator_id       uuid not null references public.operators(id) on delete restrict,

  -- identité publique du deal
  slug              text not null,
  name              text not null,
  deal_type         text not null default 'marchand_de_biens'
                    check (deal_type in ('marchand_de_biens','promotion','locatif','value_add','mixte')),

  -- localisation (adresse exacte au closing/NDA → approximation publique)
  city              text,
  postal_code       text,
  country           char(2) not null default 'FR',

  -- ÉCONOMIE DE L'OPÉRATION (cf. fiche produit P7) — montants en centimes? non:
  -- on garde numeric(16,2) en EUR pour lisibilité, cohérent avec l'app existante.
  acquisition_price_eur numeric(16,2) check (acquisition_price_eur is null or acquisition_price_eur >= 0),
  notary_fees_eur       numeric(16,2) check (notary_fees_eur is null or notary_fees_eur >= 0),
  works_budget_eur      numeric(16,2) check (works_budget_eur is null or works_budget_eur >= 0),
  other_costs_eur       numeric(16,2) check (other_costs_eur is null or other_costs_eur >= 0),
  total_project_cost_eur numeric(16,2) check (total_project_cost_eur is null or total_project_cost_eur >= 0),

  senior_debt_eur       numeric(16,2) check (senior_debt_eur is null or senior_debt_eur >= 0),
  sponsor_equity_eur    numeric(16,2) check (sponsor_equity_eur is null or sponsor_equity_eur >= 0),

  -- expertise de valeur (base du LTV)
  appraised_value_eur   numeric(16,2) check (appraised_value_eur is null or appraised_value_eur >= 0),
  ltv_pct               numeric(5,2)  check (ltv_pct is null or (ltv_pct >= 0 and ltv_pct <= 200)),

  -- rendement CIBLE (jamais garanti) — interdit de promettre un taux
  target_irr_pct        numeric(5,2)  check (target_irr_pct is null or target_irr_pct >= 0),
  duration_months       int           check (duration_months is null or duration_months > 0),

  -- PARAMÈTRES DE LEVÉE
  target_raise_eur      numeric(16,2) not null check (target_raise_eur > 0),
  min_ticket_eur        numeric(16,2) not null default 1000 check (min_ticket_eur > 0),
  max_ticket_eur        numeric(16,2) check (max_ticket_eur is null or max_ticket_eur >= min_ticket_eur),
  -- montant déjà souscrit confirmé (dénormalisé, maintenu par trigger en 0102)
  raised_eur            numeric(16,2) not null default 0 check (raised_eur >= 0),

  -- règlement par défaut : EUR (séquestre). Stablecoin EURC/EURe en option.
  settlement_currency   text not null default 'EUR'
                        check (settlement_currency in ('EUR','EURC','EURe')),
  stablecoin_enabled    boolean not null default false,        -- via CASP régulé partenaire

  -- calendrier de la fenêtre de souscription
  opens_at              timestamptz,
  closes_at             timestamptz,
  closed_at             timestamptz,                            -- closing effectif
  constraint chk_deal_window check (closes_at is null or opens_at is null or closes_at >= opens_at),

  -- badges produit (P6) : tableau de codes vérifiables (pas du marketing)
  -- ex: ["marchand_de_biens","dette_bancaire","senior_secured","lock_up_24m","france"]
  badges                text[] not null default '{}',

  -- conformité offre : régime applicable à CE deal
  offering_regime       text not null default 'private_placement'
                        check (offering_regime in ('private_placement','ecsp','dis')),
  -- réservé aux avertis ? (gate de souscription)
  restricted_to_sophisticated boolean not null default false,

  -- WATERFALL (ordre de paiement à l'exit) — structure documentée, JSON ordonné
  -- [{ "rank":1, "label":"dette senior + intérêts" }, ...]
  waterfall             jsonb not null default '[]',

  -- machine à états du deal
  status                text not null default 'draft'
                        check (status in (
                          'draft',        -- en préparation back-office
                          'open',         -- souscriptions ouvertes
                          'funded',       -- objectif atteint, en attente closing
                          'closing',      -- déblocage séquestre + mint en cours
                          'live',          -- opération en cours (travaux/exploitation)
                          'distributing', -- distributions/exit en cours
                          'closed',       -- débouclé, tokens burn
                          'cancelled',    -- annulé → remboursement intégral séquestre
                          'defaulted'     -- défaut
                        )),

  -- payloads riches (réutilise le pattern jsonb de estimations)
  scenarios             jsonb,            -- pess/central/opt (P8 graphiques)
  fees                  jsonb,            -- grille de frais plateforme + opérateur
  risk_factors          jsonb,            -- facteurs de risque (divulgation)

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- slug unique par tenant
  constraint uq_deal_slug unique (tenant_id, slug)
);

create trigger trg_deals_updated_at
  before update on public.deals
  for each row execute function public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- BOND_TRANCHES — tranches obligataires émises par la SPV pour un deal
-- ═══════════════════════════════════════════════════════════════════════════
-- L'instrument souscrit par l'investisseur = OBLIGATION (titre de créance).
-- Un deal peut avoir plusieurs tranches (ex: senior secured / mezzanine), mais
-- chaque tranche appartient à UN deal (pas de tranche transverse = pas de pool).
-- C'est l'objet inscrit en DEEP et miroité en ERC-3643.
create table if not exists public.bond_tranches (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         text not null default 'real-estate-agent'
                    references public.tenants(id) on delete restrict,

  deal_id           uuid not null references public.deals(id) on delete cascade,
  spv_id            uuid not null references public.spvs(id) on delete restrict,

  -- désignation de la tranche
  name              text not null,                              -- ex: "Obligations 2026-A"
  seniority         text not null default 'senior_secured'
                    check (seniority in ('senior_secured','mezzanine','junior','subordinated')),

  -- caractéristiques de l'obligation
  isin              text check (isin is null or isin ~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$'),  -- optionnel
  nominal_unit_eur  numeric(16,2) not null default 1000 check (nominal_unit_eur > 0),  -- valeur nominale d'une obligation
  total_nominal_eur numeric(16,2) not null check (total_nominal_eur > 0),              -- montant total de la tranche
  units_total       bigint not null check (units_total > 0),                            -- nb d'obligations émises
  units_issued      bigint not null default 0 check (units_issued >= 0),                -- nb réellement minté (DEEP)
  constraint chk_units_issued_le_total check (units_issued <= units_total),

  -- coupon (peut être nul → distribution variable in fine pour MdB)
  -- ATTENTION : taux affiché = plancher éventuel, le rendement reste NON garanti.
  coupon_rate_pct   numeric(5,2) check (coupon_rate_pct is null or coupon_rate_pct >= 0),
  coupon_frequency  text not null default 'in_fine'
                    check (coupon_frequency in ('in_fine','monthly','quarterly','semiannual','annual')),
  is_variable_return boolean not null default true,             -- distribution variable (badge P6)

  -- échéance & lock-up
  maturity_date     date,
  lock_up_until     date,                                       -- inaliénabilité (transfer restriction)
  redemption_trigger text not null default 'exit_event'
                    check (redemption_trigger in ('exit_event','maturity','call')),

  -- rang dans le waterfall (cohérent avec deals.waterfall)
  waterfall_rank    int not null default 2 check (waterfall_rank >= 1),

  -- ── MIROIR ON-CHAIN (ERC-3643 — JAMAIS ERC-4626) ──
  token_standard    text not null default 'ERC-3643'
                    check (token_standard in ('ERC-3643','ERC-1400')),  -- pas de 20/4626
  chain             text check (chain in ('polygon','base','ethereum','permissioned')),
  chain_id          int,
  token_contract_address text check (token_contract_address is null or token_contract_address ~ '^0x[a-fA-F0-9]{40}$'),
  -- registre identité ERC-3643 (whitelist KYC)
  identity_registry_address text check (identity_registry_address is null or identity_registry_address ~ '^0x[a-fA-F0-9]{40}$'),
  compliance_address text check (compliance_address is null or compliance_address ~ '^0x[a-fA-F0-9]{40}$'),
  token_decimals    int not null default 0 check (token_decimals >= 0 and token_decimals <= 18),  -- 0 = obligation indivisible

  -- ── REGISTRE LÉGAL (DEEP) = SOURCE DE VÉRITÉ ──
  deep_register_ref text,                                       -- réf inscription DEEP (Ord. 2017-1674)
  deep_registered_at timestamptz,

  -- restrictions de transfert (juridictions exclues, etc.)
  excluded_countries char(2)[] not null default '{}',          -- ISO-3166 exclus

  status            text not null default 'draft'
                    check (status in ('draft','open','issued','locked','redeeming','redeemed','cancelled')),

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- cohérence : units_total * nominal_unit = total_nominal (tolérance arrondi)
  constraint chk_tranche_nominal_consistency
    check (abs(total_nominal_eur - (units_total * nominal_unit_eur)) < 0.01)
);

create trigger trg_bond_tranches_updated_at
  before update on public.bond_tranches
  for each row execute function public.set_updated_at();

-- ─── INDEX (un par FK + tenant + filtres) ────────────────────────────────────
create index if not exists idx_spvs_tenant         on public.spvs(tenant_id);
create index if not exists idx_spvs_operator       on public.spvs(operator_id);
create index if not exists idx_spvs_status         on public.spvs(status);

create index if not exists idx_deals_tenant        on public.deals(tenant_id);
create index if not exists idx_deals_spv           on public.deals(spv_id);
create index if not exists idx_deals_operator      on public.deals(operator_id);
create index if not exists idx_deals_status        on public.deals(status);
create index if not exists idx_deals_offering      on public.deals(offering_regime);
create index if not exists idx_deals_city          on public.deals(city);

create index if not exists idx_bond_tranches_tenant on public.bond_tranches(tenant_id);
create index if not exists idx_bond_tranches_deal   on public.bond_tranches(deal_id);
create index if not exists idx_bond_tranches_spv    on public.bond_tranches(spv_id);
create index if not exists idx_bond_tranches_status on public.bond_tranches(status);
create index if not exists idx_bond_tranches_contract on public.bond_tranches(token_contract_address);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- deals / spvs / bond_tranches : catalogue d'investissement → LECTURE pour tout
-- membre du tenant (les investisseurs doivent voir les deals ouverts). L'écriture
-- est réservée au service-role (back-office). Pas de filtre user_id : ces objets
-- n'ont pas d'« owner » investisseur ; ils sont propres au tenant.
alter table public.spvs          enable row level security;
alter table public.deals         enable row level security;
alter table public.bond_tranches enable row level security;

drop policy if exists "tenant spvs read" on public.spvs;
create policy "tenant spvs read" on public.spvs for select
  using (tenant_id = (select public.current_tenant_id()));

drop policy if exists "tenant deals read" on public.deals;
create policy "tenant deals read" on public.deals for select
  using (tenant_id = (select public.current_tenant_id()));

drop policy if exists "tenant bond_tranches read" on public.bond_tranches;
create policy "tenant bond_tranches read" on public.bond_tranches for select
  using (tenant_id = (select public.current_tenant_id()));

-- ─── COMMENTAIRES ────────────────────────────────────────────────────────────
comment on table public.spvs is '1 SAS dédiée = 1 opération (ring-fencing). Seules SAS/SA émettent des titres inscriptibles DEEP. Porte la dette senior + hypothèque.';
comment on table public.deals is 'Unité de choix deal-by-deal de l''investisseur. 1 deal = 1 SPV (UNIQUE) = pas de mutualisation. Économie + levée + badges + waterfall.';
comment on table public.bond_tranches is 'Tranche OBLIGATAIRE (titre de créance) souscrite par l''investisseur. Miroir ERC-3643 d''un registre DEEP (source de vérité). Jamais ERC-4626.';
comment on column public.bond_tranches.token_standard is 'ERC-3643 (T-REX) permissionné uniquement. ERC-4626 INTERDIT (signal FIA pour ESMA).';
comment on column public.bond_tranches.deep_register_ref is 'Référence registre DEEP (Ord. 2017-1674) = SOURCE DE VÉRITÉ juridique. Le token on-chain en est le miroir.';
comment on column public.deals.target_irr_pct is 'Rendement CIBLE non garanti. Interdit de promettre un taux (mise en garde AMF). Toujours afficher "non garanti".';
