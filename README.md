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

## Stack

- **Web** : Next.js 16.2 (App Router), port `3002`.
- **DB** : Postgres + PostgREST self-host gpu1 (`real-estate-agent-db.hearst.app`).
- **Stockage** : Cloudflare R2. **Cache/Queue** : Redis. **Jobs** : Inngest.
- **LLM** : OpenAI (chat Cockpit) · Claude (entretien d'estimation).
- **Design System** : Cockpit — copie locale éditable, utilities Tailwind v4.
  Voir [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md).

## Démarrage

```bash
cp .env.example .env.local     # renseigner les variables (voir ci-dessous)
npm install
npm run dev                     # web sur http://localhost:3002
npm run electron:dev            # application desktop
```

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
npm run check          # gate complète (typecheck, lint, biome, strings, secrets, nav, catalyst)
npm test               # tests unitaires (vitest)
npm run build          # build production
npm run electron:build # .dmg signé/notarisé
```

## Documentation

- [`CLAUDE.md`](CLAUDE.md) — architecture, conventions, règles.
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — déploiement (Vercel + gpu1).
- [`docs/RELEASE.md`](docs/RELEASE.md) — version livrée et limites.
- [`docs/gpu1-selfhost.md`](docs/gpu1-selfhost.md) — DB self-host.
- [`docs/ESTIMATION.md`](docs/ESTIMATION.md) · [`docs/PROSPECTION.md`](docs/PROSPECTION.md) · [`docs/CRM_ORCHESTRATION.md`](docs/CRM_ORCHESTRATION.md) — modules.

> Les modules Invest (tokenisation) et Swarms (multi-agents) ont été retirés du
> produit. Les tables `inv_*`/`swarm_*` restent dormantes en DB.
