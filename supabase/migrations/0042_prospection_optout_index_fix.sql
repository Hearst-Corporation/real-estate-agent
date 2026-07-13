-- 0042_prospection_optout_index_fix.sql
-- Correctif : les index uniques opt-out / contact-idempotency de 0040 étaient
-- PARTIELS (WHERE ... IS NOT NULL). Postgres refuse un ON CONFLICT (cols) sur un
-- index partiel (erreur 42P10 "no unique or exclusion constraint matching"), ce
-- qui faisait échouer recordOptOut() et l'anti-double-envoi contact.
--
-- On les recrée COMPLETS : Postgres traite les NULL comme distincts, donc aucune
-- collision entre lignes sans email/tel, et l'ON CONFLICT fonctionne.
-- Additif / idempotent. Rollback = recréer les index partiels de 0040.

drop index if exists public.uq_prosp_optout_email;
drop index if exists public.uq_prosp_optout_tel;
create unique index if not exists uq_prosp_optout_email
  on public.prosp_optout (tenant_id, email_hash);
create unique index if not exists uq_prosp_optout_tel
  on public.prosp_optout (tenant_id, telephone_hash);

drop index if exists public.uq_prosp_contact_idem;
create unique index if not exists uq_prosp_contact_idem
  on public.prosp_contact_attempts (tenant_id, idempotency_key);
