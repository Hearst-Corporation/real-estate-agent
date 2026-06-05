"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UI } from "@/lib/ui-strings";

type LeadFormProps =
  | {
      mode: "create";
      cta: string;
    }
  | {
      mode: "edit";
      id: string;
      initial: {
        full_name: string;
        email?: string | null;
        phone?: string | null;
        source?: string | null;
        kind?: string | null;
        type_personne?: string | null;
        budget_min?: number | null;
        budget_max?: number | null;
        status?: string | null;
      };
      onClose?: () => void;
    };

export default function LeadForm(props: LeadFormProps) {
  const t = UI.leads.form;
  const router = useRouter();

  const initial =
    props.mode === "edit"
      ? props.initial
      : {
          full_name: "",
          email: "",
          phone: "",
          source: "",
          kind: "acheteur",
          type_personne: "particulier",
          budget_min: "",
          budget_max: "",
          status: "nouveau",
        };

  const [open, setOpen] = useState(props.mode === "edit");
  const [fullName, setFullName] = useState(initial.full_name ?? "");
  const [email, setEmail] = useState(initial.email ?? "");
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [source, setSource] = useState(initial.source ?? "");
  const [kind, setKind] = useState(initial.kind ?? "acheteur");
  const [typePersonne, setTypePersonne] = useState(
    ("type_personne" in initial && initial.type_personne) || "particulier"
  );
  const [budgetMin, setBudgetMin] = useState(
    initial.budget_min != null ? String(initial.budget_min) : ""
  );
  const [budgetMax, setBudgetMax] = useState(
    initial.budget_max != null ? String(initial.budget_max) : ""
  );
  const [status, setStatus] = useState(
    "status" in initial && initial.status ? initial.status : "nouveau"
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) {
      setError(t.fullName + " requis");
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

    const url = props.mode === "edit" ? `/api/leads/${props.id}` : "/api/leads";
    const method = props.mode === "edit" ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setLoading(false);

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError((json as { error?: string }).error ?? "error");
      return;
    }

    if (props.mode === "create") {
      setOpen(false);
      setFullName("");
      setEmail("");
      setPhone("");
      setSource("");
      setKind("acheteur");
      setTypePersonne("particulier");
      setBudgetMin("");
      setBudgetMax("");
      setStatus("nouveau");
    } else {
      props.onClose?.();
    }

    router.refresh();
  }

  if (props.mode === "create" && !open) {
    return (
      <button className="ct-seg-btn primary" onClick={() => setOpen(true)}>
        {props.cta}
      </button>
    );
  }

  return (
    <form className="ct-form" onSubmit={handleSubmit}>
      <p className="ct-card-title">{t.title}</p>

      <label className="crm-form-field">
        <span className="ct-eyebrow">{t.fullName}</span>
        <input
          className="ct-input"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
        />
      </label>

      <label className="crm-form-field">
        <span className="ct-eyebrow">{t.email}</span>
        <input
          className="ct-input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>

      <label className="crm-form-field">
        <span className="ct-eyebrow">{t.phone}</span>
        <input
          className="ct-input"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </label>

      <label className="crm-form-field">
        <span className="ct-eyebrow">{t.source}</span>
        <input
          className="ct-input"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        />
      </label>

      <label className="crm-form-field">
        <span className="ct-eyebrow">{t.kind}</span>
        <select
          className="ct-input"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="acheteur">{UI.leads.kindLabels.acheteur}</option>
          <option value="vendeur">{UI.leads.kindLabels.vendeur}</option>
        </select>
      </label>

      <label className="crm-form-field">
        <span className="ct-eyebrow">{t.typePersonne}</span>
        <select
          className="ct-input"
          value={typePersonne}
          onChange={(e) => setTypePersonne(e.target.value)}
        >
          <option value="particulier">{UI.leads.typePersonneLabels.particulier}</option>
          <option value="professionnel">{UI.leads.typePersonneLabels.professionnel}</option>
          <option value="societe">{UI.leads.typePersonneLabels.societe}</option>
          <option value="sci">{UI.leads.typePersonneLabels.sci}</option>
          <option value="agence">{UI.leads.typePersonneLabels.agence}</option>
        </select>
      </label>

      <label className="crm-form-field">
        <span className="ct-eyebrow">{t.budgetMin}</span>
        <input
          className="ct-input"
          type="number"
          min={0}
          value={budgetMin}
          onChange={(e) => setBudgetMin(e.target.value)}
        />
      </label>

      <label className="crm-form-field">
        <span className="ct-eyebrow">{t.budgetMax}</span>
        <input
          className="ct-input"
          type="number"
          min={0}
          value={budgetMax}
          onChange={(e) => setBudgetMax(e.target.value)}
        />
      </label>

      {error && <p className="ct-placeholder" style={{ color: "var(--ct-danger, red)" }}>{error}</p>}

      <div className="crm-form-actions">
        <button className="ct-seg-btn primary" type="submit" disabled={loading}>
          {t.save}
        </button>
        <button
          className="ct-seg-btn"
          type="button"
          onClick={() => {
            if (props.mode === "edit") props.onClose?.();
            else setOpen(false);
          }}
        >
          {t.cancel}
        </button>
      </div>
    </form>
  );
}
