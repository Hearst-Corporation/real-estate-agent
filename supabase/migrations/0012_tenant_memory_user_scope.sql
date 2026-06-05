-- 0012_tenant_memory_user_scope
-- Durcit l'isolation de tenant_memory : user-scoped (défense en profondeur).
-- Le service-role bypass la RLS ; le code filtre désormais user_id explicitement.
drop policy if exists "tenant memory" on public.tenant_memory;
create policy "tenant memory" on public.tenant_memory for all
  using (tenant_id = (select public.current_tenant_id()) and user_id = (select auth.uid()))
  with check (tenant_id = (select public.current_tenant_id()) and user_id = (select auth.uid()));
