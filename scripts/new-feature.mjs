#!/usr/bin/env node
// @enable-adrien:layer=front-cockpit v=2
/**
 * SCAFFOLDER DE FEATURE — génère une ressource CRUD conforme à la RECETTE.
 * =================================================================
 *
 * Script Node STANDALONE, ZÉRO dépendance. Produit, pour une ressource donnée,
 * les fichiers d'une feature CRUD conforme à components/cockpit/AGENTS.md :
 *
 *   app/(dashboard)/<resource>/page.tsx                  (server component, liste)
 *   app/(dashboard)/<resource>/_components/<R>Form.tsx   (client, kit form)
 *   app/api/<resource>/route.ts                          (GET liste + POST create)
 *   app/api/<resource>/[id]/route.ts                     (PATCH + DELETE)
 *   supabase/migrations/<ts>_<resource>.sql              (table + RLS + index — STUB)
 *
 * Garde-fous :
 *   - refuse si l'arg <resource> manque ;
 *   - refuse (et N'ÉCRASE RIEN) si une cible existe déjà ;
 *   - le code généré passe lint:strings (zéro texte en dur : les templates
 *     référencent UI.<resource>, et le namespace correspondant est injecté dans
 *     lib/ui-strings.ts — merge additif) ;
 *   - NE MODIFIE PAS config/nav.ts (keystone fragile) → imprime l'entrée NAV à coller.
 *
 * Timestamp de migration :
 *   - --ts=YYYYMMDDHHMMSS pour le fixer ;
 *   - absent → placeholder "0000_" + avertissement (on n'invente pas Date.now()).
 *
 * Usage :
 *   node scripts/new-feature.mjs <resource> [--ts=YYYYMMDDHHMMSS]
 *   ex : node scripts/new-feature.mjs contacts --ts=20260607120000
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ─── parsing des arguments ────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const positional = argv.filter((a) => !a.startsWith("--"));
const flags = Object.fromEntries(
  argv
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const [k, ...rest] = a.replace(/^--/, "").split("=");
      return [k, rest.join("=") || true];
    }),
);

function fail(msg) {
  console.error(`\n  ✗ ${msg}\n`);
  process.exit(1);
}

const resource = positional[0];
if (!resource) {
  fail(
    "argument <resource> manquant.\n      Usage : node scripts/new-feature.mjs <resource> [--ts=YYYYMMDDHHMMSS]",
  );
}
if (!/^[a-z][a-z0-9_]*$/.test(resource)) {
  fail(`ressource invalide « ${resource} » — attendu : minuscules / chiffres / underscore (ex. "contacts").`);
}
// Mots-clés SQL réservés : injectés en identifiants nus, ils rendent la migration
// ingénérable (`create table order(...)`). On refuse tôt avec un message clair.
const SQL_RESERVED = new Set([
  "order", "user", "group", "select", "table", "from", "where", "default", "column",
  "index", "view", "role", "grant", "primary", "references", "constraint", "unique",
  "foreign", "key", "check", "into", "values", "set", "case", "when", "then", "else",
  "end", "null", "true", "false", "all", "and", "or", "not", "limit", "offset", "as",
  "on", "in", "create", "drop", "alter", "insert", "update", "delete",
]);
if (SQL_RESERVED.has(resource)) {
  fail(`« ${resource} » est un mot-clé SQL réservé — choisis un autre nom (ex. "${resource}s", "${resource}_items").`);
}

// ─── helpers de nommage ───────────────────────────────────────────────────────

/** "contacts" → "Contacts" ; "deal_rooms" → "DealRooms". */
function pascal(s) {
  return s
    .split(/[_-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
}
/** Singulier naïf pour libellés ("contacts" → "contact"). Jamais vide. */
function singular(s) {
  if (s.endsWith("ies") && s.length > 3) return s.slice(0, -3) + "y";
  if (s.endsWith("s") && s.length > 1) return s.slice(0, -1);
  return s;
}

const Resource = pascal(resource); // ex. "Contacts"
const Sing = singular(resource); // ex. "contact"

// ─── timestamp de migration ───────────────────────────────────────────────────

let tsPlaceholder = false;
let ts = typeof flags.ts === "string" ? flags.ts : "";
if (ts) {
  if (!/^\d{14}$/.test(ts)) {
    fail(`--ts invalide « ${ts} » — attendu 14 chiffres YYYYMMDDHHMMSS.`);
  }
} else {
  ts = "0000";
  tsPlaceholder = true;
}

// ─── cibles ───────────────────────────────────────────────────────────────────

const targets = {
  page: join(ROOT, "app", "(dashboard)", resource, "page.tsx"),
  form: join(ROOT, "app", "(dashboard)", resource, "_components", `${Resource}Form.tsx`),
  apiList: join(ROOT, "app", "api", resource, "route.ts"),
  apiItem: join(ROOT, "app", "api", resource, "[id]", "route.ts"),
  migration: join(ROOT, "supabase", "migrations", `${ts}_${resource}.sql`),
};

// Refus d'écrasement : si une seule cible existe déjà, on s'arrête sans rien écrire.
const collisions = Object.values(targets).filter((p) => existsSync(p));
if (collisions.length > 0) {
  fail(
    `cible(s) déjà existante(s) — aucun fichier écrit (pas d'écrasement) :\n` +
      collisions.map((p) => `        ${relative(ROOT, p)}`).join("\n"),
  );
}

// ─── templates ────────────────────────────────────────────────────────────────

const pageTpl = `import { CockpitResourcePage } from "@/components/cockpit/ResourcePage";
import { DataTable, type Column } from "@/components/cockpit/DataTable";
import type { Gpu1Client } from "@/lib/gpu1";
import { getSession } from "@/lib/server/session";
import { getGpu1Admin } from "@/lib/gpu1";
import { tenantOf } from "@/lib/tenant";
import { UI } from "@/lib/ui-strings";
import ${Resource}Form from "./_components/${Resource}Form";

type ${Resource}Row = {
  id: string;
  label: string;
  created_at: string;
};

export default async function ${Resource}Page() {
  const t = UI.${resource};
  const claims = await getSession();
  // La table « ${resource} » n'est dans les types gpu1 qu'APRÈS migration + génération
  // des types. En attendant, on requête via un client non typé.
  // TODO: retirer le cast une fois lib/gpu1/database.types.ts régénéré.
  const sb = getGpu1Admin() as unknown as Gpu1Client | null;

  let rows: ${Resource}Row[] = [];
  if (claims && sb) {
    const { data } = await sb
      .from("${resource}")
      .select("id, label, created_at")
      .eq("user_id", claims.sub)
      .eq("tenant_id", tenantOf(claims))
      .order("created_at", { ascending: false });
    rows = (data ?? []) as ${Resource}Row[];
  }

  const columns: Column<${Resource}Row>[] = [
    { key: "label", header: t.cols.label, render: (r) => r.label },
    {
      key: "date",
      header: t.cols.date,
      align: "right",
      render: (r) => r.created_at.slice(0, 10),
    },
  ];

  return (
    <CockpitResourcePage
      kicker={t.eyebrow}
      title={t.title}
      action={<${Resource}Form cta={t.newCta} />}
      kpis={[{ label: t.kpis.total, value: String(rows.length) }]}
    >
      <DataTable columns={columns} rows={rows} getKey={(r) => r.id} emptyLabel={t.empty} />
    </CockpitResourcePage>
  );
}
`;

const formTpl = `"use client";

import { useState } from "react";
import { CockpitForm, Field, TextInput, Select, MoneyInput, Textarea } from "@/components/cockpit/form";
import { AccessibleModal } from "@/components/cockpit/AccessibleModal";
import { UI } from "@/lib/ui-strings";

const STATUS_OPTIONS = [
  { value: "nouveau", label: UI.${resource}.statuses.nouveau },
  { value: "actif", label: UI.${resource}.statuses.actif },
  { value: "archive", label: UI.${resource}.statuses.archive },
];

export default function ${Resource}Form({ cta }: { cta: string }) {
  const t = UI.${resource}.form;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/${resource}", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: String(form.get("label") ?? ""),
        status: String(form.get("status") ?? "nouveau"),
        amount: form.get("amount") ? Number(form.get("amount")) : null,
        notes: String(form.get("notes") ?? "") || null,
      }),
    });
    setBusy(false);
    if (res.ok) {
      setOpen(false);
      window.location.reload();
    }
  }

  return (
    <>
      <button type="button" className="ct-btn ct-btn-primary" onClick={() => setOpen(true)}>
        {cta}
      </button>
      {open ? (
        <AccessibleModal title={t.title} onClose={() => setOpen(false)}>
          <CockpitForm onSubmit={onSubmit}>
            <Field label={t.label} htmlFor="${resource}-label" required>
              <TextInput id="${resource}-label" name="label" required />
            </Field>
            <Field label={t.status} htmlFor="${resource}-status">
              <Select id="${resource}-status" name="status" options={STATUS_OPTIONS} />
            </Field>
            <Field label={t.amount} htmlFor="${resource}-amount">
              <MoneyInput id="${resource}-amount" name="amount" />
            </Field>
            <Field label={t.notes} htmlFor="${resource}-notes">
              <Textarea id="${resource}-notes" name="notes" rows={3} />
            </Field>
            <button type="submit" className="ct-btn ct-btn-primary ct-btn-block" disabled={busy}>
              {t.submit}
            </button>
          </CockpitForm>
        </AccessibleModal>
      ) : null}
    </>
  );
}
`;

const apiListTpl = `import { NextResponse } from "next/server";
import type { Gpu1Client } from "@/lib/gpu1";
import { getSession } from "@/lib/server/session";
import { getGpu1Admin } from "@/lib/gpu1";
import { tenantOf } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 200;

// La table « ${resource} » n'est dans les types gpu1 qu'après migration + génération.
// TODO: supprimer adminDb() et utiliser getGpu1Admin() directement une fois les types régénérés.
function adminDb() {
  return getGpu1Admin() as unknown as Gpu1Client | null;
}

// ─── GET /api/${resource} — liste de l'utilisateur ───────────────────────────

export async function GET() {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sb = adminDb();
  if (!sb) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });

  const { data, error } = await sb
    .from("${resource}")
    .select("id, label, status, amount, notes, created_at, updated_at")
    .eq("user_id", claims.sub)
    .eq("tenant_id", tenantOf(claims))
    .order("updated_at", { ascending: false })
    .limit(DEFAULT_LIMIT);

  if (error) {
    return NextResponse.json({ error: "fetch_failed", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}

// ─── POST /api/${resource} — créer ───────────────────────────────────────────

export async function POST(req: Request) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sb = adminDb();
  if (!sb) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { label, status, amount, notes } = body as {
    label?: string;
    status?: string;
    amount?: number;
    notes?: string;
  };

  if (!label || typeof label !== "string" || label.trim() === "") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { data, error } = await sb
    .from("${resource}")
    .insert({
      user_id: claims.sub,
      tenant_id: tenantOf(claims),
      label: label.trim(),
      status: status ?? "nouveau",
      amount: amount ?? null,
      notes: notes ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "create_failed", detail: error?.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id }, { status: 201 });
}
`;

const apiItemTpl = `import { NextResponse } from "next/server";
import type { Gpu1Client } from "@/lib/gpu1";
import { getSession } from "@/lib/server/session";
import { getGpu1Admin } from "@/lib/gpu1";
import { tenantOf } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// La table « ${resource} » n'est dans les types gpu1 qu'après migration + génération.
// TODO: supprimer adminDb() et utiliser getGpu1Admin() directement une fois les types régénérés.
function adminDb() {
  return getGpu1Admin() as unknown as Gpu1Client | null;
}

// ─── PATCH /api/${resource}/[id] ──────────────────────────────────────────────

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sb = adminDb();
  if (!sb) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const allowed = ["label", "status", "amount", "notes"] as const;
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) {
      if (key === "label") {
        const val = body[key];
        if (typeof val !== "string" || val.trim() === "") {
          return NextResponse.json({ error: "invalid_body" }, { status: 400 });
        }
        patch[key] = val.trim();
      } else {
        patch[key] = body[key];
      }
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { data, error } = await sb
    .from("${resource}")
    .update(patch)
    .eq("id", id)
    .eq("user_id", claims.sub)
    .eq("tenant_id", tenantOf(claims))
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "update_failed", detail: error?.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id });
}

// ─── DELETE /api/${resource}/[id] ─────────────────────────────────────────────

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sb = adminDb();
  if (!sb) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });

  const { id } = await params;

  const { error } = await sb
    .from("${resource}")
    .delete()
    .eq("id", id)
    .eq("user_id", claims.sub)
    .eq("tenant_id", tenantOf(claims));

  if (error) {
    return NextResponse.json({ error: "delete_failed", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
`;

const migrationTpl = `-- ─── ${resource} : table CRUD owner+tenant (STUB scaffolder) ──────────────────
-- Pattern repo : owner (user_id) + tenant (tenant_id) ; RLS owner+tenant ; index FK.
-- set_updated_at() existe déjà (0007). current_tenant_id() existe déjà (0003/0005).
-- TODO: compléter les colonnes métier puis régénérer les types gpu1.

create table if not exists ${resource} (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  tenant_id   text not null default 'real-estate-agent',

  label       text not null,
  status      text not null default 'nouveau',
  amount      numeric,
  notes       text,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger trg_${resource}_updated_at
  before update on ${resource}
  for each row execute function public.set_updated_at();

-- ─── indexes (FK + filtres) ──────────────────────────────────────────────────

create index if not exists idx_${resource}_user   on ${resource}(user_id);
create index if not exists idx_${resource}_tenant on ${resource}(tenant_id);

-- ─── RLS owner + tenant ──────────────────────────────────────────────────────

alter table ${resource} enable row level security;

create policy "tenant ${resource}" on ${resource} for all
  using ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()))
  with check ((select auth.uid()) = user_id and tenant_id = (select public.current_tenant_id()));
`;

// ─── écriture ─────────────────────────────────────────────────────────────────

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
  console.log(`  + ${relative(ROOT, path)}`);
}

console.log(`\n  Scaffolding « ${resource} » (${Resource})\n`);
write(targets.page, pageTpl);
write(targets.form, formTpl);
write(targets.apiList, apiListTpl);
write(targets.apiItem, apiItemTpl);
write(targets.migration, migrationTpl);

// ─── injection du namespace UI.<resource> (corrige A6 : zéro string en dur) ───
// Le scaffolder N'ÉMET PLUS de STRINGS={...} en dur dans le code généré : les
// templates référencent UI.<resource> / UI.<resource>.form. On ajoute donc le
// namespace dans lib/ui-strings.ts (merge additif, jamais d'écrasement de valeur).
const uiPath = join(ROOT, "lib", "ui-strings.ts");
const uiBlock = `  ${resource}: {
    eyebrow: "CRM",
    title: "${Resource}",
    newCta: "Nouveau ${Sing}",
    empty: "Aucun ${Sing} pour le moment.",
    cols: { label: "Nom", date: "Créé le" },
    kpis: { total: "Total" },
    statuses: { nouveau: "Nouveau", actif: "Actif", archive: "Archivé" },
    form: { title: "Nouveau ${Sing}", label: "Nom", status: "Statut", amount: "Montant", notes: "Notes", submit: "Créer" },
  },
`;
try {
  let ui = readFileSync(uiPath, "utf8");
  if (new RegExp(`\\n  ${resource}: \\{`).test(ui)) {
    console.log(`  = UI.${resource} déjà présent dans lib/ui-strings.ts (inchangé)`);
  } else {
    const close = ui.lastIndexOf("} as const;");
    if (close === -1) {
      console.log(`  ⚠ « } as const; » introuvable dans lib/ui-strings.ts — colle ce bloc à la main dans UI :`);
      console.log(uiBlock);
    } else {
      ui = ui.slice(0, close) + uiBlock + ui.slice(close);
      writeFileSync(uiPath, ui, "utf8");
      console.log(`  + UI.${resource} ajouté dans lib/ui-strings.ts`);
    }
  }
} catch {
  console.log(`  ⚠ lib/ui-strings.ts illisible — colle le bloc UI.${resource} à la main.`);
}

// ─── rappels manuels (NAV non touchée) ────────────────────────────────────────

// Suggestion d'icône — pioche une icône plausible dans l'union IconName
// (estimate, search, network, crm, properties, leads, visits, mandates, agenda,
//  home, user, settings, logout, plus, chevron-down, chevron-right).
const ICON_HINT = "home"; // neutre : à remplacer par l'IconName adaptée

console.log(`\n  ⚠ config/nav.ts N'A PAS été modifié (keystone fragile). À coller à la main :\n`);
console.log(`     1) UI.nav.${resource} dans lib/ui-strings.ts (libellé du rail).`);
console.log(`     2) Entrée NAV dans config/nav.ts (tableau NAV) — choisis l'icon dans l'union IconName :\n`);
console.log(
  `        { href: "/${resource}", label: UI.nav.${resource}, icon: "${ICON_HINT}", group: "crm", tabs: "crm" },\n`,
);
console.log(`        (group: "primary" | "crm" ; tabs optionnel : "crm" | "swarms")`);

if (tsPlaceholder) {
  console.log(
    `\n  ⚠ Migration nommée avec le placeholder « 0000_ » (aucun --ts fourni).`,
  );
  console.log(
    `     Renomme supabase/migrations/0000_${resource}.sql avec le bon numéro de séquence`,
  );
  console.log(`     avant de l'appliquer (ne JAMAIS inventer Date.now()).`);
}

console.log(`\n  3) Régénère les types gpu1 après application de la migration :`);
console.log(
  `        régénère lib/gpu1/database.types.ts depuis le schéma appliqué (voir docs/DEPLOYMENT.md).\n`,
);
