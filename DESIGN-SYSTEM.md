# Design system — Real Estate Agent (Cockpit)

> Refonte totale du 2026-07-02 (`/tailwind-refonte`). Ce document est la **référence
> du repo**, pas une prison : tout est éditable directement, sans verrou, sans lint
> bloquant, sans source centrale. Modifie `app/globals.css`, les composants
> `components/cockpit/*.tsx` ou le markup des pages librement — cohérence par
> discipline, pas par contrainte technique.

## Esprit

Aucune couleur imposée, aucun package externe, aucune resync. Ce DS **vit dans ce
repo** et lui appartient. La seule règle : rester cohérent visuellement, et
construire avec les primitives + les blocs Tailwind Plus plutôt que réinventer.

## Thème

**Dark cockpit produit** — cohérent avec l'usage (outil B2B utilisé toute la
journée par des agents immobiliers, dense en données CRM/estimations/swarms).

- Fond : `slate-950` (`#020617`)
- Surfaces : voiles blancs translucides (`bg-white/[0.03]` à `bg-white/[0.08]`),
  bordures `border-white/10`
- Accent : `indigo-400/500/600` (remplace l'ancien bleu `--ct-accent: #3FA7E0`)
- États : `emerald-400` (succès), `amber-400` (warning), `red-400` (danger)
- Texte : `slate-100` (fort), `slate-300`/`slate-200` (body), `slate-400`/`slate-500` (muted)
- Glassmorphism : `backdrop-blur-xl` sur les rails et panneaux flottants

## Approche technique — utilities Tailwind, pas de CSS custom

L'ancien DS (`app/cockpit/*.css`, 5193 lignes, classes `ct-*`) a été **purgé**.
Le nouveau DS pose ses tokens de thème dans `app/globals.css` (`@theme` Tailwind
v4) et **compose tout en utilities directement dans le JSX** — l'approche native
des blocs Tailwind Plus (`~/.claude/tailwind-blocks/`, 657 blocs React,
`@headlessui/react` + `@heroicons/react`).

Pas de classe `ct-*` à mémoriser : ce que tu vois dans le JSX est le style.

### Exception : `.ct-page-area`

Un seul sélecteur legacy survit, **volontairement** : `.ct-page-area` dans
[`components/cockpit/CenterPanel.tsx`](components/cockpit/CenterPanel.tsx). Ce
n'est pas un token de style — c'est un **hook DOM stable** que
[`RailRight.tsx`](components/cockpit/RailRight.tsx) cible via
`document.querySelector(".ct-page-area")` pour toggler la classe `chat-open`
(réserve l'espace du drawer chat). Renomme les deux ensemble si tu y touches.

## Tokens (`app/globals.css`)

```css
@theme {
  --color-accent-50..700   /* échelle indigo custom, alignée sur le thème */
  --font-sans               /* hérite de --font-geist-sans */
  --font-mono                /* hérite de --font-geist-mono */
}
```

Le reste (spacing, radius, shadows, typo scale) utilise les **valeurs Tailwind
natives** (`rounded-xl`, `rounded-2xl`, `gap-*`, `text-sm`/`text-xs`/`text-2xl`,
`shadow-lg`) — pas de réinvention, la doc Tailwind fait référence.

## Shell — 3 colonnes

Posé une seule fois par [`app/(dashboard)/layout.tsx`](<app/(dashboard)/layout.tsx>)
via [`CockpitShell`](components/cockpit/CockpitShell.tsx) :

| Zone | Fichier | Largeur | Rôle |
|---|---|---|---|
| Rail gauche | `RailLeft.tsx` | 104px | logo, nav icônes (`navRail`), menu création, avatar profil |
| Centre | `CenterPanel.tsx` | flex-1 | zone scrollable de la page (`.ct-page-area`), `BottomBar` mobile |
| Rail droit | `RailRight.tsx` | 420px (collapsible) | chat Kimi, état persisté `localStorage` |

**Ne jamais réimporter `CockpitShell`** dans une page — une page rend
seulement son contenu.

## Primitives — `components/cockpit/primitives.tsx`

API strictement identique à l'ancien DS (aucune page n'a dû changer sa façon de
consommer ces composants) :

| Primitive | Rôle |
|---|---|
| `PageStack` | conteneur vertical d'une page |
| `PageHeader` | en-tête (kicker, titre, action, nav, KPIs) |
| `Card` | carte glass — `variant?: "hero"\|"chart"\|"dense"` |
| `KpiGrid` / `KpiCard` | grille de KPIs |
| `DashboardGrid` | grille dashboard multi-colonnes (`@container`) |
| `InsightRail` | colonne latérale d'insights |
| `HeroMetric` | grosse métrique mise en avant |
| `Title` / `Sub` / `SectionTitle` / `SubsectionTitle` / `Caption` / `Eyebrow` / `Badge` | typo & labels |

## Composants riches — à composer, ne pas recoder

| Composant | Fichier | Usage |
|---|---|---|
| `DataTable<T>` | `DataTable.tsx` | tableau typé, `align:"right"` → tabular-nums |
| `Donut` | `Donut.tsx` | anneau % (SVG, gradient indigo) |
| `Funnel` | `Funnel.tsx` | entonnoir pipeline CRM |
| `BarList` | `BarList.tsx` | barres horizontales |
| `PageNavTabs` / `PageSegmentTabs` | onglets de sous-nav / segment local |
| `StatusSelect` | PATCH statut inline |
| `DeleteButton` | DELETE + confirm |
| `LeadKanban` / `PropertyKanban` | kanban CRM |
| `Icon` | mappe `IconName` → Heroicons 24/outline |
| `AccessibleModal` | modale a11y (focus trap complet, Tab/Shift+Tab/Escape) |
| `Skeleton` / `SkeletonLines` | placeholders de chargement |
| `CockpitForm`, `Field`, `TextInput`, `Textarea`, `Select`, `MoneyInput` | `form.tsx` — inputs stylés |

Charts avancés (sparkline, gauge…) : vérifier d'abord
`public/cockpit-catalog/catalog/_index.json` avant d'en coder un nouveau.

## Mapping écran → blocs Tailwind Plus (refonte 2026-07-02)

| Domaine | Écrans | Blocs source |
|---|---|---|
| Dashboard/Agenda | `/`, `/agenda` | `application-ui/data-display__stats`, `layout__cards` |
| Portefeuille (properties/estimations/mandates) | listes + détail + wizards | `application-ui/lists__tables`, `lists__stacked-lists`, `forms__form-layouts` |
| CRM (leads/visits) | kanban + listes + forms | `application-ui/lists__grid-lists`, `forms__*`, `feedback__empty-states` |
| Prospection | recherche + résultats | `application-ui/forms__comboboxes`, `lists__stacked-lists` |
| Swarms | agents IA, runs, scrapers, tools | `application-ui/data-display__description-lists`, `feedback__alerts` |
| Invest | deals, onboarding, souscriptions, portfolio | `application-ui/lists__tables`, `headings__page-headings`, `forms__*` |
| Auth/Profil/Admin | login, profil, MFA, admin | `application-ui/forms__sign-in-forms`, `forms__action-panels` |
| Overlays transverses | modals, alerts, empty states | `application-ui/overlays__*`, `feedback__*` |

## Navigation — inchangée

`config/nav.ts` reste la source de vérité unique (rail, onglets, `AppRoute`
typé). Aucune page sous `app/(dashboard)/` sans entrée `NAV` (sauf allowlist
`profile`/`admin`/`invest`) → `npm run lint:nav`.

## Interdits (inchangés — logique métier, pas design)

- ❌ Texte UI en dur → `lib/ui-strings` (`UI.*`) — `lint:strings`
- ❌ Clé API en dur → `process.env.X` — `lint:secrets`
- ❌ Page orpheline sans entrée `NAV` — `lint:nav`
- ❌ Strings juridiques interdites sur `/invest` — `lint:legal`

Ces gardes protègent la **logique et les données**, pas le design — ils
restent actifs (`npm run check`).

## Conventions pour ajouter une page/un composant

1. Compose les primitives existantes avant d'écrire du markup brut.
2. Cherche un bloc adapté dans `~/.claude/tailwind-blocks/INDEX.md` avant de
   dessiner un pattern (table, form, empty state, hero…) à la main.
3. Reste sur la palette du thème (`slate-*`/`indigo-*`/glass) pour la cohérence
   visuelle — rien ne t'empêche techniquement de dévier, mais évite les
   incohérences gratuites.
4. `npm run check` avant de livrer (typecheck + lint + nav + strings + secrets).
