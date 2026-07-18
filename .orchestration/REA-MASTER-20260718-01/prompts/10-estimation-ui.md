<!-- REA-M04-10 -->
# REA-M04-10 — Estimation mobile et continuité commerciale (UI)

**Branche cible (créée par l'intégrateur) :** `feature/rea-m04-estimation-ui`
**Base :** `b2d85403419d2007cb106c9e85abc1d9341685f0`

## Objectif métier
Rendre le parcours d'estimation impeccable sur mobile et prolonger la valeur commerciale : après
l'estimation, l'agent enchaîne naturellement vers la création du propriétaire (lead) et du mandat.

## Faits réellement vérifiés dans le repo (base b2d8540)
- UI estimation : `app/(dashboard)/estimations/` (`page.tsx`, `[id]`, `new`, `_components`, `error.tsx`, `loading.tsx`).
- Continuité estimation → propriétaire → mandat livrée en A2 de REA-PLATFORM-002 (migration `0043` :
  `estimations`(owner_lead_id/decision/next_action/manual_adjustments)).
- Moteur/comparables : `lib/estimation/**` (comparables, dvf, ademe, cadastre, clarity, continuity…) —
  **hors périmètre UI** (détenu par mission 12).
- DS Cockpit, thème lin/or, primitives Catalyst.

## Périmètre (STRICT — UI uniquement)
- Corriger le **pipeline mobile** de l'estimation (étapes lisibles, pas de scroll horizontal, hiérarchie claire).
- Améliorer la présentation des **comparables** et de la **confiance** (sans changer leur calcul).
- Renforcer la **continuité** vers propriétaire/mandat dans l'UI (CTA clairs vers `owner_lead_id`/mandat).
- **UI uniquement** : aucun changement du moteur d'estimation, providers, PDF, partage (mission 12), aucune migration.

## Ownership de fichiers (STRICT)
Tu ne modifies QUE : `app/(dashboard)/estimations/**` (pages + `_components`).
**Interdit** : `lib/estimation/**` (mission 12), les routes API estimation, les autres UI, le shell,
et les fichiers partagés (`config/nav.ts`, `lib/ui-strings.ts`, `app/globals.css`, primitives). Signale tout besoin partagé.

## Validations factuelles exigées (Playwright)
- `browser_navigate` sur `/estimations` et le pipeline `new` → **0 erreur console**.
- Resize 375 → 0 scroll horizontal sur chaque étape du pipeline (screenshots). Re-check 1440.
- Comparables + indice de confiance rendus clairement ; CTA continuité (propriétaire/mandat) présents et fonctionnels.
- États loading / empty / error. `pnpm typecheck` + `check:catalyst` verts.

## Conditions STOP
- Améliorer l'affichage confiance/comparables exige de changer leur calcul → **STOP** (mission 12), signale.
- Un libellé doit venir de `lib/ui-strings.ts` → **STOP**, signale.

## Interdits
Aucune opération Git. Aucune valeur d'estimation/comparable inventée. Aucun composant natif. Aucun secret.
Ne pas toucher le moteur (mission 12).

## Rapport vérité attendu
Fichiers touchés, URLs testées, console, scroll@375 par étape, continuité vérifiée, états, screenshots, besoins partagés.

<!-- REA-M04-10 -->
