"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AccessibleModal } from "@/components/cockpit/AccessibleModal";
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
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {canEnrich ? (
        <button
          type="button"
          className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-slate-200 transition-colors hover:bg-white/[0.08] disabled:opacity-50"
          onClick={handleEnrich}
          disabled={enriching}
        >
          {enriching ? UI.leads.enriching : UI.leads.enrich}
        </button>
      ) : null}
      <button
        type="button"
        className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-slate-200 transition-colors hover:bg-white/[0.08]"
        onClick={() => setEditing(true)}
      >
        {UI.viz.edit}
      </button>
      <button
        type="button"
        className="rounded-lg border border-red-400/20 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
        onClick={handleDelete}
        disabled={deleting}
      >
        {deleting ? UI.common.busy : UI.viz.delete}
      </button>
      {message ? <span className="text-xs text-slate-500">{message}</span> : null}

      {editing && (
        <AccessibleModal title="Modifier le lead" onClose={() => setEditing(false)}>
          <LeadForm id={id} defaultValues={defaultValues} onClose={() => setEditing(false)} />
        </AccessibleModal>
      )}
    </div>
  );
}
