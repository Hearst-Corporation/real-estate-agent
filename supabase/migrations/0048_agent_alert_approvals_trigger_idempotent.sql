-- 0048_agent_alert_approvals_trigger_idempotent — rend le trigger de 0045 rejouable.
--
-- Durcissement REA-M04-02. La migration 0045 crée `trg_agent_alert_approval_updated_at`
-- avec un `create trigger` NU (ligne 45). Or Postgres n'accepte pas `create trigger
-- IF NOT EXISTS` : ré-appliquer 0045 (le flux de migration du repo applique le SQL
-- manuellement via psql, sans garde anti-rejeu) échoue alors sur « trigger already
-- exists », cassant la garantie d'idempotence que 0044 et 0043 tiennent déjà en
-- faisant précéder leur `create trigger` d'un `drop trigger if exists`.
--
-- Cette migration ADDITIVE (elle n'édite pas 0045) réaligne le trigger d'approbation
-- sur le même pattern drop+create idempotent. Rejouable elle-même sans effet de bord :
-- le drop est conditionnel, le create recrée à l'identique le binding vers
-- public.set_updated_at() (défini en 0007), inchangé.
--
-- Additif, non destructif — aucune table ni donnée modifiée. La table
-- agent_alert_approvals (0045) reste NON APPLIQUÉE sur gpu1 (interdit par le brief) ;
-- cette migration se contente de garantir que, LORSQUE 0045 sera posée, sa (re)pose
-- ne bute jamais sur le trigger.

drop trigger if exists trg_agent_alert_approval_updated_at on public.agent_alert_approvals;
create trigger trg_agent_alert_approval_updated_at
  before update on public.agent_alert_approvals
  for each row execute function public.set_updated_at();

-- Rollback (référence, non exécuté) :
--   drop trigger if exists trg_agent_alert_approval_updated_at on public.agent_alert_approvals;
