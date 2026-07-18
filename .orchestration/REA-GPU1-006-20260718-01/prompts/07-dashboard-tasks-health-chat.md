# REA-GPU1-006-M07

## Rôle et résultat

Migre les consommateurs DB partagés restants : accueil/cockpit, agenda, tâches, health, chat et vues serveur non possédées par M02–M06.

Exécute autonomement sans question intermédiaire. Sous-agents internes seulement pour tests/inventaires disjoints, sans Git ; ownership et verdict restent les tiens.

## Phase 0 obligatoire

Depuis le SHA de base, lis `CLAUDE.md`, `MASTER.md`, `app/(dashboard)/page.tsx`, agenda, `app/api/tasks/**`, `app/api/health/**`, `app/api/cockpit-chat/**`, helpers d'overview/cockpit concernés et tests. Utilise un inventaire `rg` pour confirmer qu'aucun fichier n'appartient à une autre mission. Aucun commit/push.

## Ownership exclusif

Seulement les consommateurs partagés explicitement listés et leurs tests. Si un fichier relève clairement admin/CRM/estimation/prospection/gateway, STOP et handoff. Pas de socle/env/package/CI/scripts/migrations.

## Implémentation réelle

- Adopte `getGpu1Admin()`/types GPU1 ; supprime noms fournisseur de ce périmètre.
- Préserve dérivation LIVE des actions, états tâches, 401 avant DB, tenant/owner checks et comportement du chat.
- `/api/health` ne révèle ni URL, token, topology privée ou détail exploitable ; il distingue configuration, disponibilité et dégradation sans faux vert.
- Les erreurs publiques deviennent neutres. Les tests couvrent DB absente, cross-tenant, mutation tâche, overview vide/erreur et health sûr.

## Validations, STOP, rapport

Tests ciblés, typecheck/lint et scan. Aucun appel GPU1/LLM, migration ou déploiement. STOP sur ownership ambigu ou primitive manquante. Rends `reports/REA-GPU1-006-M07.md` et preuves GitHub. Aucune modification visuelle n'est attendue ; si elle survient, captures avant/après desktop+mobile, états clé, locale FR et données anonymisées obligatoires.

# REA-GPU1-006-M07
