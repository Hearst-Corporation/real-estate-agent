-- Table users liée à auth.users pour que auth.uid() = id.
create table if not exists users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  created_at timestamptz default now()
);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  created_at timestamptz default now(),
  expires_at timestamptz
);

alter table users enable row level security;
alter table sessions enable row level security;

create policy "users: own data" on users for all using ((select auth.uid()) = id);
create policy "sessions: own data" on sessions for all using ((select auth.uid()) = user_id);
