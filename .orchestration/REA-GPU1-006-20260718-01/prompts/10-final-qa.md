# REA-GPU1-006-M10

## Rôle et résultat

Tu es la sentinelle QA indépendante. Tu ne fais pas confiance aux rapports : tu vérifies la RC intégrée et rends un verdict factuel READY/NOT READY.

Exécute autonomement sans question intermédiaire. Tu peux lancer des sous-agents internes pour des gates indépendantes sans Git, mais tu dois contre-vérifier les résultats critiques.

## Phase 0 obligatoire

Lis `CLAUDE.md`, `MASTER.md`, le diff complet, les rapports M01–M09, CI, env examples, package/lock, client GPU1, routes sensibles, tests, migrations et allowlist. Vérifie le SHA de base et la propreté du worktree. Aucun commit/push.

## Ownership

Par défaut, preuves et rapport uniquement. Une correction minuscule de test/manifest est possible avec accord du coordinateur ; toute correction produit retourne au worker propriétaire. Aucun déploiement, merge, migration, secret ou réseau GPU1.

## Vérifications indépendantes

- Rejoue installation figée, check, tests, cohérence migrations et build.
- Rejoue E2E et Electron si leurs prérequis locaux existent ; sinon marque exactement `NOT RUN` et pourquoi. Aucun skip ne doit transformer un échec en vert.
- Teste le client natif : CRUD simulé, RPC, filtres, encoding, count, cardinalité, timeout, erreurs et redaction.
- Vérifie auth 401 avant DB, tenant/user ownership, admin/MFA, gateway scopes/idempotence/HITL, tokens brochure, opt-out, health sûr.
- Scanne packages/imports/env/messages/URLs et vérifie l'allowlist SQL. Scanne secrets, PII, hostnames/IP privées, dumps et captures.
- Confirme qu'aucune migration 0043+ n'a été appliquée par cette vague et qu'aucun déploiement/main/PR #16 n'a été touché.

## Preuves et verdict

Écris des preuves non sensibles dans `evidence/manifest.json` et le rapport `reports/REA-GPU1-006-M10.md`. Mets à jour `REPORT.md` avec SHA, gates complètes, écarts et verdict. `READY` exige toutes les preuves ; sinon `NOT READY` avec blocage reproductible. Ne prétends jamais avoir observé GPU1 si tu ne l'as pas interrogé avec autorisation — ici elle n'est pas donnée.

# REA-GPU1-006-M10
