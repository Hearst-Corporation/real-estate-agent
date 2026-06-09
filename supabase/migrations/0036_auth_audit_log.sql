-- 0036_auth_audit_log
-- Journal d'audit des événements d'authentification.
--
-- Chaque action sensible (login, logout, MFA, échecs) produit une ligne ici :
--   user_id    : UUID de l'utilisateur concerné ; NULL si inconnu (login_failed sur email inexistant)
--   event      : type d'événement (voir liste ci-dessous)
--   ip         : adresse IP du client au moment de l'événement (premier hop x-forwarded-for)
--   user_agent : User-Agent tronqué à 500 caractères
--   meta       : données contextuelles libres en JSON (email tenté, raison d'échec…)
--   created_at : horodatage UTC de l'événement
--
-- Événements valides (enforced côté applicatif, pas par CHECK SQL pour garder la flexibilité) :
--   login              – connexion réussie (mot de passe seul, MFA non activé)
--   login_pending_mfa  – 1er facteur validé, 2e facteur attendu (cookie pending émis)
--   login_mfa          – connexion 2FA complète réussie
--   login_failed       – échec d'authentification (mauvais mot de passe, user inconnu…)
--   login_mfa_failed   – code TOTP ou code de secours invalide
--   logout             – déconnexion explicite (jti révoqué)
--   mfa_enabled        – activation du TOTP validée par l'utilisateur
--   mfa_disabled       – désactivation du TOTP
--   mfa_reset          – reset admin des données MFA
--
-- Sécurité d'accès : table FORENSIQUE contenant des données sensibles (IP, email en clair dans meta).
-- Elle est manipulée UNIQUEMENT par le serveur en service-role (qui BYPASS la RLS).
-- On active la RLS SANS aucune policy permissive → deny par défaut pour les rôles
-- anon/authenticated : aucun client (même un user authentifié via PostgREST) ne peut lire
-- ni écrire ces logs. Même pattern que 0035 (user_mfa).
--
-- Note : à appliquer via Management API (mcp__supabase__apply_migration), jamais en CLI interactif.

create table if not exists public.auth_audit_log (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid,                            -- null si user inconnu (ex: login_failed sur email inexistant)
  event       text        not null,            -- login | login_pending_mfa | login_mfa | login_failed | login_mfa_failed | logout | mfa_enabled | mfa_disabled | mfa_reset
  ip          text,
  user_agent  text,
  meta        jsonb       not null default '{}',
  created_at  timestamptz not null default now()
);

-- RLS activée SANS policy permissive : deny par défaut (anon/authenticated n'ont aucun accès).
-- Seul le service-role (serveur) atteint cette table, en bypass RLS. Protège les données forensiques.
alter table public.auth_audit_log enable row level security;

-- Requêtes fréquentes : historique d'un utilisateur (trié par date décroissante)
create index if not exists idx_auth_audit_user_created
  on public.auth_audit_log (user_id, created_at desc);

-- Requêtes fréquentes : filtrage par type d'événement (ex: tous les login_failed récents)
create index if not exists idx_auth_audit_event_created
  on public.auth_audit_log (event, created_at desc);
