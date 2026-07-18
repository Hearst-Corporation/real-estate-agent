<!-- REA-M04-05 -->
# REA-M04-05 — Boot, health, CI et contrat de déploiement

**Branche cible (créée par l'intégrateur) :** `feature/rea-m04-prod-gates`
**Base :** `b2d85403419d2007cb106c9e85abc1d9341685f0`

## Objectif métier
Rendre le passage en production sûr et vérifiable : l'app refuse de démarrer sans son environnement
minimal, le health check reflète l'état réel DB/auth, et la CI garantit build + tests + cohérence
migrations + E2E avant tout déploiement.

## Faits réellement vérifiés dans le repo (base b2d8540)
- `pnpm check` = `concurrently` : `lint:secrets`, `lint`, `lint:nav`, `lint:strings`,
  `gen-cockpit-manifest --check`, `typecheck`, `lint:biome`, `check:catalyst`. **N'inclut ni `test` ni `build`.**
- Health : `app/api/health/route.ts` (`runtime nodejs`, `force-dynamic`, `no-store`). Ping DB réel PostgREST
  gpu1 (HEAD `Range: 0-0`, timeout `DB_PING_TIMEOUT_MS = 3000`), n'expose ni URL ni clé. Utilise
  `providersStatus`, `getSession`, `r2IsConfigured`, `inngestIsConfigured`.
- CI : `.github/workflows/ci.yml`. Scripts : `test-migrations-coherence.mjs`, `db-diagnose.mjs`.
- Migrations 0001→0045 présentes.

## À vérifier / corriger notamment
- **Validation d'environnement au boot** : variables requises absentes → échec explicite au démarrage
  (pas un crash tardif obscur). Ne jamais logger de valeur de secret.
- **Health réel DB/auth** : distinguer DB up/down et auth configurée/non, sans exposer d'infra.
- **CI** : la pipeline exécute build + tests + cohérence migrations + E2E (compléter `ci.yml` si un maillon manque).
- **Documentation de déploiement** : `docs/DEPLOYMENT.md` à jour (miroir du code).
- **Headers de sécurité** (CSP/HSTS/no-sniff/frame) posés côté Next config / réponses, sans casser l'app.

## Ownership de fichiers (STRICT)
Tu ne modifies QUE : `app/api/health/**`, `.github/workflows/ci.yml`, `docs/DEPLOYMENT.md`,
`next.config.*` (headers), `lib/server/env*.ts` / validation boot (si présent), et un éventuel
`lib/env-check.ts` **nouveau** dédié. **Interdit** : `lib/env.ts` s'il est un fichier partagé de types,
l'auth (mission 01), la gateway, l'aigent, les UI, l'electron, et les fichiers partagés (§3 MASTER.md).
**Aucun secret ni aucune modification Vercel.**

## Validations factuelles exigées
- Test/preuve : boot sans var requise → échec clair (message sans valeur de secret).
- Preuve health : réponse structurée DB up et DB down (mock du ping), collée.
- CI mise à jour → montrer le YAML final et les étapes ajoutées.
- `pnpm check` vert sur ton diff.

## Conditions STOP
- Ajouter une var requise casserait le boot local d'autres missions → **STOP**, documente la var attendue
  (à poser dans `.env.local` par Adrien, jamais committée).
- Un header de sécurité casse une page réelle → **STOP**, signale plutôt que de désactiver la page.

## Interdits
Aucune opération Git. Aucun secret committé. Aucune modification des secrets Vercel. Aucun déploiement.
Aucune donnée de health inventée.

## Rapport vérité attendu
Fichiers touchés, comportement boot/health prouvé, diff CI, vars requises documentées, limites, preuves.

<!-- REA-M04-05 -->
