# Cockpit — guide agent (à lire AVANT toute UI)

> Source de vérité **locale** pour construire une page ou un composant dans ce repo.
> Tu n'as pas besoin de lire le CSS (découpé en sections dans `app/cockpit/`) ni le
> SPEC global : **compose les primitives ci-dessous**. Le vocabulaire exact (tokens +
> classes) est dans `components/cockpit/manifest.json` (auto-généré). Si une primitive
> manque, ajoute-la dans `components/cockpit/` plutôt que d'écrire du CSS/inline.

## TL;DR — l'essentiel

1. **Une page = composition de primitives** (`PageHeader` + `PageStack` + `Card`). Jamais de `<div className="...">` brut quand une primitive existe.
2. **Zéro couleur en dur.** Pas de hex, pas de `rgb()/rgba()`, pas de `style={{ color }}`. Tout via token `--ct-*` ou classe `ct-*`. → bloqué par `npm run lint:cockpit`.
3. **Ne jamais réimporter `CockpitShell`** dans une page : le shell (rails gauche/droite + chat Kimi) est posé une fois par `app/(dashboard)/layout.tsx`. Une page rend **seulement** son contenu.
4. **Server component par défaut.** Data fetchée côté serveur, filtrée `user_id` + `tenant_id`. Les bits interactifs vont dans `_components/*` (`"use client"`).
5. **`data-product` = seul switch d'accent.** Jamais re-styler l'accent à la main.
6. **Navigation centralisée.** Une page = **1 entrée dans `NAV`** (`config/nav.ts`) ; rail, onglets et routes typées (`AppRoute`) en dérivent. Le plus rapide pour tout câbler : `npm run new:feature <resource>`.

## Recette canonique d'une page

Fichier : `app/(dashboard)/<nom>/page.tsx` — server component async.

```tsx
import { PageHeader, PageStack, Card, KpiGrid, KpiCard } from "@/components/cockpit/primitives";
import { PageNavTabs } from "@/components/cockpit/PageNavTabs";
import { DataTable, type Column } from "@/components/cockpit/DataTable";
import { TAB_GROUPS } from "@/config/nav";           // ← onglets de sous-nav typés
import { UI } from "@/lib/ui-strings";              // ← tous les textes ici, jamais en dur
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";

type Row = { id: string; label: string; created_at: string };

export default async function MaPage() {
  const t = UI.maPage;                              // namespace de strings
  const claims = await getSession();
  const sb = getSupabaseAdmin();

  let rows: Row[] = [];
  if (claims && sb) {
    const { data } = await sb
      .from("ma_table")
      .select("id, label, created_at")
      .eq("user_id", claims.sub)                    // ⚠ service-role bypass RLS →
      .eq("tenant_id", tenantOf(claims))            //   filtrer les DEUX explicitement
      .order("created_at", { ascending: false });
    rows = (data ?? []) as Row[];
  }

  const columns: Column<Row>[] = [
    { key: "label", header: t.cols.label, render: (r) => r.label },
    { key: "date", header: t.cols.date, align: "right", render: (r) => r.created_at.slice(0, 10) },
  ];

  return (
    <PageStack>
      <PageHeader
        kicker={t.kicker}
        title={t.title}
        nav={<PageNavTabs tabs={TAB_GROUPS.crm} />}   // groupe d'onglets typé (config/nav.ts)
        kpis={[{ label: t.kpi.total, value: String(rows.length) }]}
      />
      <Card title={t.tableTitle}>
        <DataTable columns={columns} rows={rows} getKey={(r) => r.id} emptyLabel={t.empty} />
      </Card>
    </PageStack>
  );
}
```

Puis : enregistrer la page dans la **navigation** (section suivante) et, si besoin, la modale de création dans `app/(dashboard)/<nom>/_components/`.

## Le plus rapide : `npm run new:feature <resource>`

Scaffolde une feature CRUD entière, conforme à cette recette, qui **compile vert** d'emblée :

```bash
npm run new:feature contacts -- --ts=20260607120000
```
Génère : la page liste (`CockpitResourcePage` + `DataTable`), `_components/<Resource>Form.tsx` (kit form), `app/api/<resource>/route.ts` + `[id]/route.ts` (CRUD filtré tenant), et un **stub de migration**. Le script **ne touche pas** `config/nav.ts` (keystone) ; il imprime les 3 étapes restantes :
1. ajouter `UI.nav.<resource>` (`lib/ui-strings.ts`) + l'entrée dans `NAV` (`config/nav.ts`) ;
2. appliquer la migration (`mcp__supabase__apply_migration`) ;
3. régénérer les types (`mcp__supabase__generate_typescript_types`) puis retirer le cast temporaire `adminDb()` / `as unknown as SupabaseClient`.

## Navigation — `config/nav.ts` (source de vérité unique)

**Ajouter une page = ajouter UNE entrée dans `NAV`.** Le rail gauche (`RailLeft`), les onglets (`PageNavTabs` via `TAB_GROUPS`) et le **typage des routes** (`AppRoute`) en dérivent automatiquement.

```ts
// config/nav.ts → tableau NAV
{ href: "/contacts", label: UI.nav.contacts, icon: "leads", group: "crm", tabs: "crm" },
```
- `group` : `"primary"` (haut du rail) ou `"crm"` (regroupé sous l'entrée CRM).
- `tabs?` : `"crm"` | `"swarms"` — groupe d'onglets de sous-nav **partagé** (fini la duplication par page : on passe `TAB_GROUPS.crm`).
- `icon` : une valeur de l'union `IconName` (cf. `Icon.tsx`).
- Une page sous `app/(dashboard)/` **sans** entrée NAV (et hors allowlist `profile`/`admin`/`invest`) **échoue `npm run lint:nav`** (page orpheline injoignable).
- Les `href` sont **typés** : un lien/onglet vers une route inconnue casse `tsc`. Route hors-rail volontaire → l'ajouter à `AppRoute`.

## Primitives de mise en page — `primitives.tsx`

| Primitive | Rôle | Props clés |
|---|---|---|
| `PageStack` | conteneur vertical d'une page | `children` |
| `PageHeader` | en-tête (kicker, titre, action, nav, KPIs) | `kicker?`, `title`, `action?`, `nav?`, `kpis?: {label,value}[]` |
| `Card` | carte verre dépoli | `title?`, `variant?: "hero"\|"chart"\|"dense"`, `className?` |
| `KpiGrid` / `KpiCard` | grille de KPIs | `KpiCard: {label,value,accent?}` |
| `DashboardGrid` | grille dashboard multi-colonnes | `children` |
| `InsightRail` | colonne latérale d'insights | `children` |
| `HeroMetric` | grosse métrique mise en avant | `eyebrow`, `value`, `label` |
| `Title` / `Sub` / `Eyebrow` / `Badge` | typo & labels | `children` |

## Composants riches (à composer, ne pas recoder)

| Composant | Fichier | Usage |
|---|---|---|
| `DataTable<T>` | `DataTable.tsx` | tableau typé. `columns: Column<T>[]` (`align:"right"` → tabular-nums), `rows`, `getKey`, `emptyLabel` |
| `Donut` | `Donut.tsx` | anneau %. `value`, `centerLabel?`, `sublabel?`, `accent?` |
| `Funnel` | `Funnel.tsx` | entonnoir pipeline. `steps: FunnelStep[]` (`lib/crm/aggregate`) |
| `BarList` | `BarList.tsx` | barres horizontales. `items: BarItem[]` |
| `PageNavTabs` | `PageNavTabs.tsx` | onglets de sous-nav. `tabs: readonly TabItem[]` — passe un groupe de `TAB_GROUPS` (`config/nav.ts`) ; href **typés** `AppRoute` |
| `StatusSelect` | `StatusSelect.tsx` | select de statut qui POST un endpoint. `endpoint`, `value`, `options`, `labels` |
| `DeleteButton` | `DeleteButton.tsx` | suppression avec confirm. `endpoint`, `label`, `confirmMessage` |
| `LeadKanban` / `PropertyKanban` | `*Kanban.tsx` | tableaux kanban CRM |
| `Icon` | `Icon.tsx` | icônes. `name: IconName` (`estimate`, `search`, `crm`, `properties`, `leads`, `visits`, `mandates`, `agenda`, `home`, `user`, `settings`, `logout`, `plus`, `chevron-down`, `chevron-right`) |
| `AccessibleModal` | `AccessibleModal.tsx` | modale a11y (focus trap) |

Charts non listés ici (sparkline, gauge…) : vérifier d'abord le catalog global `~/.claude/assets/cockpit/catalog/_index.json` (`<hearst-asset id="…">`) avant d'en coder un.

## Kit CRUD — composer une feature (page liste + formulaire)

Pour une ressource CRUD, **compose** plutôt que recoder. Émis par le scaffolder, mais utilisables seuls :

| Composant | Fichier | Usage |
|---|---|---|
| `CockpitResourcePage` | `ResourcePage.tsx` | enveloppe page ressource : `PageStack` + `PageHeader` (`kicker`, `title`, `tabs`, `action`, `kpis`) + `Card`. Server-compatible |
| `CockpitForm` | `form.tsx` | `<form className="ct-form">` présentational (props `<form>` natives, ex. `onSubmit`) |
| `Field` | `form.tsx` | label + control. `label`, `htmlFor?`, `hint?`, `required?`, `children` |
| `TextInput` / `Textarea` / `Select` / `MoneyInput` | `form.tsx` | inputs `ct-field-input`. `Select` prend `options: {value,label}[]` ; `MoneyInput` = number € |

## Tokens `--ct-*` (56) — la palette autorisée

Toujours `var(--ct-…)`. Familles disponibles :

- **Accent** : `--ct-accent`, `--ct-accent-strong`, `--ct-accent-soft`, `--ct-accent-maroon`, `--ct-border-accent`, `--ct-text-accent`, `--ct-surface-accent`
- **Surfaces** : `--ct-surface-0..3`, `--ct-surface-hover`, `--ct-surface-success`, `--ct-bg-deep`
- **Texte** : `--ct-text-strong`, `--ct-text-primary`, `--ct-text-body`, `--ct-text-muted`, `--ct-text-faint`, `--ct-text-success`, `--ct-text-danger`
- **Bordures** : `--ct-border-soft`, `--ct-border`, `--ct-border-strong`, `--ct-border-accent`
- **État** : `--ct-success`, `--ct-warning`, `--ct-danger`
- **Espacement** : `--ct-space-3xs|2xs|xs|sm|md|lg|xl` (jamais un px inline)
- **Typo** : `--ct-fs-2xs|xs|sm|base|md`, `--ct-font-mono`
- **Radius** : `--ct-radius-xs|sm|md|lg`
- **Motion** : `--ct-ease`, `--ct-dur-base`
- **Overlay** (badge sur média) : `--ct-overlay-scrim`, `--ct-overlay-border`, `--ct-overlay-blur` → utiliser la classe `ct-badge-overlay`

Liste exhaustive : `components/cockpit/manifest.json` → `tokens` (ou `grep -rhoE '\-\-ct-[a-z0-9-]+' app/cockpit/ | sort -u`).

## Classes `ct-*` (126)

Préfère **toujours** une primitive React. Si tu écris une classe à la main, elle DOIT exister.
Liste complète : `components/cockpit/manifest.json` → `classes` (régénéré par `npm run cockpit:manifest`).
Structurelles utiles : `ct-page-stack`, `ct-page-header*`, `ct-card*`, `ct-kpi-*`, `ct-badge` (+ `ct-badge-overlay`), `ct-btn` (`ct-btn-primary`/`ct-btn-secondary`/`ct-btn-block`), `ct-field*`/`ct-form*` (formulaires), `ct-data-table*`, `ct-placeholder` (état vide).

## Interdits (échouent en CI — `npm run check`)

- ❌ Couleur hex / `rgb()` / `rgba()` / `hsl()` dans `app/(dashboard)/**` ou `components/**` (hors `components/brochure`). → `lint:cockpit`.
- ❌ `style={{ color/background/border: "…" }}` avec une valeur littérale. Seule exception tolérée : **largeur pilotée par la donnée** (ex. `width: ${pct}%` dans Funnel/BarList) — sinon ajoute `// cockpit-lint-allow` sur la ligne, avec justification.
- ❌ Réimporter `CockpitShell` dans une page.
- ❌ Texte UI en dur : passe par `lib/ui-strings` (`UI.*`).
- ❌ Page sous `app/(dashboard)/` sans entrée dans `NAV` (`config/nav.ts`) → `lint:nav` (sauf allowlist `profile`/`admin`/`invest`).
- ❌ Strings juridiques interdites sur le domaine `invest` → `lint:legal` (voir `scripts/lint-legal.mjs`).

## Gotchas spécifiques au repo

- Garde d'auth : `proxy.ts` (Next 16), **pas** `middleware.ts`.
- Client Supabase service-role = **bypass RLS** → filtrer `user_id` ET `tenant_id` à la main, toujours.
- Chat Kimi (`app/api/cockpit-chat/route.ts`) : filtre `<think>…</think>` déjà câblé, ne pas retirer. `runtime = "nodejs"` + `dynamic = "force-dynamic"`.
- Layouts : `app/layout.tsx` (racine, **sans** shell) ; `app/(dashboard)/layout.tsx` (garde + `CockpitShell`) ; `app/auth/login` hors shell.

## Avant de livrer

```bash
npm run lint:cockpit   # tokens DS (couleurs en dur)
npm run lint:nav       # pages ↔ NAV (aucune page orpheline)
npm run cockpit:manifest  # SI tu as touché au CSS (app/cockpit/*.css) → régénère le vocabulaire
npm run check          # lint:cockpit + lint:legal + eslint + lint:nav + manifest --check + typecheck
```
