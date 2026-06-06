-- ═══════════════════════════════════════════════════════════════════════════
-- 0020 — INVEST : inv_documents (GED) + inv_audit_log (piste d'audit IMMUABLE)
-- ═══════════════════════════════════════════════════════════════════════════
-- Source : docs/produit/06-migrations/0105_documents_audit_log.sql, renommé C1 :
--   documents                → inv_documents
--   audit_log                → inv_audit_log         (UNE seule piste d'audit, cf. C1/§5)
--   append_audit_log()       → inv_append_audit_log()
--   audit_log_block_mutation() → inv_audit_log_block_mutation()
--
-- DOCUMENTS : gestion documentaire polymorphe (KIIS/DIS, contrat d'émission,
--   bulletin de souscription, intercreditor, K-bis, expertise, IFU, whitepaper
--   token…). Le fichier vit dans un object store (Supabase Storage / S3) ; ici
--   on stocke la clé + métadonnées + hash d'intégrité. Lien polymorphe vers
--   n'importe quelle entité (deal, spv, tranche, subscription, kyc, distribution).
--
-- AUDIT_LOG : piste d'audit IMMUABLE et inviolable. Append-only garanti par
--   TRIGGER (UPDATE/DELETE bloqués) + CHAÎNAGE par hash (chaque ligne contient
--   le hash de la précédente du même tenant → toute altération casse la chaîne).
--   C'est la SEULE piste d'audit du domaine : le compliance_audit_log proposé
--   par 08 N'EST PAS créé (décision C1 §5) — tout passe par inv_audit_log.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- INV_DOCUMENTS — GED polymorphe avec intégrité
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists inv_documents (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         text not null default 'real-estate-agent',

  -- propriétaire/déposant (qui a uploadé) ; null = système/back-office
  user_id           uuid references auth.users(id) on delete set null,

  -- LIEN POLYMORPHE : type + id de l'entité rattachée (valeurs préfixées inv_*)
  entity_type       text not null
                    check (entity_type in (
                      'inv_deal','inv_spv','inv_bond_tranche','inv_subscription','inv_kyc_case',
                      'inv_distribution','inv_operator','inv_investor_profile','inv_tenant'
                    )),
  entity_id         uuid not null,

  -- nature du document (gouverne l'affichage et les obligations)
  doc_type          text not null
                    check (doc_type in (
                      'kiis','dis','prospectus',            -- offre
                      'bond_issuance_contract',             -- contrat d'émission obligataire
                      'subscription_form',                  -- bulletin de souscription
                      'intercreditor',                      -- subordination
                      'mortgage_deed',                      -- acte d'hypothèque
                      'appraisal',                          -- expertise de valeur
                      'works_quote',                        -- devis travaux
                      'bank_term_sheet',                    -- term sheet bancaire
                      'kbis',                               -- K-bis SPV
                      'token_whitepaper',                   -- whitepaper token
                      'tax_statement',                      -- IFU / fiscal
                      'risk_disclosure','tos',              -- CGU / disclosures
                      'kyc_proof',                          -- justificatif KYC (réf, pas la PII brute)
                      'report',                             -- reporting périodique
                      'other'
                    )),

  title             text not null,
  -- localisation dans l'object store (clé), JAMAIS le binaire en base
  storage_key       text not null,
  mime_type         text,
  size_bytes        bigint check (size_bytes is null or size_bytes >= 0),

  -- intégrité : sha256 du fichier (vérifiable au téléchargement)
  content_sha256    text check (content_sha256 is null or content_sha256 ~ '^[a-f0-9]{64}$'),

  -- versionnage simple
  version           int not null default 1 check (version >= 1),
  -- visibilité : 'public' (visible investisseurs du tenant) vs 'private' (back-office)
  visibility        text not null default 'private'
                    check (visibility in ('public','restricted','private')),

  -- signature électronique (si document signé)
  is_signed         boolean not null default false,
  esign_envelope_id text,
  signed_at         timestamptz,

  status            text not null default 'active'
                    check (status in ('active','superseded','deleted')),

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger trg_inv_documents_updated_at
  before update on inv_documents
  for each row execute function public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- INV_AUDIT_LOG — piste d'audit IMMUABLE (append-only + hash-chaining)
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists inv_audit_log (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         text not null default 'real-estate-agent',

  -- séquence monotone par tenant (ordonne la chaîne de hash)
  seq               bigint not null,

  -- ACTEUR : qui a déclenché l'action
  actor_user_id     uuid references auth.users(id) on delete set null,
  actor_role        text not null default 'user'
                    check (actor_role in ('user','admin','service','system','operator')),

  -- ACTION : quoi
  action            text not null,         -- ex: 'subscription.signed', 'token.minted', 'kyc.approved'

  -- CIBLE : sur quoi (polymorphe)
  entity_type       text,
  entity_id         uuid,

  -- contexte (avant/après, métadonnées) — JSON libre mais structuré
  before_state      jsonb,
  after_state       jsonb,
  metadata          jsonb not null default '{}',

  -- traçabilité technique
  ip_address        inet,
  user_agent        text,
  request_id        text,

  -- ── CHAÎNAGE D'INTÉGRITÉ (inviolabilité) ──
  -- hash de l'enregistrement précédent du même tenant
  prev_hash         text,
  -- hash de CET enregistrement = sha256(seq||action||entity||after||prev_hash)
  record_hash       text not null,

  created_at        timestamptz not null default now(),

  -- unicité de la séquence par tenant
  constraint uq_inv_audit_seq_tenant unique (tenant_id, seq)
);

-- ─── Fonction d'insertion d'audit (calcule seq + chaîne de hash) ─────────────
-- À appeler depuis le service-role / triggers métier. Garantit la continuité de
-- la chaîne. SECURITY DEFINER pour pouvoir écrire malgré la policy restrictive.
-- Préfixée inv_ (← append_audit_log de 06) pour éviter toute collision.
create or replace function public.inv_append_audit_log(
  p_tenant_id   text,
  p_action      text,
  p_actor_user_id uuid default null,
  p_actor_role  text default 'service',
  p_entity_type text default null,
  p_entity_id   uuid default null,
  p_before      jsonb default null,
  p_after       jsonb default null,
  p_metadata    jsonb default '{}',
  p_ip          inet default null,
  p_user_agent  text default null,
  p_request_id  text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_seq       bigint;
  v_prev_hash text;
  v_record_hash text;
  v_id        uuid;
begin
  -- verrou par tenant pour sérialiser la séquence (advisory lock sur hash du tenant)
  perform pg_advisory_xact_lock(hashtext('inv_audit_log:' || p_tenant_id));

  select coalesce(max(seq), 0) + 1,
         (select record_hash from public.inv_audit_log
            where tenant_id = p_tenant_id order by seq desc limit 1)
    into v_seq, v_prev_hash
    from public.inv_audit_log
   where tenant_id = p_tenant_id;

  -- NB : digest() vient de pgcrypto, installé dans le schéma `extensions` sur
  -- Supabase. Comme cette fonction force search_path='', on QUALIFIE l'appel.
  v_record_hash := encode(
    extensions.digest(
      coalesce(p_tenant_id,'') || '|' ||
      v_seq::text || '|' ||
      coalesce(p_action,'') || '|' ||
      coalesce(p_entity_type,'') || '|' ||
      coalesce(p_entity_id::text,'') || '|' ||
      coalesce(p_after::text,'') || '|' ||
      coalesce(v_prev_hash,''),
      'sha256'
    ), 'hex'
  );

  insert into public.inv_audit_log(
    tenant_id, seq, actor_user_id, actor_role, action,
    entity_type, entity_id, before_state, after_state, metadata,
    ip_address, user_agent, request_id, prev_hash, record_hash
  ) values (
    p_tenant_id, v_seq, p_actor_user_id, p_actor_role, p_action,
    p_entity_type, p_entity_id, p_before, p_after, coalesce(p_metadata,'{}'::jsonb),
    p_ip, p_user_agent, p_request_id, v_prev_hash, v_record_hash
  ) returning id into v_id;

  return v_id;
end; $$;

-- ─── TRIGGER d'immuabilité : bloque UPDATE et DELETE sur inv_audit_log ────────
-- Préfixée inv_ (← audit_log_block_mutation de 06).
create or replace function public.inv_audit_log_block_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'inv_audit_log is append-only: % is not allowed', tg_op
    using errcode = 'insufficient_privilege';
end; $$;

drop trigger if exists trg_inv_audit_log_no_update on inv_audit_log;
create trigger trg_inv_audit_log_no_update
  before update on inv_audit_log
  for each row execute function public.inv_audit_log_block_mutation();

drop trigger if exists trg_inv_audit_log_no_delete on inv_audit_log;
create trigger trg_inv_audit_log_no_delete
  before delete on inv_audit_log
  for each row execute function public.inv_audit_log_block_mutation();

-- ─── INDEX (un par FK + tenant + filtres) ────────────────────────────────────
create index if not exists idx_inv_documents_tenant      on inv_documents(tenant_id);
create index if not exists idx_inv_documents_user         on inv_documents(user_id);
create index if not exists idx_inv_documents_entity       on inv_documents(entity_type, entity_id);
create index if not exists idx_inv_documents_doc_type     on inv_documents(doc_type);
create index if not exists idx_inv_documents_status       on inv_documents(status);

create index if not exists idx_inv_audit_log_tenant       on inv_audit_log(tenant_id);
create index if not exists idx_inv_audit_log_actor        on inv_audit_log(actor_user_id);
create index if not exists idx_inv_audit_log_entity       on inv_audit_log(entity_type, entity_id);
create index if not exists idx_inv_audit_log_action       on inv_audit_log(action);
create index if not exists idx_inv_audit_log_created      on inv_audit_log(created_at);
create index if not exists idx_inv_audit_log_tenant_seq   on inv_audit_log(tenant_id, seq);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table inv_documents enable row level security;
alter table inv_audit_log enable row level security;

-- inv_documents : lecture des docs 'public'/'restricted' du tenant + ses propres docs.
-- Écriture (upload) réservée au service-role/back-office en pratique.
drop policy if exists "tenant documents read" on inv_documents;
create policy "tenant documents read" on inv_documents for select
  using (
    tenant_id = (select public.current_tenant_id())
    and (
      visibility in ('public','restricted')
      or (select auth.uid()) = user_id
    )
  );

-- inv_audit_log : LECTURE SEULE pour l'acteur de ses propres événements, dans le
-- tenant. INSERT passe par inv_append_audit_log (SECURITY DEFINER) ; UPDATE/DELETE
-- bloqués par trigger ET non autorisés par policy.
drop policy if exists "tenant audit_log read own" on inv_audit_log;
create policy "tenant audit_log read own" on inv_audit_log for select
  using (
    tenant_id = (select public.current_tenant_id())
    and (select auth.uid()) = actor_user_id
  );

-- ─── COMMENTAIRES ────────────────────────────────────────────────────────────
comment on table inv_documents is 'GED polymorphe (KIIS/DIS, contrat d''émission, intercreditor, K-bis, IFU…). Clé object-store + sha256. Jamais le binaire ni la PII brute en base.';
comment on table inv_audit_log is 'Piste d''audit IMMUABLE UNIQUE du domaine invest : append-only (trigger bloque UPDATE/DELETE) + chaînage par hash par tenant. Remplace compliance_audit_log (08).';
comment on function public.inv_append_audit_log is 'SEULE voie d''écriture de l''audit. Calcule seq monotone par tenant + record_hash chaîné au prev_hash. SECURITY DEFINER.';
comment on column inv_audit_log.record_hash is 'sha256(tenant|seq|action|entity_type|entity_id|after_state|prev_hash). Vérifie l''intégrité de la chaîne.';
