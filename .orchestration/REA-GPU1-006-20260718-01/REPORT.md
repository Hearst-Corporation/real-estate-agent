# RAPPORT — REA-GPU1-006 (migration native GPU1/PostgREST)

> **MODE QUICK** (owner : « code juste, arrête les tests »). Exécution + intégration priorisées,
> validation globale réduite au boot local. RC : `feature/rea-gpu1-native-006` @ `8add003`,
> base `feature/rea-release-005` @ `044ebd2`. PR #16 intacte, `main`/`release-005` non touchés.

## Ce qui a été développé
Le SDK Supabase est retiré du runtime au profit d'un **client PostgREST GPU1 natif** :
- **M01** — `lib/gpu1/` : `getGpu1Admin(): Gpu1Client<Database>|null`, fetch natif, timeout/abort,
  query builder aligné supabase-js (`{data,error,count}`), types `lib/gpu1/database.types.ts`.
  Env canonique **serveur-only** `GPU1_POSTGREST_URL` / `GPU1_POSTGREST_ADMIN_TOKEN`. `@supabase/*`
  retiré de package.json + lockfile. Shims transitoires pour migrer sans casse.
- **M02-M07** — 7 domaines migrés (swap `getSupabaseAdmin`→`getGpu1Admin`), owner-checks
  `user_id+tenant_id` préservés (l'admin token bypass RLS), frontière de confiance gateway (HITL,
  idempotence, identité dérivée de l'auth), tokens brochure, opt-out RGPD, `/api/health` recâblé
  sans fuite (ni URL, ni token, ni nom de fournisseur).
- **M08** — scripts (`db-diagnose`, `seed-crm`, `new-feature`), e2e et docs migrés sur GPU1.
  Migrations SQL **inchangées, non appliquées**.
- **M09** — convergence : shims supprimés, clé UI `supabase_not_configured`→`database_not_configured`,
  `scripts/check-no-supabase.mjs` (exit 1) branché dans `npm run check` avec allowlist SQL minimale.

## Ce qui fonctionne
- **Serveur local boot OK** sur le client GPU1 natif : `GET / → 200`, `GET /api/health → 200`
  (ping DB gpu1 réel via `getGpu1Admin`), `GET /auth/login → 200`.
- Zéro `@supabase`/`SupabaseClient`/`getSupabaseAdmin`/`SUPABASE_*` actif hors allowlist SQL historique.
- Chaque worker a passé ses tests directs au moment de son intégration (M01 681, M03 41, M04 101,
  M05 196, M02 22, M06 96, M07 12) ; M09 a fait tourner la suite complète (681) à la convergence.

## Ce qui reste (non bloquant / hors mode quick)
- **Validation exhaustive M10 non exécutée** (retirée à la demande owner) : pas de `pnpm check`
  complet final, ni build de prod, ni e2e/electron rejoués, ni contrôle visuel 390/1440.
- Migrations `0046`/`0047`/`0048` toujours **non appliquées sur gpu1** (garde-fou).
- `supabase/migrations/` conservé comme convention de chemin (allowlisté).

## Comment voir le résultat
```bash
git fetch origin feature/rea-gpu1-native-006
git worktree add /tmp/rea-gpu1 feature/rea-gpu1-native-006   # ou checkout
cd /tmp/rea-gpu1
# .env.local : GPU1_POSTGREST_URL + GPU1_POSTGREST_ADMIN_TOKEN + JWT_SECRET
AUTH_DEV_BYPASS=true node_modules/.bin/next dev --webpack -p 3002
# http://localhost:3002
```

## Branche / commit
`feature/rea-gpu1-native-006` @ **`8add003`** (9 commits depuis `044ebd2`).

<!-- REA-GPU1-006-20260718-01 -->
