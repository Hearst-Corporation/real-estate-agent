"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UI } from "@/lib/ui-strings";
import { FORM_LIMITS } from "@/lib/crm/format";

type PropertyOption = {
  id: string;
  title: string | null;
  city: string | null;
};

export default function MandateForm() {
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
    } catch {
      setError(UI.common.networkError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="ct-form" onSubmit={handleSubmit}>
      <p className="ct-card-title">{t.form.title}</p>

      <label className="ct-eyebrow">{t.form.property}</label>
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

      <label className="ct-eyebrow">{t.form.kind}</label>
      <select
        className="ct-input"
        value={kind}
        onChange={(e) => setKind(e.target.value)}
      >
        {Object.entries(t.kindLabels).map(([k, label]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ))}
      </select>

      <label className="ct-eyebrow">{t.form.reference}</label>
      <input
        className="ct-input"
        type="text"
        value={reference}
        onChange={(e) => setReference(e.target.value)}
        placeholder={t.form.reference}
      />

      <label className="ct-eyebrow">{t.form.askingPrice}</label>
      <input
        className="ct-input"
        type="number"
        min={FORM_LIMITS.priceMin}
        value={askingPrice}
        onChange={(e) => setAskingPrice(e.target.value)}
      />

      <label className="ct-eyebrow">{t.form.commissionPct}</label>
      <input
        className="ct-input"
        type="number"
        min={FORM_LIMITS.commissionMin}
        max={FORM_LIMITS.commissionMax}
        step={FORM_LIMITS.commissionStep}
        value={commissionPct}
        onChange={(e) => setCommissionPct(e.target.value)}
      />

      <label className="ct-eyebrow">{t.form.signedAt}</label>
      <input
        className="ct-input"
        type="date"
        value={signedAt}
        onChange={(e) => setSignedAt(e.target.value)}
      />

      <label className="ct-eyebrow">{t.form.expiresAt}</label>
      <input
        className="ct-input"
        type="date"
        value={expiresAt}
        onChange={(e) => setExpiresAt(e.target.value)}
      />

      {error && <p className="ct-error">{error}</p>}

      <div className="crm-form-actions">
        <button type="submit" className="ct-seg-btn primary" disabled={loading || !propertyId}>
          {t.form.save}
        </button>
        <button
          type="button"
          className="ct-seg-btn"
          onClick={() => router.back()}
          disabled={loading}
        >
          {t.form.cancel}
        </button>
      </div>
    </form>
  );
}
