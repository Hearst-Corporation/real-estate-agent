"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AccessibleModal } from "@/components/cockpit/AccessibleModal";
import { CockpitForm, Field, TextInput, Textarea, Select, MoneyInput } from "@/components/cockpit/form";
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

    if (onClose) {
      router.refresh();
      onClose();
    } else {
      const json = await res.json().catch(() => ({}));
      const newId = (json as { id?: string }).id;
      router.push(newId ? `/properties/${newId}` : "/properties");
    }
  }

  return (
    <CockpitForm onSubmit={handleSubmit}>
      <p className="ct-card-title">{t.form.title}</p>

      <Field label={t.form.name} htmlFor="property-title" required>
        <TextInput
          id="property-title"
          name="title"
          required
          defaultValue={defaultValues.title ?? ""}
        />
      </Field>

      <Field label={t.form.type} htmlFor="property-type" required>
        <TextInput
          id="property-type"
          name="property_type"
          required
          defaultValue={defaultValues.property_type ?? ""}
        />
      </Field>

      <Field label={t.form.address} htmlFor="property-address" required>
        <TextInput
          id="property-address"
          name="address"
          required
          defaultValue={defaultValues.address ?? ""}
        />
      </Field>

      <Field label={t.form.city} htmlFor="property-city" required>
        <TextInput
          id="property-city"
          name="city"
          required
          defaultValue={defaultValues.city ?? ""}
        />
      </Field>

      <Field label={t.form.postalCode} htmlFor="property-postal-code" required>
        <TextInput
          id="property-postal-code"
          name="postal_code"
          required
          defaultValue={defaultValues.postal_code ?? ""}
        />
      </Field>

      <Field label={t.form.surface} htmlFor="property-surface">
        <TextInput
          id="property-surface"
          name="surface"
          type="number"
          min={0}
          defaultValue={defaultValues.surface ?? ""}
        />
      </Field>

      <Field label={t.form.rooms} htmlFor="property-rooms">
        <TextInput
          id="property-rooms"
          name="rooms"
          type="number"
          min={0}
          defaultValue={defaultValues.rooms ?? ""}
        />
      </Field>

      <Field label={t.form.bedrooms} htmlFor="property-bedrooms">
        <TextInput
          id="property-bedrooms"
          name="bedrooms"
          type="number"
          min={0}
          defaultValue={defaultValues.bedrooms ?? ""}
        />
      </Field>

      <Field label={t.form.askingPrice} htmlFor="property-asking-price">
        <MoneyInput
          id="property-asking-price"
          name="asking_price"
          min={0}
          defaultValue={defaultValues.asking_price ?? ""}
        />
      </Field>

      <Field label={t.form.notes} htmlFor="property-notes">
        <Textarea
          id="property-notes"
          name="notes"
          rows={FORM_LIMITS.textareaRows}
          defaultValue={defaultValues.notes ?? ""}
        />
      </Field>

      {/* Informations complémentaires */}
      <fieldset className="ct-form-fieldset">
        <legend>{t.enrichissement.title}</legend>

        <div className="ct-form-row-2col">
          <Field label={t.form.dpeLabel} htmlFor="property-dpe-letter">
            <Select
              id="property-dpe-letter"
              name="dpe_letter"
              defaultValue={defaultValues.dpe_letter ?? ""}
              options={[{ value: "", label: "—" }, ...["A","B","C","D","E","F","G"].map(l => ({ value: l, label: l }))]}
            />
          </Field>
          <Field label={t.form.gesLabel} htmlFor="property-ges-letter">
            <Select
              id="property-ges-letter"
              name="ges_letter"
              defaultValue={defaultValues.ges_letter ?? ""}
              options={[{ value: "", label: "—" }, ...["A","B","C","D","E","F","G"].map(l => ({ value: l, label: l }))]}
            />
          </Field>
        </div>

        <div className="ct-form-row-2col">
          <Field label={t.form.yearBuilt} htmlFor="property-year-built">
            <TextInput id="property-year-built" name="year_built" type="number" min={1800} max={2030} defaultValue={defaultValues.year_built ?? ""} />
          </Field>
          <Field label={t.form.orientation} htmlFor="property-orientation">
            <Select
              id="property-orientation"
              name="orientation"
              defaultValue={defaultValues.orientation ?? ""}
              options={[{ value: "", label: "—" }, ...["N","S","E","O","NE","NO","SE","SO"].map(o => ({ value: o, label: o }))]}
            />
          </Field>
        </div>

        <div className="ct-form-row-2col">
          <Field label={t.form.floor} htmlFor="property-floor">
            <TextInput id="property-floor" name="floor" type="number" min={0} defaultValue={defaultValues.floor ?? ""} />
          </Field>
          <Field label={t.form.floorTotal} htmlFor="property-floor-total">
            <TextInput id="property-floor-total" name="floor_total" type="number" min={1} defaultValue={defaultValues.floor_total ?? ""} />
          </Field>
        </div>

        <div className="ct-form-row-2col">
          <Field label={t.form.chargesMonthly} htmlFor="property-charges-monthly">
            <MoneyInput id="property-charges-monthly" name="charges_monthly" min={0} defaultValue={defaultValues.charges_monthly ?? ""} />
          </Field>
          <Field label={t.form.taxeFonciere} htmlFor="property-taxe-fonciere">
            <MoneyInput id="property-taxe-fonciere" name="taxe_fonciere" min={0} defaultValue={defaultValues.taxe_fonciere ?? ""} />
          </Field>
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

        <Field label={t.form.parkingCount} htmlFor="property-parking-count">
          <TextInput id="property-parking-count" name="parking_count" type="number" min={0} defaultValue={defaultValues.parking_count ?? ""} />
        </Field>
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
    </CockpitForm>
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
