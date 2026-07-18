# REA-GPU1-006-M05

## Rôle et résultat

Migre prospection, annonces, critères acquéreurs, matching, contacts, opt-out et runs vers GPU1/PostgREST natif, en conservant RGPD et RLS.

Exécute autonomement sans question intermédiaire. Les sous-agents internes éventuels restent bornés à des tests/inventaires disjoints et n'utilisent pas Git.

## Phase 0 obligatoire

Dans un worktree isolé, lis `CLAUDE.md`, `MASTER.md`, `app/api/prospection/**`, `app/(dashboard)/prospection/**`, `lib/prospection/**` et tests. Dresse la matrice tables/opérations, versioning annonces, opt-out, historique, matching, ingestion/scraping et effets externes. Aucun commit/push.

## Ownership exclusif

Uniquement prospection hors routes/lib `agent-gateway`. Pas de socle, env, package/CI, CRM, estimation, scripts généraux ou migrations.

## Implémentation réelle

- Utilise `getGpu1Admin()` et types GPU1 ; élimine imports/types/messages fournisseur.
- Maintiens auth avant DB, filtres explicites tenant/user, déduplication, consentement/opt-out, limites d'envoi et validation de sources.
- Aucun scrape réel, email/SMS, ingestion distante ou donnée fabriquée pendant les tests.
- Couvre par tests : cross-tenant, opt-out, idempotence/déduplication, DB absente, erreur PostgREST, matching et mutation valide.
- Ne transforme jamais un transport indisponible en `sent`.

## Validations, STOP, rapport

Tests ciblés, typecheck/lint et scan de ton ownership. STOP pour primitive PostgREST manquante, table/colonne ambiguë ou effet externe indispensable. Aucune migration/GPU1/déploiement. Rends `reports/REA-GPU1-006-M05.md` avec preuves non sensibles committées dans GitHub et limites. Si aucune UI ne change, aucune capture ; sinon avant/après mobile+desktop anonymisé obligatoire.

# REA-GPU1-006-M05
