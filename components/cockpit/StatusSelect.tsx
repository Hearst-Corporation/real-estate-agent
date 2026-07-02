"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UI } from "@/lib/ui-strings";

type StatusSelectProps = {
  /** Endpoint REST à PATCHer avec { status }. Ex: `/api/mandates/${id}`. */
  endpoint: string;
  value: string;
  options: readonly string[];
  labels: Record<string, string>;
  ariaLabel: string;
};

/** Sélecteur de statut inline (PATCH { status } + refresh). */
export function StatusSelect({ endpoint, value, options, labels, ariaLabel }: StatusSelectProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const status = e.target.value;
    if (status === value) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
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
        className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-slate-100 focus:border-indigo-400/50 focus:outline-none disabled:opacity-50"
        value={value}
        onChange={handleChange}
        disabled={busy}
        aria-label={ariaLabel}
      >
        {options.map((s) => (
          <option key={s} value={s}>
            {labels[s] ?? s}
          </option>
        ))}
      </select>
      {error ? <span className="ml-2 text-xs text-red-400">{error}</span> : null}
    </>
  );
}
