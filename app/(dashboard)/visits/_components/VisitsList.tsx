"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Visit = {
  id: string;
  status: string;
  scheduled_at: string;
  duration_min: number;
  notes: string | null;
  feedback: string | null;
  lead_id: string | null;
  property_id: string;
  properties: { title: string | null; city: string | null } | null;
};

const STATUS_OPTIONS = ["planifiee", "confirmee", "realisee", "annulee", "no_show"] as const;

type Props = {
  visits: Visit[];
  statusLabels: Record<string, string>;
  deleteLabel: string;
  durationUnit: string;
};

export default function VisitsList({ visits, statusLabels, deleteLabel, durationUnit }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);

  async function handleStatusChange(id: string, status: string) {
    setPending(id);
    try {
      await fetch(`/api/visits/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  async function handleDelete(id: string) {
    setPending(id);
    try {
      await fetch(`/api/visits/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      {visits.map((v) => {
        const city = v.properties?.city ?? null;
        const title = v.properties?.title ?? null;
        const label = title ?? city ?? v.property_id;
        const dateStr = new Date(v.scheduled_at).toLocaleString("fr-FR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
        const busy = pending === v.id;

        return (
          <div key={v.id} className="ct-card">
            <div className="est-list-row">
              <div className="est-list-info">
                <div className="est-list-main">{label}</div>
                <div className="est-list-meta">
                  <span className="ct-placeholder">{dateStr}</span>
                  <span className="ct-placeholder">{v.duration_min}{durationUnit}</span>
                  <span className="ct-badge">{statusLabels[v.status] ?? v.status}</span>
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                <select
                  className="ct-input"
                  value={v.status}
                  disabled={busy}
                  onChange={(e) => handleStatusChange(v.id, e.target.value)}
                  style={{ minWidth: "120px" }}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {statusLabels[s] ?? s}
                    </option>
                  ))}
                </select>
                <button
                  className="ct-seg-btn"
                  disabled={busy}
                  onClick={() => handleDelete(v.id)}
                >
                  {deleteLabel}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
