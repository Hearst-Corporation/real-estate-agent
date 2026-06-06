-- 0017_prosp_matchs_feedback — matchs acquéreur × annonce + feedback ML
create table if not exists public.prosp_matchs (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         text not null,
  user_id           uuid not null references auth.users(id) on delete cascade,
  critere_id        uuid not null references public.prosp_criteres_acquereur(id) on delete cascade,
  annonce_id        uuid not null references public.prosp_annonces(id) on delete cascade,
  score_match       smallint not null,
  score_breakdown   jsonb,
  features_snapshot jsonb,
  alerte_envoyee    boolean not null default false,
  alerte_at         timestamptz,
  created_at        timestamptz not null default now(),
  unique (tenant_id, critere_id, annonce_id)
);
create index prosp_matchs_tenant_idx  on public.prosp_matchs (tenant_id, user_id);
create index prosp_matchs_critere_idx on public.prosp_matchs (critere_id, score_match desc);
alter table public.prosp_matchs enable row level security;
create policy "owner_all" on public.prosp_matchs for all using (
  tenant_id = current_setting('app.tenant_id', true) and user_id = auth.uid()
);

create table if not exists public.prosp_match_feedback (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  text not null,
  user_id    uuid not null references auth.users(id) on delete cascade,
  match_id   uuid not null references public.prosp_matchs(id) on delete cascade,
  signal     text not null check (signal in ('like','dislike','contact','visite')),
  created_at timestamptz not null default now()
);
create index prosp_feedback_match_idx on public.prosp_match_feedback (match_id);
alter table public.prosp_match_feedback enable row level security;
create policy "owner_all" on public.prosp_match_feedback for all using (
  tenant_id = current_setting('app.tenant_id', true) and user_id = auth.uid()
);
