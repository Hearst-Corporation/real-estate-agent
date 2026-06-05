"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UI } from "@/lib/ui-strings";

type Property = { id: string; title: string | null; city: string | null };

export default function VisitForm({ cta }: { cta: string }) {
  const t = UI.visits.form;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [propertyId, setPropertyId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [duration, setDuration] = useState(30);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    fetch("/api/properties")
      .then((r) => r.json())
      .then((d) => setProperties(d.items ?? []))
      .catch(() => setProperties([]));
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!propertyId || !scheduledAt) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          property_id: propertyId,
          scheduled_at: new Date(scheduledAt).toISOString(),
          duration_min: duration,
          notes: notes || undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "error");
        return;
      }
      setOpen(false);
      setPropertyId("");
      setScheduledAt("");
      setDuration(30);
      setNotes("");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button className="ct-seg-btn primary" onClick={() => setOpen(true)}>
        {cta}
      </button>
    );
  }

  return (
    <div className="ct-card">
      <div className="ct-card-title">{t.title}</div>
      <form className="ct-form" onSubmit={handleSubmit}>
        <label>
          <span className="ct-kpi-label">{t.property}</span>
          <select
            className="ct-input"
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            required
          >
            <option value="">—</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title ?? p.city ?? p.id}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="ct-kpi-label">{t.scheduledAt}</span>
          <input
            className="ct-input"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            required
          />
        </label>

        <label>
          <span className="ct-kpi-label">{t.duration}</span>
          <input
            className="ct-input"
            type="number"
            min={5}
            max={480}
            step={5}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
          />
        </label>

        <label>
          <span className="ct-kpi-label">{t.notes}</span>
          <input
            className="ct-input"
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>

        {error && <p className="ct-error">{error}</p>}

        <div className="crm-form-actions">
          <button className="ct-seg-btn primary" type="submit" disabled={loading}>
            {t.save}
          </button>
          <button
            className="ct-seg-btn"
            type="button"
            onClick={() => setOpen(false)}
          >
            {t.cancel}
          </button>
        </div>
      </form>
    </div>
  );
}
