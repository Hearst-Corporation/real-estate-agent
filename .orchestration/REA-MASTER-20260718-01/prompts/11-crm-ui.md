<!-- REA-M04-11 -->
# REA-M04-11 — CRM et portefeuille denses (UI)

**Branche cible (créée par l'intégrateur) :** `feature/rea-m04-crm-ui`
**Base :** `b2d85403419d2007cb106c9e85abc1d9341685f0`

## Objectif métier
Densifier les vues CRM (biens, mandats, visites, fiches) pour supprimer les grandes surfaces vides et
donner à l'agent une lecture rapide de son portefeuille — sans inventer de données pour « remplir ».

## Faits réellement vérifiés dans le repo (base b2d8540)
- Pages CRM UI : `app/(dashboard)/properties/**`, `app/(dashboard)/mandates/**`, `app/(dashboard)/visits/**`,
  `app/(dashboard)/leads/**` (fiches). Vue cockpit portefeuille amorcée (branche `ds/liberer-coherence-canon`).
- Formats/helpers : `lib/crm/**` (dont `format.ts`). DS Cockpit, thème lin/or, primitives Catalyst.
- **Attention chevauchement** : la fiche **lead** et son financement sont **détenus par la mission 06**
  (`feature/rea-m04-buyer-finance`). Ne touche PAS au champ financement ni à la logique lead de la mission 06.

## Périmètre (STRICT — UI uniquement)
- Réduire les surfaces vides sur biens / mandats / visites / fiches CRM ; densité et hiérarchie.
- **Ne pas inventer de données** : une liste vide reste un empty state honnête, pas des lignes factices.
- UI uniquement : aucune route API, aucune migration.

## Ownership de fichiers (STRICT)
Tu ne modifies QUE : `app/(dashboard)/properties/**`, `app/(dashboard)/mandates/**`,
`app/(dashboard)/visits/**`, et les parties **d'affichage** des fiches CRM **hors financement lead**.
**Interdit** : le champ financement / logique lead (mission 06), `lib/crm/format.ts` s'il est partagé par
d'autres missions (signale sinon), l'estimation/prospection UI, le shell, et les fichiers partagés
(`config/nav.ts`, `lib/ui-strings.ts`, `app/globals.css`, primitives).

## Validations factuelles exigées (Playwright)
- `browser_navigate` sur properties / mandates / visits → **0 erreur console**.
- Resize 375 → 0 scroll horizontal ; densité améliorée sans surface vide dominante (screenshots avant/après).
- États empty honnêtes (aucun bien → message clair, pas de fausse ligne). Re-check 1440.
- `pnpm typecheck` + `check:catalyst` verts.

## Conditions STOP
- Densifier exige de charger plus de données (nouvelle route/API) → **STOP** (UI uniquement), signale.
- Chevauchement avec la fiche lead/financement (mission 06) → **STOP**, coordonne via rapport.

## Interdits
Aucune opération Git. Aucune donnée CRM inventée. Aucun composant natif. Aucun secret. Ne pas empiéter sur la mission 06.

## Rapport vérité attendu
Fichiers touchés, URLs testées, console, scroll@375, densité avant/après, empty states, screenshots, besoins partagés,
zones de chevauchement signalées.

<!-- REA-M04-11 -->
