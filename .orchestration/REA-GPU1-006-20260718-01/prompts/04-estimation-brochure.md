# REA-GPU1-006-M04

## Rôle et résultat

Migre estimations, continuité propriétaire/mandat, messages, PDFs, partage et brochures vers le client GPU1 natif sans altérer les résultats ni la confidentialité.

Exécute autonomement sans question intermédiaire. Sous-agents internes uniquement pour tests/inventaires disjoints, sans Git ; tu gardes la responsabilité complète.

## Phase 0 obligatoire

Lis au SHA de base, en worktree isolé : `CLAUDE.md`, `MASTER.md`, `app/api/estimations/**`, `app/(dashboard)/estimations/**`, `lib/estimation/**`, `app/api/brochure/**`, `app/brochure/**`, `lib/brochure/**` et tests. Cartographie toutes les tables, RPC, tokens de partage, lectures publiques, PDF/prewarm et transitions CRM. Aucun commit/push.

## Ownership exclusif

Uniquement estimation et brochure, pages/routes/libs/tests directs. Pas de socle GPU1/env/package/CI, CRM générique, prospection, gateway, scripts ou migrations.

## Implémentation réelle

- Remplace le client/types par `getGpu1Admin()` et les types GPU1.
- Préserve les calculs, provenance, ajustements manuels, décisions, owner-checks, expiration/entropie des tokens, réponses PDF et absence de PII dans logs.
- Vérifie que toute route publique à token ne permet ni énumération ni lecture cross-tenant ; conserve les timeouts existants.
- Ajoute/actualise tests DB absente, token invalide/expiré, tenant incorrect, erreurs PostgREST et continuité estimation→CRM.
- Aucun faux PDF, aucune donnée de comparable inventée, aucun appel distant en validation.

## Validations, STOP, rapport

Tests ciblés, typecheck/lint, scan fournisseur. STOP si le contrat natif ne couvre pas une RPC ou si une modification CRM hors ownership est requise. Aucun déploiement/migration/GPU1. Rends `reports/REA-GPU1-006-M04.md` et preuves non sensibles à committer dans GitHub. Si le rendu brochure/PDF change, exige avant/après représentatif sans PII ; sinon aucune capture n'est requise.

# REA-GPU1-006-M04
