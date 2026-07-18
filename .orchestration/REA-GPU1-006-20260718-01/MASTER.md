# REA-GPU1-006-20260718-01 — migration native GPU1/PostgREST

## Autorité et état de départ

- Dépôt : `Hearst-Corporation/real-estate-agent`.
- Remote : `https://github.com/Hearst-Corporation/real-estate-agent.git`.
- Base immuable des workers : `feature/rea-release-005` au SHA `044ebd2ddc74fef8907d765b657ce65d0dc935ea`.
- Branche de coordination : `orchestration/REA-GPU1-006-20260718-01`.
- PR #16 reste intacte. Aucun worker ne pousse, ne merge, ne déploie et n'applique de migration.
- La base réelle est PostgreSQL auto-hébergée sur GPU1, exposée par PostgREST. Supabase Cloud, GoTrue, Storage et Realtime ne font pas partie de l'architecture.
- La publication des métadonnées techniques GPU1 et migrations est autorisée, mais aucun secret, jeton, hostname privé, dump, PII, capture sensible ou valeur d'environnement ne doit entrer dans Git.

## Résultat attendu

Retirer la dépendance runtime et la nomenclature Supabase de l'application au profit d'un accès explicite, typé et serveur-only à PostgREST sur GPU1, sans régression métier ni affaiblissement RLS/tenant. Les migrations restent du SQL PostgreSQL rejouable et ne sont jamais exécutées pendant cette vague.

Le résultat est accepté seulement si :

1. aucun paquet `@supabase/*` n'est requis au runtime, dans les tests ou les scripts ;
2. aucune variable `SUPABASE_*` ou `NEXT_PUBLIC_SUPABASE_*` n'est requise ;
3. aucun secret DB n'est exposé au navigateur ;
4. les routes conservent leurs contrôles auth, tenant, validation Zod, idempotence et codes d'erreur honnêtes ;
5. les appels passent par un client PostgREST GPU1 natif, testé, avec timeouts et erreurs neutralisées ;
6. les gates `pnpm check`, `pnpm test`, `pnpm test:migrations`, `pnpm build`, E2E applicable et Electron applicable sont factuellement vertes ;
7. un scan final distingue les références historiques SQL indispensables des dépendances ou affirmations produit obsolètes.

## Contrat d'intégration imposé

M01 définit le socle commun dans `lib/gpu1/**` :

- `getGpu1Admin()` est serveur-only et renvoie `Gpu1PostgrestClient<Database> | null` ;
- la forme des résultats reste `{ data, error, count? }` pour limiter le blast radius ;
- le client couvre uniquement les opérations réellement observées dans le dépôt (`from`, `select`, `insert`, `update`, `delete`, `upsert`, `rpc`, filtres, tri, pagination, `single`, `maybeSingle`) ;
- toute requête a un timeout/abort déterministe, encode correctement les filtres PostgREST et ne journalise jamais token, payload PII ou URL secrète ;
- les types DB résident sous `lib/gpu1/database.types.ts` ;
- variables canoniques : `GPU1_POSTGREST_URL` et `GPU1_POSTGREST_ADMIN_TOKEN`, strictement serveur-only. `JWT_SECRET` reste le secret de session applicatif ;
- erreur publique neutre : `database_not_configured`, jamais un nom de fournisseur ;
- aucune connexion PostgreSQL directe depuis Next/Vercel, aucun SDK Supabase masqué sous un alias.

M02 à M07 peuvent coder parallèlement contre ce contrat. M01 est intégré avant leur validation agrégée. Les mocks peuvent être locaux à leurs tests mais ne doivent pas dupliquer le client de production.

## Ordonnancement

### Vague A — parallélisable

| Mission | Branche worker | Worktree suggéré | Ownership exclusif | Dépendances | Preuves minimales |
|---|---|---|---|---|---|
| M01 | `work/rea-gpu1-006-m01-core` | `/tmp/rea-gpu1-006-m01` | client GPU1, env, dépendances, CI de base | aucune | tests client/env + scans |
| M02 | `work/rea-gpu1-006-m02-auth-admin` | `/tmp/rea-gpu1-006-m02` | auth, admin, audit, MFA | contrat M01 | tests auth/tenant + scans |
| M03 | `work/rea-gpu1-006-m03-crm` | `/tmp/rea-gpu1-006-m03` | leads, biens, visites, mandats | contrat M01 | tests CRUD/tenant + scans |
| M04 | `work/rea-gpu1-006-m04-estimation` | `/tmp/rea-gpu1-006-m04` | estimations et brochures | contrat M01 | tests token/continuité + scans |
| M05 | `work/rea-gpu1-006-m05-prospection` | `/tmp/rea-gpu1-006-m05` | prospection et matching hors gateway | contrat M01 | tests RGPD/tenant + scans |
| M06 | `work/rea-gpu1-006-m06-gateway` | `/tmp/rea-gpu1-006-m06` | agent gateway, agents, jobs | contrat M01 | tests authz/idempotence + scans |
| M07 | `work/rea-gpu1-006-m07-shell` | `/tmp/rea-gpu1-006-m07` | dashboard partagé, tâches, health, chat | contrat M01 | tests health/tasks + scans |

### Vague B — après intégration A

- M08 : scripts, E2E, documentation publique et rangement des migrations.
- M09 : convergence, scan zéro dépendance/nomenclature fournisseur et corrections transversales.
- M10 : QA finale indépendante, preuves et verdict READY/NOT READY.

Worktrees suggérés : `/tmp/rea-gpu1-006-m08`, `/tmp/rea-gpu1-006-m09`, `/tmp/rea-gpu1-006-m10`. M08 dépend de M01–M07 ; M09 dépend de M08 ; M10 dépend de M09.

## Règles Git et worktrees

- Un worktree isolé et une branche par mission, toujours depuis le SHA de base indiqué.
- Le coordinateur Opus est seul propriétaire des commits, cherry-picks, résolutions de conflits et pushs.
- Les workers ne font ni commit, ni push, ni rebase, ni merge. Ils rendent un diff, des commandes exactes et un rapport.
- Ne jamais reset/clean/checkout un worktree partagé. Préserver tout changement concurrent hors ownership.
- Un conflit de fichier hors ownership déclenche STOP et rapport au coordinateur.
- Le coordinateur est autorisé à committer/pousser chaque branche worker et à créer `feature/rea-gpu1-native-006` pour y cherry-picker les missions acceptées et exécuter M08–M10.
- Aucun merge vers `feature/rea-release-005`, `feature/rea-master-004` ou `main`, aucune modification de PR #16, aucun déploiement Vercel/GPU1, aucune migration SQL appliquée et aucun redémarrage de service dans cette orchestration sans nouvelle autorisation explicite.

## Sécurité et vérité

- L'admin token PostgREST contourne RLS : chaque écriture et lecture sensible conserve le filtrage explicite `user_id + tenant_id` et les owner-checks existants.
- Ne jamais remplacer un contrôle par une confiance dans le client.
- Ne jamais inventer de table, colonne, endpoint, disponibilité d'agent, donnée de démo ou succès E2E.
- Les migrations ne sont ni appliquées ni testées contre une base distante sans autorisation. Leur cohérence statique et leur rejouabilité locale sont testées.
- Les tests nécessitant des secrets absents doivent être marqués `NOT RUN` avec prérequis précis, jamais transformés en succès silencieux.
- Pas de captures contenant PII. Pas de `.env*` réel. Pas de dump ou bundle de production.

## Gate d'intégration

Le coordinateur exécute, depuis une RC propre :

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm test:migrations
pnpm build
pnpm test:e2e
pnpm electron:test
```

Les deux dernières commandes peuvent être `NOT RUN` uniquement si un prérequis externe est réellement absent et documenté. Un échec n'est jamais converti en skip. Le scan M09 doit prouver l'absence de dépendances, imports, variables et messages runtime Supabase, avec une allowlist commentée uniquement pour d'éventuels fragments SQL historiques indispensables.

## Livrables et verdict

Chaque mission écrit son rapport dans `reports/<MISSION_ID>.md` et ses preuves non sensibles dans `evidence/`. `REPORT.md` agrège les SHA, gates, écarts, migrations non appliquées et limites. Le verdict final est `READY` seulement si tous les critères sont prouvés ; sinon `NOT READY` avec blocage exact.
