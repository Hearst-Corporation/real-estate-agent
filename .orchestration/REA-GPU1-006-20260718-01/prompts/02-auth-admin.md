# REA-GPU1-006-M02

## Rôle et résultat

Migre auth, administration, audit et MFA vers le contrat `getGpu1Admin()` sans modifier la sécurité, les scopes tenant ni les réponses publiques.

Exécute autonomement sans question intermédiaire. Des sous-agents internes sont permis seulement pour des tests/inventaires disjoints, sans Git ; tu assumes la synthèse finale.

## Phase 0 obligatoire

Depuis le SHA de base dans un worktree isolé, lis `CLAUDE.md`, `MASTER.md`, tous les fichiers `lib/server/auth*`, `lib/server/audit-log.ts`, `lib/server/mfa-store.ts`, `lib/admin/**`, `app/api/auth/**`, `app/api/admin/**`, `app/(dashboard)/admin/**` et leurs tests. Cartographie chaque requête, owner-check, bypass RLS et code d'erreur. Aucun commit/push.

## Ownership exclusif

Tu peux modifier uniquement les fichiers auth/admin/audit/MFA précités et leurs tests directs. Tu ne modifies pas `lib/gpu1/**`, env, package/lock, CI, autres domaines, migrations ou scripts.

## Implémentation réelle

- Remplace imports, types et noms locaux Supabase par le contrat GPU1 défini dans MASTER.
- Préserve l'auth 401 avant DB, les rôles, l'isolation `tenant_id + user_id`, les garde-fous MFA et la neutralisation des erreurs.
- Le token admin ne quitte jamais le serveur. Aucun fallback permissif, aucun faux succès si DB indisponible.
- Renomme uniquement les erreurs fournisseur en `database_not_configured` si elles sont exposées ; garde le reste des contrats API stable.
- Ajoute/actualise les tests de non-régression cross-tenant, accès non-admin, DB absente et erreurs PostgREST.

## Validations, STOP, rapport

Exécute tests ciblés, typecheck/lint applicables et un scan de ton ownership. STOP au moindre besoin de modifier le socle ou un autre domaine ; documente le handoff. Aucun appel GPU1, migration ou déploiement. Rends fichiers, preuves textuelles non sensibles à committer dans GitHub, limites et rapport `reports/REA-GPU1-006-M02.md`. Aucune capture UI n'est requise sans changement visuel.

# REA-GPU1-006-M02
