"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const PROPERTY_STATUSES = [
  "prospect",
  "estimation",
  "mandat",
  "en_vente",
  "sous_offre",
  "vendu",
  "archive",
] as const;

type PropertyStatus = (typeof PROPERTY_STATUSES)[number];

interface PropertyStatusControlProps {
  id: string;
  currentStatus: string;
  statusLabels: Record<string, string>;
}

export function PropertyStatusControl({
  id,
  currentStatus,
  statusLabels,
}: PropertyStatusControlProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const status = e.target.value as PropertyStatus;
    if (status === currentStatus) return;
    setBusy(true);
    try {
      await fetch(`/api/properties/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <select
      className="ct-input crm-status-select"
      value={currentStatus}
      onChange={handleChange}
      disabled={busy}
      aria-label="Statut du bien"
    >
      {PROPERTY_STATUSES.map((s) => (
        <option key={s} value={s}>
          {statusLabels[s] ?? s}
        </option>
      ))}
    </select>
  );
}
