"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogTitle, DialogBody } from "@/components/ui/dialog";
import { Fieldset, FieldGroup, Field, Label, ErrorMessage } from "@/components/ui/fieldset";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  VISIT_REPORT_INTEREST,
  VISIT_REPORT_OUTCOME,
  VISIT_REPORT_INTEREST_LABELS,
  VISIT_REPORT_OUTCOME_LABELS,
  VISIT_REPORT_PRICE_MAX,
  VISIT_REPORT_TEXT_MAX,
  type VisitReportInterest,
  type VisitReportOutcome,
  type VisitReportRow,
} from "@/lib/visit-report/schema";

const INTEREST_TONE: Record<VisitReportInterest, "lime" | "amber" | "zinc" | "red"> = {
  tres_interesse: "lime",
  interesse: "lime",
  mitige: "amber",
  peu_interesse: "zinc",
  non_interesse: "red",
};

const OUTCOME_TONE: Record<VisitReportOutcome, "lime" | "amber" | "zinc" | "red"> = {
  offre_probable: "lime",
  a_relancer: "amber",
  reflexion: "zinc",
  abandon: "red",
};

/** Formatte un prix en euros sans magic number de locale en dur ailleurs. */
function euros(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

/** Carte de lecture du CR (réutilisable timeline / tableau proprio). */
export function VisitReportCard({ report }: { report: VisitReportRow }) {
  return (
    <div className="surface flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge color={INTEREST_TONE[report.interest]}>
          {VISIT_REPORT_INTEREST_LABELS[report.interest]}
        </Badge>
        <Badge color={OUTCOME_TONE[report.outcome]}>
          {VISIT_REPORT_OUTCOME_LABELS[report.outcome]}
        </Badge>
        {report.price_discussed != null && (
          <Badge color="zinc">Prix évoqué&nbsp;: {euros(report.price_discussed)}</Badge>
        )}
      </div>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {report.positives && (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
              Points positifs
            </dt>
            <dd className="mt-1 whitespace-pre-line text-sm text-zinc-950 dark:text-white">
              {report.positives}
            </dd>
          </div>
        )}
        {report.objections && (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
              Objections / freins
            </dt>
            <dd className="mt-1 whitespace-pre-line text-sm text-zinc-950 dark:text-white">
              {report.objections}
            </dd>
          </div>
        )}
        {report.next_action && (
          <div className="sm:col-span-2">
            <dt className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
              Prochaine action
            </dt>
            <dd className="mt-1 whitespace-pre-line text-sm text-zinc-950 dark:text-white">
              {report.next_action}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}

type Props = {
  visitId: string;
  /** CR déjà chargé côté serveur (édition), ou null (création). */
  initial?: VisitReportRow | null;
  cta?: string;
};

export default function VisitReportForm({ visitId, initial = null, cta }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [interest, setInterest] = useState<VisitReportInterest | "">(
    initial?.interest ?? "",
  );
  const [outcome, setOutcome] = useState<VisitReportOutcome | "">(initial?.outcome ?? "");
  const [positives, setPositives] = useState(initial?.positives ?? "");
  const [objections, setObjections] = useState(initial?.objections ?? "");
  const [nextAction, setNextAction] = useState(initial?.next_action ?? "");
  const [price, setPrice] = useState<string>(
    initial?.price_discussed != null ? String(initial.price_discussed) : "",
  );

  // NB: le composant est remonté (key basée sur updated_at côté page) quand le CR
  // serveur change après router.refresh() → l'état initial se resynchronise sans
  // effect (pattern React recommandé : reset via key, pas de setState en effect).

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!interest || !outcome) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/visits/${visitId}/report`, {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interest,
          outcome,
          positives: positives.trim() || undefined,
          objections: objections.trim() || undefined,
          next_action: nextAction.trim() || undefined,
          price_discussed: price.trim() ? Number(price) : null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(
          d.error === "unavailable"
            ? "Compte-rendu indisponible (migration 0051 non appliquée)."
            : d.error === "not_found"
              ? "Visite introuvable."
              : "Échec de l'enregistrement.",
        );
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Échec de l'enregistrement.");
    } finally {
      setLoading(false);
    }
  }

  const label = cta ?? (initial ? "Modifier le compte-rendu" : "Rédiger le compte-rendu");

  return (
    <>
      <Button color="indigo" type="button" onClick={() => setOpen(true)}>
        {label}
      </Button>

      <Dialog open={open} onClose={setOpen} size="2xl">
        <DialogTitle>Compte-rendu de visite</DialogTitle>
        <DialogBody>
          <form onSubmit={handleSubmit}>
            <Fieldset>
              <FieldGroup>
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  <Field>
                    <Label>Niveau d&apos;intérêt de l&apos;acquéreur</Label>
                    <Select
                      name="interest"
                      value={interest}
                      onChange={(e) => setInterest(e.target.value as VisitReportInterest)}
                      required
                    >
                      <option value="">—</option>
                      {VISIT_REPORT_INTEREST.map((v) => (
                        <option key={v} value={v}>
                          {VISIT_REPORT_INTEREST_LABELS[v]}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Field>
                    <Label>Probabilité de suite</Label>
                    <Select
                      name="outcome"
                      value={outcome}
                      onChange={(e) => setOutcome(e.target.value as VisitReportOutcome)}
                      required
                    >
                      <option value="">—</option>
                      {VISIT_REPORT_OUTCOME.map((v) => (
                        <option key={v} value={v}>
                          {VISIT_REPORT_OUTCOME_LABELS[v]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>

                <Field>
                  <Label>Points positifs</Label>
                  <Textarea
                    name="positives"
                    rows={2}
                    maxLength={VISIT_REPORT_TEXT_MAX}
                    value={positives}
                    onChange={(e) => setPositives(e.target.value)}
                  />
                </Field>

                <Field>
                  <Label>Objections / freins</Label>
                  <Textarea
                    name="objections"
                    rows={2}
                    maxLength={VISIT_REPORT_TEXT_MAX}
                    value={objections}
                    onChange={(e) => setObjections(e.target.value)}
                  />
                </Field>

                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  <Field>
                    <Label>Prix évoqué (€)</Label>
                    <Input
                      name="price_discussed"
                      type="number"
                      min={0}
                      max={VISIT_REPORT_PRICE_MAX}
                      step={1000}
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                    />
                  </Field>

                  <Field>
                    <Label>Prochaine action recommandée</Label>
                    <Input
                      name="next_action"
                      type="text"
                      maxLength={VISIT_REPORT_TEXT_MAX}
                      value={nextAction}
                      onChange={(e) => setNextAction(e.target.value)}
                    />
                  </Field>
                </div>

                {error && <ErrorMessage>{error}</ErrorMessage>}

                <div className="flex items-center gap-3 pt-2">
                  <Button
                    color="indigo"
                    type="submit"
                    disabled={loading || !interest || !outcome}
                  >
                    {loading ? "Enregistrement…" : "Enregistrer"}
                  </Button>
                  <Button plain type="button" onClick={() => setOpen(false)}>
                    Annuler
                  </Button>
                </div>
              </FieldGroup>
            </Fieldset>
          </form>
        </DialogBody>
      </Dialog>
    </>
  );
}
