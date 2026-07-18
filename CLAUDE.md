# Real estate Agent

> Stack : Next.js 16 (App Router) + Electron. **Backend unique : Postgres self-hosté GPU1 derrière PostgREST** — Supabase est définitivement retiré du produit.

## Langue & mode
- Toutes les réponses en **français**.
- Mode **autonomie totale** : tu exécutes, tu ne demandes pas confirmation pour chaque étape.

## 🚀 État production (vérifié le 2026-07-18)

| Fait | Valeur |
|---|---|
| URL production | **https://real-estate-agent-iota-nine.vercel.app** |
| Commit déployé | `main @ 210f572a27703899e8992a6a70edb3000adc905e` |
| Health | `GET /api/health` → **200**, `db: "up"` |
| Migrations appliquées sur GPU1 | **jusqu'à `0058`** (voir [docs/gpu1-activation-009.md](docs/gpu1-activation-009.md)) |

⚠️ Le domaine `real-estate-agent.vercel.app` **n'héberge pas cette app** (répond une autre
application). Ne pas l'utiliser comme URL de prod. `electron/main.ts` pointe encore dessus
(`prod`) — divergence connue, à corriger côté code.

## Stack
- **Web** : Next.js 16.2 (App Router) sur port `3002` — hébergé sur **Vercel**.
- **DB** : **Postgres self-hosté gpu1** derrière **PostgREST + Caddy** (`https://real-estate-agent-db.hearst.app`, tunnel Cloudflare `hearst-prod`). Client unique : **`getGpu1Admin()` de `@/lib/gpu1`**. ⚠️ **PostgREST-only** : ni GoTrue (Auth), ni Storage, ni Realtime — l'auth est recâblée en RPC Postgres (`verify_login`, migration 0037), le stockage passe par **Cloudflare R2** (`lib/storage/r2.ts`).
- **Supabase : RETIRÉ** — aucun SDK `@supabase/*`, aucun helper `getSupabaseAdmin`, aucune var `SUPABASE_*`/`NEXT_PUBLIC_SUPABASE_*` dans le runtime. La gate `npm run check:no-supabase` (`scripts/check-no-supabase.mjs`) casse le build si l'un d'eux réapparaît. Le dossier `supabase/migrations/` ne garde ce nom que par **convention de chemin historique** : c'est du SQL Postgres standard rejoué sur GPU1.
- **Cache/Queue** : Redis (Railway `redis.railway.internal:6379` ou Upstash REST en runtime)
- **Hosting** : Vercel (app Next) + gpu1 (DB) + Railway (redis). Doc complète : [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
- **Desktop** : Electron (splash sélecteur d'env local/prod, build signé/notarisé)
- **Design system** : Cockpit — **copie locale éditable** de ce repo (`app/globals.css` + `components/cockpit/`, Tailwind v4 utilities). Pas de source centrale, pas de resync.

## ⚡ Opérations DB — gpu1 self-host (PostgREST)

Aucun outil Supabase (CLI, MCP, Management API) ne s'applique : la DB est un Postgres
self-hosté gpu1 exposé par PostgREST.

- **État des migrations** : `supabase/migrations/` contient `0001`→`0058`. **Toutes appliquées sur GPU1** — `0043` et `0047` l'étaient déjà, les 14 restantes (`0044 0045 0046 0048 0049`→`0058`) ont été appliquées le **2026-07-18**, données métier inchangées. Détail : [docs/gpu1-activation-009.md](docs/gpu1-activation-009.md).
- **Diagnostic schéma** : `node scripts/db-diagnose.mjs` (compare les tables attendues au réel, teste `verify_login`, RLS anon/service-role). Lit `.env.local`, masque les secrets.
- **Appliquer une nouvelle migration** (`0059`+) :
  ```bash
  ssh gpu1 'docker exec -i nexus-postgres psql -U postgres -d real-estate-agent -v ON_ERROR_STOP=1' < supabase/migrations/00NN_nom.sql
  ssh gpu1 'docker kill -s SIGUSR1 real-estate-agent-postgrest'   # reload cache PostgREST (obligatoire après DDL)
  ```
  `pg_dump` **avant** toute migration non additive (procédure : [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) §7).
- **Lectures / data fixes** : PostgREST REST (`/rest/v1/…`, service-role côté serveur uniquement).
- Cohérence statique des migrations (sans DB, en CI) : `npm run test:migrations`.
- Détail complet : [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) §4.

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
- **Tools** (25, `lib/agent/tools/`) : lecture directe, toutes mutations owner-check user+tenant systématique. **Confirmation humaine obligatoire uniquement sur les mutations destructives/irréversibles** — `delete_lead` (`crm.ts`) et `send_estimation` (`estimation.ts`) : garde-fou dur, param `confirmed:boolean` requis dans le schema, `execute()` refuse et redemande tant qu'il est absent. Les mutations simples (create_lead, create_property, create_visit, create_mandate, create_estimation, create_calendar_event, etc.) s'exécutent **sans confirmation**, c'est le comportement voulu — pas un oubli. Aucun tool `execute_sql`/`call_any_route`/`run_code`. Le modèle ne reçoit jamais le service-role. Données métier (notes/annonces) = non fiables (protection prompt injection). Vérifié en vrai (Playwright) le 2026-07-16 : create_lead écrit en DB, delete_lead bloque sans confirmation puis exécute après "oui".
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

## 🔌 État réel des intégrations externes (2026-07-18)

Un état `CONFIG` = **capacité conservée mais non branchée** (variables absentes). Le code
dégrade honnêtement (jamais de faux envoi, jamais de faux résultat) — **ne jamais supprimer
une capacité au motif qu'elle est en `CONFIG`**.

| Intégration | Variables | État |
|---|---|---|
| **Resend** (email) | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | **CONFIGURÉ en production** (clé + expéditeur présents) mais **NON TESTÉ** — aucun envoi réel n'a été effectué à ce jour. |
| **Aigent** (copilotes) | `AIGENT_RUNTIME_BASE_URL`, `AIGENT_RUNTIME_TOKEN` | **CONFIG** — variables **absentes**. Note honnête : même configuré, le registre côté producteur est un **skeleton** (liste d'agents vide, `run` → 404). |
| **Twilio** (SMS / WhatsApp) | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM`, `TWILIO_WHATSAPP_FROM` | **CONFIG** — variables **absentes**. |

## Commandes
- `npm run dev` — Next sur `http://localhost:3002` (Turbopack).
  - **En worktree** (`node_modules` symliké → Turbopack panique) : `AUTH_DEV_BYPASS=true node_modules/.bin/next dev --webpack -p 3002`. `AUTH_DEV_BYPASS` est **strictement local** — posé avec `NODE_ENV=production`, le boot throw.
  - **Jamais `pnpm <script>` dans un worktree** (purge les `node_modules` partagés) → binaires directs `node_modules/.bin/*`.
- `npm run check` — gate complète (secrets, eslint, nav, strings, manifest cockpit, typecheck, biome, catalyst, **no-supabase**)
- `npm test` — vitest · `npm run test:migrations` — cohérence statique des migrations
- `npm run build` / `npm run lint`
- `npm run electron:dev` — app desktop (Next + Electron)
- `npm run electron:build` — `.dmg` signé/notarisé (release : `/release-mac`)
- `npm run test:e2e` — smoke Playwright
- `/dev-adrien` · `/audit-adrien` · `/ship-adrien` · `/brief-adrien` · `/ready-adrien` (stubs locaux ; leurs descriptions mentionnent encore Supabase — obsolète, la DB est GPU1)

## Design system — copie locale éditable
Le DS Cockpit vit dans ce repo (`components/cockpit/` + `components/ui/` + `app/globals.css`, utilities Tailwind v4 natives — voir [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md), **source de vérité unique du DS**). C'est LA copie de ce repo, éditable librement : composants, tokens, classes se modifient directement. Pas de source centrale, pas de resync, pas de lint bloquant sur le design. Seule règle : garder la cohérence visuelle interne. Compose les primitives existantes (`components/cockpit/primitives.tsx`, `components/ui/*`) avant d'en créer.
- `data-product` = attribut de scope CSS (accent dédié par section), pas un verrou global — le thème par défaut vit directement dans `app/globals.css`.

## Conventions
- Pas de magic numbers. Tout via `.env.local` ou `config/`.
- RLS activée sur toutes les tables — toute nouvelle table DOIT avoir une policy + index sur chaque FK.
- Secrets dans `.env.local` (gitignored) + `docs/api-config/SERVICES.md` (gitignored).

## Référentiels
- Déploiement / migrations / health : [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) · état DB réel : [docs/gpu1-activation-009.md](docs/gpu1-activation-009.md)
- Preuves QA (captures + manifests) : [docs/qa/](docs/qa/)
- **Archive** (rapports de vagues, docs dépassées — *ne font pas foi*) : [docs/archive/](docs/archive/)
- Services & API keys : [docs/api-config/SERVICES.md](docs/api-config/SERVICES.md) *(gitignored)*
- Variables locales : [.env.local](.env.local) *(gitignored)*
- Design system (source de vérité DS de CE repo) : [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) · `components/cockpit/` + `components/ui/` + `app/globals.css`
