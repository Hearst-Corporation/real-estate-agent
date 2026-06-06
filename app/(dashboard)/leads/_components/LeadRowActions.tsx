"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UI } from "@/lib/ui-strings";
import { isEnrichable } from "@/lib/crm/enrichable";
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
  const [enriching, setEnriching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const canEnrich = isEnrichable(defaultValues.type_personne);

  async function handleDelete() {
    if (!confirm(`${UI.leads.delete} « ${fullName} » ?`)) return;
    setDeleting(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/leads/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setMessage(UI.common.httpError(res.status));
        return;
      }
      router.refresh();
    } catch {
      setMessage(UI.common.networkError);
    } finally {
      setDeleting(false);
    }
  }

  async function handleEnrich() {
    if (!canEnrich) return;
    if (!confirm(UI.leads.enrichConsent)) return;

    setEnriching(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/leads/${id}/enrich`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: true }),
      });
      const json = (await res.json().catch(() => ({}))) as { enriched?: boolean; error?: string };

      if (!res.ok) {
        setMessage(UI.leads.enrichErrors[json.error ?? ""] ?? UI.common.httpError(res.status));
        return;
      }

      setMessage(json.enriched ? UI.leads.enrichDone : UI.leads.enrichNoData);
      router.refresh();
    } catch {
      setMessage(UI.common.networkError);
    } finally {
      setEnriching(false);
    }
  }

  return (
    <div className="ct-table-actions">
      {canEnrich ? (
        <button className="ct-seg-btn" onClick={handleEnrich} disabled={enriching}>
          {enriching ? UI.leads.enriching : UI.leads.enrich}
        </button>
      ) : null}
      <button className="ct-seg-btn" onClick={() => setEditing(true)}>
        {UI.viz.edit}
      </button>
      <button className="ct-seg-btn danger" onClick={handleDelete} disabled={deleting}>
        {deleting ? UI.common.busy : UI.viz.delete}
      </button>
      {message ? <span className="ct-placeholder">{message}</span> : null}

      {editing && (
        <div
          className="crm-form-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Modifier le lead"
          onKeyDown={(e) => { if (e.key === "Escape") setEditing(false); }}
        >
          <div className="crm-form-modal">
            <LeadForm id={id} defaultValues={defaultValues} onClose={() => setEditing(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
