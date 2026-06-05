"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import LeadForm from "./LeadForm";

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

const STATUS_ORDER = [
  "nouveau",
  "contacte",
  "qualifie",
  "visite",
  "offre",
  "gagne",
  "perdu",
] as const;

type LeadsBoardProps = {
  leads: Lead[];
  statusLabels: Record<string, string>;
  kindLabels: Record<string, string>;
};

const fmt = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function LeadCard({
  lead,
  kindLabels,
}: {
  lead: Lead;
  kindLabels: Record<string, string>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm(`Supprimer « ${lead.full_name} » ?`)) return;
    setDeleting(true);
    await fetch(`/api/leads/${lead.id}`, { method: "DELETE" });
    setDeleting(false);
    router.refresh();
  }

  if (editing) {
    return (
      <div className="crm-lead-card">
        <LeadForm
          mode="edit"
          id={lead.id}
          initial={{
            full_name: lead.full_name,
            email: lead.email,
            phone: lead.phone,
            source: lead.source,
            kind: lead.kind,
            type_personne: lead.type_personne,
            budget_min: lead.budget_min,
            budget_max: lead.budget_max,
            status: lead.status,
          }}
          onClose={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="crm-lead-card">
      <div className="crm-lead-header">
        <span className="crm-lead-name">{lead.full_name}</span>
        {lead.kind && (
          <span className={`ct-badge crm-kind-${lead.kind}`}>
            {kindLabels[lead.kind] ?? lead.kind}
          </span>
        )}
      </div>

      {(lead.email || lead.phone) && (
        <div className="crm-lead-contact">
          {lead.email && <span className="ct-placeholder">{lead.email}</span>}
          {lead.phone && <span className="ct-placeholder">{lead.phone}</span>}
        </div>
      )}

      {(lead.budget_min != null || lead.budget_max != null) && (
        <div className="crm-lead-budget ct-placeholder">
          {lead.budget_min != null && lead.budget_max != null
            ? `${fmt.format(lead.budget_min)} — ${fmt.format(lead.budget_max)}`
            : lead.budget_min != null
            ? `≥ ${fmt.format(lead.budget_min)}`
            : `≤ ${fmt.format(lead.budget_max!)}`}
        </div>
      )}

      {lead.source && (
        <div className="ct-placeholder" style={{ fontSize: "0.75rem" }}>
          {lead.source}
        </div>
      )}

      <div className="crm-lead-actions">
        <button className="ct-seg-btn" onClick={() => setEditing(true)}>
          Modifier
        </button>
        <button
          className="ct-seg-btn"
          onClick={handleDelete}
          disabled={deleting}
          style={{ color: "var(--ct-danger, red)" }}
        >
          {deleting ? "…" : "Supprimer"}
        </button>
      </div>
    </div>
  );
}

export default function LeadsBoard({
  leads,
  statusLabels,
  kindLabels,
}: LeadsBoardProps) {
  const grouped = STATUS_ORDER.reduce<Record<string, Lead[]>>((acc, s) => {
    acc[s] = leads.filter((l) => l.status === s);
    return acc;
  }, {} as Record<string, Lead[]>);

  return (
    <div className="crm-kanban">
      {STATUS_ORDER.map((status) => (
        <div key={status} className="crm-col">
          <div className="crm-col-header">
            <span className="ct-eyebrow">{statusLabels[status] ?? status}</span>
            <span className="ct-badge">{grouped[status].length}</span>
          </div>
          <div className="crm-col-body">
            {grouped[status].length === 0 ? (
              <div className="crm-col-empty" />
            ) : (
              grouped[status].map((lead) => (
                <LeadCard key={lead.id} lead={lead} kindLabels={kindLabels} />
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
