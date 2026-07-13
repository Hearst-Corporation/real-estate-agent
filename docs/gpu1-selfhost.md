# Self-hosting gpu1 — Real Estate Agent

> Migré de Supabase Cloud vers gpu1 le **2026-07-13** via `/cloud-adrien`.
> Le projet Cloud `pyxhhkdjirqambhlpuqz` **avait été supprimé** côté Supabase
> (DNS `db.pyxhhkdjirqambhlpuqz.supabase.co` mort, ref absent de `list_projects`)
> → pas de `pg_dump` possible → montage en mode **`install`** (schéma reconstruit
> depuis les 40 migrations locales `supabase/migrations/*`, base sans données).

## Montage (reproduit le modèle Nexus, isolation stricte par workspace)

| Élément | Valeur |
|---|---|
| Base Postgres | `real-estate-agent` sur le conteneur partagé `nexus-postgres` (gpu1) |
| Rôle login PostgREST | `authenticator_real_estate_agent` (mot de passe propre) |
| Secret JWT workspace | `~/real-estate-agent-db/.jwt_secret` (unique — étanche l'isolation) |
| PostgREST | conteneur `real-estate-agent-postgrest` (`postgrest/postgrest`, `nexus-net`) |
| Caddy | conteneur `real-estate-agent-caddy` (`caddy:2`) sur `:8101` |
| Storage | **non posé** (0 bucket côté Cloud) |
| URL publique | `https://real-estate-agent-db.hearst.app` → `172.17.0.1:8101` |
| Tunnel | `hearst-prod` (`7b73bae6…`), route ajoutée via **config distante** (API CF) |

⚠️ Le tunnel `hearst-prod` est **remotely-managed** : le `/etc/cloudflared/config.yml`
local est ignoré. Toute route s'édite via `PUT /accounts/{acc}/cfd_tunnel/{tun}/configurations`
avec le token `CLOUDFLARE_TUNNEL_TOKEN` (scope `Account:Cloudflare Tunnel:Edit`).

Layout gpu1 : `~/real-estate-agent-db/` (Caddyfile, roles/grants/harden.sql,
00_prelude.sql, migrations/, .jwt_secret, .auth_pwd).

## Variables (.env.local)

```
NEXT_PUBLIC_SUPABASE_URL=https://real-estate-agent-db.hearst.app
SUPABASE_URL=https://real-estate-agent-db.hearst.app
NEXT_PUBLIC_SUPABASE_PROJECT_REF=real-estate-agent
NEXT_PUBLIC_SUPABASE_ANON_KEY=<JWT anon re-signé, secret workspace>
SUPABASE_SERVICE_ROLE_KEY=<JWT service_role re-signé, secret workspace>
SUPABASE_JWT_SECRET=<secret workspace>
```

Les anciennes clés Cloud sont dans `.env.local.bak-*` (rupture nette voulue).

## Auth recâblée (limite GoTrue résolue)

Le montage PostgREST **ne reprend pas GoTrue** → `sb.auth.signInWithPassword` HS.
Recâblage propre (migration **0037**) :
- table `public.auth_credentials` (email, `password_hash` bcrypt via pgcrypto, tenant_id, role) ;
- RPC `verify_login(p_email, p_password)` SECURITY DEFINER → renvoie l'identité si le hash matche ;
- `app/api/auth/login/route.ts` appelle `sb.rpc("verify_login", …)` au lieu de GoTrue.
  Le reste du flow (JWT jose, cookie, MFA, proxy) est **inchangé**.

Admin seedé : `admin@real-estate-agent.app` (id `9717aa27-…`, role admin, tenant `default`).
Créer un user = INSERT dans `auth.users` + `auth_credentials` (hash `extensions.crypt(pwd, gen_salt('bf'))`).

## Prélude schéma (00_prelude.sql)

Stubs des objets Supabase-managed nécessaires aux migrations : schéma `auth`
(+ `auth.users` minimal, cible des 36 FK), `auth.uid()`/`auth.jwt()` (lisent les
claims JWT PostgREST), schéma `extensions` (pgcrypto, uuid-ossp), rôle `supabase_auth_admin`.

## Limites de ce montage (explicites)

- **Auth GoTrue** non reprise → login recâblé sur `verify_login` (ci-dessus).
  Pas de magic link, OAuth providers, reset email natifs Supabase.
- **Edge Functions** Cloud non migrées.
- **Realtime** non repris.
- **Storage** non posé (0 bucket) — à ajouter via `/cloud-adrien` si des buckets apparaissent.
- Base **sans données** (le Cloud était supprimé) : schéma complet, tables vides.

## Diag / réparation

```bash
ssh gpu1 'docker ps --format "{{.Names}}\t{{.Status}}" | grep real-estate-agent'
curl -s -o /dev/null -w "%{http_code}\n" https://real-estate-agent-db.hearst.app/   # 200
# reload schema cache après une migration :
ssh gpu1 'docker kill -s SIGUSR1 real-estate-agent-postgrest'
```
