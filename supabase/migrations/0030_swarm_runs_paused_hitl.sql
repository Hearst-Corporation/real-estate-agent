-- swarm_runs.status : autorise 'paused_hitl' (run en pause Human-in-the-Loop).
-- Sans ça, toute persistance d'un run en pause HITL viole le CHECK et le record
-- local reste désynchronisé du moteur (run bloqué silencieusement).
-- Appliqué via MCP le 2026-06-08 (name: swarm_runs_paused_hitl).
alter table public.swarm_runs drop constraint if exists swarm_runs_status_check;
alter table public.swarm_runs
  add constraint swarm_runs_status_check
  check (status in ('pending','running','done','failed','error','paused_hitl'));
