"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UI } from "@/lib/ui-strings";
import { LeadForm, type LeadDefaults } from "./LeadForm";

type LeadRowActionsProps = {
  id: string;
  fullName: string;
  defaultValues: LeadDefaults;
};

/** Actions d'une ligne lead : Modifier (modale) + Supprimer. */
export function LeadRowActions({ id, fullName, defaultValues }: LeadRowActionsProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm(`${UI.leads.delete} « ${fullName} » ?`)) return;
    setDeleting(true);
    await fetch(`/api/leads/${id}`, { method: "DELETE" });
    setDeleting(false);
    router.refresh();
  }

  return (
    <div className="ct-table-actions">
      <button className="ct-seg-btn" onClick={() => setEditing(true)}>
        {UI.viz.edit}
      </button>
      <button className="ct-seg-btn danger" onClick={handleDelete} disabled={deleting}>
        {deleting ? "…" : UI.viz.delete}
      </button>

      {editing && (
        <div className="crm-form-overlay">
          <div className="crm-form-modal">
            <LeadForm id={id} defaultValues={defaultValues} onClose={() => setEditing(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
