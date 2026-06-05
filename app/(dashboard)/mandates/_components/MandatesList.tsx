"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UI } from "@/lib/ui-strings";
import { Card, Badge } from "@/components/cockpit/primitives";

type MandateRow = {
  id: string;
  status: string;
  kind: string;
  reference: string | null;
  asking_price: number | null;
  commission_pct: number | null;
  signed_at: string | null;
  expires_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  properties: { title: string | null; city: string | null } | null;
};

type Props = {
  initialMandates: MandateRow[];
};

const ALL_STATUSES = ["brouillon", "actif", "suspendu", "expire", "resilie", "realise"] as const;

const fmtEur = (v: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);

export default function MandatesList({ initialMandates }: Props) {
  const t = UI.mandates;
  const router = useRouter();
  const [mandates, setMandates] = useState<MandateRow[]>(initialMandates);
  const [patching, setPatching] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleStatusChange(id: string, status: string) {
    setPatching(id);
    try {
      const res = await fetch(`/api/mandates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setMandates((prev) =>
          prev.map((m) => (m.id === id ? { ...m, status } : m))
        );
        router.refresh();
      }
    } finally {
      setPatching(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t.delete)) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/mandates/${id}`, { method: "DELETE" });
      if (res.ok) {
        setMandates((prev) => prev.filter((m) => m.id !== id));
        router.refresh();
      }
    } finally {
      setDeleting(null);
    }
  }

  return (
    <>
      {mandates.map((m) => (
        <Card key={m.id}>
          <div className="est-list-row">
            <div className="est-list-info">
              <div className="est-list-main">
                {m.reference ? m.reference : m.properties?.city ?? m.id}
                {m.properties?.city ? ` — ${m.properties.city}` : ""}
              </div>
              <div className="est-list-meta">
                <Badge>{t.statusLabels[m.status] ?? m.status}</Badge>
                <Badge>{t.kindLabels[m.kind] ?? m.kind}</Badge>
                {m.asking_price != null && (
                  <span className="ct-placeholder">{fmtEur(m.asking_price)}</span>
                )}
                {m.commission_pct != null && (
                  <span className="ct-placeholder">
                    {m.commission_pct}{t.commissionUnit}
                  </span>
                )}
                {m.signed_at && (
                  <span className="ct-placeholder">
                    {new Date(m.signed_at).toLocaleDateString("fr-FR")}
                  </span>
                )}
                {m.expires_at && (
                  <span className="ct-placeholder">
                    → {new Date(m.expires_at).toLocaleDateString("fr-FR")}
                  </span>
                )}
              </div>
            </div>

            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
              <select
                className="ct-input"
                value={m.status}
                disabled={patching === m.id}
                onChange={(e) => handleStatusChange(m.id, e.target.value)}
                style={{ minWidth: "9rem" }}
              >
                {ALL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t.statusLabels[s] ?? s}
                  </option>
                ))}
              </select>

              <button
                className="ct-seg-btn"
                disabled={deleting === m.id}
                onClick={() => handleDelete(m.id)}
              >
                {t.delete}
              </button>
            </div>
          </div>
        </Card>
      ))}
    </>
  );
}
