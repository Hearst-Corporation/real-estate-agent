"use client";

import { useState } from "react";
import { UI } from "@/lib/ui-strings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Label, FieldGroup } from "@/components/ui/fieldset";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Subheading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
import { useTourActive } from "@/components/onboarding";
import type { Critere, Urgence, AlerteFrequence } from "./types";

const t = UI.prospection;

const URGENCES: Urgence[] = ["faible", "normale", "haute", "urgente"];
const FREQUENCES: AlerteFrequence[] = ["immediate", "quotidien", "hebdo", "off"];

function urgenceOptLabel(u: Urgence): string {
  return u === "faible" ? t.urgenceFaible : u === "normale" ? t.urgenceNormale : u === "haute" ? t.urgenceHaute : t.urgenceUrgente;
}
function freqOptLabel(f: AlerteFrequence): string {
  return f === "immediate" ? t.freqImmediate : f === "quotidien" ? t.freqQuotidien : f === "hebdo" ? t.freqHebdo : t.freqOff;
}

/** Sérialise criteres_secondaires (record) → texte « clé, clé » pour l'édition. */
function secondairesToText(rec: Record<string, string | number | boolean> | null | undefined): string {
  if (!rec) return "";
  return Object.keys(rec).join(", ");
}

/**
 * Formulaire de critère (profil de recherche) — création ET édition, enrichi des
 * champs LIVE 0043 : urgence, exclusions, souhaits secondaires, fréquence d'alerte.
 * Persiste en LIVE via POST (création) ou PATCH (édition) sur /api/prospection/criteres.
 */
export function CritereForm({
  critere,
  onSaved,
  onCancel,
}: {
  /** Présent = édition ; absent = création. */
  critere?: Critere;
  onSaved: () => void | Promise<void>; // strings-lint-allow
  onCancel: () => void;
}) {
  const isEdit = Boolean(critere);
  const [nom, setNom] = useState(critere?.nom ?? "");
  const [zones, setZones] = useState(
    Array.isArray(critere?.zones)
      ? critere!.zones
          .map((z) => (typeof z === "string" ? z : (z as { label?: string }).label ?? ""))
          .filter(Boolean)
          .join(", ")
      : "",
  );
  const [budgetMin, setBudgetMin] = useState(critere?.budget_min != null ? String(critere.budget_min) : "");
  const [budgetMax, setBudgetMax] = useState(critere?.budget_max != null ? String(critere.budget_max) : "");
  const [surfaceMin, setSurfaceMin] = useState(critere?.surface_min != null ? String(critere.surface_min) : "");
  const [piecesMin, setPiecesMin] = useState(critere?.pieces_min != null ? String(critere.pieces_min) : "");
  const [urgence, setUrgence] = useState<Urgence | "">(critere?.urgence ?? "");
  const [exclusions, setExclusions] = useState((critere?.exclusions ?? []).join(", "));
  const [secondaires, setSecondaires] = useState(secondairesToText(critere?.criteres_secondaires));
  const [frequence, setFrequence] = useState<AlerteFrequence>(critere?.alerte_frequence ?? "off");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tourActive = useTourActive();

  async function save() {
    // LOT 10 — la visite guidée montre le formulaire, elle n'enregistre jamais
    // de critère à la place de l'agent.
    if (tourActive) return;
    if (!nom.trim()) {
      setError(t.critereNameRequired);
      return;
    }
    setSaving(true);
    setError(null);
    const exclusionsArr = exclusions.split(",").map((s) => s.trim()).filter(Boolean);
    // Souhaits secondaires : liste de clés → record { clé: true } (souhait présent).
    const secondairesRec: Record<string, boolean> = {};
    for (const key of secondaires.split(",").map((s) => s.trim()).filter(Boolean)) {
      secondairesRec[key] = true;
    }
    const payload: Record<string, unknown> = {
      nom: nom.trim(),
      zones: zones.split(",").map((z) => z.trim()).filter(Boolean),
      budget_min: budgetMin ? Number(budgetMin) : null,
      budget_max: budgetMax ? Number(budgetMax) : null,
      surface_min: surfaceMin ? Number(surfaceMin) : null,
      pieces_min: piecesMin ? Number(piecesMin) : null,
      urgence: urgence || null,
      exclusions: exclusionsArr,
      criteres_secondaires: secondairesRec,
      alerte_frequence: frequence,
    };
    try {
      const res = await fetch("/api/prospection/criteres", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEdit ? { id: critere!.id, ...payload } : payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.detail ?? json.error ?? `Erreur HTTP ${res.status}`);
        return;
      }
      await onSaved();
    } catch {
      setError(isEdit ? t.updateError : t.saveError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="surface flex flex-col gap-5 p-5">
      <FieldGroup>
        <Field>
          <Label>{t.critereNamePlaceholder}</Label>
          <Input value={nom} onChange={(e) => setNom(e.target.value)} placeholder={t.critereNamePlaceholder} />
        </Field>
      </FieldGroup>

      {/* ── Critères essentiels (bloquants) ── */}
      <section>
        <Subheading>{t.formSectionEssentiels}</Subheading>
        <FieldGroup className="mt-2">
          <Field>
            <Label>{t.critereZonesPlaceholder}</Label>
            <Input value={zones} onChange={(e) => setZones(e.target.value)} placeholder={t.critereZonesPlaceholder} />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <Label>{t.formBudgetMin}</Label>
              <Input type="number" value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} />
            </Field>
            <Field>
              <Label>{t.budgetMaxPlaceholder}</Label>
              <Input type="number" value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} />
            </Field>
            <Field>
              <Label>{t.surfaceMinPlaceholder}</Label>
              <Input type="number" value={surfaceMin} onChange={(e) => setSurfaceMin(e.target.value)} />
            </Field>
            <Field>
              <Label>{t.formPiecesMin}</Label>
              <Input type="number" value={piecesMin} onChange={(e) => setPiecesMin(e.target.value)} />
            </Field>
          </div>
          <Field>
            <Label>{t.formUrgence}</Label>
            <Select value={urgence} onChange={(e) => setUrgence(e.target.value as Urgence | "")}>
              <option value="">{t.urgenceNone}</option>
              {URGENCES.map((u) => (
                <option key={u} value={u}>
                  {urgenceOptLabel(u)}
                </option>
              ))}
            </Select>
          </Field>
        </FieldGroup>
      </section>

      {/* ── Souhaits secondaires (non bloquants) ── */}
      <section>
        <Subheading>{t.formSectionSecondaires}</Subheading>
        <Field className="mt-2">
          <Label>{t.profilSecondaires}</Label>
          <Input value={secondaires} onChange={(e) => setSecondaires(e.target.value)} placeholder={t.formSecondairesPlaceholder} />
        </Field>
        <Text className="mt-1.5">{t.formSecondairesHint}</Text>
      </section>

      {/* ── Exclusions (rejets) ── */}
      <section>
        <Subheading>{t.formSectionExclusions}</Subheading>
        <Field className="mt-2">
          <Label>{t.profilExclusions}</Label>
          <Input value={exclusions} onChange={(e) => setExclusions(e.target.value)} placeholder={t.formExclusionsPlaceholder} />
        </Field>
        <Text className="mt-1.5">{t.formExclusionsHint}</Text>
      </section>

      {/* ── Préférences d'alerte ── */}
      <section>
        <Subheading>{t.formSectionAlerte}</Subheading>
        <Field className="mt-2 max-w-xs">
          <Label>{t.formAlerteFrequence}</Label>
          <Select value={frequence} onChange={(e) => setFrequence(e.target.value as AlerteFrequence)}>
            {FREQUENCES.map((f) => (
              <option key={f} value={f}>
                {freqOptLabel(f)}
              </option>
            ))}
          </Select>
        </Field>
      </section>

      {error && (
        <div className="flex items-center gap-2">
          <Badge color="red">{UI.common.error}</Badge>
          <Text>{error}</Text>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button color="indigo" className="!text-zinc-950" onClick={save} disabled={saving}>
          {saving ? t.saving : t.save}
        </Button>
        <Button plain onClick={onCancel} disabled={saving}>
          {t.detailClose}
        </Button>
      </div>
    </div>
  );
}
