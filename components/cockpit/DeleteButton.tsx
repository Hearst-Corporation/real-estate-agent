"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UI } from "@/lib/ui-strings";

type DeleteButtonProps = {
  /** Endpoint REST à DELETE. Ex: `/api/visits/${id}`. */
  endpoint: string;
  label: string;
  /** Message de confirmation (optionnel — pas de confirm si absent). */
  confirmMessage?: string;
};

/** Bouton de suppression destructif (DELETE + refresh). Style .ct-seg-btn.danger. */
export function DeleteButton({ endpoint, label, confirmMessage }: DeleteButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (confirmMessage && !confirm(confirmMessage)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(endpoint, { method: "DELETE" });
      if (!res.ok) {
        setError(UI.common.httpError(res.status));
        return;
      }
      router.refresh();
    } catch {
      setError(UI.common.networkError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="ct-seg-btn danger" onClick={handleDelete} disabled={busy}>
        {busy ? UI.common.busy : label}
      </button>
      {error ? <span className="ct-error">{error}</span> : null}
    </>
  );
}
