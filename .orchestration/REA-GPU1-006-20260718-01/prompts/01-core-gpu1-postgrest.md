# REA-GPU1-006-M01

## Rôle et résultat

Tu es le worker socle. Remplace les SDK Supabase par un client PostgREST GPU1 natif, typé, serveur-only et testé, puis renomme l'environnement sans casser les contrats métier.

Exécute autonomement sans question intermédiaire. Tu peux déléguer en sous-agents internes uniquement l'inventaire ou les tests disjoints ; tu restes responsable du diff final et aucun sous-agent ne fait de Git.

## Contexte et phase 0 obligatoire

Pars de `044ebd2ddc74fef8907d765b657ce65d0dc935ea` dans un worktree isolé. Lis intégralement `CLAUDE.md`, `MASTER.md`, `package.json`, `lib/server/supabase.ts`, `lib/supabase/**`, `lib/env.ts`, `lib/env-check.ts`, `instrumentation.ts`, les tests associés, `.env.example`, `.env.production.example`, `next.config.ts`, `.github/workflows/ci.yml` et tous les usages de la query API. Inventorie les opérateurs réellement utilisés avant de coder. Ne fais aucun commit/push.

## Ownership exclusif

Tu peux modifier : `lib/gpu1/**`, `lib/server/supabase.ts` (suppression/migration), `lib/supabase/**` (suppression/migration), `lib/env.ts`, `lib/env-check.ts`, leurs tests directs, `instrumentation.ts`, `.env.example`, `.env.production.example`, `next.config.ts`, `package.json`, `pnpm-lock.yaml`, `.github/workflows/ci.yml`.

Interdit : routes/pages métier, scripts DB, E2E, migrations SQL, déploiement, base distante.

## Implémentation réelle

- Crée `getGpu1Admin(): Gpu1PostgrestClient<Database> | null` sous `lib/gpu1/**` avec fetch natif, timeout/AbortController, headers PostgREST, encodage sûr et résultats `{data,error,count?}`.
- Supporte strictement les opérations observées : CRUD/upsert/rpc, filtres, tri, pagination, select, `single`/`maybeSingle`. Teste URL, headers, sérialisation, préférences, cardinalité, erreurs HTTP/JSON, timeout et absence de fuite de token.
- Déplace les types vers `lib/gpu1/database.types.ts`. Aucun import ou paquet `@supabase/*` ne doit rester dans ton ownership.
- Variables : `GPU1_POSTGREST_URL`, `GPU1_POSTGREST_ADMIN_TOKEN`; toutes deux serveur-only. Supprime le besoin des variables publiques DB si aucun consommateur navigateur réel n'existe — l'inventaire initial doit le prouver.
- Conserve `JWT_SECRET`. Ne confonds pas session applicative et JWT PostgREST.
- Remplace les diagnostics fournisseur par `database_not_configured`/GPU1 neutre. Ne logue jamais valeurs de secrets ou PII.
- Mets CI/exemples/env et lockfile en cohérence. N'ajoute pas de connexion PostgreSQL directe.

## Validations et preuves

Lance les tests unitaires ciblés, typecheck et lint sur ton périmètre. Fournis aussi un scan `rg` prouvant la disparition des paquets/imports/variables Supabase dans ton ownership. Une gate globale peut échouer tant que les consommateurs parallèles ne sont pas intégrés : distingue régression et dépendance attendue. Les preuves textuelles non sensibles et le rapport doivent être committés par l'Opus dans GitHub ; aucune capture UI n'est requise car aucune surface n'est modifiée.

## Sécurité, STOP et handoff

STOP si le contrat PostgREST ne peut reproduire une opération sans changer sa sémantique, si un accès navigateur réel exige un secret, ou si tu dois toucher un fichier hors ownership. Ne fais ni migration, ni réseau GPU1, ni déploiement. Rends : fichiers modifiés, contrat exact, tests/sorties, risques, ordre d'intégration et contenu pour `reports/REA-GPU1-006-M01.md`.

# REA-GPU1-006-M01
