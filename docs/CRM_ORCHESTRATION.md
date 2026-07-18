# CRM Orchestration Spec — conventions FIGÉES (à respecter à la lettre)

Tu construis un module d'un CRM immobilier dans Next.js 16 App Router. La DB est déjà migrée
(tables `properties`, `leads`, `visits`, `mandates`), types TS à jour dans `lib/gpu1/database.types.ts`.
NE PAS toucher à la DB, ni aux types, ni à `lib/server/*`, ni à `cockpit.css` (sauf agent CSS dédié).

## Patterns obligatoires (copier exactement)

### Route API (app/api/<module>/route.ts et [id]/route.ts)
```ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getGpu1Admin } from "@/lib/gpu1";
import { tenantOf } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sb = getGpu1Admin();
  if (!sb) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  const { data, error } = await sb
    .from("<table>")
    .select("...")
    .eq("user_id", claims.sub)
    .eq("tenant_id", tenantOf(claims))
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: "fetch_failed", detail: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}
```
- POST: insert avec `user_id: claims.sub, tenant_id: tenantOf(claims)` TOUJOURS explicites (service-role bypass RLS).
- Route dynamique `[id]/route.ts` : GET (single), PATCH (update), DELETE. Toujours filtrer `.eq("id", id).eq("user_id", claims.sub).eq("tenant_id", ...)`.
- Validation body minimale : champs requis présents → sinon 400 `{ error: "invalid_body" }`.
- `params` est une Promise en Next 16 : `{ params }: { params: Promise<{ id: string }> }` puis `const { id } = await params;`.

### Page serveur (app/(dashboard)/<module>/page.tsx)
- Server Component `async`. Charge via `getSession()` + `getGpu1Admin()` + `tenantOf()` DIRECTEMENT (pas de fetch HTTP interne).
- Filtrer `.eq("user_id", claims.sub).eq("tenant_id", tenantOf(claims))`.
- Primitives : `import { Eyebrow, Title, Sub, Card, KpiGrid, KpiCard, Badge } from "@/components/cockpit/primitives";`
- Toutes les strings via `UI.<module>.*` (lib/ui-strings.ts). AUCUNE string FR en dur dans le JSX.
- Liste vide → `<Card><p className="ct-placeholder">{UI.<module>.empty}</p></Card>` + CTA création.

### Composant client (app/(dashboard)/<module>/_components/*.tsx)
- `"use client"` en tête. Formulaires de création/édition → POST/PATCH vers l'API puis `router.refresh()` ou `router.push()`.
- Boutons : `className="ct-seg-btn"` (ou ` primary`). Inputs : `className="ct-input"`, form `className="ct-form"`.

## Classes CSS Cockpit disponibles (NE PAS en inventer)
`ct-eyebrow ct-title ct-sub ct-card ct-card-title ct-card-body ct-kpi-grid ct-kpi-grid.cols-3 ct-kpi-grid.cols-2
ct-kpi-card ct-kpi-card.accent ct-kpi-label ct-kpi-value ct-seg-track ct-seg-btn ct-seg-btn.primary ct-seg-btn.active
ct-badge ct-placeholder ct-form ct-input ct-mb-sm est-list-row est-list-info est-list-main est-list-meta`
Si une classe manque (table, kanban, form-field), l'agent CSS (agent 9) l'ajoute dans cockpit.css avec tokens `--ct-*`. Les autres agents l'UTILISENT en supposant qu'elle existe (préfixe `ct-` ou `crm-`).

## Tokens — INTERDICTION de hex en dur. Uniquement `var(--ct-*)`.

## Statuts métier (labels FR dans ui-strings)
- properties: prospect, estimation, mandat, en_vente, sous_offre, vendu, archive
- leads: nouveau, contacte, qualifie, visite, offre, gagne, perdu | kind: acheteur, vendeur
- visits: planifiee, confirmee, realisee, annulee, no_show
- mandates: brouillon, actif, suspendu, expire, resilie, realise | kind: simple, exclusif, semi_exclusif

## Périmètre de fichiers par agent — NE PAS sortir de ta zone
Chaque agent ne crée QUE ses fichiers listés. Zéro édition de fichier partagé sauf indiqué.
Fichiers partagés (lib/ui-strings.ts, nav, dashboard, cockpit.css) = agents dédiés uniquement.
