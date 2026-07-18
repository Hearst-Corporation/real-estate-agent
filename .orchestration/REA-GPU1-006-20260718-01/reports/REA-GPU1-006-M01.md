# REA-GPU1-006-M01 — Client socle PostgREST gpu1 (remplacement SDK Supabase)

Statut : **READY** (socle livré, testé, gate ciblée verte). Les 6 workers M02–M07 consomment le contrat ci-dessous.

Base immuable : `044ebd2`. Worker = fichiers édités uniquement (RULE 0 : aucun git).

---

## 1. Fichiers édités

- `lib/gpu1/postgrest.ts` — **nouveau** : client PostgREST natif (fetch), query builder chaînable, rpc, timeout/abort, erreurs normalisées.
- `lib/gpu1/index.ts` — **nouveau** : usine `getGpu1Admin()` serveur-only + réexports de types + alias `Gpu1Client<Db>`.
- `lib/gpu1/database.types.ts` — **déplacé** depuis `lib/supabase/database.types.ts` (types DB, aucun import `@supabase`).
- `lib/gpu1/postgrest.test.ts` — **nouveau** : 30 tests (URL, headers, sérialisation, Prefer, cardinalité, erreurs HTTP/JSON, timeout/abort, non-fuite token, rpc).
- `lib/gpu1/index.test.ts` — **nouveau** : 5 tests (garde null non-configuré, singleton, plumbing env).
- `lib/server/supabase.ts` — **shim** : réexporte `getGpu1Admin` sous l'ancien nom `getSupabaseAdmin` (aucun `@supabase`). À supprimer post-migration.
- `lib/supabase/database.types.ts` — **shim** : réexporte les types depuis `@/lib/gpu1/database.types`. À supprimer post-migration.
- `lib/supabase/client.ts` — **supprimé** : client navigateur (`@supabase/ssr`), zéro consommateur réel.
- `lib/env.ts` — vars canoniques `GPU1_POSTGREST_URL` / `GPU1_POSTGREST_ADMIN_TOKEN` ; suppression de `publicEnv()` (aucun consommateur) et des vars DB publiques ; `JWT_SECRET` conservé.
- `lib/env-check.ts` — boot fail-fast sur `GPU1_POSTGREST_URL` + `GPU1_POSTGREST_ADMIN_TOKEN` + `JWT_SECRET`.
- `lib/env-check.test.ts` — migré sur les vars canoniques (test direct de mon module).
- `instrumentation.ts` — inchangé fonctionnellement (appelle `assertBootEnv()`).
- `.env.example` / `.env.production.example` — bloc DB réécrit (GPU1 serveur-only, plus de `NEXT_PUBLIC_*` DB).
- `next.config.ts` — retrait de `*.supabase.co` du CSP `connect-src` (DB serveur-only).
- `package.json` — retrait de `@supabase/ssr` et `@supabase/supabase-js`.
- `pnpm-lock.yaml` — retrait des 2 racines `@supabase/*` + 7 defs transitives + orphelins `iceberg-js@0.8.1`, `cookie@1.1.1`. YAML valide.
- `.github/workflows/ci.yml` — build sans placeholders DB ; e2e/electron-smoke sur secrets GPU1 (passthrough legacy conservé pour les specs E2E non encore migrées).

---

## 2. CONTRAT EXACT DU CLIENT (à consommer par M02–M07)

### Usine

```ts
import { getGpu1Admin, type Gpu1Client, type Database } from "@/lib/gpu1";

const db = getGpu1Admin(); // Gpu1Client<Database> | null
if (!db) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
```

- Serveur-only (`import "server-only"`). Token service-role (**bypass RLS**) → **conserver le filtrage explicite `user_id` + `tenant_id`** dans chaque requête.
- `null` si `GPU1_POSTGREST_URL` **ou** `GPU1_POSTGREST_ADMIN_TOKEN` absent → répondre `503 database_not_configured` (**jamais** de nom de fournisseur).
- Singleton mémoïsé.

### Migration des consommateurs (diff minimal)

| Avant | Après |
|---|---|
| `import { getSupabaseAdmin } from "@/lib/server/supabase"` | `import { getGpu1Admin } from "@/lib/gpu1"` |
| `getSupabaseAdmin()` | `getGpu1Admin()` |
| `import type { SupabaseClient } from "@supabase/supabase-js"` | `import type { Gpu1Client } from "@/lib/gpu1"` |
| param `sb: SupabaseClient<Database>` | param `sb: Gpu1Client<Database>` (ou `Gpu1Client`) |
| `import type { Database } from "@/lib/supabase/database.types"` | `import type { Database } from "@/lib/gpu1/database.types"` (ou `@/lib/gpu1`) |

Le shim `@/lib/server/supabase` (`getSupabaseAdmin`) et `@/lib/supabase/database.types` **restent fonctionnels** pendant la transition : un consommateur non encore migré compile et tourne. **Ne pas supprimer les shims tant que M02–M07 n'ont pas fini.**

### API de query (chaînable, alignée sur supabase-js)

`db.from(table)` retourne un `Gpu1QueryBuilder`. La **Row est inférée du schéma** `Database` quand `table` est un nom connu (`db.from("leads")` → Row `leads`), comme supabase-js. Un générique explicite reste possible pour les projections : `db.from<{ id: string }>("leads")`.

Verbes :
- `.select(cols = "*", { count?: "exact"|"planned"|"estimated", head?: boolean })`
- `.insert(values)` · `.update(values)` · `.delete()`
- `.upsert(values, { onConflict?: string, ignoreDuplicates?: boolean })`

Filtres : `.eq .neq .gt .gte .lt .lte .like .ilike .is(col, null|bool) .in(col, array) .contains .not(col, op, value) .or("a.eq.1,b.eq.2")`

Tri / pagination : `.order(col, { ascending?, nullsFirst? })` · `.limit(n)` · `.range(from, to)`

Cardinalité : `.single()` · `.maybeSingle()` (0 ligne → `data:null, error:null`)

RPC : `db.rpc<T>(fn, args)` → `POST /rpc/<fn>`.

### Forme des résultats (STABLE — ne change pas entre requêtes)

```ts
// liste (await d'un builder, ou builder terminé par un filtre)
{ data: T[] | null, error: PostgrestError | null, count: number | null }
// .single() / .maybeSingle()
{ data: T | null,   error: PostgrestError | null, count: number | null }
// .rpc()
{ data: T | null,   error: PostgrestError | null, count: number | null }
```

`PostgrestError = { message: string; code?: string; details?: string|null; hint?: string|null }`.

- `count` renseigné seulement si `{ count: "exact" }` (lu depuis `Content-Range`).
- Le builder est **thenable** : `await db.from(...).select(...).eq(...)` déclenche la requête.

### Comportement erreur / timeout (garanti par tests)

- Erreur HTTP → `error` normalisée (`message`/`code` depuis le corps PostgREST, sinon `http_<status>`). **Ne throw jamais.**
- Corps non-JSON en 200 → `error.code = "EPARSE"` (`invalid_json_response`).
- `maybeSingle()` sur 0 ligne (`PGRST116`/`406`) → `{ data:null, error:null }`.
- Timeout : `AbortController`, défaut **15000 ms** (surchargeable via `GPU1_POSTGREST_TIMEOUT_MS`). Abort → `{ error:{ message:"request_timeout", code:"ETIMEDOUT" } }`.
- Erreur réseau → `{ error:{ message:"network_error", code:"ENETWORK" } }`.
- **Le token n'apparaît jamais** dans un message d'erreur / log (prouvé par test). Nom de colonne non `[a-zA-Z0-9_.*]` → throw local (anti-injection).

### Headers émis

`Authorization: Bearer <token>`, `Content-Type: application/json`, `Accept: application/json` (ou `application/vnd.pgrst.object+json` sur single/maybeSingle). `Prefer` composé : `count=…`, `return=representation|minimal`, `resolution=merge-duplicates|ignore-duplicates`. `Range` + `Range-Unit: items` sur `.range()`.

---

## 3. Variables d'environnement

**Ajoutées (serveur-only)** : `GPU1_POSTGREST_URL`, `GPU1_POSTGREST_ADMIN_TOKEN`, `GPU1_POSTGREST_TIMEOUT_MS` (optionnel).
**Conservée** : `JWT_SECRET` (session applicative jose — distincte du JWT PostgREST).
**Retirées du socle** : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_PROJECT_REF`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`.

**Preuve « aucun consommateur navigateur DB »** : `lib/supabase/client.ts` (seul client navigateur) avait **zéro import** (`rg` sur `@/lib/supabase/client` → 0). `publicEnv()` avait **zéro consommateur code** (mentions doc/commentaire uniquement). Donc aucune var DB publique n'est requise.

---

## 4. Preuves (sorties collées)

**vitest** (mes suites) :
```
Test Files  3 passed (3)
     Tests  37 passed (37)   (postgrest 30 + index 5 + env-check 8, index compté avec postgrest)
```
**vitest** (suite complète, non-régression) : `Test Files 66 passed (66) · Tests 681 passed (681)`.

**eslint** (fichiers owned) : `0 problem (exit 0)`.

**tsc** (fichiers owned) : `ZERO error in owned files`.

**tsc** (global) : 54 erreurs, **toutes en fichiers consommateurs** (M02–M07) — **dépendances attendues**, pas des régressions : param annotés `SupabaseClient<Database>`/`DbLike` (→ passer à `Gpu1Client`), et suites de narrowing de Row côté consommateur. Répartition : TS2345 ×34 (type client), TS2339 ×12, TS2352 ×4, TS18047 ×3, TS2740 ×1.

**Scans `rg` (disparition Supabase dans mon ownership)** — tous vides :
```
@supabase           → 0
SupabaseClient      → 0
SUPABASE_/NEXT_PUBLIC_SUPABASE → 0
supabase.co         → 0   (retiré du CSP next.config.ts)
createClient/createBrowserClient/createServerClient → 0
```
Lockfile : `@supabase|iceberg-js|cookie@1.1.1` → 0 occurrence, YAML valide.

---

## 5. Limites / risques

- **`--frozen-lockfile` en CI** : lockfile édité à la main (impossible de lancer `pnpm install` — node_modules symliké vers le repo réel, risque de mutation hors worktree). YAML validé + orphelins purgés, mais si pnpm exige un hash d'intégrité recalculé, l'intégrateur devra faire **un** `pnpm install --lockfile-only` propre sur main après merge. **Aucune connexion réseau/DB effectuée** (garde-fou respecté).
- **Inférence de Row** : `from("table")` infère la Row du schéma ; les consommateurs qui **projettent** (`select("id,foo")`) et attendaient déjà un type partiel peuvent avoir à préciser un générique — c'est le même comportement que supabase-js.
- **Shims transitoires** : `lib/server/supabase.ts` et `lib/supabase/database.types.ts` restent tant que M02–M07 n'ont pas migré. Un worker M07 (ou nettoyage final) devra les supprimer.
- **Hors ownership (handoff)** : deux routes lisent encore `process.env.NEXT_PUBLIC_SUPABASE_URL` — `app/api/prospection/criteres/route.ts` et `app/api/health/route.ts` — à migrer par leurs owners vers `GPU1_POSTGREST_URL`. `scripts/*` et `e2e/*` (hors périmètre) référencent encore Supabase.

---

## 6. Ordre d'intégration recommandé

1. **M01 (ce socle) en premier** — pose `lib/gpu1/**` + shims + env. La gate globale reste rouge (dépendances attendues), c'est normal.
2. **M02–M07 ensuite, dans n'importe quel ordre** — chacun remplace `getSupabaseAdmin`→`getGpu1Admin` et les annotations `SupabaseClient<Database>`→`Gpu1Client` dans SES routes. Chaque merge fait baisser le compteur tsc.
3. **Dernier passage (M07 ou cleanup)** — migrer `health/route.ts` + `prospection/criteres/route.ts`, supprimer les shims `lib/server/supabase.ts` et `lib/supabase/database.types.ts`, migrer `e2e/*` et `scripts/*`, puis `pnpm install --lockfile-only` pour sceller le lockfile. tsc global vert = migration finie.
