"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PROPERTY_STATUSES, type PropertyStatus } from "@/lib/crm/format";
import { UI } from "@/lib/ui-strings";

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
  const [error, setError] = useState<string | null>(null);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const status = e.target.value as PropertyStatus;
    if (status === currentStatus) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/properties/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
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
      <select
        className="ct-input crm-status-select"
        value={currentStatus}
        onChange={handleChange}
        disabled={busy}
        aria-label={UI.properties.statusAria}
      >
        {PROPERTY_STATUSES.map((s) => (
          <option key={s} value={s}>
            {statusLabels[s] ?? s}
          </option>
        ))}
      </select>
      {error ? <span className="ct-error">{error}</span> : null}
    </>
  );
}
