# Real estate Agent

> Projet créé via `/setup-adrien`. Stack : Next.js 16 (App Router) + Electron. Région Supabase : eu-west-1.

## Langue & mode
- Toutes les réponses en **français**.
- Mode **autonomie totale** : tu exécutes, tu ne demandes pas confirmation pour chaque étape.

## Stack
- **Web** : Next.js 16.2 (App Router, Turbopack) sur port `3002` — hébergé sur **Vercel** (`https://real-estate-agent.vercel.app`).
- **DB** : **Postgres self-hosté gpu1** derrière **PostgREST + Caddy** (`https://real-estate-agent-db.hearst.app`, tunnel Cloudflare `hearst-prod`). ⚠️ **PostgREST-only** : GoTrue (Auth), Storage et Realtime Supabase sont **absents** — l'auth est recâblée en RPC Postgres (`verify_login`, migration 0037), le stockage passe par **Cloudflare R2** (`lib/storage/r2.ts`). L'ancien Supabase Cloud (`pyxhhkdjirqambhlpuqz`) est **supprimé**.
- **Cache/Queue** : Redis (Railway `redis.railway.internal:6379` ou Upstash REST en runtime)
- **Hosting** : Vercel (app Next) + gpu1 (DB) + Railway (redis). Doc complète : [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
- **Desktop** : Electron (splash sélecteur d'env local/prod, build signé/notarisé)
- **Design system** : Cockpit — **copie locale éditable** de ce repo (`app/globals.css` + `components/cockpit/`, Tailwind v4 utilities). Pas de source centrale, pas de resync.

## ⚡ Opérations DB — gpu1 self-host (PostgREST)

Le MCP Supabase **ne s'applique plus** (Cloud supprimé). La DB est un Postgres self-hosté gpu1 exposé par PostgREST.

- **Diagnostic schéma** : `node scripts/db-diagnose.mjs` (compare 59 tables attendues au réel, teste `verify_login`, RLS anon/service-role, GoTrue/Storage/Realtime). Lit `.env.local`, masque les secrets.
- **Appliquer une migration** : SQL versionné dans `supabase/migrations/NNNN_nom.sql`, puis appliqué sur gpu1 :
  ```bash
  ssh gpu1 'docker exec -i nexus-postgres psql -U postgres -d real-estate-agent' < supabase/migrations/00NN_nom.sql
  ssh gpu1 'docker kill -s SIGUSR1 real-estate-agent-postgrest'   # reload cache PostgREST (obligatoire après DDL)
  ```
- **Lectures / data fixes** : PostgREST REST (`/rest/v1/…`, service-role côté serveur uniquement).
- JAMAIS `supabase db push` (interactif). Toujours versionner en parallèle dans `supabase/migrations/`.
- Détail complet : [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) §Migrations.

## 🔐 Auth & multi-tenant

- Auth = **email + mot de passe** (pas de magic link). Seul l'admin crée des users.
- Flux : `/api/auth/login` vérifie le mot de passe via la **RPC Postgres `verify_login`** (bcrypt/pgcrypto, migration 0037 — plus de GoTrue/`signInWithPassword`) → émet un **JWT jose** custom → cookie `real_estate_agent_token` (httpOnly, 30j, sliding session, `Domain=.hearst.app` en prod).
- Garde : `proxy.ts` (Next 16 — **PAS** `middleware.ts`) vérifie le JWT. Routes ouvertes : `/auth/*`, `/api/auth/login`, `/api/auth/logout`, `/api/health`. Tout le reste exige une session ; `/api/*` non connecté → 401 JSON.
- Layouts : `app/layout.tsx` (racine, **sans** CockpitShell) ; `app/(dashboard)/layout.tsx` (garde serveur + CockpitShell) ; `app/auth/login/` hors shell.
- Profil : `app/(dashboard)/profile/page.tsx` (déconnexion principale ici).
- Tenant : `current_tenant_id()` + RLS `(select …)` + hook JWT `custom_access_token_hook`. Le client service-role bypass RLS → **toujours filtrer `user_id` + `tenant_id` explicitement** côté code.
- Révocation session : `revoked_sessions` (migration 0028) — logout / kill admin insèrent le `jti` ; le proxy rejette les tokens révoqués quand `AUTH_CHECK_REVOCATION=true`. **Activée** → posée en `.env.local` + **Vercel** (Production + Preview) ; Railway = redis-only, non concerné. Prend effet au prochain déploiement (sans ça, le logout n'efface que le cookie navigateur). Fail-open (blip DB → laisse passer, jamais de lock massif) ; tokens legacy sans `jti` ignorés (rétro-compat).
- Mémoire Cockpit : table `tenant_memory` isolée par tenant + user. Capture `« mémorise: … »`, réinjection des 20 dernières dans le system prompt.
- Admin : `admin@real-estate-agent.app` — identifiants dans `docs/credentials.local.txt` (gitignored).

## 🤖 Stack LLM

| Provider | Var | Usage | SDK |
|---|---|---|---|
| **OpenAI** | `OPENAI_API_KEY` (+ `OPENAI_CHAT_MODEL`/`_FALLBACK_MODEL`/`_TIMEOUT_MS`) | **Chat Cockpit** (moteur principal) | `openai` |
| **Claude** | `ANTHROPIC_API_KEY` | Entretien/estimation | `@anthropic-ai/sdk` |

- Le chat Cockpit (`app/api/cockpit-chat/route.ts`) utilise **OpenAI** via `lib/llm/openai.ts` + `lib/agent/run.ts` (function-calling natif, streaming NDJSON). Modèle par défaut `gpt-5.4`, fallback `gpt-5.4-mini` — **vérifier la dispo réelle sur le compte** avant de figer un modèle, ne pas en supposer un.
- **Mode dégradé** : `OPENAI_API_KEY` absente → la route chat renvoie 503 (assistant non configuré), le reste de l'app fonctionne. Jamais de fausse réponse.
- **Tools** : lecture directe (owner-check user+tenant), mutation → **confirmation humaine obligatoire** (jamais d'exécution silencieuse). Aucun tool `execute_sql`/`call_any_route`/`run_code`. Le modèle ne reçoit jamais le service-role. Données métier (notes/annonces) = non fiables (protection prompt injection).
- **Kimi** (`lib/llm/kimi.ts`) : conservé UNIQUEMENT pour l'entretien d'estimation (`lib/ai/interview.ts`), pas pour le Cockpit.
- Runtime `nodejs` + `dynamic = "force-dynamic"` sur la route chat.
- JAMAIS hardcoder une clé — toujours `process.env.X`, **serveur uniquement** (jamais `NEXT_PUBLIC_*`, jamais dans le renderer Electron). JAMAIS de client LLM hors `lib/llm/`.

## 🧩 Modules produit (état final — Mission 04)

**Conservés** : CRM (leads/mandats/biens/visites/agenda), Estimation, Prospection, Auth/Admin, Cockpit OpenAI, Electron.

**RETIRÉS** (décision produit — ne pas remettre sans décision explicite) : **Invest** (tokenisation/souscriptions/portefeuille/closing/KIIS) et **Swarms/CrewAI/Missions** (orchestration multi-agents interne). Pages/routes/libs/composants supprimés du runtime ; les tables `inv_*` et `swarm_*` restent **dormantes** en DB (aucun DROP). Les futurs agents seront développés séparément (LangSmith), pas dans un moteur Swarms interne.

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
Le DS Cockpit vit dans ce repo (`components/cockpit/` + `app/globals.css`, Tailwind v4 utilities — voir [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md)). C'est LA copie de ce repo, éditable librement ici : composants, tokens, classes se modifient directement. Pas de source centrale à mettre à jour, pas de resync, pas de lint bloquant sur le design. Seule règle : garder la cohérence visuelle interne du repo.
- Recette de page, primitives et vocabulaire : **[components/cockpit/AGENTS.md](components/cockpit/AGENTS.md)**. Compose les primitives quand elles existent ; sinon, libre de les faire évoluer ou d'en créer ici.
- `data-product` = attribut de scope CSS (accent dédié par section), pas un verrou global — le thème par défaut vit directement dans `app/globals.css`.

## Conventions
- Pas de magic numbers. Tout via `.env.local` ou `config/`.
- RLS activée sur toutes les tables — toute nouvelle table DOIT avoir une policy + index sur chaque FK.
- Secrets dans `.env.local` (gitignored) + `docs/api-config/SERVICES.md` (gitignored).

## Référentiels
- Services & API keys : [docs/api-config/SERVICES.md](docs/api-config/SERVICES.md) *(gitignored)*
- Variables locales : [.env.local](.env.local) *(gitignored)*
- Guide UI agent : [components/cockpit/AGENTS.md](components/cockpit/AGENTS.md)
- Design system (copie locale, source de vérité de CE repo) : [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) · `components/cockpit/` + `app/globals.css`
