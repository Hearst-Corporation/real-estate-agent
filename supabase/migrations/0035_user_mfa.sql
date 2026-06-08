-- 0035_user_mfa
-- MFA TOTP par utilisateur (RFC 6238). Une ligne par user :
--   secret        : secret TOTP base32 (stocké TEL QUEL — nécessaire pour vérifier les codes,
--                    impossible à hasher car il faut le secret en clair pour recalculer le TOTP)
--   enabled       : le 2FA est-il actif (true après confirmation d'un 1er code valide)
--   backup_codes  : HASHES sha256 hex des codes de secours — JAMAIS le clair (le clair n'est
--                    montré qu'une fois à l'utilisateur, on ne stocke que l'empreinte)
--   confirmed_at  : horodatage de l'activation effective
--
-- Sécurité d'accès : table SYSTÈME manipulée UNIQUEMENT par le serveur en service-role
-- (qui BYPASS la RLS). On active donc la RLS SANS aucune policy permissive → deny par défaut
-- pour les rôles anon/authenticated : aucun client (même un user authentifié via PostgREST)
-- ne peut lire ni écrire le secret TOTP ou les hashes. C'est volontairement plus strict que
-- 0028 (revoked_sessions, qui n'héberge aucun secret et tolère une policy "own data").

create table if not exists public.user_mfa (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  secret       text not null,                          -- secret TOTP base32 (clair, requis pour vérif)
  enabled      boolean not null default false,
  backup_codes text[] not null default '{}',           -- HASHES sha256 des codes de secours (jamais le clair)
  created_at   timestamptz not null default now(),
  confirmed_at timestamptz
);

-- RLS activée SANS policy permissive : deny par défaut (anon/authenticated n'ont aucun accès).
-- Seul le service-role (serveur) atteint cette table, en bypass RLS. Protège les secrets MFA.
alter table public.user_mfa enable row level security;
