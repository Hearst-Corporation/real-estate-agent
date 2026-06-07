"use client";

import React from "react";
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
      try {
        await fetch(`/api/leads/${leadId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        });
        window.location.reload();
      } catch (err) {
        console.error("Failed to update status", err);
      }
    }
  };

  // Helper to generate a consistent color based on string
  const getAvatarColor = (name: string) => {
    const colors = ["var(--ct-avatar-1)", "var(--ct-avatar-2)", "var(--ct-avatar-3)", "var(--ct-avatar-4)", "var(--ct-avatar-5)", "var(--ct-avatar-6)", "var(--ct-avatar-7)"];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <div className="crm-kanban">
      {columns.map(col => (
        <div 
          key={col.id} 
          className="crm-col"
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, col.id)}
        >
          <div className="crm-col-head">
            <span>{col.title}</span>
            <span className="ct-badge is-muted">{col.leads.length}</span>
          </div>
          <div className="crm-col-body">
            {col.leads.length === 0 ? (
              <div className="crm-col-empty" />
            ) : (
              col.leads.map(lead => (
                <div 
                  key={lead.id} 
                  className="crm-lead-card"
                  draggable
                  onDragStart={(e) => handleDragStart(e, lead.id)}
                >
                  <div className="crm-lead-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--ct-space-xs)' }}>
                      <div
                        className="crm-avatar"
                        style={{ backgroundColor: getAvatarColor(lead.full_name) }}
                      >
                        {lead.full_name.substring(0, 2).toUpperCase()}
                      </div>
                      <span className="crm-lead-name" title={lead.full_name}>{lead.full_name}</span>
                    </div>
                  </div>
                  <div className="crm-lead-contact">
                    {lead.budget_max ? (
                      <span className="crm-lead-budget">{eur(lead.budget_max)}</span>
                    ) : lead.budget_min ? (
                      <span className="crm-lead-budget">≥ {eur(lead.budget_min)}</span>
                    ) : null}
                  </div>
                  <div className="crm-lead-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="ct-badge is-muted" style={{ margin: 0, fontSize: 9 }}>
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
  );
}
