"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogTitle,
  DialogBody,
} from "@/components/ui/dialog";
import { useOpenFromQuery } from "@/lib/hooks/useOpenFromQuery";
import { Fieldset, Legend, Field, Label, ErrorMessage } from "@/components/ui/fieldset";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox, CheckboxField } from "@/components/ui/checkbox";
import { UI } from "@/lib/ui-strings";
import { CRM_ANCHORS } from "@/lib/onboarding/tours/crm";
import { FORM_LIMITS } from "@/lib/crm/format";
import { emitPropertyChanged } from "@/lib/hooks/usePropertyLive";

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

/** Clés des 6 booléens équipement gérés en état contrôlé (Catalyst Checkbox). */
type BoolKey =
  | "has_elevator"
  | "has_parking"
  | "has_garden"
  | "has_terrace"
  | "has_pool"
  | "cellar";

export function PropertyForm({ id, defaultValues = {}, onClose }: PropertyFormProps) {
  const t = UI.properties;
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = Boolean(id);

  // Booléens équipement : Catalyst Checkbox est un composant contrôlé (pas
  // d'input natif submittable) → on gère leur état ici et on l'injecte dans body.
  const [bools, setBools] = useState<Record<BoolKey, boolean>>({
    has_elevator: defaultValues.has_elevator ?? false,
    has_parking: defaultValues.has_parking ?? false,
    has_garden: defaultValues.has_garden ?? false,
    has_terrace: defaultValues.has_terrace ?? false,
    has_pool: defaultValues.has_pool ?? false,
    cellar: defaultValues.cellar ?? false,
  });

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

    // Booléens checkboxes (état contrôlé)
    body.has_elevator = bools.has_elevator;
    body.has_parking = bools.has_parking;
    body.has_garden = bools.has_garden;
    body.has_terrace = bools.has_terrace;
    body.has_pool = bools.has_pool;
    body.cellar = bools.cellar;

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
        setError((json as { error?: string }).error ?? UI.common.networkError);
        return;
      }

      emitPropertyChanged();

      if (onClose) {
        router.refresh();
        onClose();
      } else {
        const json = await res.json().catch(() => ({}));
        const newId = (json as { id?: string }).id;
        router.push(newId ? `/properties/${newId}` : "/properties");
      }
    } catch {
      setError(UI.common.networkError);
    } finally {
      setLoading(false);
    }
  }

  const fieldsetClass = "surface p-4";
  const legendClass = "px-1 text-xs font-semibold uppercase tracking-widest text-accent-500 dark:text-accent-400";
  const row2Class = "grid grid-cols-1 gap-4 sm:grid-cols-2";

  const letterOptions = ["A", "B", "C", "D", "E", "F", "G"];
  const orientationOptions = ["N", "S", "E", "O", "NE", "NO", "SE", "SO"];

  const checkboxRows: [BoolKey, string][] = [
    ["has_elevator", t.form.hasElevator],
    ["has_parking", t.form.hasParking],
    ["has_garden", t.form.hasGarden],
    ["has_terrace", t.form.hasTerrace],
    ["has_pool", t.form.hasPool],
    ["cellar", t.form.hasCellar],
  ];

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Section : informations principales */}
      <Fieldset className={fieldsetClass}>
        <Legend className={legendClass}>{t.form.sectionMain}</Legend>
        <div className={row2Class}>
          <Field>
            <Label>{t.form.name}</Label>
            <Input name="title" required defaultValue={defaultValues.title ?? ""} />
          </Field>
          <Field>
            <Label>{t.form.type}</Label>
            <Input name="property_type" required defaultValue={defaultValues.property_type ?? ""} />
          </Field>
        </div>
      </Fieldset>

      {/* Section : localisation */}
      <Fieldset className={fieldsetClass}>
        <Legend className={legendClass}>{t.form.sectionLocation}</Legend>
        <Field>
          <Label>{t.form.address}</Label>
          <Input name="address" required defaultValue={defaultValues.address ?? ""} />
        </Field>
        <div className={`${row2Class} mt-4`}>
          <Field>
            <Label>{t.form.city}</Label>
            <Input name="city" required defaultValue={defaultValues.city ?? ""} />
          </Field>
          <Field>
            <Label>{t.form.postalCode}</Label>
            <Input name="postal_code" required defaultValue={defaultValues.postal_code ?? ""} />
          </Field>
        </div>
      </Fieldset>

      {/* Section : caractéristiques */}
      <Fieldset className={fieldsetClass}>
        <Legend className={legendClass}>{t.form.sectionFeatures}</Legend>
        <div className={row2Class}>
          <Field>
            <Label>{t.form.surface}</Label>
            <Input name="surface" type="number" min={0} defaultValue={defaultValues.surface ?? ""} />
          </Field>
          <Field>
            <Label>{t.form.rooms}</Label>
            <Input name="rooms" type="number" min={0} defaultValue={defaultValues.rooms ?? ""} />
          </Field>
        </div>
        <div className={`${row2Class} mt-4`}>
          <Field>
            <Label>{t.form.bedrooms}</Label>
            <Input name="bedrooms" type="number" min={0} defaultValue={defaultValues.bedrooms ?? ""} />
          </Field>
        </div>
      </Fieldset>

      {/* Section : prix / mandat */}
      <Fieldset className={fieldsetClass}>
        <Legend className={legendClass}>{t.form.sectionPrice}</Legend>
        <Field>
          <Label>{t.form.askingPrice}</Label>
          <Input name="asking_price" type="number" min={0} defaultValue={defaultValues.asking_price ?? ""} />
        </Field>
        <Field className="mt-4">
          <Label>{t.form.notes}</Label>
          <Textarea name="notes" rows={FORM_LIMITS.textareaRows} defaultValue={defaultValues.notes ?? ""} />
        </Field>
      </Fieldset>

      {/* Informations complémentaires */}
      <Fieldset className={fieldsetClass}>
        <Legend className={legendClass}>{t.enrichissement.title}</Legend>

        <div className={row2Class}>
          <Field>
            <Label>{t.form.dpeLabel}</Label>
            <Select name="dpe_letter" defaultValue={defaultValues.dpe_letter ?? ""}>
              <option value="">—</option>
              {letterOptions.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </Select>
          </Field>
          <Field>
            <Label>{t.form.gesLabel}</Label>
            <Select name="ges_letter" defaultValue={defaultValues.ges_letter ?? ""}>
              <option value="">—</option>
              {letterOptions.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </Select>
          </Field>
        </div>

        <div className={`${row2Class} mt-4`}>
          <Field>
            <Label>{t.form.yearBuilt}</Label>
            <Input name="year_built" type="number" min={1800} max={2030} defaultValue={defaultValues.year_built ?? ""} />
          </Field>
          <Field>
            <Label>{t.form.orientation}</Label>
            <Select name="orientation" defaultValue={defaultValues.orientation ?? ""}>
              <option value="">—</option>
              {orientationOptions.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </Select>
          </Field>
        </div>

        <div className={`${row2Class} mt-4`}>
          <Field>
            <Label>{t.form.floor}</Label>
            <Input name="floor" type="number" min={0} defaultValue={defaultValues.floor ?? ""} />
          </Field>
          <Field>
            <Label>{t.form.floorTotal}</Label>
            <Input name="floor_total" type="number" min={1} defaultValue={defaultValues.floor_total ?? ""} />
          </Field>
        </div>

        <div className={`${row2Class} mt-4`}>
          <Field>
            <Label>{t.form.chargesMonthly}</Label>
            <Input name="charges_monthly" type="number" min={0} defaultValue={defaultValues.charges_monthly ?? ""} />
          </Field>
          <Field>
            <Label>{t.form.taxeFonciere}</Label>
            <Input name="taxe_fonciere" type="number" min={0} defaultValue={defaultValues.taxe_fonciere ?? ""} />
          </Field>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          {checkboxRows.map(([name, label]) => (
            <CheckboxField key={name}>
              <Checkbox
                name={name}
                checked={bools[name]}
                onChange={(checked) => setBools((b) => ({ ...b, [name]: checked }))}
              />
              <Label>{label}</Label>
            </CheckboxField>
          ))}
        </div>

        <Field className="mt-4">
          <Label>{t.form.parkingCount}</Label>
          <Input name="parking_count" type="number" min={0} defaultValue={defaultValues.parking_count ?? ""} />
        </Field>
      </Fieldset>

      {error && <ErrorMessage>{error}</ErrorMessage>}

      <div className="flex items-center gap-2">
        <Button type="submit" color="indigo" className="!text-zinc-950" disabled={loading} aria-busy={loading}>
          {loading ? UI.common.saving : t.form.save}
        </Button>
        {onClose && (
          <Button type="button" plain onClick={onClose}>
            {t.form.cancel}
          </Button>
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
  // `?new=1` ouvre uniquement la modale de CRÉATION (pas l'édition d'une fiche).
  useOpenFromQuery(id ? "" : "new", useCallback(() => setOpen(true), []));

  return (
    <>
      <Button
        color="indigo"
        className="!text-zinc-950"
        // Ancre de visite guidée : uniquement sur le bouton de CRÉATION
        // (l'édition d'une fiche réutilise le même composant).
        data-tour-id={id ? undefined : CRM_ANCHORS.propertyCreate}
        onClick={() => setOpen(true)}
      >
        {triggerLabel ?? t.newCta}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} size="2xl">
        <DialogTitle>{t.form.title}</DialogTitle>
        <DialogBody>
          <PropertyForm id={id} defaultValues={defaultValues} onClose={() => setOpen(false)} />
        </DialogBody>
      </Dialog>
    </>
  );
}
