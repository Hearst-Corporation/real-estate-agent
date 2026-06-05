-- 0011_pdf_status
-- Statut du job de génération PDF (pré-chauffage async Inngest).
-- NULL = jamais demandé (un pdf_key présent = déjà en cache R2 → 'ready' implicite).
-- CHECK autorise NULL (sémantique "jamais demandé").

alter table public.estimations
  add column if not exists pdf_status text
    check (pdf_status in ('pending','ready','failed'));

comment on column public.estimations.pdf_status is
  'Statut du job PDF async (pending/ready/failed). NULL = jamais demandé (cache R2 via pdf_key reste la voie synchrone).';
