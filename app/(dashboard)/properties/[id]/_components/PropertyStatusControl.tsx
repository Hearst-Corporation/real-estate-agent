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
        className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-100 focus:border-indigo-400/50 focus:outline-none disabled:opacity-50"
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
      {error ? <span className="ml-2 text-xs text-red-400">{error}</span> : null}
    </>
  );
}
