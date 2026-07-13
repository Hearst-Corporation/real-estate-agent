"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useOpenFromQuery } from "@/lib/hooks/useOpenFromQuery";
import { Dialog, DialogTitle, DialogBody } from "@/components/ui/dialog";
import { Fieldset, FieldGroup, Field, Label, ErrorMessage } from "@/components/ui/fieldset";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
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
    <form onSubmit={handleSubmit}>
      <Fieldset>
        <FieldGroup>
          <Field>
            <Label>{t.fullName}</Label>
            <Input
              name="full_name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </Field>

          <Field>
            <Label>{t.email}</Label>
            <Input
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>

          <Field>
            <Label>{t.phone}</Label>
            <Input name="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>

          <Field>
            <Label>{t.source}</Label>
            <Input name="source" value={source} onChange={(e) => setSource(e.target.value)} />
          </Field>

          <Field>
            <Label>{t.kind}</Label>
            <Select name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
              {LEAD_KINDS.map((k) => (
                <option key={k} value={k}>
                  {UI.leads.kindLabels[k]}
                </option>
              ))}
            </Select>
          </Field>

          <Field>
            <Label>{t.typePersonne}</Label>
            <Select
              name="type_personne"
              value={typePersonne}
              onChange={(e) => setTypePersonne(e.target.value)}
            >
              {LEAD_TYPE_PERSONNE.map((tp) => (
                <option key={tp} value={tp}>
                  {UI.leads.typePersonneLabels[tp]}
                </option>
              ))}
            </Select>
          </Field>

          <Field>
            <Label>{t.budgetMin}</Label>
            <Input
              name="budget_min"
              type="number"
              min={FORM_LIMITS.priceMin}
              value={budgetMin}
              onChange={(e) => setBudgetMin(e.target.value)}
            />
          </Field>

          <Field>
            <Label>{t.budgetMax}</Label>
            <Input
              name="budget_max"
              type="number"
              min={0}
              value={budgetMax}
              onChange={(e) => setBudgetMax(e.target.value)}
            />
          </Field>

          {error && <ErrorMessage>{error}</ErrorMessage>}

          <div className="flex items-center gap-3 pt-2">
            <Button color="indigo" type="submit" disabled={loading}>
              {t.save}
            </Button>
            {onClose && (
              <Button plain type="button" onClick={onClose}>
                {t.cancel}
              </Button>
            )}
          </div>
        </FieldGroup>
      </Fieldset>
    </form>
  );
}

/** Bouton "Nouveau lead" + modale de création. */
export default function LeadFormModal({ cta }: { cta: string }) {
  const [open, setOpen] = useState(false);
  useOpenFromQuery("new", useCallback(() => setOpen(true), []));

  return (
    <>
      <Button color="indigo" type="button" onClick={() => setOpen(true)}>
        {cta}
      </Button>
      <Dialog open={open} onClose={setOpen}>
        <DialogTitle>{UI.leads.form.title}</DialogTitle>
        <DialogBody>
          <LeadForm onClose={() => setOpen(false)} />
        </DialogBody>
      </Dialog>
    </>
  );
}
