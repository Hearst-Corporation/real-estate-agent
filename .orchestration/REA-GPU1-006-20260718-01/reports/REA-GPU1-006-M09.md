# REA-GPU1-006-M09 — Convergence zéro-Supabase (rapport)

**Statut : READY.** Base RC `c382da3` (M01–M08 intégrés). Aucun git, aucune migration, aucun réseau GPU1.

## Fichiers édités (relatifs)

Supprimés (shims transitoires M01) :
- `lib/server/supabase.ts` (réexport `getSupabaseAdmin`→`getGpu1Admin`)
- `lib/supabase/database.types.ts` (réexport types) → dossier `lib/supabase/` supprimé (vide)

Modifiés :
- `lib/ui-strings.ts` — clé UI `supabase_not_configured` → `database_not_configured`
- `app/api/auth/login/route.ts` — émet `database_not_configured`
- `lib/prospection/ingest.ts` — `throw new Error("database_not_configured")` (résidu trouvé par le check)
- `docs/CRM_ORCHESTRATION.md` — snippet d'exemple recâblé `@/lib/gpu1` / `getGpu1Admin` / `database_not_configured` (doc = miroir du code)
- `scripts/lint-secrets.mjs` — retrait du pattern d'exclusion orphelin `lib/supabase/database.types.ts`
- `package.json` — script `check:no-supabase` + branché dans la gate `check` (colonne `nosupa`)
- Tests reciblés (mock `@/lib/server/supabase`→`@/lib/gpu1`, var locale `getSupabaseAdmin`→`getGpu1Admin`, commentaires cosmétiques) :
  `test/api-prospection-estimate.test.ts`, `test/api-prospection-matchs.test.ts`,
  `test/api-prospection-criteres.test.ts`, `test/api-prospection-link-crm.test.ts`,
  `test/routes/properties-update.test.ts`, `test/routes/properties-create.test.ts`, `test/api-leads.test.ts`

Ajouté :
- `scripts/check-no-supabase.mjs` — garde anti-retour (exit 1)

## Clé UI renommée
`supabase_not_configured` → `database_not_configured`. Émetteurs runtime réels : **2** (`app/api/auth/login/route.ts` + `lib/prospection/ingest.ts`) — les autres routes émettaient déjà `database_not_configured` (migré en vague antérieure). Mapping FR unique dans `lib/ui-strings.ts` (form login). Aucune chaîne orpheline restante.

## Check anti-retour posé
`scripts/check-no-supabase.mjs`, `exit 1`, scanne `app|components|lib|config|scripts|electron|test`. Détecte le **retour ACTIF** (les regex exigent une syntaxe active, pas de la prose) :
- import/require d'un paquet `@supabase/*`
- import des shims supprimés `@/lib/server/supabase` | `@/lib/supabase/*`
- identifiant `getSupabaseAdmin`, type `SupabaseClient`
- env `SUPABASE_*` / `NEXT_PUBLIC_SUPABASE_*`, URL `*.supabase.co`
- message public `"supabase_not_configured"`

Échappatoire ligne : `// no-supabase-allow`. **Allowlist (fichier/motif/note)** :
- `scripts/check-no-supabase.mjs` (`*`) — le garde lui-même (motifs en regex + doc)
- `lib/gpu1/index.ts` (`get-supabase-admin`, `supabase-client-type`) — en-tête de doc décrivant la migration historique `getSupabaseAdmin→getGpu1Admin` et le type `SupabaseClient<Database>→Gpu1Client<Database>` ; commentaires, aucun code actif.

Branché dans `npm run check`.

## Sorties globales (RC entière)
- `node_modules/.bin/tsc --noEmit` → **exit 0, 0 erreur**
- `node_modules/.bin/vitest run` → **66 fichiers, 681 tests, tous verts, exit 0**
- `node scripts/check-no-supabase.mjs` → **✓ 0 violation, exit 0**
- `rg` global (app/lib/config/scripts/electron/test) sur `@supabase|getSupabaseAdmin|SupabaseClient|SUPABASE_|supabase.co|"supabase_not_configured"` → **0 occurrence active**. Restent uniquement des commentaires descriptifs historiques (`postgrest.ts:3` « Remplace le SDK @supabase/supabase-js… », en-tête `lib/gpu1/index.ts`, mocks/prose de tests, paths `supabase/migrations/`) — non bloquants, légitimes.

## Item 5 — surface secrets/DB
- Aucune var DB en `NEXT_PUBLIC_*` (DB = `GPU1_POSTGREST_URL` / `_ADMIN_TOKEN` / `_TIMEOUT_MS`, tous server-only).
- `lib/gpu1/index.ts` : `import "server-only"`. Admin token jamais côté client.
- `app/api/health/route.ts` : ping via `getGpu1Admin`, état neutre `up|down|unconfigured` + latence — n'expose ni URL, ni token, ni nom/fournisseur, ni topologie.

## Limites / notes
- Les commentaires d'historique restants (« mock Supabase », « comme supabase-js », « Supabase non configuré » dans les JSDoc) sont **hors scope convergence mécanique** (renommer ~40 commentaires = churn cosmétique sans valeur runtime) et non détectés par le check car non-actifs. Volontairement laissés.
- `docs/` n'est pas dans SCAN_DIRS du check (prose libre) ; le snippet de code copiable de `CRM_ORCHESTRATION.md` a néanmoins été corrigé au titre de « doc = miroir du code ».
- Aucun secret/PII/hostname privé committé. Aucune action git.

## Ordre d'intégration
Indépendant — un seul lot. Aucune dépendance sur d'autres missions non intégrées.
