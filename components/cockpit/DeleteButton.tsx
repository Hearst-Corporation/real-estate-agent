"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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

  async function handleDelete() {
    if (confirmMessage && !confirm(confirmMessage)) return;
    setBusy(true);
    try {
      await fetch(endpoint, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="ct-seg-btn danger" onClick={handleDelete} disabled={busy}>
      {busy ? "…" : label}
    </button>
  );
}
