# Livraison — Real Estate Agent (Azigo)

> Produit final Mission 04. Voir [DEPLOYMENT.md](DEPLOYMENT.md) pour la topologie complète.

## Produit livré

Logiciel immobilier pour agent : **CRM** (leads, mandats, biens, visites, agenda),
**Estimation** (avis de valeur IA déterministe, PDF, partage), **Prospection**
(ingestion annonces, matching, contact), **Cockpit** (assistant IA OpenAI
transversal), **Auth/Admin** (JWT jose, MFA), **Electron** (desktop).

**Retirés** de ce produit : Invest (tokenisation) et Swarms/CrewAI (orchestration
multi-agents interne). Tables `inv_*`/`swarm_*` dormantes en DB (non purgées).

## Prérequis
- Node 22+, pnpm. DB Postgres+PostgREST sur gpu1 (`real-estate-agent-db.hearst.app`).
- App déployée sur Vercel ; DB sur gpu1 ; stockage Cloudflare R2.

## Variables (voir `.env.example`)
**Requises au boot** (`lib/env-check.ts`) : `GPU1_POSTGREST_URL`,
`GPU1_POSTGREST_ADMIN_TOKEN`, `JWT_SECRET`, `ANTHROPIC_API_KEY`
(DB = Postgres self-hosté gpu1 via PostgREST, serveur-only — aucune var `NEXT_PUBLIC_*` DB).
**Cockpit OpenAI** (optionnel, mode dégradé si absent) : `OPENAI_API_KEY`,
`OPENAI_CHAT_MODEL` (défaut `gpt-5.4`), `OPENAI_CHAT_FALLBACK_MODEL`
(`gpt-5.4-mini`), `OPENAI_CHAT_TIMEOUT_MS` (45000).
**Garde-fou prod** : `AUTH_DEV_BYPASS` absent/false, `AUTH_CHECK_REVOCATION=true`.
Clés **serveur uniquement** — jamais `NEXT_PUBLIC_*`, jamais dans le renderer Electron.

## Commandes
```bash
npm run check     # gate complète (typecheck, lint, biome, strings, secrets, nav, legal, catalyst)
npm test          # 294 tests
npm run build     # build production
npm run start     # next start -p 3002
npm run electron:build   # .dmg signé/notarisé
```

## Migrations
Appliquées sur gpu1 après `pg_dump` (voir DEPLOYMENT.md §4/§7). Cette livraison
n'ajoute aucune migration (retrait applicatif uniquement, tables dormantes conservées).

## Vérifications post-déploiement
- `GET /api/health` → 200, `db:up`.
- Login → Dashboard → Leads/Biens/Mandats/Visites/Agenda/Estimations/Prospection → 200.
- `/invest/*`, `/swarms/*`, `/missions/*` → **404** (retirés).
- Cockpit : `POST /api/cockpit-chat` sans auth → 401 ; avec auth + `OPENAI_API_KEY`
  valide + quota → réponse streamée ; sans clé → 503 honnête (app fonctionne).

## Rollback
- App : Vercel *Promote* d'un déploiement stable, ou `git revert`.
- DB : aucune migration destructive dans cette livraison. Backup `pg_dump` avant tout.

## Limitations connues
- **Cockpit OpenAI** : le code est complet et testé, mais la génération réelle
  dépend du **quota du compte OpenAI**. Au moment de la livraison, le compte est en
  `insufficient_quota` (429) → recharger le crédit OpenAI pour activer le chat. Le
  mode dégradé est honnête (message d'erreur, jamais de fausse réponse).
- Kimi (`lib/llm/kimi.ts`) conservé uniquement pour l'entretien d'estimation.
- MoteurImmo inutilisable (host mort) — Apify est la source d'annonces.
- Apollo : clé invalide ; PDL couvre l'enrichissement.
