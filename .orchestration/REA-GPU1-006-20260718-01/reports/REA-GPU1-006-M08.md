# REA-GPU1-006-M08 — scripts, E2E, migrations, doc publique → GPU1/PostgREST

Statut : **READY**. Aucun git, aucune migration appliquée, aucun réseau GPU1, aucun déploiement.

## Fichiers édités (relatifs)

### scripts/
- `scripts/db-diagnose.mjs` — vars `GPU1_POSTGREST_URL`/`GPU1_POSTGREST_ADMIN_TOKEN`
  (+ `GPU1_POSTGREST_ANON_TOKEN` optionnel) ; dérive `PGRST_BASE` (…/rest/v1) et
  `HOST_BASE` (racine domaine, probes GoTrue/Storage/Realtime attendus ABSENTS) ;
  auth **Bearer seul** (suppression de l'entête `apikey`, propre à Supabase Cloud) ;
  paths PostgREST sans préfixe `/rest/v1` (déjà dans la base). Nomenclature « Supabase
  self-hosté » → « Postgres self-hosté gpu1 (PostgREST) ».
- `scripts/seed-crm.mjs` — retrait `@supabase/supabase-js` → **mini-client PostgREST**
  (fetch, Bearer service-role) reproduisant la surface utilisée (`from().select/insert`,
  `like/eq/limit`, `count=exact head` via `Content-Range`) ; vars GPU1 canoniques ;
  suppression du chemin utilisateur en dur (fallback via `REA_ENV_FILE`).
- `scripts/new-feature.mjs` — templates générés migrés : `getSupabaseAdmin`/
  `@/lib/server/supabase`/`SupabaseClient` → `getGpu1Admin`/`@/lib/gpu1`/`Gpu1Client` ;
  cast non typé `as unknown as Gpu1Client | null` ; erreur `supabase_not_configured`
  → `database_not_configured` (contrat neutre, aligné sur le métier migré) ; hints
  de types « Supabase » → « gpu1 ». SQL du STUB inchangé (path `supabase/migrations/`
  conservé, cf. allowlist).

### e2e/
- `e2e/_helpers.ts` — ajout `gpu1DeleteByIds(env, table, ids)` : DELETE PostgREST
  `?id=in.(…)` Bearer service-role, best-effort (jamais bloquant). Home partagé du
  cleanup, remplace les `createClient` dupliqués.
- `e2e/crm.spec.ts` — retrait `@supabase/supabase-js` ; cleanup `afterAll` via
  `gpu1DeleteByIds` (ordre FK inversé conservé) ; `loadEnv` local dupliqué (avec
  chemin en dur) supprimé au profit de l'import `_helpers.loadEnv`.
- `e2e/estimation-prospection.spec.ts` — retrait `@supabase/supabase-js` ; cleanup
  via `gpu1DeleteByIds`.

### docs publiques
- `README.md` — vars boot : `GPU1_POSTGREST_URL`, `GPU1_POSTGREST_ADMIN_TOKEN`,
  `JWT_SECRET`, `ANTHROPIC_API_KEY` (aucune `NEXT_PUBLIC_*` DB).
- `docs/RELEASE.md` — idem, source corrigée `lib/env.ts` → `lib/env-check.ts`.
- `docs/DEPLOYMENT.md` — vars boot corrigées ; secrets CI e2e renommés ; drift
  corrigé (**49 fichiers 0001→0045 → 52 fichiers 0001→0048**) ; note explicite que
  `supabase/` est une convention de chemin, pas une dépendance runtime.
- `docs/gpu1-selfhost.md` — bloc `.env.local` réécrit en nomenclature GPU1 canonique
  (l'historique de re-signature JWT anon/service-role est préservé en note).

## Vérifs (mon diff)
- `node scripts/test-migrations-coherence.mjs` → **VERT** (cohérence 0043→0048 prouvée).
- `node_modules/.bin/tsc --noEmit` → **0 erreur** (0 dans mes fichiers).
- `node_modules/.bin/eslint <mes fichiers>` → **exit 0**.
- `node --check` sur les 3 `.mjs` → OK.
- `rg '@supabase|SUPABASE_|supabase\.co|NEXT_PUBLIC_SUPABASE|createClient|signInWithPassword' scripts/ e2e/` → **0** (runtime).
- **NON exécutés volontairement** (garde-fou réseau GPU1) : `db-diagnose.mjs`,
  `seed-crm.mjs`, la suite E2E complète.

## Répertoire migrations
Renommage `supabase/migrations` → `database/migrations` **NON effectué** (décision) :
le brief l'autorise « path convention historique » et le renommage toucherait des
références possiblement hors ownership (CI M01). Conservé tel quel, filtrage GPU1
inchangé. → **allowlist M09** (voir ci-dessous).

## Fragments SQL « supabase » à mettre en allowlist M09 (SQL historique, NON réécrit)
Vrais helpers Postgres requis sur gpu1 ou commentaires d'historique — pas des dépendances Cloud :
- `supabase/migrations/0005_jwt_tenant_hook.sql:10-11` — `grant … to supabase_auth_admin`
  (rôle Postgres réel du montage). **Dépendance SQL réelle**, à conserver.
- `supabase/migrations/0015_invest_foundation.sql:31` — commentaire pgcrypto/schéma `extensions`.
- `supabase/migrations/0020_invest_documents_audit.sql:12,172` — commentaires (Storage, search_path).
- `supabase/migrations/0036_auth_audit_log.sql:29` — commentaire Management API (historique).
- `supabase/migrations/0046_auth_credentials_tenant_index.sql:15` — commentaire de la commande
  `psql … < supabase/migrations/…` (path convention).
- Path `supabase/migrations/` référencé (non réécrit, convention) dans :
  `scripts/new-feature.mjs` (l.14/120/553), `scripts/db-diagnose.mjs` (l.58),
  `scripts/test-migrations-coherence.mjs` (l.11), `scripts/test-migrations-dynamic.sh` (l.13).
- `scripts/lint-secrets.mjs:24,55` (ownership M08, non modifié) et
  `scripts/estimate-cli.ts:3` référencent `lib/supabase/database.types.ts` / « sans Supabase » —
  commentaires ; le type canonique est `lib/gpu1/database.types.ts`. Cosmétique, hors périmètre strict.

## Handoffs
- **CI / M01** : le brief M01 mentionnait un « passthrough legacy » Supabase le temps de
  cette migration. E2E est désormais 100 % GPU1 (aucun `SUPABASE_*` requis par les specs) →
  ce passthrough n'est **plus nécessaire**. La doc CI (`docs/DEPLOYMENT.md`) annonce désormais
  les secrets `GPU1_POSTGREST_URL`/`GPU1_POSTGREST_ADMIN_TOKEN`/`JWT_SECRET`/`ANTHROPIC_API_KEY` ;
  **les noms des secrets GitHub Actions eux-mêmes** (workflow `.github/`) sont ownership M01 —
  à renommer côté CI pour matcher.

## Limites / risques
- Le mini-client PostgREST de `seed-crm.mjs` et `gpu1DeleteByIds` n'ont PAS été exercés en
  live (garde-fou réseau) : validés par lecture + syntaxe + lint + alignement sur la surface
  réelle de `lib/gpu1/postgrest.ts` (Bearer only, `{base}/{table}`, `{base}/rpc/{fn}`,
  `Content-Range` pour count). À contre-vérifier au premier run avec `.env.local` réel.
- Chemin credentials en dur restant dans `e2e/crm.spec.ts:9` et `e2e/_helpers.ts:24`
  (`REPO_ROOT`) : fallback local pré-existant, hors périmètre Supabase — laissé intact.

## Ordre d'intégration
Indépendant des consommateurs métier (déjà intégrés M01–M07). Intégrable seul.
Dépend uniquement de `@/lib/gpu1` (présent) pour les types référencés par les templates générés.
