<!-- REA-M04-02 -->
# REA-M04-02 — Gateway Aigent : identité, idempotence et HITL

**Branche cible (créée par l'intégrateur) :** `feature/rea-m04-gateway`
**Base :** `b2d85403419d2007cb106c9e85abc1d9341685f0`

## Objectif métier
Garantir que la gateway métier server-to-server consommée par les agents Aigent ne produit jamais
un double effet (idempotence), ne laisse jamais un agent agir hors de ses scopes/tenant, et persiste
correctement les approbations humaines (HITL) avant toute action sensible.

## Faits réellement vérifiés dans le repo (base b2d8540)
- Gateway : `app/api/agent-gateway/v1/**` (**15 routes** : listings, buyers, matching, alerts, crm, valuations)
  + `lib/agent-gateway/**` (`auth.ts`, `authz.ts`, `scopes.ts`, `delegation.ts`, `idempotency.ts`,
  `idempotent-write.ts`, `approval.ts`, `audit.ts`, `contracts.ts`, `handler.ts`, `response.ts`, `unavailable.ts`).
- Tests déjà présents : `authz.test.ts`, `idempotency.test.ts`, `approval.test.ts`, `dispatch-route.test.ts`,
  `read-route.test.ts`, `normalize-route.test.ts`, `update-preferences-route.test.ts`.
- Migrations : `0044_agent_gateway.sql` (idempotency keys + audit, RLS deny-by-default, service-role only),
  `0045_alert_approvals.sql` (approbations persistées). Trigger `set_updated_at` idempotent (drop+create).
- HITL Aigent : `app/api/aigent/runs/[id]/resume/route.ts`, migration `0030_swarm_runs_paused_hitl.sql`.

## À vérifier / corriger notamment
- **Idempotence des triggers** et du flux reserve→lookup→complete (`agent_gateway_idempotency_keys`) :
  un rejeu (même `tenant_id`, `interface`, `idem_key`) ne doit jamais produire un second effet.
- **Identité technique + scopes + délégation** : chaque interface refuse hors-scope et hors-tenant.
- **Approbations persistées** (`0045`) : une action sensible bloque sans approbation, exécute après.
- **Timeouts** : aucun appel gateway ne pend indéfiniment.
- **Audit** : chaque interface journalise (forensique, service-role only).

## Ownership de fichiers (STRICT)
Tu ne modifies QUE : `app/api/agent-gateway/**`, `lib/agent-gateway/**`, `app/api/aigent/runs/[id]/resume/route.ts`,
et migrations **additives** gateway/approbations si nécessaire (numéro > 0045, jamais éditer l'existant).
**Interdit** : `lib/aigent/runtime*.ts` (mission 04), le reste de `app/api/aigent/**` hors resume (mission 04),
l'auth/proxy (mission 01), les UI, l'electron, les e2e, et les fichiers partagés (§3 MASTER.md).

## Validations factuelles exigées
- Test prouvant qu'un rejeu même clé ne double pas l'effet (assert 1 seul write).
- Test prouvant qu'une interface refuse un scope manquant / un tenant étranger (403).
- Test prouvant qu'une action sensible sans approbation → refus, puis exécution après approbation.
- `pnpm typecheck` + `pnpm lint` + tests gateway verts sur ton diff. **Aucun agent ni envoi réel inventé.**
- Aucune migration appliquée sur GPU1.

## Conditions STOP
- Prouver l'idempotence exige d'écrire réellement en DB gpu1 → **STOP**, rapporte (tests en mock/local seulement).
- Un correctif touche un fichier hors ownership ou partagé → **STOP**, signale le besoin.

## Interdits
Aucune opération Git. Aucun secret committé. Aucun agent/run/résultat fabriqué. Aucun envoi externe réel.

## Rapport vérité attendu
Fichiers touchés, tests ajoutés + résultats collés, limites, preuves, besoins fichiers partagés.

<!-- REA-M04-02 -->
