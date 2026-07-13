"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { eur, LEAD_STATUSES } from "@/lib/crm/format";
import { UI } from "@/lib/ui-strings";
import { LeadRowActions } from "@/app/(dashboard)/leads/_components/LeadRowActions";

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

interface LeadKanbanProps {
  leads: Lead[];
  onStatusChange?: (id: string, newStatus: string) => void;
}

export function LeadKanban({ leads, onStatusChange }: LeadKanbanProps) {
  const t = UI.leads;
  const router = useRouter();
  const [dropError, setDropError] = React.useState<string | null>(null);

  // Group leads by status
  const columns = LEAD_STATUSES.map(status => ({
    id: status,
    title: t.statusLabels[status] || status,
    leads: leads.filter(l => l.status === status)
  }));

  const handleDragStart = (e: React.DragEvent, leadId: string) => {
    e.dataTransfer.setData("leadId", leadId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = async (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData("leadId");
    if (leadId && onStatusChange) {
      onStatusChange(leadId, newStatus);
    } else if (leadId) {
      // Fallback if no handler provided: call API directly
      setDropError(null);
      try {
        const res = await fetch(`/api/leads/${leadId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        // Refresh serveur sans recharger la page (conserve scroll & état).
        router.refresh();
      } catch {
        setDropError(t.statusUpdateError);
      }
    }
  };

  // Helper to generate a consistent color based on string
  const getAvatarColor = (name: string) => {
    const colors = ["#818cf8", "#22d3ee", "#34d399", "#fbbf24", "#fb7185", "#a78bfa", "#38bdf8"];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  // full_name peut arriver null malgré le type (données legacy / import).
  const initials = (name: string | null) =>
    name?.trim() ? name.trim().substring(0, 2).toUpperCase() : t.fallbackInitials;

  return (
    <div className="flex flex-col gap-4">
      {dropError && (
        <div
          className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          {dropError}
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2 @5xl:grid-cols-4">
      {columns.map(col => (
        <div
          key={col.id}
          className="flex flex-col gap-3 rounded-2xl border border-zinc-950/10 bg-zinc-950/[0.02] p-3"
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, col.id)}
        >
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
              {col.title}
            </span>
            <span className="rounded-full bg-zinc-950/5 px-2 py-0.5 text-xs font-medium text-zinc-500">
              {col.leads.length}
            </span>
          </div>
          <div className="flex min-h-16 flex-col gap-2">
            {col.leads.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-950/10" />
            ) : (
              col.leads.map(lead => (
                <div
                  key={lead.id}
                  className="cursor-grab rounded-xl border border-zinc-950/10 bg-white p-3 shadow-sm shadow-zinc-950/5 active:cursor-grabbing"
                  draggable
                  onDragStart={(e) => handleDragStart(e, lead.id)}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-slate-950"
                      style={{ backgroundColor: getAvatarColor(lead.full_name ?? "") }}
                    >
                      {initials(lead.full_name)}
                    </div>
                    <span
                      className="truncate text-sm font-medium text-zinc-900"
                      title={lead.full_name ?? ""}
                    >
                      {lead.full_name ?? t.fallbackInitials}
                    </span>
                  </div>
                  <div className="mt-2">
                    {lead.budget_max ? (
                      <span className="text-sm font-semibold tabular-nums text-zinc-900">
                        {eur(lead.budget_max)}
                      </span>
                    ) : lead.budget_min ? (
                      <span className="text-sm font-semibold tabular-nums text-zinc-900">
                        ≥ {eur(lead.budget_min)}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="rounded-full bg-zinc-950/5 px-2 py-0.5 text-[0.65rem] font-medium text-zinc-500">
                      {lead.kind ? (t.kindLabels[lead.kind] || lead.kind) : "Lead"}
                    </span>
                    <LeadRowActions
                      id={lead.id}
                      fullName={lead.full_name}
                      defaultValues={{
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
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ))}
      </div>
    </div>
  );
}
