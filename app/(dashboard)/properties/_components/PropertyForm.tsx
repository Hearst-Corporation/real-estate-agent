"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AccessibleModal } from "@/components/cockpit/AccessibleModal";
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
    dpe_letter?: string | null;
    ges_letter?: string | null;
    year_built?: number | null;
    floor?: number | null;
    floor_total?: number | null;
    has_elevator?: boolean;
    has_parking?: boolean;
    has_garden?: boolean;
    has_terrace?: boolean;
    has_pool?: boolean;
    charges_monthly?: number | null;
    taxe_fonciere?: number | null;
    orientation?: string | null;
    cellar?: boolean;
    parking_count?: number | null;
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

    // Enrichissement
    const dpe_letter = fd.get("dpe_letter");
    const ges_letter = fd.get("ges_letter");
    const year_built = fd.get("year_built");
    const floor = fd.get("floor");
    const floor_total = fd.get("floor_total");
    const orientation = fd.get("orientation");
    const charges_monthly = fd.get("charges_monthly");
    const taxe_fonciere = fd.get("taxe_fonciere");
    const parking_count = fd.get("parking_count");

    if (dpe_letter) body.dpe_letter = String(dpe_letter);
    if (ges_letter) body.ges_letter = String(ges_letter);
    if (year_built) body.year_built = Number(year_built);
    if (floor) body.floor = Number(floor);
    if (floor_total) body.floor_total = Number(floor_total);
    if (orientation) body.orientation = String(orientation);
    if (charges_monthly) body.charges_monthly = Number(charges_monthly);
    if (taxe_fonciere) body.taxe_fonciere = Number(taxe_fonciere);
    if (parking_count) body.parking_count = Number(parking_count);

    // Booléens checkboxes
    body.has_elevator = fd.get("has_elevator") === "true";
    body.has_parking = fd.get("has_parking") === "true";
    body.has_garden = fd.get("has_garden") === "true";
    body.has_terrace = fd.get("has_terrace") === "true";
    body.has_pool = fd.get("has_pool") === "true";
    body.cellar = fd.get("cellar") === "true";

    const url = isEdit ? `/api/properties/${id}` : "/api/properties";
    const method = isEdit ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setLoading(false);

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError((json as { error?: string }).error ?? UI.common.networkError);
      return;
    }

    router.refresh();
    onClose?.();
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

      {/* Informations complémentaires */}
      <fieldset className="ct-form-fieldset">
        <legend>{t.enrichissement.title}</legend>

        <div className="ct-form-row-2col">
          <label>
            <span>{t.form.dpeLabel}</span>
            <select className="ct-input" name="dpe_letter" defaultValue={defaultValues.dpe_letter ?? ""}>
              <option value="">—</option>
              {["A","B","C","D","E","F","G"].map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
          <label>
            <span>{t.form.gesLabel}</span>
            <select className="ct-input" name="ges_letter" defaultValue={defaultValues.ges_letter ?? ""}>
              <option value="">—</option>
              {["A","B","C","D","E","F","G"].map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
        </div>

        <div className="ct-form-row-2col">
          <label>
            <span>{t.form.yearBuilt}</span>
            <input className="ct-input" name="year_built" type="number" min={1800} max={2030} defaultValue={defaultValues.year_built ?? ""} />
          </label>
          <label>
            <span>{t.form.orientation}</span>
            <select className="ct-input" name="orientation" defaultValue={defaultValues.orientation ?? ""}>
              <option value="">—</option>
              {["N","S","E","O","NE","NO","SE","SO"].map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
        </div>

        <div className="ct-form-row-2col">
          <label>
            <span>{t.form.floor}</span>
            <input className="ct-input" name="floor" type="number" min={0} defaultValue={defaultValues.floor ?? ""} />
          </label>
          <label>
            <span>{t.form.floorTotal}</span>
            <input className="ct-input" name="floor_total" type="number" min={1} defaultValue={defaultValues.floor_total ?? ""} />
          </label>
        </div>

        <div className="ct-form-row-2col">
          <label>
            <span>{t.form.chargesMonthly}</span>
            <input className="ct-input" name="charges_monthly" type="number" min={0} defaultValue={defaultValues.charges_monthly ?? ""} />
          </label>
          <label>
            <span>{t.form.taxeFonciere}</span>
            <input className="ct-input" name="taxe_fonciere" type="number" min={0} defaultValue={defaultValues.taxe_fonciere ?? ""} />
          </label>
        </div>

        <div className="ct-form-checkboxes">
          {([
            ["has_elevator", t.form.hasElevator, defaultValues.has_elevator],
            ["has_parking", t.form.hasParking, defaultValues.has_parking],
            ["has_garden", t.form.hasGarden, defaultValues.has_garden],
            ["has_terrace", t.form.hasTerrace, defaultValues.has_terrace],
            ["has_pool", t.form.hasPool, defaultValues.has_pool],
            ["cellar", t.form.hasCellar, defaultValues.cellar],
          ] as [string, string, boolean | undefined][]).map(([name, label, checked]) => (
            <label key={name} className="ct-form-checkbox">
              <input type="checkbox" name={name} defaultChecked={checked ?? false} value="true" />
              <span>{label}</span>
            </label>
          ))}
        </div>

        <label>
          <span>{t.form.parkingCount}</span>
          <input className="ct-input" name="parking_count" type="number" min={0} defaultValue={defaultValues.parking_count ?? ""} />
        </label>
      </fieldset>

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

interface PropertyFormModalProps {
  id?: string;
  defaultValues?: PropertyFormProps["defaultValues"];
  triggerLabel?: string;
}

/** Bouton + modale inline — supporte création et édition */
export default function PropertyFormModal({ id, defaultValues, triggerLabel }: PropertyFormModalProps) {
  const t = UI.properties;
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button className="ct-seg-btn primary" onClick={() => setOpen(true)}>
        {triggerLabel ?? t.newCta}
      </button>
    );
  }

  return (
    <AccessibleModal title={t.form.title} onClose={() => setOpen(false)}>
      <PropertyForm id={id} defaultValues={defaultValues} onClose={() => setOpen(false)} />
    </AccessibleModal>
  );
}
