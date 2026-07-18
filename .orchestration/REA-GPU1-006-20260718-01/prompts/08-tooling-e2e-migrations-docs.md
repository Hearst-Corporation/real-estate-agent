# REA-GPU1-006-M08

## Rôle et dépendance

Après intégration M01–M07, aligne scripts, E2E, migrations et documentation publique sur l'architecture GPU1/PostgREST, sans toucher au code métier.

Exécute autonomement sans question intermédiaire. Tu peux déléguer scans et tests disjoints à des sous-agents internes sans Git, puis contre-vérifie leurs sorties.

## Phase 0 obligatoire

Pars de la branche d'intégration à jour. Lis `CLAUDE.md`, `MASTER.md`, tous les scripts, E2E, workflow/commandes docs et `supabase/migrations/**`. Cherche `supabase`, `SUPABASE_`, anciens endpoints, chemins absolus, secrets/PII et hypothèses Cloud. Aucun commit/push.

## Ownership exclusif

`scripts/**`, `e2e/**`, fichiers de documentation/commandes publics, répertoire de migrations et tests de cohérence migration. Ne modifie ni app/lib métier, ni client/env/package/lock/CI appartenant à M01. Propose un handoff si une correction y est nécessaire.

## Implémentation réelle

- Migre diagnostics, seed et E2E vers le client/variables GPU1 canoniques ; aucun SDK Supabase.
- Les E2E data-fonctionnels échouent clairement ou indiquent `NOT RUN` avant la suite si prérequis absents ; aucun skip silencieux d'un échec applicatif.
- Renomme le répertoire `supabase/migrations` vers un nom neutre (`database/migrations`) uniquement si tous scripts/checks/références sont mis à jour atomiquement. Ne réécris pas la logique SQL et n'applique rien.
- Conserve les helpers SQL historiques indispensables (`auth.uid()` ou schémas) seulement après preuve qu'ils sont requis sur GPU1 ; documente-les dans l'allowlist, sans les qualifier de Supabase Cloud.
- Nettoie la documentation obsolète sans publier hostname privé, jeton, adresse IP, chemin utilisateur, PII ou capture sensible.

## Validations, STOP, rapport

Lance tests scripts/migrations, E2E sans secrets pour vérifier le fail-fast, lint et scans. STOP si un renommage casserait l'historique ou si une dépendance SQL distante n'est pas vérifiable. Aucun GPU1/déploiement. Rends `reports/REA-GPU1-006-M08.md`, matrice des références conservées et preuves textuelles committées dans GitHub. Pas de capture UI.

# REA-GPU1-006-M08
