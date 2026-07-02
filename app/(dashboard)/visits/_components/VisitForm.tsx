"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useOpenFromQuery } from "@/lib/hooks/useOpenFromQuery";
import {
  CockpitForm,
  Field,
  TextInput,
  Select,
} from "@/components/cockpit/form";
import { UI } from "@/lib/ui-strings";
import { FORM_LIMITS } from "@/lib/crm/format";

type Property = { id: string; title: string | null; city: string | null };

export default function VisitForm({ cta }: { cta: string }) {
  const t = UI.visits.form;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  useOpenFromQuery("new", useCallback(() => setOpen(true), []));
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [propertyId, setPropertyId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [duration, setDuration] = useState<number>(FORM_LIMITS.visitDurationDefault);
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
        setError(d.error ?? UI.common.error);
        return;
      }
      setOpen(false);
      setPropertyId("");
      setScheduledAt("");
      setDuration(FORM_LIMITS.visitDurationDefault);
      setNotes("");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400"
        onClick={() => setOpen(true)}
      >
        {cta}
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-lg shadow-black/20 backdrop-blur-sm">
      <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
        {t.title}
      </div>
      <CockpitForm onSubmit={handleSubmit}>
        <Field label={t.property} htmlFor="visit-property" required>
          <Select
            id="visit-property"
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            required
            options={[
              { value: "", label: "—" },
              ...properties.map((p) => ({
                value: p.id,
                label: p.title ?? p.city ?? p.id,
              })),
            ]}
          />
        </Field>

        <Field label={t.scheduledAt} htmlFor="visit-scheduled-at" required>
          <TextInput
            id="visit-scheduled-at"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            required
          />
        </Field>

        <Field label={t.duration} htmlFor="visit-duration">
          <TextInput
            id="visit-duration"
            type="number"
            min={FORM_LIMITS.visitDurationMin}
            max={FORM_LIMITS.visitDurationMax}
            step={FORM_LIMITS.visitDurationStep}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
          />
        </Field>

        <Field label={t.notes} htmlFor="visit-notes">
          <TextInput
            id="visit-notes"
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex items-center gap-2 pt-2">
          <button
            className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
            type="submit"
            disabled={loading}
          >
            {t.save}
          </button>
          <button
            className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/[0.08]"
            type="button"
            onClick={() => setOpen(false)}
          >
            {t.cancel}
          </button>
        </div>
      </CockpitForm>
    </div>
  );
}
