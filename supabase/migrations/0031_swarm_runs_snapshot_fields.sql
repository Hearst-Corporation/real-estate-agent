-- swarm_runs : snapshot complet du run (poussé par le webhook moteur ou le poll),
-- pour que les GET puissent servir le record DB sans re-poller le moteur sans
-- perdre les métriques (tokens/coût) ni la décision HITL en attente.
-- Appliqué via MCP le 2026-06-08 (name: swarm_runs_snapshot_fields).
alter table public.swarm_runs add column if not exists tokens_in  integer;
alter table public.swarm_runs add column if not exists tokens_out integer;
alter table public.swarm_runs add column if not exists cost_usd   numeric;
alter table public.swarm_runs add column if not exists decision   jsonb;
