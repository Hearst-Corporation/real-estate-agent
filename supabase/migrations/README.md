# `supabase/migrations/` — SQL PostgreSQL historique, appliqué sur GPU1

> **Ce répertoire n'est PAS un runtime Supabase.** Il ne contient que du **SQL
> PostgreSQL standard**, versionné et **déjà appliqué** sur le Postgres
> self-hosté GPU1. Aucun SDK, service ou projet Supabase n'existe dans ce
> produit — la gate `scripts/check-no-supabase.mjs` (`npm run check`) échoue si
> un usage actif réapparaît dans le code.

## Pourquoi le nom reste

Le répertoire **conserve son chemin** parce qu'il est référencé en dur par
l'outillage qui vérifie et applique les migrations :

- `scripts/preflight-gpu1.mjs` — résout `supabase/migrations/` pour comparer le
  SQL versionné au schéma réel et générer les commandes d'application.
- `scripts/test-migrations-coherence.mjs` — vérifie la séquence `NNNN_` et
  l'absence de trous / doublons.
- `scripts/db-diagnose.mjs` — dérive la liste des tables **attendues** en
  parsant ces fichiers.
- `lib/agent-gateway/migration-triggers.test.ts` et
  `lib/prospection/rls-matrix.test.ts` — prouvent des invariants (triggers,
  matrice RLS) **par analyse statique du SQL versionné**.
- `scripts/new-feature.mjs` — y écrit le stub de migration d'une nouvelle
  ressource.

Un renommage casserait ces cinq consommateurs sans rien apporter : le nom du
dossier est une **convention de chemin**, pas une dépendance produit.

## État

- Séquence : `0001_init.sql` → `0058_learning_signals.sql` (**62 fichiers**),
  toutes **appliquées** sur GPU1.
- Backend réel : **Postgres self-hosté GPU1 exposé par PostgREST**, consommé
  exclusivement via `getGpu1Admin()` de `@/lib/gpu1`.

## Mentions « supabase » résiduelles dans le SQL — volontaires

Deux catégories, toutes deux **hors périmètre de la gate** (le scan exclut
`supabase/migrations/`) :

1. **Rôle SQL historique** — `0005_jwt_tenant_hook.sql` fait un
   `grant … to supabase_auth_admin`. C'est le nom d'un **rôle Postgres**
   effectivement créé à l'époque : réécrire le fichier réécrirait une migration
   **déjà appliquée**, ce qui est interdit. Le SQL versionné doit rester le
   miroir exact de ce qui a tourné.
2. **Chemins en commentaire** — plusieurs en-têtes citent
   `… < supabase/migrations/00NN_….sql`, c'est la **commande d'application
   réelle** sur GPU1, pas une dépendance.

## Appliquer une migration

```bash
ssh gpu1 'docker exec -i nexus-postgres psql -U postgres -d real-estate-agent' \
  < supabase/migrations/00NN_nom.sql
ssh gpu1 'docker kill -s SIGUSR1 real-estate-agent-postgrest'   # reload cache après DDL
```

Détail complet : [`docs/DEPLOYMENT.md`](../../docs/DEPLOYMENT.md) §Migrations.

**Ne jamais** modifier une migration déjà appliquée — créer un nouveau fichier
`NNNN_`. **Ne jamais** utiliser `supabase db push` (interactif, et sans objet
ici : il n'y a pas de projet Supabase).
