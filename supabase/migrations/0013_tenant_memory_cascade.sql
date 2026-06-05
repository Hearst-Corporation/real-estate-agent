-- 0013_tenant_memory_cascade
-- GC des mémoires orphelines : cascade à la suppression du user (au lieu de SET NULL).
-- Une mémoire est désormais user-scoped (0012) ; un user_id NULL serait illisible et
-- inutile. Cohérent avec les autres FK auth.users du schéma (estimations, etc.).

alter table public.tenant_memory drop constraint if exists tenant_memory_user_id_fkey;
alter table public.tenant_memory
  add constraint tenant_memory_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

-- Purge des éventuelles mémoires déjà orphelines (illisibles depuis le scoping user).
delete from public.tenant_memory where user_id is null;
