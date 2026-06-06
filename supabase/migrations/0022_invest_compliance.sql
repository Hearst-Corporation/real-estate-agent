-- ═══════════════════════════════════════════════════════════════════════════
-- 0022 — INVEST : conformité opérationnelle PSFP/ECSP + LCB-FT + legal-tech
-- ═══════════════════════════════════════════════════════════════════════════
-- NOUVEAU (conçu d'après docs/produit/08-conformite-operationnelle.md §13),
-- renommé selon C1 (préfixe inv_). Ce fichier n'apporte QUE les tables conformité
-- MANQUANTES — les entités déjà créées par 0015→0020 ne sont PAS recréées :
--   • issuers/deals (08)        → déjà inv_operators / inv_spvs / inv_deals (0015/0016)
--   • kyc_cases (08)            → déjà inv_kyc_cases (0015)
--   • subscriptions (08)        → déjà inv_subscriptions (0017)
--   • escrow_deposits (08)      → déjà inv_escrow_movements (0017)
--   • documents (08)            → déjà inv_documents (0020)
--   • compliance_audit_log (08) → SUPPRIMÉ : on réutilise inv_audit_log (0020).
--                                  UNE seule piste d'audit (décision C1 §5).
--
-- Tables créées ici (mapping 08 → inv_) :
--   kiis_documents          → inv_kiis_documents       (KIIS/DIS versionné — WF-1)
--   kiis_versions           → inv_kiis_versions
--   investor_assessments    → inv_investor_assessments (test ECSP — WF-3)
--   deal_closing_conditions → inv_deal_closing_conditions (CS — WF-5)
--   travel_rule_records     → inv_travel_rule_records  (TFR 2023/1113 — WF-6)
--   signature_envelopes     → inv_signature_envelopes  (eIDAS — WF-8)
--   deep_inscriptions       → inv_deep_inscriptions    (inscription DEEP — WF-9)
--   bond_register           → inv_bond_register        (masse obligataire — WF-9)
--   bondholder_mass         → inv_bondholder_mass      (L.228-46 — WF-9)
--   regulatory_reports      → inv_regulatory_reports   (PSFP/AMF — WF-10)
--
-- Conventions : tenant_id text FK-less ; RLS (owner+tenant pour tables
-- investisseur, tenant-read pour back-office) ; index sur chaque FK ;
-- set_updated_at()/current_tenant_id() existants (non redéfinis).
-- ═══════════════════════════════════════════════════════════════════════════

-- ════════════════ A. KIIS / DIS VERSIONNÉS (WF-1) ════════════════════════════

-- KIIS / DIS — en-tête (1 par deal/type), pointe la version courante.
create table if not exists inv_kiis_documents (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       text not null default 'real-estate-agent',
  deal_id         uuid not null references inv_deals(id) on delete cascade,
  doc_type        text not null default 'KIIS' check (doc_type in ('KIIS','DIS')),
  current_version int not null default 0 check (current_version >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger trg_inv_kiis_documents_updated_at
  before update on inv_kiis_documents
  for each row execute function public.set_updated_at();

-- Versions du KIIS — machine à états DRAFT→PUBLISHED→SUPERSEDED, hash PDF figé.
create table if not exists inv_kiis_versions (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       text not null default 'real-estate-agent',
  kiis_document_id uuid not null references inv_kiis_documents(id) on delete cascade,
  version         int not null check (version >= 1),
  state           text not null default 'DRAFT'
                  check (state in ('DRAFT','PENDING_COMPLIANCE_REVIEW','APPROVED',
                                   'PUBLISHED','SUPERSEDED','ARCHIVED')),
  pdf_sha256      text check (pdf_sha256 is null or pdf_sha256 ~ '^[a-f0-9]{64}$'),  -- figé à PUBLISHED
  content         jsonb,                          -- sections A-G ECSP
  review_notes    text,
  published_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- une seule version n par document
  constraint uq_inv_kiis_version unique (kiis_document_id, version)
);

create trigger trg_inv_kiis_versions_updated_at
  before update on inv_kiis_versions
  for each row execute function public.set_updated_at();

-- ════════════════ B. TEST INVESTISSEUR / CLASSIFICATION ECSP (WF-3) ══════════
-- Test connaissances + capacité de perte + classification + plafond.
create table if not exists inv_investor_assessments (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete cascade,
  tenant_id       text not null default 'real-estate-agent',
  -- lien profil (cohérence avec inv_investor_profiles)
  investor_profile_id uuid references inv_investor_profiles(id) on delete cascade,

  state           text not null default 'ASSESSMENT_REQUIRED'
                  check (state in ('ASSESSMENT_REQUIRED','KNOWLEDGE_TEST','LOSS_CAPACITY_SIM',
                                   'SOPHISTICATED_REVIEW','CLASSIFIED_RETAIL','CLASSIFIED_SOPHISTICATED',
                                   'TEST_FAILED','ASSESSMENT_EXPIRED')),
  classification  text check (classification in ('retail','sophisticated')),
  knowledge_score numeric(5,2),
  knowledge_passed boolean,
  -- capacité de perte (art. 21(5) ECSP)
  annual_income_eur     numeric(16,2) check (annual_income_eur is null or annual_income_eur >= 0),
  liquid_assets_eur     numeric(16,2) check (liquid_assets_eur is null or liquid_assets_eur >= 0),
  financial_commitments_eur numeric(16,2) check (financial_commitments_eur is null or financial_commitments_eur >= 0),
  -- patrimoine net = revenu + actifs liquides − engagements (colonne générée)
  net_worth_eur   numeric(16,2) generated always as
                  (coalesce(annual_income_eur,0) + coalesce(liquid_assets_eur,0)
                   - coalesce(financial_commitments_eur,0)) stored,
  classified_at   timestamptz,
  expires_at      timestamptz,                    -- retail +1 an ; sophisticated +2 ans
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger trg_inv_investor_assessments_updated_at
  before update on inv_investor_assessments
  for each row execute function public.set_updated_at();

-- ════════════════ C. CONDITIONS SUSPENSIVES DE CLOSING (WF-5) ════════════════
-- CS1 (seuil), CS2 (prêt), + permis, expertise… paramétrables par deal.
create table if not exists inv_deal_closing_conditions (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       text not null default 'real-estate-agent',
  deal_id         uuid not null references inv_deals(id) on delete cascade,
  code            text not null,                 -- 'THRESHOLD','BANK_LOAN','PERMIT','VALUATION'
  label           text not null,
  is_met          boolean not null default false,
  met_at          timestamptz,
  -- preuve documentaire (GED — WF-8)
  evidence_document_id uuid references inv_documents(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger trg_inv_deal_closing_conditions_updated_at
  before update on inv_deal_closing_conditions
  for each row execute function public.set_updated_at();

-- ════════════════ D. TRAVEL RULE — entrées stablecoin (WF-6) ═════════════════
-- TFR (UE) 2023/1113. asset ∈ {EURC,EURe} — jamais USDT (I5, CHECK).
create table if not exists inv_travel_rule_records (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete cascade,
  tenant_id       text not null default 'real-estate-agent',
  -- rattachement au mouvement séquestre concerné
  escrow_movement_id uuid references inv_escrow_movements(id) on delete set null,
  subscription_id uuid references inv_subscriptions(id) on delete set null,

  state           text not null default 'RAMP_INITIATED'
                  check (state in ('RAMP_INITIATED','AWAITING_ONCHAIN_TX','SCREENING',
                                   'TRAVEL_RULE_OK','BLOCKED','CONVERTED_TO_EUR','SETTLED_TO_ESCROW')),
  casp_provider   text not null check (casp_provider in ('circle','monerium','other')),  -- EURC | EURe
  asset           text not null check (asset in ('EURC','EURe')),  -- jamais USDT (I5)
  chain           text not null,
  tx_hash         text check (tx_hash is null or tx_hash ~ '^0x[a-fA-F0-9]{64}$'),
  originator_info jsonb,                          -- TFR 2023/1113
  beneficiary_info jsonb,
  screening_result text check (screening_result is null or screening_result in ('clean','sanctions','mixer')),
  amount_token    numeric(24,8) check (amount_token is null or amount_token >= 0),
  amount_eur      numeric(16,2) check (amount_eur is null or amount_eur >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger trg_inv_travel_rule_records_updated_at
  before update on inv_travel_rule_records
  for each row execute function public.set_updated_at();

-- ════════════════ E. SIGNATURE eIDAS (WF-8) ══════════════════════════════════
create table if not exists inv_signature_envelopes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete cascade,
  tenant_id       text not null default 'real-estate-agent',
  subscription_id uuid references inv_subscriptions(id) on delete set null,
  doc_kind        text not null check (doc_kind in ('bulletin_souscription','contrat_emission',
                                                    'cgu_disclosures','cap_warning','intercreditor')),
  state           text not null default 'DRAFT'
                  check (state in ('DRAFT','SENT','VIEWED','SIGNED','SEALED','ARCHIVED','EXPIRED','DECLINED')),
  provider        text not null default 'yousign' check (provider in ('yousign','docusign','other')),
  signature_level text not null default 'AdES' check (signature_level in ('SES','AdES','QES')),
  provider_ref    text,
  doc_sha256      text check (doc_sha256 is null or doc_sha256 ~ '^[a-f0-9]{64}$'),
  signed_at       timestamptz,
  sealed_at       timestamptz,
  audit_trail     jsonb,                          -- piste eIDAS du prestataire
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger trg_inv_signature_envelopes_updated_at
  before update on inv_signature_envelopes
  for each row execute function public.set_updated_at();

-- ════════════════ F. REGISTRES LÉGAUX (WF-9) ════════════════════════════════
-- Registre des obligations / position de chaque porteur (DEEP = source de vérité).
create table if not exists inv_bond_register (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       text not null default 'real-estate-agent',
  deal_id         uuid not null references inv_deals(id) on delete restrict,
  bond_tranche_id uuid references inv_bond_tranches(id) on delete restrict,
  holder_user_id  uuid references auth.users(id) on delete restrict, -- titulaire KYC
  subscription_id uuid references inv_subscriptions(id) on delete set null,
  state           text not null default 'INSCRIBED_DEEP'
                  check (state in ('INSCRIBED_DEEP','MIRRORED_ONCHAIN','TRANSFER_PENDING',
                                   'FROZEN','REDEEMED_DEEP','EXTINGUISHED')),
  nominal_eur     numeric(16,2) not null check (nominal_eur >= 0),
  units           bigint not null check (units >= 0),               -- nb d'obligations
  rate_or_index   text,                           -- jamais "garanti"
  rank            text not null default 'subordonnee' check (rank in ('senior','subordonnee')),
  inscribed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger trg_inv_bond_register_updated_at
  before update on inv_bond_register
  for each row execute function public.set_updated_at();

-- Inscriptions DEEP (acte juridique d'inscription en DLT) + miroir on-chain.
create table if not exists inv_deep_inscriptions (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       text not null default 'real-estate-agent',
  bond_register_id uuid not null references inv_bond_register(id) on delete cascade,
  registrar       text not null,                  -- 'tokeny' | teneur de registre
  inscription_ref text,
  -- miroir on-chain
  onchain_contract text check (onchain_contract is null or onchain_contract ~ '^0x[a-fA-F0-9]{40}$'),
  onchain_chain   text,
  onchain_token_units bigint check (onchain_token_units is null or onchain_token_units >= 0),
  reconciled      boolean not null default false, -- Σ on-chain == Σ DEEP ?
  inscribed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger trg_inv_deep_inscriptions_updated_at
  before update on inv_deep_inscriptions
  for each row execute function public.set_updated_at();

-- Masse des obligataires (L.228-46 s. C. com.).
create table if not exists inv_bondholder_mass (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       text not null default 'real-estate-agent',
  deal_id         uuid not null references inv_deals(id) on delete cascade,
  bond_tranche_id uuid references inv_bond_tranches(id) on delete set null,
  representative_name text,                        -- représentant de la masse (L.228-47)
  representative_contact text,
  constituted_at  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger trg_inv_bondholder_mass_updated_at
  before update on inv_bondholder_mass
  for each row execute function public.set_updated_at();

-- ════════════════ G. REPORTING RÉGLEMENTAIRE PSFP/AMF (WF-10) ════════════════
create table if not exists inv_regulatory_reports (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       text not null default 'real-estate-agent',
  report_type     text not null check (report_type in ('psfp_annual','default_rate','tracfin',
                                                       'investor_quarterly','ifu','incident')),
  state           text not null default 'DUE'
                  check (state in ('DUE','DRAFT','REVIEWED','APPROVED','SUBMITTED','ACKNOWLEDGED','ARCHIVED')),
  period_start    date,
  period_end      date,
  payload         jsonb,
  -- lien PDF généré (GED) le cas échéant
  document_id     uuid references inv_documents(id) on delete set null,
  submitted_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger trg_inv_regulatory_reports_updated_at
  before update on inv_regulatory_reports
  for each row execute function public.set_updated_at();

-- ─── INDEX (un par FK + tenant + filtres) ────────────────────────────────────
create index if not exists idx_inv_kiisdoc_tenant      on inv_kiis_documents(tenant_id);
create index if not exists idx_inv_kiisdoc_deal        on inv_kiis_documents(deal_id);
create index if not exists idx_inv_kiisver_tenant      on inv_kiis_versions(tenant_id);
create index if not exists idx_inv_kiisver_doc         on inv_kiis_versions(kiis_document_id);
create index if not exists idx_inv_kiisver_state       on inv_kiis_versions(state);

create index if not exists idx_inv_assess_user         on inv_investor_assessments(user_id);
create index if not exists idx_inv_assess_tenant       on inv_investor_assessments(tenant_id);
create index if not exists idx_inv_assess_profile      on inv_investor_assessments(investor_profile_id);
create index if not exists idx_inv_assess_state        on inv_investor_assessments(state);

create index if not exists idx_inv_dcc_tenant          on inv_deal_closing_conditions(tenant_id);
create index if not exists idx_inv_dcc_deal            on inv_deal_closing_conditions(deal_id);
create index if not exists idx_inv_dcc_evidence        on inv_deal_closing_conditions(evidence_document_id);

create index if not exists idx_inv_travel_user         on inv_travel_rule_records(user_id);
create index if not exists idx_inv_travel_tenant       on inv_travel_rule_records(tenant_id);
create index if not exists idx_inv_travel_escrow       on inv_travel_rule_records(escrow_movement_id);
create index if not exists idx_inv_travel_sub          on inv_travel_rule_records(subscription_id);
create index if not exists idx_inv_travel_state        on inv_travel_rule_records(state);

create index if not exists idx_inv_sig_user            on inv_signature_envelopes(user_id);
create index if not exists idx_inv_sig_tenant          on inv_signature_envelopes(tenant_id);
create index if not exists idx_inv_sig_sub             on inv_signature_envelopes(subscription_id);
create index if not exists idx_inv_sig_state           on inv_signature_envelopes(state);

create index if not exists idx_inv_bondreg_tenant      on inv_bond_register(tenant_id);
create index if not exists idx_inv_bondreg_deal        on inv_bond_register(deal_id);
create index if not exists idx_inv_bondreg_tranche     on inv_bond_register(bond_tranche_id);
create index if not exists idx_inv_bondreg_holder      on inv_bond_register(holder_user_id);
create index if not exists idx_inv_bondreg_sub         on inv_bond_register(subscription_id);
create index if not exists idx_inv_bondreg_state       on inv_bond_register(state);

create index if not exists idx_inv_deep_tenant         on inv_deep_inscriptions(tenant_id);
create index if not exists idx_inv_deep_bondreg        on inv_deep_inscriptions(bond_register_id);

create index if not exists idx_inv_mass_tenant         on inv_bondholder_mass(tenant_id);
create index if not exists idx_inv_mass_deal           on inv_bondholder_mass(deal_id);
create index if not exists idx_inv_mass_tranche        on inv_bondholder_mass(bond_tranche_id);

create index if not exists idx_inv_reg_reports_tenant   on inv_regulatory_reports(tenant_id);
create index if not exists idx_inv_reg_reports_document  on inv_regulatory_reports(document_id);
create index if not exists idx_inv_reg_reports_type      on inv_regulatory_reports(report_type);
create index if not exists idx_inv_reg_reports_state     on inv_regulatory_reports(state);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table inv_kiis_documents          enable row level security;
alter table inv_kiis_versions           enable row level security;
alter table inv_investor_assessments    enable row level security;
alter table inv_deal_closing_conditions enable row level security;
alter table inv_travel_rule_records     enable row level security;
alter table inv_signature_envelopes     enable row level security;
alter table inv_bond_register           enable row level security;
alter table inv_deep_inscriptions       enable row level security;
alter table inv_bondholder_mass         enable row level security;
alter table inv_regulatory_reports      enable row level security;

-- Tables back-office (tenant-read, écriture service-role) :
-- KIIS documents = lecture tenant ; versions = uniquement PUBLISHED côté client.
drop policy if exists "tenant kiisdoc read" on inv_kiis_documents;
create policy "tenant kiisdoc read" on inv_kiis_documents for select
  using (tenant_id = (select public.current_tenant_id()));

drop policy if exists "tenant kiisver read" on inv_kiis_versions;
create policy "tenant kiisver read" on inv_kiis_versions for select
  using (tenant_id = (select public.current_tenant_id()) and state = 'PUBLISHED');

drop policy if exists "tenant dcc read" on inv_deal_closing_conditions;
create policy "tenant dcc read" on inv_deal_closing_conditions for select
  using (tenant_id = (select public.current_tenant_id()));

drop policy if exists "tenant mass read" on inv_bondholder_mass;
create policy "tenant mass read" on inv_bondholder_mass for select
  using (tenant_id = (select public.current_tenant_id()));

drop policy if exists "tenant deep read" on inv_deep_inscriptions;
create policy "tenant deep read" on inv_deep_inscriptions for select
  using (tenant_id = (select public.current_tenant_id()));

drop policy if exists "tenant reg reports read" on inv_regulatory_reports;
create policy "tenant reg reports read" on inv_regulatory_reports for select
  using (tenant_id = (select public.current_tenant_id()));

-- Tables investisseur (owner + tenant — pattern 0008_crm.sql) :
drop policy if exists "own assessment" on inv_investor_assessments;
create policy "own assessment" on inv_investor_assessments for all
  using ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()))
  with check ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()));

drop policy if exists "own travel" on inv_travel_rule_records;
create policy "own travel" on inv_travel_rule_records for all
  using ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()))
  with check ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()));

drop policy if exists "own signatures" on inv_signature_envelopes;
create policy "own signatures" on inv_signature_envelopes for all
  using ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()))
  with check ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()));

-- inv_bond_register : le porteur voit SA position (lecture) ; écriture service-role.
drop policy if exists "own bondreg read" on inv_bond_register;
create policy "own bondreg read" on inv_bond_register for select
  using ((select auth.uid()) = holder_user_id and tenant_id = (select public.current_tenant_id()));

-- ─── COMMENTAIRES ────────────────────────────────────────────────────────────
comment on table inv_kiis_documents is 'En-tête KIIS/DIS par deal (WF-1). La version courante pointe vers inv_kiis_versions. KIIS opposable, aucune promesse de rendement.';
comment on table inv_kiis_versions is 'Versions KIIS (WF-1) : DRAFT→PENDING→APPROVED→PUBLISHED→SUPERSEDED. Hash PDF figé à PUBLISHED (opposabilité). Édition en place interdite.';
comment on table inv_investor_assessments is 'Test ECSP (WF-3, art. 21) : connaissances + capacité de perte + classification + net_worth (généré) → plafond max(1000€,5%).';
comment on table inv_deal_closing_conditions is 'Conditions suspensives de closing (WF-5) : THRESHOLD/BANK_LOAN/PERMIT/VALUATION. Preuve documentaire via evidence_document_id (GED).';
comment on table inv_travel_rule_records is 'Travel Rule TFR (UE) 2023/1113 (WF-6) sur entrées stablecoin. asset ∈ {EURC,EURe} — jamais USDT (I5). Conversion EUR par le CASP.';
comment on table inv_signature_envelopes is 'Enveloppes de signature eIDAS (WF-8, Règl. 910/2014). AdES par défaut, QES pour actes sensibles. Piste d''audit prestataire conservée.';
comment on table inv_bond_register is 'Registre légal des obligations / position du porteur (WF-9). DEEP = source de vérité. rate_or_index jamais "garanti".';
comment on table inv_deep_inscriptions is 'Inscription DEEP (Ord. 2017-1674) = acte juridique en DLT (WF-9), + miroir on-chain ERC-3643. reconciled = Σ on-chain == Σ DEEP.';
comment on table inv_bondholder_mass is 'Masse des obligataires (L.228-46 C.com., WF-9) : personnalité civile + représentant de la masse (L.228-47). Vote, pas de droit réel sur l''immeuble.';
comment on table inv_regulatory_reports is 'Reporting réglementaire PSFP/AMF + LCB-FT (WF-10) : annuel PSFP, taux de défaut, Tracfin, IFU. Source = tables transactionnelles.';
