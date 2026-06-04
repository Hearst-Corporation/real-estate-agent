create or replace function public.current_tenant_id()
returns text language sql stable set search_path = '' as $$
  select coalesce(nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', ''), 'real-estate-agent');
$$;
alter table users add column if not exists tenant_id text not null default 'real-estate-agent';
alter table cockpit_chats add column if not exists tenant_id text not null default 'real-estate-agent';
alter table cockpit_messages add column if not exists tenant_id text not null default 'real-estate-agent';
create index if not exists idx_cockpit_chats_user on cockpit_chats(user_id);
create index if not exists idx_cockpit_messages_chat on cockpit_messages(chat_id);
create index if not exists idx_cockpit_chats_tenant on cockpit_chats(tenant_id);
create index if not exists idx_cockpit_messages_tenant on cockpit_messages(tenant_id);
drop policy if exists "own chats" on cockpit_chats;
create policy "tenant chats" on cockpit_chats for all
  using ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()))
  with check ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()));
drop policy if exists "own messages" on cockpit_messages;
create policy "tenant messages" on cockpit_messages for all
  using (tenant_id = (select public.current_tenant_id()) and exists (select 1 from cockpit_chats c
    where c.id = chat_id and c.user_id = (select auth.uid()) and c.tenant_id = (select public.current_tenant_id())))
  with check (tenant_id = (select public.current_tenant_id()) and exists (select 1 from cockpit_chats c
    where c.id = chat_id and c.user_id = (select auth.uid()) and c.tenant_id = (select public.current_tenant_id())));
