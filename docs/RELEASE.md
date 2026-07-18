# Livraison — Real Estate Agent (Azigo)

> Voir [DEPLOYMENT.md](DEPLOYMENT.md) pour la topologie complète.

## Version en production (2026-07-18)

| | |
|---|---|
| URL | **https://real-estate-agent-iota-nine.vercel.app** |
| Commit | `main @ 210f572a27703899e8992a6a70edb3000adc905e` |
| Health | `GET /api/health` → **200**, `db: "up"` |
| Schéma DB | migrations appliquées sur GPU1 **jusqu'à `0058`** ([gpu1-activation-009.md](gpu1-activation-009.md)) |
| Backend | GPU1 / PostgREST (`getGpu1Admin()`) — **Supabase retiré** |

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
npm run check     # gate complète (secrets, eslint, nav, strings, manifest, typecheck, biome, catalyst, no-supabase)
npm test          # tests unitaires (vitest)
npm run test:migrations   # cohérence statique des migrations (sans DB)
npm run build     # build production
npm run start     # next start -p 3002
npm run electron:build   # .dmg signé/notarisé
```

## Migrations
Appliquées sur gpu1 après `pg_dump` (voir DEPLOYMENT.md §4/§7). **État : `0001`→`0058`
toutes appliquées** (2026-07-18, données métier inchangées). Aucune migration en attente.

## Vérifications post-déploiement
- `GET /api/health` → 200, `db:up`. **Vérifié le 2026-07-18 sur la prod** (`db:"up"`).
- Login → Dashboard → Leads/Biens/Mandats/Visites/Agenda/Estimations/Prospection → 200.
- `/invest/*`, `/swarms/*`, `/missions/*` → **404** (retirés).
- Cockpit : `POST /api/cockpit-chat` sans auth → 401 ; avec auth + `OPENAI_API_KEY`
  valide + quota → réponse streamée ; sans clé → 503 honnête (app fonctionne).

## Rollback
- App : Vercel *Promote* d'un déploiement stable, ou `git revert`.
- DB : aucune migration destructive dans cette livraison. Backup `pg_dump` avant tout.

## Limitations connues
- **Cockpit OpenAI** : le code est complet et testé, mais la génération réelle dépend du
  **quota du compte OpenAI** (constaté `insufficient_quota`/429 lors de la livraison Mission 04 —
  **état du quota non revérifié depuis**). Le mode dégradé est honnête (message d'erreur,
  jamais de fausse réponse).
- **Resend** (email) : **configuré en production** (`RESEND_API_KEY` + `RESEND_FROM_EMAIL`)
  mais **jamais testé** — aucun envoi réel n'a été effectué.
- **Aigent** (copilotes) : **CONFIG** — `AIGENT_RUNTIME_BASE_URL`/`AIGENT_RUNTIME_TOKEN`
  absentes. Même une fois configuré, le registre côté producteur est un **skeleton**
  (liste d'agents vide, `run` → 404) : l'intégration ne peut pas encore rendre de service réel.
- **Twilio** (SMS/WhatsApp) : **CONFIG** — `TWILIO_*` absentes.
- Kimi (`lib/llm/kimi.ts`) conservé uniquement pour l'entretien d'estimation.
- MoteurImmo inutilisable (host mort) — Apify est la source d'annonces.
- Apollo : clé invalide ; PDL couvre l'enrichissement.

> Ces capacités en `CONFIG` sont **volontairement conservées** : elles dégradent honnêtement
> (aucun faux envoi, aucun faux résultat). Ne pas les supprimer au motif qu'elles sont inactives.
