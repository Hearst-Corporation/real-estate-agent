"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UI } from "@/lib/ui-strings";

type Props = {
  leadId: string;
  hasData?: boolean;
};

/** Bouton d'enrichissement B2B inline (fiche détail lead). */
export function LeadEnrichButton({ leadId, hasData = false }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const te = UI.leads.detail.enrich;

  async function handleEnrich() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${leadId}/enrich`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: true }),
      });

      if (!res.ok) {
        if (res.status === 422) {
          setError(te.errorNoEmail);
        } else if (res.status === 503) {
          setError(te.errorNotConfigured);
        } else {
          setError(te.errorGeneric);
        }
        return;
      }

      router.refresh();
    } catch {
      setError(te.errorGeneric);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button className="ct-seg-btn" onClick={handleEnrich} disabled={busy}>
        {busy ? te.busy : hasData ? te.reenrich : te.button}
      </button>
      {error && <p className="ct-placeholder">{error}</p>}
    </div>
  );
}
