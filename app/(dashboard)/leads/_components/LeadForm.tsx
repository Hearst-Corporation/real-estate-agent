"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AccessibleModal } from "@/components/cockpit/AccessibleModal";
import {
  CockpitForm,
  Field,
  TextInput,
  Select,
  MoneyInput,
} from "@/components/cockpit/form";
import { UI } from "@/lib/ui-strings";
import {
  LEAD_KINDS,
  LEAD_TYPE_PERSONNE,
  LEAD_DEFAULT_KIND,
  LEAD_DEFAULT_TYPE_PERSONNE,
  LEAD_DEFAULT_STATUS,
  FORM_LIMITS,
} from "@/lib/crm/format";

export type LeadDefaults = {
  full_name?: string;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  kind?: string | null;
  type_personne?: string | null;
  budget_min?: number | null;
  budget_max?: number | null;
  status?: string | null;
};

/** Le formulaire pur (création si pas d'`id`, édition sinon). */
export function LeadForm({
  id,
  defaultValues = {},
  onClose,
}: {
  id?: string;
  defaultValues?: LeadDefaults;
  onClose?: () => void;
}) {
  const t = UI.leads.form;
  const router = useRouter();
  const isEdit = Boolean(id);

  const [fullName, setFullName] = useState(defaultValues.full_name ?? "");
  const [email, setEmail] = useState(defaultValues.email ?? "");
  const [phone, setPhone] = useState(defaultValues.phone ?? "");
  const [source, setSource] = useState(defaultValues.source ?? "");
  const [kind, setKind] = useState(defaultValues.kind ?? LEAD_DEFAULT_KIND);
  const [typePersonne, setTypePersonne] = useState(
    defaultValues.type_personne ?? LEAD_DEFAULT_TYPE_PERSONNE
  );
  const [budgetMin, setBudgetMin] = useState(
    defaultValues.budget_min != null ? String(defaultValues.budget_min) : ""
  );
  const [budgetMax, setBudgetMax] = useState(
    defaultValues.budget_max != null ? String(defaultValues.budget_max) : ""
  );
  const [status] = useState(defaultValues.status ?? LEAD_DEFAULT_STATUS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) {
      setError(UI.common.required(t.fullName));
      return;
    }
    setLoading(true);
    setError(null);

    const body: Record<string, unknown> = {
      full_name: fullName.trim(),
      kind,
      type_personne: typePersonne,
      status,
      email: email || null,
      phone: phone || null,
      source: source || null,
      budget_min: budgetMin ? Number(budgetMin) : null,
      budget_max: budgetMax ? Number(budgetMax) : null,
    };

    const url = isEdit ? `/api/leads/${id}` : "/api/leads";
    const method = isEdit ? "PATCH" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError((json as { error?: string }).error ?? UI.common.error);
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
      <p className="ct-card-title">{t.title}</p>

      <Field label={t.fullName} htmlFor="lead-full-name" required>
        <TextInput
          id="lead-full-name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
        />
      </Field>

      <Field label={t.email} htmlFor="lead-email">
        <TextInput
          id="lead-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>

      <Field label={t.phone} htmlFor="lead-phone">
        <TextInput
          id="lead-phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </Field>

      <Field label={t.source} htmlFor="lead-source">
        <TextInput
          id="lead-source"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        />
      </Field>

      <Field label={t.kind} htmlFor="lead-kind">
        <Select
          id="lead-kind"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          options={LEAD_KINDS.map((k) => ({
            value: k,
            label: UI.leads.kindLabels[k],
          }))}
        />
      </Field>

      <Field label={t.typePersonne} htmlFor="lead-type-personne">
        <Select
          id="lead-type-personne"
          value={typePersonne}
          onChange={(e) => setTypePersonne(e.target.value)}
          options={LEAD_TYPE_PERSONNE.map((tp) => ({
            value: tp,
            label: UI.leads.typePersonneLabels[tp],
          }))}
        />
      </Field>

      <Field label={t.budgetMin} htmlFor="lead-budget-min">
        <MoneyInput
          id="lead-budget-min"
          min={FORM_LIMITS.priceMin}
          value={budgetMin}
          onChange={(e) => setBudgetMin(e.target.value)}
        />
      </Field>

      <Field label={t.budgetMax} htmlFor="lead-budget-max">
        <MoneyInput
          id="lead-budget-max"
          min={0}
          value={budgetMax}
          onChange={(e) => setBudgetMax(e.target.value)}
        />
      </Field>

      {error && <p className="ct-error">{error}</p>}

      <div className="crm-form-actions">
        <button className="ct-seg-btn primary" type="submit" disabled={loading}>
          {t.save}
        </button>
        {onClose && (
          <button className="ct-seg-btn" type="button" onClick={onClose}>
            {t.cancel}
          </button>
        )}
      </div>
    </CockpitForm>
  );
}

/** Bouton "Nouveau lead" + modale de création (pattern .crm-form-overlay). */
export default function LeadFormModal({ cta }: { cta: string }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button className="ct-seg-btn primary" onClick={() => setOpen(true)}>
        {cta}
      </button>
    );
  }

  return (
    <AccessibleModal title={UI.leads.form.title} onClose={() => setOpen(false)}>
      <LeadForm onClose={() => setOpen(false)} />
    </AccessibleModal>
  );
}
