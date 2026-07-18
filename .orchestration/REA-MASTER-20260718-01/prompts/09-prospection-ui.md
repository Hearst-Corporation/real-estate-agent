<!-- REA-M04-09 -->
# REA-M04-09 — Prospection haute densité (UI)

**Branche cible (créée par l'intégrateur) :** `feature/rea-m04-prospection-ui`
**Base :** `b2d85403419d2007cb106c9e85abc1d9341685f0`

## Objectif métier
Rendre la prospection dense et efficace : l'agent voit **le premier résultat utile rapidement**,
en particulier sur mobile, sans scroller à travers du vide ou des en-têtes surdimensionnés.

## Faits réellement vérifiés dans le repo (base b2d8540)
- UI prospection : `app/(dashboard)/prospection/**`. 5 onglets livrés en A1 de REA-PLATFORM-002 :
  Profils / Matching / Annonces / Historique / Alertes (matching expliqué, alertes en aperçu honnête).
- Données prospection réelles (LIVE) : critères multi-profils, matching expliqué (critères satisfaits/
  imparfaits/bloquants), historique (`prosp_match_feedback.signal`, `prosp_contact_attempts`), préférences d'alertes.
- **Envoi d'alertes = CONFIG/APERÇU honnête** (aucun transport branché ; badge « Aperçu — envoi non branché »).
- DS Cockpit, thème lin/or, primitives Catalyst.

## Périmètre (STRICT — UI uniquement)
- Densifier et hiérarchiser l'UI prospection : premier résultat visible vite, mobile-first, densité maîtrisée.
- **Ne pas** transformer l'aperçu d'alerte en faux envoi. **Ne pas** inventer de match/donnée.
- **UI uniquement** : aucune route API, aucune logique de scoring/matching, aucune migration.

## Ownership de fichiers (STRICT)
Tu ne modifies QUE : `app/(dashboard)/prospection/**` (pages + `_components`).
**Interdit** : `lib/prospection/**` (logique — hors périmètre UI), les routes `app/api/prospection/**`,
les autres UI (accueil/agenda/estimation/crm), le shell (mission 07), et les fichiers partagés
(`config/nav.ts`, `lib/ui-strings.ts`, `app/globals.css`, primitives). Signale tout besoin partagé.

## Validations factuelles exigées (Playwright)
- `browser_navigate` prospection → **0 erreur console**.
- Resize 375 → 0 scroll horizontal ; **premier résultat utile visible sans scroll excessif** (screenshot mobile). Re-check 1440.
- États : loading / empty (aucun match) / error honnêtes ; badge « Aperçu » d'alerte préservé.
- `pnpm typecheck` + `check:catalyst` verts.

## Conditions STOP
- Améliorer l'UI exige de changer la logique de matching/scoring → **STOP** (hors périmètre UI), signale.
- Un libellé doit venir de `lib/ui-strings.ts` → **STOP**, signale.

## Interdits
Aucune opération Git. Aucun faux envoi d'alerte. Aucun match/donnée inventé. Aucun composant natif. Aucun secret.

## Rapport vérité attendu
Fichiers touchés, URL testée, console, scroll@375, temps/scroll jusqu'au premier résultat, états, screenshots
mobile+desktop, besoins fichiers partagés.

<!-- REA-M04-09 -->
