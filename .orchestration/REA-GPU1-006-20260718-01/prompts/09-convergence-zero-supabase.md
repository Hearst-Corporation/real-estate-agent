# REA-GPU1-006-M09

## Rôle et résultat

Après M08, réalise la convergence transversale et ferme toutes les dépendances ou nomenclatures Supabase résiduelles sans masquer les exceptions SQL réellement nécessaires.

Exécute autonomement sans question intermédiaire. Les sous-agents internes peuvent paralléliser des scans/gates sans Git ; tu dois relire leurs preuves et reproduire tout échec.

## Phase 0 obligatoire

Lis l'intégralité du diff depuis `044ebd2`, tous les rapports M01–M08, MASTER, package/lock, env/CI, app/lib/scripts/e2e/docs/migrations. Rejoue un inventaire global. Aucun commit/push.

## Ownership

Tu peux corriger les résidus transversaux strictement nécessaires à l'intégration. Tu ne développes aucune nouvelle fonctionnalité, ne refactors pas l'UI et ne changes pas les contrats métier. Toute correction non mécanique importante est renvoyée au propriétaire initial.

## Travail obligatoire

- Prouve zéro paquet/import/runtime/env `@supabase`, `SupabaseClient`, `getSupabaseAdmin`, `SUPABASE_*`, URL `supabase.co` et erreur fournisseur.
- Ajoute un check statique CI/release qui empêche leur retour, avec allowlist minimale, fichier par fichier, pour SQL historique indispensable seulement.
- Vérifie qu'aucune variable DB n'est `NEXT_PUBLIC_*`, que l'admin token est serveur-only et que health/logs n'exposent rien.
- Vérifie types, résultat `{data,error,count?}`, timeouts, RPC, cardinalité et erreurs sur tous les domaines.
- Contrôle `git diff`, secrets, PII, hostnames privés et documents/captures sensibles.
- Exécute `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm test`, `pnpm test:migrations`, `pnpm build`. Corrige uniquement les régressions de convergence.

## STOP et rapport

STOP si la suppression d'une référence impose une migration GPU1, une donnée secrète, un changement produit ou un contournement de test. Aucun déploiement/merge/migration. Rends `reports/REA-GPU1-006-M09.md` avec commandes, sorties, allowlist, verdict technique et preuves non sensibles committées dans GitHub. Pas de capture UI sauf changement visuel imprévu, qui doit alors être prouvé avant/après.

# REA-GPU1-006-M09
