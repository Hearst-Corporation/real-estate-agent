<!-- REA-M04-08 -->
# REA-M04-08 — Cockpit quotidien et Agenda

**Branche cible (créée par l'intégrateur) :** `feature/rea-m04-daily-cockpit`
**Base :** `b2d85403419d2007cb106c9e85abc1d9341685f0`

## Objectif métier
Faire de l'accueil un vrai cockpit quotidien priorisé (urgent → aujourd'hui → ensuite) et d'un agenda
lisible, en réduisant la profusion de boxes / pills / CTA répétitifs qui noie l'information utile.

## Faits réellement vérifiés dans le repo (base b2d8540)
- Accueil : `app/(dashboard)/page.tsx`. Agenda : `app/(dashboard)/agenda/`.
- Centre d'actions dérivé + `rea_tasks` : migration `0043` ajoute la table `rea_tasks` ; A4 de REA-PLATFORM-002
  a livré « action center + agenda entity links + rea_tasks » (LAST_REPORT). Dérivation dans `lib/actions/derive.ts`.
- DS Cockpit (`components/cockpit/**`), thème lin/or, primitives Catalyst.

## À vérifier / corriger notamment
- **Hiérarchie temporelle** claire : urgent → aujourd'hui → ensuite (une seule chose dominante par écran).
- **Réduire** le nombre de boxes/pills/CTA redondants ; regrouper l'action.
- **Agenda** lisible (densité maîtrisée, liens vers les entités CRM déjà présents).
- États : loading / empty (« rien d'urgent aujourd'hui ») / error honnêtes, jamais de fausse tâche.

## Ownership de fichiers (STRICT)
Tu ne modifies QUE : `app/(dashboard)/page.tsx` (+ ses `_components`), `app/(dashboard)/agenda/**`,
et éventuellement `lib/actions/**` (dérivation d'affichage, sans changer le contrat DB).
**Interdit** : shell/layout (mission 07), prospection/estimation/crm UI (missions 09–11), routes API
métier hors lecture, migrations, et fichiers partagés (`config/nav.ts`, `lib/ui-strings.ts`, `app/globals.css`,
primitives). Si un libellé doit vivre dans `lib/ui-strings.ts`, **signale-le**.

## Validations factuelles exigées (Playwright)
- `browser_navigate` accueil + agenda → **0 erreur console**.
- Resize 375 → 0 scroll horizontal. Re-check 1440.
- États empty (aucune tâche) et populé (tâches réelles dérivées) rendus correctement (screenshots).
- `pnpm typecheck` + `check:catalyst` verts.

## Conditions STOP
- Réduire les CTA exige de retirer une fonctionnalité réelle → **STOP**, propose plutôt un regroupement, documente.
- Un libellé/priorité doit venir de `lib/ui-strings.ts` → **STOP**, signale.

## Interdits
Aucune opération Git. Aucune tâche/action inventée (tout dérivé de données réelles). Aucun secret.
Pas de composant natif dans le dashboard.

## Rapport vérité attendu
Fichiers touchés, URLs testées, console, scroll, états empty/populé, screenshots, besoins fichiers partagés.

<!-- REA-M04-08 -->
