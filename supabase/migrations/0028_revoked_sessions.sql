-- 0028_revoked_sessions
-- Révocation de session rétro-compatible : une déconnexion (ou un kill admin)
-- insère le `jti` du token courant ici ; le check révocation (gaté côté proxy via
-- AUTH_CHECK_REVOCATION) rejette tout token dont le jti est présent. Les tokens
-- legacy SANS jti ne sont jamais matchés → restent acceptés (rétro-compat).
-- Accès via service-role serveur (bypass RLS) ; RLS alignée sur le reste (own data).

create table if not exists public.revoked_sessions (
  jti         text primary key,
  user_id     uuid references users(id) on delete cascade,
  revoked_at  timestamptz default now(),
  token_iat   timestamptz
);

create index if not exists idx_revoked_sessions_user on public.revoked_sessions(user_id);

alter table public.revoked_sessions enable row level security;

create policy "revoked_sessions: own data" on public.revoked_sessions
  for all using ((select auth.uid()) = user_id);
