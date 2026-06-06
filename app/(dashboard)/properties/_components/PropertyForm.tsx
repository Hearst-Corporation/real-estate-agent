"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UI } from "@/lib/ui-strings";
import { FORM_LIMITS } from "@/lib/crm/format";

interface PropertyFormProps {
  /** Si fourni, passe en mode édition (PATCH) */
  id?: string;
  defaultValues?: {
    title?: string;
    property_type?: string;
    address?: string;
    city?: string;
    postal_code?: string;
    surface?: number | null;
    rooms?: number | null;
    bedrooms?: number | null;
    asking_price?: number | null;
    status?: string;
    notes?: string | null;
  };
  onClose?: () => void;
}

export function PropertyForm({ id, defaultValues = {}, onClose }: PropertyFormProps) {
  const t = UI.properties;
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = Boolean(id);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {
      title: fd.get("title"),
      property_type: fd.get("property_type"),
      address: fd.get("address"),
      city: fd.get("city"),
      postal_code: fd.get("postal_code"),
      status: fd.get("status") || "prospect",
    };

    const surface = fd.get("surface");
    const rooms = fd.get("rooms");
    const bedrooms = fd.get("bedrooms");
    const asking_price = fd.get("asking_price");
    const notes = fd.get("notes");

    if (surface) body.surface = Number(surface);
    if (rooms) body.rooms = Number(rooms);
    if (bedrooms) body.bedrooms = Number(bedrooms);
    if (asking_price) body.asking_price = Number(asking_price);
    if (notes) body.notes = notes;

    const url = isEdit ? `/api/properties/${id}` : "/api/properties";
    const method = isEdit ? "PATCH" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? UI.common.networkError);
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
    <form className="ct-form" onSubmit={handleSubmit}>
      <p className="ct-card-title">{t.form.title}</p>

      <label>
        <span>{t.form.name}</span>
        <input
          className="ct-input"
          name="title"
          required
          defaultValue={defaultValues.title ?? ""}
        />
      </label>

      <label>
        <span>{t.form.type}</span>
        <input
          className="ct-input"
          name="property_type"
          required
          defaultValue={defaultValues.property_type ?? ""}
        />
      </label>

      <label>
        <span>{t.form.address}</span>
        <input
          className="ct-input"
          name="address"
          required
          defaultValue={defaultValues.address ?? ""}
        />
      </label>

      <label>
        <span>{t.form.city}</span>
        <input
          className="ct-input"
          name="city"
          required
          defaultValue={defaultValues.city ?? ""}
        />
      </label>

      <label>
        <span>{t.form.postalCode}</span>
        <input
          className="ct-input"
          name="postal_code"
          required
          defaultValue={defaultValues.postal_code ?? ""}
        />
      </label>

      <label>
        <span>{t.form.surface}</span>
        <input
          className="ct-input"
          name="surface"
          type="number"
          min={0}
          defaultValue={defaultValues.surface ?? ""}
        />
      </label>

      <label>
        <span>{t.form.rooms}</span>
        <input
          className="ct-input"
          name="rooms"
          type="number"
          min={0}
          defaultValue={defaultValues.rooms ?? ""}
        />
      </label>

      <label>
        <span>{t.form.bedrooms}</span>
        <input
          className="ct-input"
          name="bedrooms"
          type="number"
          min={0}
          defaultValue={defaultValues.bedrooms ?? ""}
        />
      </label>

      <label>
        <span>{t.form.askingPrice}</span>
        <input
          className="ct-input"
          name="asking_price"
          type="number"
          min={0}
          defaultValue={defaultValues.asking_price ?? ""}
        />
      </label>

      <label>
        <span>{t.form.notes}</span>
        <textarea
          className="ct-input"
          name="notes"
          rows={FORM_LIMITS.textareaRows}
          defaultValue={defaultValues.notes ?? ""}
        />
      </label>

      {error && <p className="ct-error">{error}</p>}

      <div className="ct-seg-track">
        <button type="submit" className="ct-seg-btn primary" disabled={loading} aria-busy={loading}>
          {loading ? UI.common.saving : t.form.save}
        </button>
        {onClose && (
          <button type="button" className="ct-seg-btn" onClick={onClose}>
            {t.form.cancel}
          </button>
        )}
      </div>
    </form>
  );
}

/** Bouton + modale inline "Nouveau bien" */
export default function PropertyFormModal() {
  const t = UI.properties;
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button className="ct-seg-btn primary" onClick={() => setOpen(true)}>
        {t.newCta}
      </button>
    );
  }

  return (
    <div className="crm-form-overlay">
      <div className="crm-form-modal">
        <PropertyForm onClose={() => setOpen(false)} />
      </div>
    </div>
  );
}
