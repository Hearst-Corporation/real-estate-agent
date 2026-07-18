<!-- REA-M04-07 -->
# REA-M04-07 — Shell responsive et Assistant contextuel

**Branche cible (créée par l'intégrateur) :** `feature/rea-m04-shell`
**Base :** `b2d85403419d2007cb106c9e85abc1d9341685f0`

## Objectif métier
Rendre le shell (rails de navigation, largeur de contenu métier, panneau assistant droit) confortable
sur toutes les tailles : desktop large, mobile, et écrans de faible hauteur — sans perdre l'accès à
l'assistant ni au contenu principal.

## Faits réellement vérifiés dans le repo (base b2d8540)
- Layout : `app/layout.tsx` (racine, sans CockpitShell) ; `app/(dashboard)/layout.tsx` (garde serveur + CockpitShell).
- Design system = Cockpit, copie locale éditable : `components/cockpit/**` + `components/ui/**` + `app/globals.css`
  (Tailwind v4). Thème lin/or, primitives Catalyst (jamais de natif dans le dashboard).
- Assistant / chat Cockpit : route `app/api/cockpit-chat/route.ts` (OpenAI), panneau côté UI.

## À vérifier / corriger notamment
- **Mobile** : le shell reste utilisable (rails repliables, pas de scroll horizontal sur le body).
- **Faible hauteur** : l'assistant droit et le contenu ne se chevauchent pas / restent atteignables.
- **Largeur métier** : le contenu principal a une largeur de lecture correcte (pas trop étiré).
- **Assistant droit** : ouverture/fermeture, focus clavier visible, états (loading/empty/error).
- **Conserver Catalyst et le thème lin/or** — pas de nouvelle couleur d'accent, pas de composant natif.

## Ownership de fichiers (STRICT)
Tu ne modifies QUE : `app/(dashboard)/layout.tsx`, les composants de shell/assistant dans
`components/cockpit/**` **hors primitives partagées**, et éventuellement `app/layout.tsx`.
**Interdit** : `components/cockpit/primitives.tsx`, `components/ui/*`, `app/globals.css`, `config/nav.ts`,
`lib/ui-strings.ts` (tous partagés → signale le besoin). Interdit aussi les pages métier détenues par les
missions 08–11 (accueil, agenda, prospection, estimation, crm) et les routes API.

## Validations factuelles exigées (Playwright obligatoire, cf. règle browser)
- `browser_navigate` sur une page du dashboard → **0 erreur console**.
- `browser_resize` 375×812 → `scrollWidth <= innerWidth` (0 scroll horizontal). Re-check 1440.
- Écran faible hauteur (ex. 1024×600) : assistant + contenu atteignables (snapshot + screenshot).
- États assistant (ouvert/fermé, focus visible) testés. `pnpm typecheck` + `check:catalyst` verts.

## Conditions STOP
- Le fix responsive exige d'éditer `app/globals.css` ou une primitive partagée → **STOP**, signale.
- Un changement toucherait `config/nav.ts` (structure de nav) → **STOP**, signale (partagé).

## Interdits
Aucune opération Git. Aucun composant natif dans le dashboard. Aucune nouvelle couleur d'accent.
Aucune donnée inventée. Aucun secret.

## Rapport vérité attendu
Fichiers touchés, URL(s) testées, console, scroll@375/@1440, faible hauteur, états assistant, screenshots,
besoins fichiers partagés.

<!-- REA-M04-07 -->
