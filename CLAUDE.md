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
- **Design system** : Cockpit (`app/cockpit.css` + `components/cockpit/`) — source de vérité `~/.claude/assets/cockpit/SPEC.md`

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

## Conventions
- Pas de magic numbers. Tout via `.env.local` ou `config/`.
- RLS activée sur toutes les tables — toute nouvelle table DOIT avoir une policy + index sur chaque FK.
- Design : tokens `--ct-*` uniquement, aucune couleur hex hors `cockpit.css`. `data-product` = seul switch d'accent.
- Secrets dans `.env.local` (gitignored) + `docs/api-config/SERVICES.md` (gitignored).

## Référentiels
- Services & API keys : [docs/api-config/SERVICES.md](docs/api-config/SERVICES.md) *(gitignored)*
- Variables locales : [.env.local](.env.local) *(gitignored)*
- Design system : `~/.claude/assets/cockpit/SPEC.md`
