-- 0037 — Auth locale (self-hosté gpu1) : remplace GoTrue signInWithPassword.
--
-- Contexte : migration Cloud → gpu1 (/cloud-adrien install, 2026-07-13). Le
-- montage gpu1 = PostgREST + Storage, PAS GoTrue → `sb.auth.signInWithPassword`
-- ne fonctionne plus. On recâble la vérif password EN BASE via pgcrypto (bcrypt),
-- exposée en RPC PostgREST. Le reste du flow auth (JWT jose, cookie, MFA, proxy)
-- est déjà custom et INCHANGÉ.
--
-- `auth.users` reste la source des FK (36 FK pointent dessus). auth_credentials
-- porte le secret de login ; app_metadata (tenant_id/role) déménage ici aussi.

CREATE TABLE IF NOT EXISTS public.auth_credentials (
  user_id       uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  tenant_id     text NOT NULL DEFAULT 'default',
  role          text NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Pas d'accès anon/authenticated : seul service_role (serveur) lit/écrit.
REVOKE ALL ON public.auth_credentials FROM anon, authenticated;

-- verify_login : renvoie l'identité si le password matche le hash bcrypt, sinon 0 ligne.
-- SECURITY DEFINER → tourne avec les droits du owner (accès table même si l'appelant
-- ne l'a pas). Recherche par email exact, comparaison en temps constant via crypt().
CREATE OR REPLACE FUNCTION public.verify_login(p_email text, p_password text)
RETURNS TABLE (user_id uuid, tenant_id text, role text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT c.user_id, c.tenant_id, c.role
  FROM public.auth_credentials c
  WHERE c.email = p_email
    AND c.password_hash = extensions.crypt(p_password, c.password_hash);
$$;

-- Exposée aux rôles PostgREST (la fonction elle-même filtre : mauvais pwd → 0 ligne).
GRANT EXECUTE ON FUNCTION public.verify_login(text, text) TO anon, authenticated, service_role;
