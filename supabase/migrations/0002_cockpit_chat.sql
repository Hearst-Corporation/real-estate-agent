create table if not exists cockpit_chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  title text default 'Nouvelle conversation',
  created_at timestamptz default now()
);
create table if not exists cockpit_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid references cockpit_chats(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  created_at timestamptz default now()
);
alter table cockpit_chats enable row level security;
alter table cockpit_messages enable row level security;
create policy "own chats" on cockpit_chats for all using ((select auth.uid()) = user_id);
create policy "own messages" on cockpit_messages for all
  using (exists (select 1 from cockpit_chats c where c.id = chat_id and c.user_id = (select auth.uid())));
