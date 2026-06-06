-- ═══════════════════════════════════════════════════════════════════════════
-- 0100 — TOKENISATION : socle (tenants, operators, investor_profiles, kyc_records)
-- ═══════════════════════════════════════════════════════════════════════════
-- Domaine : plateforme d'investissement immobilier tokenisé (obligations SAS / PSFP).
-- Cadre verrouillé (docs/etude-immobilier-tokenise-2026.md) :
--   • OBLIGATIONS d'une SAS opérationnelle (MdB/promotion), 1 SPV = 1 opération.
--   • Distribution PSFP/ECSP. AUCUN fonds, AUCUN AIFM.
--   • Anti-FIA : pas de pré-collecte, pas de pooling, pas de NAV globale, pas de
--     rebalancing → AUCUNE table « portfolio / fund / vault » dans ce schéma.
--   • Security token ERC-3643 en MIROIR du registre légal DEEP (source de vérité).
--   • Plateforme ne détient JAMAIS les fonds (séquestre tiers obligatoire).
--
-- Conventions projet (reprises à l'identique de 0003/0007/0008) :
--   • tenant_id text not null default 'real-estate-agent'
--   • RLS : (select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id())
--   • un INDEX par FK (règle projet) + index sur tenant_id et colonnes de filtre
--   • set_updated_at() (0007) et current_tenant_id() (0003) déjà présents.
--
-- IMPORTANT : ces migrations sont préfixées 01xx pour ne PAS entrer en collision
-- avec la numérotation 00xx de l'app d'estimation existante. Elles vivent dans
-- docs/produit/06-migrations/ (livrable) ; à recopier dans supabase/migrations/
-- lors de l'intégration réelle.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Helpers idempotents ─────────────────────────────────────────────────────
-- Rappel : on NE redéfinit PAS set_updated_at() ni current_tenant_id() (déjà là).
-- Si ce schéma est joué sur une base vierge, dé-commenter le bloc ci-dessous.
--
-- create or replace function public.set_updated_at()
-- returns trigger language plpgsql set search_path = '' as $$
-- begin new.updated_at := now(); return new; end; $$;
--
-- create or replace function public.current_tenant_id()
-- returns text language sql stable set search_path = '' as $$
--   select coalesce(nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', ''), 'real-estate-agent');
-- $$;

-- Extension pour la chaîne d'audit (sha256 via digest()).
-- Sur Supabase, pgcrypto vit dans le schéma `extensions` (pré-installé). On le
-- garde là ; append_audit_log() qualifie l'appel en extensions.digest().
create extension if not exists pgcrypto with schema extensions;

-- ═══════════════════════════════════════════════════════════════════════════
-- TENANTS — racine multi-tenant explicite (registre des espaces clients)
-- ═══════════════════════════════════════════════════════════════════════════
-- Le tenant_id reste un text (clé logique JWT) partout ailleurs pour rester
-- compatible avec current_tenant_id(). Cette table documente/contraint les
-- tenants valides et porte la configuration réglementaire de chacun.
create table if not exists public.tenants (
  -- la PK EST le tenant_id text utilisé dans le JWT (app_metadata.tenant_id)
  id                text primary key,
  name              text not null,

  -- périmètre réglementaire de l'espace (gouverne les garde-fous applicatifs)
  -- 'psfp_partner' : distribution via PSFP tiers ; 'psfp_own' : agrément propre ;
  -- 'private_placement' : placement privé strict (qualifiés / ≥100k€).
  distribution_regime text not null default 'private_placement'
                      check (distribution_regime in ('private_placement','psfp_partner','psfp_own')),

  -- entité juridique éditrice (OpCo Plateforme) — informatif
  legal_entity_name text,
  legal_entity_siren text check (legal_entity_siren is null or legal_entity_siren ~ '^[0-9]{9}$'),

  -- agrément PSFP (numéro AMF) si regime psfp_own
  psfp_authorization_ref text,

  status            text not null default 'active'
                    check (status in ('active','suspended','archived')),
  settings          jsonb not null default '{}',

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger trg_tenants_updated_at
  before update on public.tenants
  for each row execute function public.set_updated_at();

-- tenant racine du projet (idempotent)
insert into public.tenants (id, name, distribution_regime)
values ('real-estate-agent', 'Real Estate Agent (default)', 'private_placement')
on conflict (id) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- OPERATORS — opérateurs immobiliers (SAS marchand de biens / promoteur)
-- ═══════════════════════════════════════════════════════════════════════════
-- C'est le « sachant » qui source les deals, porte le risque opérationnel et
-- l'alignement (equity + carried). Objet commercial réel = pilier anti-FIA.
-- Un operator n'est PAS un user : c'est une personne morale partenaire.
create table if not exists public.operators (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         text not null default 'real-estate-agent'
                    references public.tenants(id) on delete restrict,

  -- propriétaire de la fiche côté back-office (qui l'a créée/gère)
  user_id           uuid references auth.users(id) on delete set null,

  legal_name        text not null,
  -- SIREN FR (9 chiffres) — la SAS opérateur doit avoir une existence légale
  siren             text check (siren is null or siren ~ '^[0-9]{9}$'),
  legal_form        text not null default 'SAS'
                    check (legal_form in ('SAS','SA','SCCV','SCI','autre')),

  -- type d'activité commerciale réelle (badge produit P6)
  activity_type     text not null default 'marchand_de_biens'
                    check (activity_type in ('marchand_de_biens','promotion','foncier_locatif','mixte')),

  -- track record (alimente les badges et la due diligence)
  track_record_deals int not null default 0 check (track_record_deals >= 0),
  track_record_volume_eur numeric(16,2) not null default 0 check (track_record_volume_eur >= 0),

  -- carte T loi Hoguet : requise UNIQUEMENT si entremise/gestion pour tiers.
  -- Marchand de biens en nom propre → non requise (cf. étude P11/P13).
  hoguet_card_t     boolean not null default false,
  hoguet_card_ref   text,

  contact_email     text,
  contact_phone     text,
  website_url       text,

  status            text not null default 'onboarding'
                    check (status in ('onboarding','active','suspended','blacklisted')),
  notes             text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger trg_operators_updated_at
  before update on public.operators
  for each row execute function public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- INVESTOR_PROFILES — profil investisseur (1 par user, étend public.users)
-- ═══════════════════════════════════════════════════════════════════════════
-- Porte la classification ECSP (averti/non-averti), la capacité de perte, le
-- plafond réglementaire, le statut KYC agrégé et l'adresse wallet (lien
-- ONCHAINID). C'est la table « qui peut souscrire et combien ».
create table if not exists public.investor_profiles (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  tenant_id         text not null default 'real-estate-agent'
                    references public.tenants(id) on delete restrict,

  -- 1 seul profil par (tenant, user)
  constraint uq_investor_profile_user unique (tenant_id, user_id),

  -- identité investisseur
  investor_kind     text not null default 'natural_person'
                    check (investor_kind in ('natural_person','legal_entity')),
  full_name         text,
  country           char(2) not null default 'FR',  -- ISO-3166 alpha-2

  -- Classification ECSP (Règl. UE 2020/1503) — gouverne tickets & avertissements
  -- 'non_sophisticated' = non-averti (test + délai 4j) ; 'sophisticated' = averti.
  investor_class    text not null default 'non_sophisticated'
                    check (investor_class in ('non_sophisticated','sophisticated','professional')),

  -- test de connaissances ECSP (non-avertis)
  appropriateness_test_passed boolean not null default false,
  appropriateness_test_at     timestamptz,

  -- capacité de perte déclarée (base du plafond max(1000€, 5% patrimoine net))
  declared_net_worth_eur      numeric(16,2) check (declared_net_worth_eur is null or declared_net_worth_eur >= 0),
  -- plafond d'investissement calculé/appliqué (12 mois glissants) — null = non plafonné (averti)
  annual_investment_cap_eur   numeric(16,2) check (annual_investment_cap_eur is null or annual_investment_cap_eur >= 0),

  -- statut KYC agrégé (détail dans kyc_records) — dénormalisé pour gating rapide
  kyc_status        text not null default 'none'
                    check (kyc_status in ('none','pending','approved','rejected','expired')),
  kyc_approved_at   timestamptz,
  kyc_expires_at    timestamptz,

  -- wallet on-chain (miroir) + ONCHAINID (KYC soulbound)
  -- Adresse EVM checksummée (0x + 40 hex). Le claim KYC est porté off-chain ici
  -- et reflété par l'ONCHAINID on-chain.
  wallet_address    text check (wallet_address is null or wallet_address ~ '^0x[a-fA-F0-9]{40}$'),
  onchainid_address text check (onchainid_address is null or onchainid_address ~ '^0x[a-fA-F0-9]{40}$'),
  wallet_kind       text not null default 'none'
                    check (wallet_kind in ('none','self_custody','embedded')),

  -- consentements
  tos_accepted_at        timestamptz,
  risk_disclosure_accepted_at timestamptz,

  status            text not null default 'active'
                    check (status in ('active','suspended','closed')),

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- garde-fou : un wallet ne peut être lié qu'à un seul profil par tenant
  constraint uq_investor_wallet unique (tenant_id, wallet_address)
);

create trigger trg_investor_profiles_updated_at
  before update on public.investor_profiles
  for each row execute function public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- KYC_RECORDS — historique des vérifications KYC/AML (LCB-FT)
-- ═══════════════════════════════════════════════════════════════════════════
-- Append-friendly : chaque soumission/décision est un enregistrement. Le
-- statut « courant » est dénormalisé sur investor_profiles. Stocke la
-- référence du prestataire (Sumsub/Onfido), JAMAIS les pièces brutes (PII)
-- qui restent chez le prestataire ; on garde des références + hash.
create table if not exists public.kyc_records (
  id                uuid primary key default gen_random_uuid(),
  investor_profile_id uuid not null references public.investor_profiles(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  tenant_id         text not null default 'real-estate-agent'
                    references public.tenants(id) on delete restrict,

  provider          text not null default 'sumsub'
                    check (provider in ('sumsub','onfido','manual','other')),
  provider_applicant_id text,            -- id côté prestataire (pas de PII brute)
  provider_check_id text,

  -- niveau de diligence
  level             text not null default 'standard'
                    check (level in ('standard','enhanced')),   -- EDD si stablecoin / risque élevé

  -- résultat
  status            text not null default 'pending'
                    check (status in ('pending','approved','rejected','expired','review')),
  risk_score        int check (risk_score is null or (risk_score between 0 and 100)),

  -- contrôles spécifiques (LCB-FT)
  source_of_funds_verified boolean not null default false,
  pep_screening_passed     boolean,        -- personne politiquement exposée
  sanctions_screening_passed boolean,      -- listes de sanctions
  -- screening on-chain (mixers/sanctions wallet) si entrée stablecoin
  chain_screening_passed   boolean,

  rejection_reason  text,
  approved_at       timestamptz,
  expires_at        timestamptz,
  raw_result_hash   text,                  -- sha256 du payload prestataire (intégrité, pas la donnée)

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger trg_kyc_records_updated_at
  before update on public.kyc_records
  for each row execute function public.set_updated_at();

-- ─── INDEX (un par FK + tenant + colonnes de filtre) ─────────────────────────
create index if not exists idx_operators_tenant        on public.operators(tenant_id);
create index if not exists idx_operators_user          on public.operators(user_id);
create index if not exists idx_operators_status        on public.operators(status);
create index if not exists idx_operators_siren         on public.operators(siren);

create index if not exists idx_investor_profiles_user  on public.investor_profiles(user_id);
create index if not exists idx_investor_profiles_tenant on public.investor_profiles(tenant_id);
create index if not exists idx_investor_profiles_kyc    on public.investor_profiles(kyc_status);
create index if not exists idx_investor_profiles_class  on public.investor_profiles(investor_class);
create index if not exists idx_investor_profiles_wallet on public.investor_profiles(wallet_address);

create index if not exists idx_kyc_records_profile      on public.kyc_records(investor_profile_id);
create index if not exists idx_kyc_records_user         on public.kyc_records(user_id);
create index if not exists idx_kyc_records_tenant       on public.kyc_records(tenant_id);
create index if not exists idx_kyc_records_status       on public.kyc_records(status);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.tenants            enable row level security;
alter table public.operators          enable row level security;
alter table public.investor_profiles  enable row level security;
alter table public.kyc_records        enable row level security;

-- tenants : un user authentifié ne voit QUE son propre tenant (lecture seule
-- côté client ; l'écriture passe par le service-role en back-office).
drop policy if exists "tenant self read" on public.tenants;
create policy "tenant self read" on public.tenants for select
  using (id = (select public.current_tenant_id()));

-- operators : visibilité au sein du tenant (catalogue partagé des opérateurs).
-- L'écriture est réservée au service-role (back-office) ; ici on autorise la
-- LECTURE à tout membre du tenant (les fiches opérateur sont publiques au sein
-- de l'espace pour afficher le track record sur les deals).
drop policy if exists "tenant operators read" on public.operators;
create policy "tenant operators read" on public.operators for select
  using (tenant_id = (select public.current_tenant_id()));

-- investor_profiles : strictement owner + tenant.
drop policy if exists "tenant investor_profiles" on public.investor_profiles;
create policy "tenant investor_profiles" on public.investor_profiles for all
  using ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()))
  with check ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()));

-- kyc_records : owner + tenant (le user voit son propre historique KYC).
drop policy if exists "tenant kyc_records" on public.kyc_records;
create policy "tenant kyc_records" on public.kyc_records for all
  using ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()))
  with check ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()));

-- ─── COMMENTAIRES (doc inline) ───────────────────────────────────────────────
comment on table public.tenants is 'Racine multi-tenant. PK = tenant_id text du JWT (app_metadata.tenant_id). Porte le régime de distribution (PSFP/placement privé).';
comment on table public.operators is 'Opérateurs immobiliers (SAS MdB/promotion). Objet commercial réel = pilier anti-FIA. NE PAS confondre avec users.';
comment on table public.investor_profiles is '1 profil par (tenant,user). Classification ECSP, plafond, KYC agrégé, wallet + ONCHAINID. Gate de souscription.';
comment on table public.kyc_records is 'Historique KYC/AML (Sumsub/Onfido). Références + hash uniquement, jamais de PII brute (reste chez le prestataire).';
comment on column public.investor_profiles.annual_investment_cap_eur is 'Plafond ECSP 12 mois glissants pour non-avertis: max(1000€, 5% patrimoine net). NULL = averti/non plafonné.';
comment on column public.operators.hoguet_card_t is 'Carte T loi Hoguet requise UNIQUEMENT si entremise/gestion pour tiers. Marchand de biens en nom propre: false.';
