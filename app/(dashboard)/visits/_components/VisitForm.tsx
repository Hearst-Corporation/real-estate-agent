"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useOpenFromQuery } from "@/lib/hooks/useOpenFromQuery";
import { Dialog, DialogTitle, DialogBody } from "@/components/ui/dialog";
import { Fieldset, FieldGroup, Field, Label, ErrorMessage } from "@/components/ui/fieldset";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
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

  return (
    <>
      <Button color="indigo" type="button" onClick={() => setOpen(true)}>
        {cta}
      </Button>

      <Dialog open={open} onClose={setOpen}>
        <DialogTitle>{t.title}</DialogTitle>
        <DialogBody>
          <form onSubmit={handleSubmit}>
            <Fieldset>
              <FieldGroup>
                <Field>
                  <Label>{t.property}</Label>
                  <Select
                    name="property_id"
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
                  </Select>
                </Field>

                <Field>
                  <Label>{t.scheduledAt}</Label>
                  <Input
                    name="scheduled_at"
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    required
                  />
                </Field>

                <Field>
                  <Label>{t.duration}</Label>
                  <Input
                    name="duration_min"
                    type="number"
                    min={FORM_LIMITS.visitDurationMin}
                    max={FORM_LIMITS.visitDurationMax}
                    step={FORM_LIMITS.visitDurationStep}
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                  />
                </Field>

                <Field>
                  <Label>{t.notes}</Label>
                  <Input
                    name="notes"
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </Field>

                {error && <ErrorMessage>{error}</ErrorMessage>}

                <div className="flex items-center gap-3 pt-2">
                  <Button color="indigo" type="submit" disabled={loading}>
                    {t.save}
                  </Button>
                  <Button plain type="button" onClick={() => setOpen(false)}>
                    {t.cancel}
                  </Button>
                </div>
              </FieldGroup>
            </Fieldset>
          </form>
        </DialogBody>
      </Dialog>
    </>
  );
}
