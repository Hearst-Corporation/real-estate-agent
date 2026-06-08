"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AccessibleModal } from "@/components/cockpit/AccessibleModal";
import { CockpitForm, Field, TextInput, Select, MoneyInput } from "@/components/cockpit/form";
import { UI } from "@/lib/ui-strings";
import { FORM_LIMITS } from "@/lib/crm/format";

type PropertyOption = {
  id: string;
  title: string | null;
  city: string | null;
};

function MandateForm({ onClose }: { onClose?: () => void }) {
  const t = UI.mandates;
  const router = useRouter();

  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [propertyId, setPropertyId] = useState("");
  const [kind, setKind] = useState("simple");
  const [reference, setReference] = useState("");
  const [askingPrice, setAskingPrice] = useState("");
  const [commissionPct, setCommissionPct] = useState("");
  const [signedAt, setSignedAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  useEffect(() => {
    fetch("/api/properties")
      .then((r) => r.json())
      .then((d) => setProperties(d.items ?? []))
      .catch(() => setProperties([]));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!propertyId) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/mandates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          property_id: propertyId,
          kind,
          reference: reference || undefined,
          asking_price: askingPrice ? Number(askingPrice) : undefined,
          commission_pct: commissionPct ? Number(commissionPct) : undefined,
          signed_at: signedAt || undefined,
          expires_at: expiresAt || undefined,
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? UI.common.error);
        return;
      }

      router.refresh();
      onClose?.();
    } catch {
      setError(UI.common.networkError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <CockpitForm onSubmit={handleSubmit}>
      <h3 className="ct-card-title">{t.form.title}</h3>

      <Field label={t.form.property} htmlFor="mandate-property" required>
        <Select
          id="mandate-property"
          options={[
            { value: "", label: "—" },
            ...properties.map((p) => ({
              value: p.id,
              label: p.title ?? p.city ?? p.id,
            })),
          ]}
          value={propertyId}
          onChange={(e) => setPropertyId(e.target.value)}
          required
        />
      </Field>

      <Field label={t.form.kind} htmlFor="mandate-kind">
        <Select
          id="mandate-kind"
          options={Object.entries(t.kindLabels).map(([k, label]) => ({
            value: k,
            label,
          }))}
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        />
      </Field>

      <Field label={t.form.reference} htmlFor="mandate-reference">
        <TextInput
          id="mandate-reference"
          type="text"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder={t.form.reference}
        />
      </Field>

      <Field label={t.form.askingPrice} htmlFor="mandate-asking-price">
        <MoneyInput
          id="mandate-asking-price"
          min={FORM_LIMITS.priceMin}
          value={askingPrice}
          onChange={(e) => setAskingPrice(e.target.value)}
        />
      </Field>

      <Field label={t.form.commissionPct} htmlFor="mandate-commission-pct">
        <TextInput
          id="mandate-commission-pct"
          type="number"
          min={FORM_LIMITS.commissionMin}
          max={FORM_LIMITS.commissionMax}
          step={FORM_LIMITS.commissionStep}
          value={commissionPct}
          onChange={(e) => setCommissionPct(e.target.value)}
        />
      </Field>

      <Field label={t.form.signedAt} htmlFor="mandate-signed-at">
        <TextInput
          id="mandate-signed-at"
          type="date"
          value={signedAt}
          onChange={(e) => setSignedAt(e.target.value)}
        />
      </Field>

      <Field label={t.form.expiresAt} htmlFor="mandate-expires-at">
        <TextInput
          id="mandate-expires-at"
          type="date"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
        />
      </Field>

      {error && <p className="ct-error">{error}</p>}

      <div className="crm-form-actions">
        <button type="submit" className="ct-seg-btn primary" disabled={loading || !propertyId}>
          {t.form.save}
        </button>
        <button
          type="button"
          className="ct-seg-btn"
          onClick={() => onClose?.()}
          disabled={loading}
        >
          {t.form.cancel}
        </button>
      </div>
    </CockpitForm>
  );
}

export default function MandateFormModal({ cta }: { cta: string }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button className="ct-seg-btn primary" onClick={() => setOpen(true)}>
        {cta}
      </button>
    );
  }

  return (
    <AccessibleModal title={UI.mandates.form.title} onClose={() => setOpen(false)}>
      <MandateForm onClose={() => setOpen(false)} />
    </AccessibleModal>
  );
}
