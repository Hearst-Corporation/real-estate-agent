"use client";

import React, { useState } from "react";
import { DataTable, type Column } from "@/components/cockpit/DataTable";
import { LeadKanban } from "@/components/cockpit/LeadKanban";
import { StatusSelect } from "@/components/cockpit/StatusSelect";
import { Badge } from "@/components/cockpit/primitives";
import { LeadRowActions } from "@/app/(dashboard)/leads/_components/LeadRowActions";
import { LeadsCockpit } from "@/app/(dashboard)/leads/_components/LeadsCockpit";
import { eur, LEAD_STATUSES } from "@/lib/crm/format";
import { UI } from "@/lib/ui-strings";

function budgetRange(min: number | null, max: number | null): string {
  if (min != null && max != null) return `${eur(min)} – ${eur(max)}`;
  if (min != null) return `≥ ${eur(min)}`;
  if (max != null) return `≤ ${eur(max)}`;
  return "—";
}

type Lead = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  status: string;
  kind: string | null;
  type_personne: string | null;
  source: string | null;
  budget_min: number | null;
  budget_max: number | null;
  property_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export function LeadsViewToggle({ leads }: { leads: Lead[] }) {
  // Vue COCKPIT par défaut (métier) ; kanban + liste restent accessibles.
  const [view, setView] = useState<"cockpit" | "kanban" | "list">("cockpit");
  const t = UI.leads;

  const columns: Column<Lead>[] = [
    { key: "name", header: t.table.name, render: (l) => l.full_name },
    {
      key: "kind",
      header: t.table.kind,
      render: (l) => (l.kind ? <Badge>{t.kindLabels[l.kind] ?? l.kind}</Badge> : "—"),
    },
    {
      key: "status",
      header: t.table.status,
      render: (l) => (
        <StatusSelect
          endpoint={`/api/leads/${l.id}`}
          value={l.status}
          options={LEAD_STATUSES}
          labels={t.statusLabels}
          ariaLabel={t.table.status}
        />
      ),
    },
    {
      key: "budget",
      header: t.table.budget,
      align: "right",
      render: (l) => budgetRange(l.budget_min, l.budget_max),
    },
    { key: "source", header: t.table.source, render: (l) => l.source ?? "—" },
    {
      key: "action",
      header: t.table.action,
      align: "right",
      render: (l) => (
        <LeadRowActions
          id={l.id}
          fullName={l.full_name}
          defaultValues={{
            full_name: l.full_name,
            email: l.email,
            phone: l.phone,
            source: l.source,
            kind: l.kind,
            type_personne: l.type_personne,
            budget_min: l.budget_min,
            budget_max: l.budget_max,
            status: l.status,
          }}
        />
      ),
    },
  ];

  return (
    <div className="crm-view-panel">
      <div className="crm-toolbar crm-toolbar-shrink">
        <div className="ct-card-title">{t.cockpit.panelTitle}</div>
        <div className="ct-seg-track">
          <button
            className={`ct-seg-btn ${view === "cockpit" ? "active" : ""}`}
            onClick={() => setView("cockpit")}
          >
            {t.cockpit.tabCockpit}
          </button>
          <button
            className={`ct-seg-btn ${view === "kanban" ? "active" : ""}`}
            onClick={() => setView("kanban")}
          >
            {t.cockpit.tabKanban}
          </button>
          <button
            className={`ct-seg-btn ${view === "list" ? "active" : ""}`}
            onClick={() => setView("list")}
          >
            {t.cockpit.tabList}
          </button>
        </div>
      </div>

      {view === "cockpit" ? (
        <LeadsCockpit leads={leads} />
      ) : view === "kanban" ? (
        <LeadKanban leads={leads} />
      ) : (
        <div className="crm-view-panel">
          <DataTable columns={columns} rows={leads} emptyLabel={t.empty} getKey={(l) => l.id} />
        </div>
      )}
    </div>
  );
}
