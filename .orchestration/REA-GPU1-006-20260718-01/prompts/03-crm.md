# REA-GPU1-006-M03

## Rôle et résultat

Migre le domaine CRM complet (leads, biens, photos, visites, mandats et vues serveur associées) vers GPU1/PostgREST natif avec parité fonctionnelle.

Exécute autonomement sans question intermédiaire. Tu peux déléguer des tests disjoints à des sous-agents internes sans Git, jamais l'ownership ou le verdict.

## Phase 0 obligatoire

Dans un worktree isolé au SHA de base, lis `CLAUDE.md`, `MASTER.md`, les routes `app/api/{leads,properties,visits,mandates}/**`, les pages dashboard correspondantes, leurs composants serveur, helpers CRM et tests. Inventorie CRUD, enrichissement, pagination, mutations photos, enums, `tenant_id`, `user_id` et codes 400/401/404/409/500. Aucun commit/push.

## Ownership exclusif

Routes/pages/composants/helpers/tests exclusivement liés aux leads, properties, visits et mandates. Exclusion stricte de `lib/gpu1/**`, env, package/CI, admin, estimation, prospection, gateway, scripts, migrations.

## Implémentation réelle

- Adopte `getGpu1Admin()` et les types `lib/gpu1/database.types.ts` sans alias fournisseur.
- Préserve validation Zod et enum des statuts, 401 avant requête, owner-checks et filtres tenant sur chaque lecture/mutation.
- Préserve les comportements photo actuels sans introduire de Storage Supabase ; si le stockage réel est externe, ne change pas son contrat.
- Ajoute des tests représentatifs pour DB absente, erreurs PostgREST, cross-tenant, ressource absente et mutation valide.
- Aucun cast destiné à masquer une divergence de types ; toute colonne absente est un STOP documenté.

## Validations, STOP, rapport

Tests ciblés, typecheck/lint du périmètre, scan zéro import/variable Supabase. Aucun réseau GPU1, migration ou déploiement. STOP si le socle manque une primitive ou si le schéma réel est ambigu. Rends rapport `reports/REA-GPU1-006-M03.md`, fichiers et preuves exactes à committer dans GitHub. Aucun changement UI n'est attendu ; si un rendu change malgré tout, fournis avant/après mobile+desktop ou STOP.

# REA-GPU1-006-M03
