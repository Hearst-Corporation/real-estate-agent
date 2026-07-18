<!-- REA-M04-13 -->
# REA-M04-13 — Electron production et parité web

**Branche cible (créée par l'intégrateur) :** `feature/rea-m04-electron`
**Base :** `b2d85403419d2007cb106c9e85abc1d9341685f0`

## Objectif métier
Rendre l'application desktop Electron prête pour la production : sécurité renforcée (isolation renderer),
packaging signé/notarisé fiable, smoke tests, et parité fonctionnelle avec le web.

## Faits réellement vérifiés dans le repo (base b2d8540)
- Dossier Electron : `electron/main.ts`, `electron/preload.cts`, `electron/splash.html`,
  `electron/entitlements.mac.plist`, `electron/tsconfig.json`, `electron/__tests__/`.
- Scripts : `pnpm electron:dev`, `pnpm electron:start`, `pnpm electron:test`, `pnpm electron:build`,
  `pnpm electron:build:release`, `pnpm electron:publish`.
- Splash = sélecteur d'env (local/prod). Build signé/notarisé (`/release-mac`).
- Contrainte sécurité globale : clés LLM **jamais** dans le renderer Electron ; jamais `NEXT_PUBLIC_*` pour un secret.

## À vérifier / corriger notamment
- **Sécurité desktop** : `contextIsolation` on, `nodeIntegration` off, preload minimal, pas de secret exposé au renderer.
- **Packaging** : build signé + notarisé + staplé sans erreur Gatekeeper (au moins la config, pas forcément l'exécution notarize ici).
- **Smoke tests** : `electron:test` couvre le démarrage / splash / sélection d'env.
- **Parité web** : les flux métier web fonctionnent identiquement dans la coquille desktop.

## Ownership de fichiers (STRICT)
Tu ne modifies QUE : `electron/**` (et éventuellement la config de build electron référencée depuis
`package.json` — mais `package.json` est **partagé** : signale les changements de scripts/deps au lieu de l'éditer).
**Interdit** : le produit web métier (`app/**`, `components/**`, `lib/**` hors intégration electron),
les routes API, les migrations, et les fichiers partagés (§3 MASTER.md).

## Validations factuelles exigées
- `pnpm electron:test` vert (smoke), sortie collée.
- Preuve de la config sécurité (extraits `main.ts`/`preload.cts` : isolation on, nodeIntegration off).
- Config packaging vérifiée (entitlements, signature) — sans exécuter une vraie notarisation ni publier.
- `pnpm typecheck` vert sur ton diff.

## Conditions STOP
- Un changement de dépendance/script est requis → **STOP** (`package.json` partagé), signale précisément.
- La parité exige de modifier le produit web → **STOP** (hors périmètre), coordonne via rapport.
- La notarisation exige des secrets de signature réels → **STOP**, n'expose aucun secret.

## Interdits
Aucune opération Git. Aucun secret de signature committé. Aucune publication réelle. Aucune modif du web métier.

## Rapport vérité attendu
Fichiers touchés, sortie `electron:test`, preuves config sécurité, état packaging, limites (ce qui n'a pas été
notarisé/publié), besoins `package.json`.

<!-- REA-M04-13 -->
