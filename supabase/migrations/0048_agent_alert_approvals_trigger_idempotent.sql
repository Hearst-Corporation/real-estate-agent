-- 0048_agent_alert_approvals_trigger_idempotent — rend le trigger de 0045 rejouable.
--
-- Durcissement REA-M04-02. La migration 0045 crée `trg_agent_alert_approval_updated_at`
-- a été publiée initialement avec un `create trigger` nu. 0045 est désormais
-- elle-même corrigée par un `drop trigger if exists` préalable, afin qu'un rejeu
-- séquentiel ne s'arrête jamais avant 0048. On conserve 0048 comme réparation forward
-- explicite pour un environnement qui aurait déjà appliqué l'ancienne forme de 0045.
--
-- Cette migration ADDITIVE (elle n'édite pas 0045) réaligne le trigger d'approbation
-- sur le même pattern drop+create idempotent. Rejouable elle-même sans effet de bord :
-- le drop est conditionnel, le create recrée à l'identique le binding vers
-- public.set_updated_at() (défini en 0007), inchangé.
--
-- Additif, non destructif — aucune table ni donnée modifiée. L'état live GPU1 de
-- 0045 doit être vérifié par introspection avant application ; 0048 dépend de la
-- relation agent_alert_approvals créée par 0045 et doit donc toujours la suivre.

drop trigger if exists trg_agent_alert_approval_updated_at on public.agent_alert_approvals;
create trigger trg_agent_alert_approval_updated_at
  before update on public.agent_alert_approvals
  for each row execute function public.set_updated_at();

-- Rollback (référence, non exécuté) :
--   drop trigger if exists trg_agent_alert_approval_updated_at on public.agent_alert_approvals;
