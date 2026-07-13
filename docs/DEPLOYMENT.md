# Déploiement — Real Estate Agent

> Topologie **réelle** au 2026-07-13. Source de vérité DB : [gpu1-selfhost.md](gpu1-selfhost.md).
> Ce document décrit le déploiement de bout en bout (app, DB, stockage, jobs, observabilité, health, rollback, backup).

---

## 1. Topologie

| Composant | Où | Détail |
|---|---|---|
| **App web (Next.js 16.2)** | **Vercel** — `hearst-corporation/real-estate-agent` | `https://real-estate-agent.vercel.app`. C'est aussi l'URL prod chargée par l'app Electron (`electron/main.ts` → `prod`). |
| **DB (Postgres + PostgREST)** | **gpu1 self-host** | `https://real-estate-agent-db.hearst.app` — Caddy `:8101` + PostgREST, derrière tunnel Cloudflare `hearst-prod` (remotely-managed). **PostgREST-only** : pas de GoTrue/Storage/Realtime. Voir [gpu1-selfhost.md](gpu1-selfhost.md). |
| **Auth** | Applicatif | RPC `verify_login` (migration 0037, bcrypt/pgcrypto) → JWT jose custom (`JWT_SECRET`) → cookie `real_estate_agent_token`. Garde = `proxy.ts` (Next 16, **pas** `middleware.ts`). |
| **Stockage photos/docs** | **Cloudflare R2** | `lib/storage/r2.ts` (S3-compatible, aws4fetch). Pas Supabase Storage. |
| **Cache / Queue** | **Redis** | Railway (`REDIS_URL`) ou Upstash REST (`UPSTASH_REDIS_REST_*`, préféré sur Vercel serverless). |
| **Jobs asynchrones** | **Inngest** | Route `app/api/inngest/route.ts` (`serve()`), fonctions dans `lib/jobs/inngest/functions.ts`. Auth par signature HMAC (`INNGEST_SIGNING_KEY`). Fail-soft : sans clé → chemin synchrone. |
| **LLM / Chat Cockpit** | Claude (Anthropic) · OpenAI | Estimation/interview via Claude (`ANTHROPIC_API_KEY`). Chat Cockpit sur OpenAI (`OPENAI_API_KEY`, modèles `OPENAI_CHAT_MODEL`/`_FALLBACK_MODEL`) — **optionnel**, le chat dégrade proprement si absent, le boot ne throw jamais. |
| **Observabilité** | Sentry · Langfuse · PostHog | Tous **optionnels**, mode dégradé si clé absente (le boot ne throw jamais). |

**Modules produit** : Estimation (avis de valeur IA), Prospection (annonces/matching), CRM (leads, biens, mandats, visites, agenda). Les modules Invest (tokenisation) et Swarms (multi-agents) ont été **retirés**.

**Frontière** : l'app tourne sur Vercel, la DB sur gpu1. Aucun `Dockerfile`/`compose` dans le repo — l'app n'est pas conteneurisée (build Vercel natif).

---

## 2. Variables d'environnement

- **Dev** : copier [`.env.example`](../.env.example) → `.env.local` (gitignored). Valeurs réelles dans `docs/api-config/SERVICES.md` (gitignored).
- **Prod (Vercel)** : renseigner les vars de [`.env.production.example`](../.env.production.example) dans *Project Settings → Environment Variables* (Production + Preview).

**Requises au boot** (validées par `lib/env.ts` — zod, throw si manquantes) :
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`.

**Garde-fou prod** : `AUTH_DEV_BYPASS=true` avec `NODE_ENV=production` → **le boot throw** (`lib/env.ts`). Ne jamais définir `AUTH_DEV_BYPASS` en prod (ou `=false`). `AUTH_CHECK_REVOCATION=true` requis en prod pour que le logout serveur soit effectif (sinon le logout n'efface que le cookie navigateur).

---

## 3. Build & run

```bash
npm run build            # next build (build Vercel = même commande)
npm run start            # next start -p 3002   → PORT = 3002
```

Sur Vercel, build et start sont gérés par la plateforme (pas de `start` manuel). En self-host éventuel : `npm run build && npm run start` (PORT 3002).

Electron (desktop, hors CI web) :
```bash
npm run electron:build           # .dmg signé/notarisé (voir /release-mac)
```

---

## 4. Migrations DB

Les migrations vivent dans `supabase/migrations/NNNN_nom.sql` (41 fichiers, `0001`→`0037`).
La base gpu1 a été **montée en reconstruisant le schéma depuis ces migrations** (via `/cloud-adrien`, mode `install`). Il n'y a **pas** de `supabase db push` (interactif, banni). Un script de diagnostic reproductible existe : `scripts/db-diagnose.mjs` (voir §Diagnostic ci-dessous).

**Appliquer une migration sur gpu1** (DDL appliqué sur la base `real-estate-agent`, puis reload du cache PostgREST) :

```bash
# 1. appliquer le SQL sur la base gpu1 (psql via le conteneur nexus-postgres)
ssh gpu1 'docker exec -i nexus-postgres psql -U postgres -d real-estate-agent' < supabase/migrations/00NN_nom.sql

# 2. recharger le cache de schéma PostgREST (OBLIGATOIRE après tout DDL)
ssh gpu1 'docker kill -s SIGUSR1 real-estate-agent-postgrest'
```

> Note : la mémoire projet mentionne aussi l'application de DDL via la Management API Supabase
> (`api.supabase.com/.../database/query` + `SUPABASE_ACCESS_TOKEN`). Ce chemin ciblait le
> **Cloud** (supprimé). Le mécanisme courant est celui ci-dessus (gpu1). Ne pas mixer les deux.

**Diagnostic schéma** — script reproductible qui compare les 59 tables attendues (migrations) au schéma réel, teste la RPC `verify_login`, GoTrue/Storage/Realtime, et le RLS anon vs service-role :
```bash
node scripts/db-diagnose.mjs        # lit .env.local, masque les secrets, sortie lisible
```
Vérifs manuelles rapides en complément :
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://real-estate-agent-db.hearst.app/       # 200 = PostgREST up
ssh gpu1 'docker ps --format "{{.Names}}\t{{.Status}}" | grep real-estate-agent'          # conteneurs up
```

---

## 5. Health check

Endpoint public (route ouverte du proxy) : **`GET /api/health`**.

- Contrôle RÉEL : `app`, `db` (ping PostgREST gpu1, up/down + latence, timeout 3s), `auth` (JWT_SECRET présent), `storage` (vars R2), `jobs` (Inngest).
- **HTTP 200** si la DB est up ; **HTTP 503** si la DB est down (composant critique). `no-store`.
- Ne renvoie **aucun secret**. Le détail `providers` (config des intégrations) n'apparaît qu'avec une session authentifiée.

```bash
curl -s https://real-estate-agent.vercel.app/api/health | jq
# { "ok": true, "service": "real-estate-agent",
#   "checks": { "app":"up","db":"up","dbLatencyMs":120,"auth":"up","storage":"up","jobs":"up" } }
```

Brancher ce endpoint sur le monitoring Vercel / uptime externe → alerte sur 503 ou `db:down`.

---

## 6. Rollback

- **App (Vercel)** : *Deployments → sélectionner le déploiement stable précédent → Promote to Production* (rollback instantané, pas de rebuild). Ou `git revert` + push (redéploie).
- **Migration DB** : les migrations n'ont pas de `down` automatique. Rollback = appliquer un SQL inverse manuel sur gpu1 (même procédure §4). Toujours `pg_dump` (§7) **avant** une migration destructive.
- **Tunnel Cloudflare** : route `hearst-prod` remotely-managed — voir [gpu1-selfhost.md](gpu1-selfhost.md) pour ré-éditer via l'API CF.

---

## 7. Sauvegarde DB (gpu1)

Backup logique de la base `real-estate-agent` (nécessite l'accès SSH gpu1 — commande **documentée, non exécutée ici**) :

```bash
# dump compressé horodaté vers un fichier local
ssh gpu1 'docker exec nexus-postgres pg_dump -U postgres -d real-estate-agent -Fc' \
  > backup-real-estate-agent-$(date +%Y%m%d-%H%M%S).dump

# restauration dans une base (⚠ destructif — cible une base isolée d'abord)
ssh gpu1 'docker exec -i nexus-postgres pg_restore -U postgres -d real-estate-agent --clean --if-exists' \
  < backup-real-estate-agent-<horodatage>.dump
```

Recommandé : cron gpu1 (dump quotidien vers R2 ou disque local), sur le modèle du backup hebdo `cloudflared` déjà en place (`/etc/cron.d/`). À poser côté gpu1, hors périmètre de ce repo.

---

## 8. Checklist go-live

- [ ] Vars requises posées sur Vercel (Production + Preview) — cf `.env.production.example`.
- [ ] `AUTH_DEV_BYPASS` absent/false · `AUTH_CHECK_REVOCATION=true`.
- [ ] `npm run build` vert · `npm run typecheck` vert.
- [ ] `GET /api/health` → 200, `db:up` sur le domaine prod.
- [ ] Migrations appliquées sur gpu1 + `SIGUSR1` reload PostgREST.
- [ ] `pg_dump` récent disponible.
- [ ] Observabilité : Sentry/Langfuse/PostHog actifs si clés posées (sinon dégradé assumé).
