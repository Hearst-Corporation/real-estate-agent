# REA-GPU1-006-M06

## Rôle et résultat

Migre la gateway server-to-server Aigent, son audit/idempotence/HITL, les types d'agents et jobs Inngest vers le contrat GPU1 natif sans sur-déclarer les capacités.

Exécute autonomement sans question intermédiaire. Les sous-agents internes sont limités à des tests disjoints, sans Git, et ne peuvent changer les capacités déclarées.

## Phase 0 obligatoire

Lis en worktree isolé `CLAUDE.md`, `MASTER.md`, `lib/agent-gateway/**`, `app/api/agent-gateway/**`, `lib/agent/**`, `lib/jobs/**` et tous leurs tests. Reconstitue scopes, auth token, timeouts, audit, idempotency keys, approvals, 15 interfaces et écritures tenant. Aucun commit/push.

## Ownership exclusif

Ces seuls chemins et tests directs. Ne touche pas socle/env/package/CI, routes métier hors gateway, prospection directe, migrations ou scripts.

## Implémentation réelle

- Remplace `SupabaseClient` et imports par `Gpu1PostgrestClient`/`getGpu1Admin` sans `as T` trompeur.
- Préserve fail-closed si token/scopes absents, timeout, audit, idempotence, HITL et frontières `AVAILABLE/UNAVAILABLE` réelles.
- Chaque write conserve tenant/user/owner checks ; aucun acteur `system` incompatible avec un NOT NULL ne doit être inventé.
- Tests obligatoires : authz, scopes, timeout, double write, release de clé après échec, audit neutralisé, erreur DB, interface disponible/indisponible.
- Aucun run Aigent réel ni appel externe.

## Validations, STOP, rapport

Tests ciblés, typecheck/lint, scan fournisseur. STOP si une interface nécessite un changement métier hors ownership ou une migration. Aucun GPU1/déploiement. Rends `reports/REA-GPU1-006-M06.md`, preuve 15/15 honnête, écarts et sorties non sensibles à committer dans GitHub. Aucune capture UI requise sans changement visuel.

# REA-GPU1-006-M06
