"use client";

import React, { useState } from "react";
import { DataTable, type Column } from "@/components/cockpit/DataTable";
import { PropertyKanban } from "@/components/cockpit/PropertyKanban";
import { PropertiesCockpit, type CockpitProperty } from "./PropertiesCockpit";
import { eur, sqm } from "@/lib/crm/format";
import { statusTone, type StatusTone } from "@/lib/crm/statusTone";
import { UI } from "@/lib/ui-strings";
import Link from "next/link";
import { DeleteButton } from "@/components/cockpit/DeleteButton";

type Property = CockpitProperty & {
  surface: number | null;
  cover_photo_url?: string | null;
};

/** Classes Tailwind du badge de statut par tonalité métier (`statusTone`). */
const STATUS_TONE_CLASSES: Record<StatusTone, string> = {
  "is-positive": "border-emerald-400/30 bg-emerald-500/10 text-emerald-300",
  "is-negative": "border-red-400/30 bg-red-500/10 text-red-300",
  "is-pending": "border-amber-400/30 bg-amber-500/10 text-amber-300",
};

export function PropertiesViewToggle({ properties }: { properties: Property[] }) {
  // Vue COCKPIT par défaut (métier) ; kanban + liste restent accessibles.
  const [view, setView] = useState<"cockpit" | "kanban" | "list">("cockpit");
  const t = UI.properties;

  const columns: Column<Property>[] = [
    {
      key: "title",
      header: t.table.title,
      render: (p) => (
        <Link href={`/properties/${p.id}`} className="text-indigo-300 hover:text-indigo-200">
          {p.title ?? t.fallbackTitle}
        </Link>
      ),
    },
    { key: "type", header: t.table.type, render: (p) => t.typeLabels[p.property_type ?? ""] ?? p.property_type ?? "—" },
    { key: "city", header: t.table.city, render: (p) => p.city ?? "—" },
    { key: "surface", header: t.table.surface, align: "right", render: (p) => sqm(p.surface) },
    { key: "price", header: t.table.price, align: "right", render: (p) => eur(p.asking_price) },
    {
      key: "status",
      header: t.table.status,
      render: (p) => (
        <span
          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_TONE_CLASSES[statusTone("property", p.status)]}`}
        >
          {t.statusLabels[p.status] ?? p.status}
        </span>
      ),
    },
    {
      key: "action",
      header: t.table.action,
      align: "right",
      render: (p) => (
        <div className="flex items-center justify-end gap-2">
          <Link
            href={`/properties/${p.id}`}
            className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-white/[0.08]"
          >
            {t.open}
          </Link>
          <DeleteButton endpoint={`/api/properties/${p.id}`} label={t.delete} confirmMessage={t.delete} />
        </div>
      ),
    },
  ];

  const segBtn = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
      active ? "bg-indigo-500/15 text-indigo-300" : "text-slate-400 hover:text-slate-100"
    }`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-semibold text-slate-100">{t.cockpit.panelTitle}</div>
        <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
          <button className={segBtn(view === "cockpit")} onClick={() => setView("cockpit")}>
            {t.cockpit.tabCockpit}
          </button>
          <button className={segBtn(view === "kanban")} onClick={() => setView("kanban")}>
            {t.cockpit.tabKanban}
          </button>
          <button className={segBtn(view === "list")} onClick={() => setView("list")}>
            {t.cockpit.tabList}
          </button>
        </div>
      </div>

      {view === "cockpit" ? (
        <PropertiesCockpit properties={properties} />
      ) : view === "kanban" ? (
        <PropertyKanban properties={properties} />
      ) : (
        <DataTable columns={columns} rows={properties} emptyLabel={t.empty} getKey={(p) => p.id} />
      )}
    </div>
  );
}
