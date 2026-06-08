# Real estate Agent

> Projet créé via `/setup-adrien`. Stack : Next.js 16 (App Router) + Electron. Région Supabase : eu-west-1.

## Langue & mode
- Toutes les réponses en **français**.
- Mode **autonomie totale** : tu exécutes, tu ne demandes pas confirmation pour chaque étape.

## Stack
- **Web** : Next.js 16.2 (App Router, Turbopack) sur port `3002`
- **DB** : Supabase Postgres — projet ref `pyxhhkdjirqambhlpuqz`
- **Cache/Queue** : Redis (Railway `redis.railway.internal:6379` ou Upstash REST en runtime)
- **Hosting** : Vercel (`hearst-corporation/real-estate-agent`) + Railway (`6f1ed5d5-a69a-4f43-bb0b-54270ac5607a`)
- **Desktop** : Electron (splash sélecteur d'env local/prod, build signé/notarisé)
- **Design system** : Cockpit — **copie locale éditable** de ce repo (`app/cockpit.css` + `components/cockpit/`). Pas de source centrale, pas de resync.

## ⚡ MCP Supabase — règle absolue

Pour TOUTE opération DB, utiliser le **MCP Supabase** sans demander confirmation :

| Opération | Tool MCP | Quand |
|---|---|---|
| Lister tables | `mcp__supabase__list_tables` | Avant tout schema change |
| **Appliquer migration** | `mcp__supabase__apply_migration` | À chaque DDL (snake_case) |
| Exécuter query | `mcp__supabase__execute_sql` | Lectures / data fixes |
| Générer types TS | `mcp__supabase__generate_typescript_types` | Après chaque migration → `lib/supabase/database.types.ts` |
| Logs | `mcp__supabase__get_logs` | Debug |
| Advisors | `mcp__supabase__get_advisors` | Avant prod |

- JAMAIS `supabase db push` (interactif).
- Toujours versionner en parallèle dans `supabase/migrations/NNNN_nom.sql`.
- `project_id` = `pyxhhkdjirqambhlpuqz` (aussi dans `.env.local` → `NEXT_PUBLIC_SUPABASE_PROJECT_REF`).

## 🔐 Auth & multi-tenant

- Auth = **email + mot de passe** (pas de magic link). `disable_signup=true` → seul l'admin API crée des users.
- Flux : `/api/auth/login` vérifie via `signInWithPassword` (service role) → émet un **JWT jose** custom → cookie `real_estate_agent_token` (httpOnly, 30j, sliding session, `Domain=.hearst.app` en prod).
- Garde : `proxy.ts` (Next 16 — **PAS** `middleware.ts`) vérifie le JWT. Routes ouvertes : `/auth/*`, `/api/auth/login`, `/api/auth/logout`, `/api/health`. Tout le reste exige une session ; `/api/*` non connecté → 401 JSON.
- Layouts : `app/layout.tsx` (racine, **sans** CockpitShell) ; `app/(dashboard)/layout.tsx` (garde serveur + CockpitShell) ; `app/auth/login/` hors shell.
- Profil : `app/(dashboard)/profile/page.tsx` (déconnexion principale ici).
- Tenant : `current_tenant_id()` + RLS `(select …)` + hook JWT `custom_access_token_hook`. Le client service-role bypass RLS → **toujours filtrer `user_id` + `tenant_id` explicitement** côté code.
- Révocation session : `revoked_sessions` (migration 0028) — logout / kill admin insèrent le `jti` ; le proxy rejette les tokens révoqués quand `AUTH_CHECK_REVOCATION=true`. **Activée** → posée en `.env.local` + **Vercel** (Production + Preview) ; Railway = redis-only, non concerné. Prend effet au prochain déploiement (sans ça, le logout n'efface que le cookie navigateur). Fail-open (blip DB → laisse passer, jamais de lock massif) ; tokens legacy sans `jti` ignorés (rétro-compat).
- Mémoire Kimi : table `tenant_memory` isolée par tenant + user. Capture `« mémorise: … »`, réinjection des 20 dernières dans le system prompt.
- Admin : `admin@real-estate-agent.app` — identifiants dans `docs/credentials.local.txt` (gitignored).

## 🤖 Stack LLM

| Provider | Var | Usage | SDK |
|---|---|---|---|
| **Claude** | `ANTHROPIC_API_KEY` | LLM principal | `@anthropic-ai/sdk` |
| **OpenAI** | `OPENAI_API_KEY` | Embeddings, fallback | `openai` |
| **Hypercli (Kimi K2.6)** | `HYPERCLI_API_KEY` + `HYPERCLI_BASE_URL` | Chat Cockpit, coding heavy, contexte 256k | `openai` drop-in |

- Le chat Cockpit (`app/api/cockpit-chat/route.ts`) utilise Kimi K2.6 via `lib/llm/kimi.ts`. `HYPERCLI_API_KEY` jamais côté client.
- Kimi émet son raisonnement dans `<think>…</think>` au milieu du flux `content` → **filtre serveur** (machine à états) déjà câblé dans la route. Ne pas le retirer.
- Runtime `nodejs` + `dynamic = "force-dynamic"` sur la route chat.
- JAMAIS hardcoder une clé — toujours `process.env.X`. JAMAIS de client LLM hors `lib/llm/`.

## 🖥️ Infra GPU (gpu1 + gpu2)

| Serveur | LAN | Tailscale | SSH | Services |
|---|---|---|---|---|
| GPU1 | `192.168.1.200` | `100.88.191.49` | `gpu1`, `ubuntu-comput3` | workhorse secondaire |
| GPU2 | `192.168.1.150` | `100.110.74.114` | `gpu2-remote` | ComfyUI :8188 · InvokeAI :9090 |

Tunnel SSH si besoin GPU : `ssh -L 8188:localhost:8188 gpu2-remote -N &`. Doc : `docs/api-config/SERVICES.md`.

## Commandes
- `npm run dev` — Next sur `http://localhost:3002`
- `npm run build` / `npm run lint`
- `npm run electron:dev` — app desktop (Next + Electron)
- `npm run electron:build` — `.dmg` signé/notarisé (release : `/release-mac`)
- `npm run test:e2e` — smoke Playwright
- `/dev-adrien` · `/audit-adrien` · `/ship-adrien` · `/brief-adrien` · `/ready-adrien` (stubs locaux)

## Design system — copie locale éditable
Le DS Cockpit vit dans ce repo (`components/cockpit/` + `app/cockpit/*.css`). C'est LA copie de ce repo, éditable librement ici : composants, tokens (`--ct-*`), CSS se modifient directement. Pas de source centrale à mettre à jour, pas de resync. Seule règle : garder la cohérence visuelle interne du repo.
- Recette de page, primitives et vocabulaire : **[components/cockpit/AGENTS.md](components/cockpit/AGENTS.md)**. Compose les primitives quand elles existent ; sinon, libre de les faire évoluer ou d'en créer ici.
- `data-product` = switch d'accent par défaut, mais tokens et CSS s'éditent directement dans `app/cockpit/`.

## Conventions
- Pas de magic numbers. Tout via `.env.local` ou `config/`.
- RLS activée sur toutes les tables — toute nouvelle table DOIT avoir une policy + index sur chaque FK.
- Secrets dans `.env.local` (gitignored) + `docs/api-config/SERVICES.md` (gitignored).

## Référentiels
- Services & API keys : [docs/api-config/SERVICES.md](docs/api-config/SERVICES.md) *(gitignored)*
- Variables locales : [.env.local](.env.local) *(gitignored)*
- Guide UI agent : [components/cockpit/AGENTS.md](components/cockpit/AGENTS.md)
- Design system (copie locale, source de vérité de CE repo) : `components/cockpit/` + `app/cockpit/*.css`
