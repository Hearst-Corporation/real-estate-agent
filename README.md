# Azigo

Logiciel de gestion pour agent immobilier : CRM, estimation d'un bien (avis de
valeur IA), prospection d'annonces, et un assistant conversationnel (Cockpit).

## Modules livrés

- **CRM** — leads, mandats, biens, visites, agenda.
- **Estimation** — avis de valeur déterministe (BAN, DVF, cadastre IGN, ADEME),
  comparables, PDF, partage sécurisé, liaison CRM.
- **Prospection** — ingestion d'annonces (Apify), déduplication, matching,
  liaison CRM/estimation, contact avec validation humaine, opt-out.
- **Cockpit** — assistant IA transversal (OpenAI) : lecture des données, actions
  préparées avec confirmation humaine.
- **Auth/Admin** — email + mot de passe, JWT jose, MFA TOTP, audit.
- **Desktop** — application Electron (build signé/notarisé).

## Production

| | |
|---|---|
| **URL** | https://real-estate-agent-iota-nine.vercel.app |
| **Commit déployé** | `main @ 210f572a27703899e8992a6a70edb3000adc905e` |
| **Health** (2026-07-18) | `GET /api/health` → **200**, `db: "up"` |
| **Migrations DB** | appliquées sur GPU1 **jusqu'à `0058`** — voir [`docs/gpu1-activation-009.md`](docs/gpu1-activation-009.md) |

> Le domaine `real-estate-agent.vercel.app` **n'est pas** cette application (il répond une
> autre app). Utiliser l'URL ci-dessus.

## Stack

- **Web** : Next.js 16.2 (App Router), port `3002`, déployé sur Vercel.
- **DB** : Postgres + PostgREST self-host gpu1 (`real-estate-agent-db.hearst.app`),
  **backend unique**, accédé via `getGpu1Admin()` (`lib/gpu1`). **Supabase est retiré** :
  aucun SDK, aucune var `SUPABASE_*` — gate `npm run check:no-supabase`. Le dossier
  `supabase/migrations/` n'est qu'une convention de chemin (SQL Postgres standard).
- **Stockage** : Cloudflare R2. **Cache/Queue** : Redis. **Jobs** : Inngest.
- **LLM** : OpenAI (chat Cockpit) · Claude (entretien d'estimation).
- **Design System** : Cockpit — copie locale éditable, utilities Tailwind v4.
  Voir [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md).

## Intégrations externes — état réel (2026-07-18)

| Intégration | État |
|---|---|
| **Resend** (email) | **configuré en production** (`RESEND_API_KEY` + `RESEND_FROM_EMAIL`) mais **non testé** — aucun envoi réel effectué. |
| **Aigent** (copilotes) | **CONFIG** — `AIGENT_RUNTIME_BASE_URL`/`AIGENT_RUNTIME_TOKEN` absentes ; côté producteur le registre est un skeleton (liste vide, `run` → 404). |
| **Twilio** (SMS/WhatsApp) | **CONFIG** — `TWILIO_*` absentes. |

Ces capacités restent dans le produit et dégradent honnêtement (aucun faux envoi).

## Démarrage

```bash
cp .env.example .env.local     # renseigner les variables (voir ci-dessous)
npm install
npm run dev                     # web sur http://localhost:3002
npm run electron:dev            # application desktop
```

En worktree Git (`node_modules` symliké → Turbopack panique, `pnpm <script>` interdit) :

```bash
AUTH_DEV_BYPASS=true node_modules/.bin/next dev --webpack -p 3002
```

`AUTH_DEV_BYPASS` est **strictement local** : posé avec `NODE_ENV=production`, le boot échoue.

## Variables d'environnement

Copier [`.env.example`](.env.example). Requises au boot :
`GPU1_POSTGREST_URL`, `GPU1_POSTGREST_ADMIN_TOKEN`, `JWT_SECRET`,
`ANTHROPIC_API_KEY` (DB = Postgres self-hosté gpu1 via PostgREST, serveur-only —
aucune variable `NEXT_PUBLIC_*` DB). Le Cockpit OpenAI
(`OPENAI_API_KEY`) est optionnel — le chat dégrade proprement si absent. Les clés
vivent uniquement en `.env.local` (gitignored), jamais committées.

## Commandes

```bash
npm run dev            # serveur de dev (port 3002)
npm run check          # gate complète (secrets, eslint, nav, strings, manifest, typecheck, biome, catalyst, no-supabase)
npm test               # tests unitaires (vitest)
npm run test:migrations # cohérence statique des migrations (sans DB)
npm run build          # build production
npm run electron:build # .dmg signé/notarisé
```

## Documentation

- [`CLAUDE.md`](CLAUDE.md) — architecture, conventions, règles, état production.
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — déploiement (Vercel + gpu1).
- [`docs/RELEASE.md`](docs/RELEASE.md) — version livrée et limites.
- [`docs/gpu1-selfhost.md`](docs/gpu1-selfhost.md) — DB self-host (montage).
- [`docs/gpu1-activation-009.md`](docs/gpu1-activation-009.md) — **état réel des migrations sur GPU1**.
- [`docs/ESTIMATION.md`](docs/ESTIMATION.md) · [`docs/PROSPECTION.md`](docs/PROSPECTION.md) · [`docs/CRM_ORCHESTRATION.md`](docs/CRM_ORCHESTRATION.md) — modules.
- [`docs/qa/`](docs/qa/) — preuves QA (captures + manifests). [`docs/archive/`](docs/archive/) — rapports de vagues passées (**historique, ne fait pas foi**).

> Les modules Invest (tokenisation) et Swarms (multi-agents) ont été retirés du
> produit. Les tables `inv_*`/`swarm_*` restent dormantes en DB.
