<!-- REA-M04-03 -->
# REA-M04-03 — RLS et matrice d'accès prospection

**Branche cible (créée par l'intégrateur) :** `feature/rea-m04-rls`
**Base :** `b2d85403419d2007cb106c9e85abc1d9341685f0`

## Objectif métier
Garantir qu'aucune donnée de prospection (acquéreurs, critères, matchs, contacts) d'un tenant ne fuit
vers un autre tenant, ni vers un rôle anon, via une matrice d'accès RLS explicite et testée.

## Faits réellement vérifiés dans le repo (base b2d8540)
- DB = Postgres self-hosté gpu1 derrière PostgREST. RLS activée sur les tables métier ;
  `current_tenant_id()` + policies `(select …)` + hook JWT `custom_access_token_hook`.
  Le client service-role **bypass RLS** → owner-check applicatif obligatoire côté code.
- Tables prospection : `prosp_criteres_acquereur`, `prosp_matchs`, `prosp_match_feedback`,
  `prosp_contact_attempts`, `prosp_feedback_envois`, `prosp_idempotency_keys` (migrations 0032–0043).
- Pattern additif éprouvé : chaque migration ne modifie aucune table existante (cf. 0043/0044/0045).

## Périmètre (STRICT — additif seulement)
- **Une seule nouvelle migration additive** réservée à la RLS : `supabase/migrations/00NN_rls_prospection.sql`
  (numéro > 0045). Elle **ajoute/renforce** des policies ; elle ne DROP ni ne modifie aucune table.
- Tests d'accès : `anon` (refusé), `authenticated` tenant courant (autorisé), `authenticated` cross-tenant
  (refusé), `service-role` (bypass documenté). Tests en `lib/prospection/**` ou `test/` (fichiers `*.test.ts`).

## À vérifier notamment
- Chaque table prospection listée a une policy tenant-scoped explicite (pas de table sans policy exposée à `authenticated`).
- La migration est rejouable (idempotente : `drop policy if exists` puis `create policy`).
- **Aucune application de migration sur GPU1** : tu écris le SQL versionné, tu ne l'exécutes pas.

## Ownership de fichiers (STRICT)
Tu ne modifies QUE : la nouvelle migration RLS (`supabase/migrations/00NN_rls_prospection.sql`) et des
fichiers de tests dédiés (`lib/prospection/*.test.ts` ou `test/rls-*.test.ts`).
**Interdit** : éditer une migration existante, toucher aux routes/UI/gateway/auth, aux fichiers partagés.

## Validations factuelles exigées
- La matrice anon/authenticated/service-role/cross-tenant est couverte par des tests nommés.
- `scripts/test-migrations-coherence.mjs` reste vert (cohérence numéro/ordre).
- `pnpm typecheck` vert sur les tests ajoutés.

## Conditions STOP
- Prouver la RLS exige d'exécuter la migration sur gpu1 → **STOP**, rapporte (le test réel se fera à
  l'intégration/QA, pas ici). Aucune exécution GPU1.
- Renforcer la RLS casserait une route existante (accès légitime bloqué) → **STOP**, documente le conflit.

## Interdits
Aucune opération Git. Aucune migration appliquée sur GPU1. Aucune table modifiée/supprimée. Aucun secret.

## Rapport vérité attendu
Migration ajoutée (chemin + résumé des policies), tests d'accès + résultats, limites (ce qui ne peut être
prouvé sans gpu1), preuves collées.

<!-- REA-M04-03 -->
