"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/cockpit/primitives";

interface Property {
  id: string;
  status: string;
  title: string | null;
  property_type: string | null;
  city: string | null;
  postal_code: string | null;
  surface: number | null;
  asking_price: number | null;
  updated_at: string;
}

interface PropertiesListProps {
  properties: Property[];
  statusLabels: Record<string, string>;
  openLabel: string;
  deleteLabel: string;
}

export default function PropertiesList({
  properties,
  statusLabels,
  openLabel,
  deleteLabel,
}: PropertiesListProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleDelete(id: string) {
    setDeleting(id);
    await fetch(`/api/properties/${id}`, { method: "DELETE" });
    setDeleting(null);
    router.refresh();
  }

  return (
    <div className="crm-list">
      {properties.map((p) => (
        <Card key={p.id}>
          <div className="est-list-row">
            <div className="est-list-info">
              <div className="est-list-main">
                {p.title}
                {p.city ? ` — ${p.city}` : ""}
              </div>
              <div className="est-list-meta">
                <span className="ct-badge">{statusLabels[p.status] ?? p.status}</span>
                {p.surface != null && (
                  <span className="ct-placeholder">{p.surface} m²</span>
                )}
                {p.asking_price != null && (
                  <span className="ct-placeholder">
                    {new Intl.NumberFormat("fr-FR", {
                      style: "currency",
                      currency: "EUR",
                      maximumFractionDigits: 0,
                    }).format(p.asking_price)}
                  </span>
                )}
              </div>
            </div>
            <div className="ct-seg-track">
              <Link href={`/properties/${p.id}`} className="ct-seg-btn">
                {openLabel}
              </Link>
              <button
                className="ct-seg-btn"
                onClick={() => handleDelete(p.id)}
                disabled={deleting === p.id}
              >
                {deleting === p.id ? "…" : deleteLabel}
              </button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
