-- 0049_alert_approvals_pending_decision — boîte d'approbation HUMAINE (HITL).
--
-- REA-PRODUCT-007 / W2. Étend le modèle 0045 (agent_alert_approvals) pour porter
-- une DÉCISION HUMAINE explicite : une action d'agent en attente est créée en
-- statut 'pending' (par le flux agent/gateway, hors périmètre W2) ; un humain du
-- tenant la voit dans la boîte d'approbation et tranche → 'approved' | 'rejected'.
-- La gateway consomme ensuite une approbation ('approved' → 'consumed', 0045).
--
-- ⚠️ NON APPLIQUÉE sur gpu1 (interdit par le brief : aucune migration gpu1). Tant
-- que cette forme du CHECK n'est pas en base, l'insert d'un 'pending' échoue et la
-- boîte d'approbation affiche un état UNAVAILABLE honnête (la lecture des colonnes
-- existantes reste possible ; seule la valeur 'pending'/'rejected' est nouvelle).
--
-- Additif, non destructif : on remplace uniquement la contrainte CHECK du statut
-- pour admettre les deux nouveaux états. Aucune donnée existante modifiée
-- ('approved'/'consumed'/'revoked' restent valides). Idempotent (drop if exists).

alter table public.agent_alert_approvals
  drop constraint if exists agent_alert_approvals_status_check;

alter table public.agent_alert_approvals
  add constraint agent_alert_approvals_status_check
  check (status in ('pending','approved','rejected','consumed','revoked'));

-- Traçabilité de la décision humaine (qui + quand). Additif, nullable → aucun
-- backfill requis, aucune ligne existante invalidée.
alter table public.agent_alert_approvals
  add column if not exists decided_by uuid;
alter table public.agent_alert_approvals
  add column if not exists decided_at timestamptz;

-- Index de la boîte d'approbation : lister le 'pending' d'un tenant, le plus
-- récent d'abord. Couvre le WHERE (tenant_id, status) + ORDER BY created_at.
create index if not exists idx_agent_alert_approval_pending
  on public.agent_alert_approvals (tenant_id, status, created_at desc);

-- L'unicité de 0045 (uq_agent_alert_approval_active, where status='approved')
-- reste inchangée : au plus une approbation ACTIVE par (tenant, match, canal,
-- hash). Un 'pending' n'entre pas dans cet index → plusieurs en attente possibles,
-- la décision humaine promeut au plus l'un d'eux en 'approved'.

comment on column public.agent_alert_approvals.decided_by is
  'Utilisateur (tenant) ayant tranché pending → approved/rejected (HITL boîte d''approbation).';

-- Rollback (référence, non exécuté) :
--   drop index if exists idx_agent_alert_approval_pending;
--   alter table public.agent_alert_approvals drop column if exists decided_at;
--   alter table public.agent_alert_approvals drop column if exists decided_by;
--   alter table public.agent_alert_approvals drop constraint if exists agent_alert_approvals_status_check;
--   alter table public.agent_alert_approvals add constraint agent_alert_approvals_status_check
--     check (status in ('approved','consumed','revoked'));
