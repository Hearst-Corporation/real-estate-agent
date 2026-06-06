"use client";

import React, { useState } from "react";
import { DataTable, type Column } from "@/components/cockpit/DataTable";
import { PropertyKanban } from "@/components/cockpit/PropertyKanban";
import { eur, sqm } from "@/lib/crm/format";
import { statusTone } from "@/lib/crm/statusTone";
import { UI } from "@/lib/ui-strings";
import Link from "next/link";
import { DeleteButton } from "@/components/cockpit/DeleteButton";

type Property = {
  id: string;
  status: string;
  title: string | null;
  property_type: string | null;
  city: string | null;
  surface: number | null;
  asking_price: number | null;
  cover_photo_url?: string | null;
};

export function PropertiesViewToggle({ properties }: { properties: Property[] }) {
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const t = UI.properties;

  const columns: Column<Property>[] = [
    {
      key: "title",
      header: t.table.title,
      render: (p) => (
        <Link href={`/properties/${p.id}`} className="crm-link">
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
        <span className={`crm-status ${statusTone("property", p.status)}`}>
          {t.statusLabels[p.status] ?? p.status}
        </span>
      ),
    },
    {
      key: "action",
      header: t.table.action,
      align: "right",
      render: (p) => (
        <div className="ct-table-actions">
          <Link href={`/properties/${p.id}`} className="ct-seg-btn">
            {t.open}
          </Link>
          <DeleteButton endpoint={`/api/properties/${p.id}`} label={t.delete} confirmMessage={t.delete} />
        </div>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, minHeight: 0 }}>
      <div className="crm-toolbar" style={{ flexShrink: 0 }}>
        <h3 className="ct-card-title" style={{ margin: 0 }}>VOS BIENS</h3>
        <div className="ct-seg-track">
          <button 
            className={`ct-seg-btn ${view === "kanban" ? "active" : ""}`}
            onClick={() => setView("kanban")}
          >
            Kanban
          </button>
          <button 
            className={`ct-seg-btn ${view === "list" ? "active" : ""}`}
            onClick={() => setView("list")}
          >
            Liste
          </button>
        </div>
      </div>

      {view === "kanban" ? (
        <PropertyKanban properties={properties} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--ct-surface-1)', border: '1px solid var(--ct-border)', borderRadius: '12px', padding: '16px', overflow: 'hidden' }}>
          <DataTable columns={columns} rows={properties} emptyLabel={t.empty} getKey={(p) => p.id} />
        </div>
      )}
    </div>
  );
}
