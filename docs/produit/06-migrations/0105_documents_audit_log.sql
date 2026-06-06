-- ═══════════════════════════════════════════════════════════════════════════
-- 0105 — TOKENISATION : documents (GED) + audit_log (piste d'audit IMMUABLE)
-- ═══════════════════════════════════════════════════════════════════════════
-- DOCUMENTS : gestion documentaire polymorphe (KIIS/DIS, contrat d'émission,
--   bulletin de souscription, intercreditor, K-bis, expertise, IFU, whitepaper
--   token…). Le fichier vit dans un object store (Supabase Storage / S3) ; ici
--   on stocke la clé + métadonnées + hash d'intégrité. Lien polymorphe vers
--   n'importe quelle entité (deal, spv, tranche, subscription, kyc, distribution).
--
-- AUDIT_LOG : piste d'audit IMMUABLE et inviolable (exigence réglementaire +
--   bonne pratique). Append-only garanti par TRIGGER (UPDATE/DELETE bloqués) +
--   CHAÎNAGE par hash (chaque ligne contient le hash de la précédente du même
--   tenant → toute altération casse la chaîne). Trace QUI a fait QUOI sur QUOI.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- DOCUMENTS — GED polymorphe avec intégrité
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.documents (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         text not null default 'real-estate-agent'
                    references public.tenants(id) on delete restrict,

  -- propriétaire/déposant (qui a uploadé) ; null = système/back-office
  user_id           uuid references auth.users(id) on delete set null,

  -- LIEN POLYMORPHE : type + id de l'entité rattachée
  entity_type       text not null
                    check (entity_type in (
                      'deal','spv','bond_tranche','subscription','kyc_record',
                      'distribution','operator','investor_profile','tenant'
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

create trigger trg_documents_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- AUDIT_LOG — piste d'audit IMMUABLE (append-only + hash-chaining)
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.audit_log (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         text not null default 'real-estate-agent'
                    references public.tenants(id) on delete restrict,

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
  constraint uq_audit_seq_tenant unique (tenant_id, seq)
);

-- ─── Fonction d'insertion d'audit (calcule seq + chaîne de hash) ─────────────
-- À appeler depuis le service-role / triggers métier. Garantit la continuité de
-- la chaîne. SECURITY DEFINER pour pouvoir écrire malgré la policy restrictive.
create or replace function public.append_audit_log(
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
  perform pg_advisory_xact_lock(hashtext('audit_log:' || p_tenant_id));

  select coalesce(max(seq), 0) + 1,
         (select record_hash from public.audit_log
            where tenant_id = p_tenant_id order by seq desc limit 1)
    into v_seq, v_prev_hash
    from public.audit_log
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

  insert into public.audit_log(
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

-- ─── TRIGGER d'immuabilité : bloque UPDATE et DELETE sur audit_log ───────────
create or replace function public.audit_log_block_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'audit_log is append-only: % is not allowed', tg_op
    using errcode = 'insufficient_privilege';
end; $$;

drop trigger if exists trg_audit_log_no_update on public.audit_log;
create trigger trg_audit_log_no_update
  before update on public.audit_log
  for each row execute function public.audit_log_block_mutation();

drop trigger if exists trg_audit_log_no_delete on public.audit_log;
create trigger trg_audit_log_no_delete
  before delete on public.audit_log
  for each row execute function public.audit_log_block_mutation();

-- ─── INDEX (un par FK + tenant + filtres) ────────────────────────────────────
create index if not exists idx_documents_tenant      on public.documents(tenant_id);
create index if not exists idx_documents_user         on public.documents(user_id);
create index if not exists idx_documents_entity       on public.documents(entity_type, entity_id);
create index if not exists idx_documents_doc_type     on public.documents(doc_type);
create index if not exists idx_documents_status       on public.documents(status);

create index if not exists idx_audit_log_tenant       on public.audit_log(tenant_id);
create index if not exists idx_audit_log_actor        on public.audit_log(actor_user_id);
create index if not exists idx_audit_log_entity       on public.audit_log(entity_type, entity_id);
create index if not exists idx_audit_log_action       on public.audit_log(action);
create index if not exists idx_audit_log_created      on public.audit_log(created_at);
create index if not exists idx_audit_log_tenant_seq   on public.audit_log(tenant_id, seq);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.documents enable row level security;
alter table public.audit_log enable row level security;

-- documents : lecture des docs 'public'/'restricted' du tenant + ses propres docs.
-- Écriture (upload) réservée au service-role/back-office en pratique.
drop policy if exists "tenant documents read" on public.documents;
create policy "tenant documents read" on public.documents for select
  using (
    tenant_id = (select public.current_tenant_id())
    and (
      visibility in ('public','restricted')
      or (select auth.uid()) = user_id
    )
  );

-- audit_log : LECTURE SEULE pour l'acteur de ses propres événements, dans le
-- tenant. INSERT passe par append_audit_log (SECURITY DEFINER) ; UPDATE/DELETE
-- bloqués par trigger ET non autorisés par policy.
drop policy if exists "tenant audit_log read own" on public.audit_log;
create policy "tenant audit_log read own" on public.audit_log for select
  using (
    tenant_id = (select public.current_tenant_id())
    and (select auth.uid()) = actor_user_id
  );

-- ─── COMMENTAIRES ────────────────────────────────────────────────────────────
comment on table public.documents is 'GED polymorphe (KIIS/DIS, contrat d''émission, intercreditor, K-bis, IFU…). Clé object-store + sha256. Jamais le binaire ni la PII brute en base.';
comment on table public.audit_log is 'Piste d''audit IMMUABLE : append-only (trigger bloque UPDATE/DELETE) + chaînage par hash par tenant (toute altération casse la chaîne).';
comment on function public.append_audit_log is 'SEULE voie d''écriture de l''audit. Calcule seq monotone par tenant + record_hash chaîné au prev_hash. SECURITY DEFINER.';
comment on column public.audit_log.record_hash is 'sha256(tenant|seq|action|entity_type|entity_id|after_state|prev_hash). Vérifie l''intégrité de la chaîne.';
