"use client";

import { useState } from "react";
import { Dialog, DialogTitle, DialogBody } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type {
  CriteriaSuggestion,
  DerivedSignals,
  RelanceProposal,
} from "@/lib/post-visit/types";
import type { OffmarketMatch } from "@/lib/offmarket/matching";
import {
  VISIT_REPORT_INTEREST_LABELS,
  VISIT_REPORT_OUTCOME_LABELS,
} from "@/lib/visit-report/schema";

/**
 * Boucle intelligente après visite (W3) — composant ADDITIF.
 *
 * Affiche les signaux dérivés du CR, les SUGGESTIONS de critères (proposées,
 * l'humain applique), les relances proposées et le recalcul de matchs (moteur
 * existant). « Générer » persiste signaux + relances via POST /api/post-visit.
 * « Appliquer » d'une suggestion passe par la route EXISTANTE des critères.
 *
 * États : idle / loading / result / error, dégradation UNAVAILABLE honnête.
 */

type LoopResult = {
  signals: DerivedSignals;
  critereId: string | null;
  suggestions: CriteriaSuggestion[];
  relances: RelanceProposal[] | { tasksCreated?: number; draftsCreated?: number; tasks: string; drafts: string };
  matches: OffmarketMatch[];
  matchesStatus: string;
  persisted: boolean;
};

function euros(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

const FIELD_LABELS: Record<string, string> = {
  budget_max: "Budget max",
  budget_min: "Budget min",
  surface_min: "Surface min",
  pieces_min: "Pièces min",
};

function errorLabel(code: string): string {
  switch (code) {
    case "unavailable":
      return "Boucle indisponible (migrations 0051/0054 non appliquées).";
    case "no_report":
      return "Aucun compte-rendu : rédigez-le d'abord.";
    case "not_found":
      return "Visite introuvable.";
    default:
      return "Échec du traitement.";
  }
}

export default function PostVisitLoop({
  visitId,
  cta = "Boucle après visite",
}: {
  visitId: string;
  cta?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LoopResult | null>(null);
  const [applied, setApplied] = useState<Record<string, "applying" | "done" | "error">>({});

  async function run() {
    setState("loading");
    setError(null);
    try {
      const res = await fetch(`/api/post-visit/${visitId}`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(errorLabel(data.error ?? "error"));
        setState("idle");
        return;
      }
      setResult(data as LoopResult);
      setState("done");
    } catch {
      setError(errorLabel("error"));
      setState("idle");
    }
  }

  /** Applique UNE suggestion via la route EXISTANTE des critères (l'humain décide). */
  async function applySuggestion(s: CriteriaSuggestion, critereId: string) {
    const key = s.field;
    setApplied((m) => ({ ...m, [key]: "applying" }));
    try {
      const res = await fetch("/api/prospection/criteres", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: critereId, [s.field]: s.suggested }),
      });
      setApplied((m) => ({ ...m, [key]: res.ok ? "done" : "error" }));
    } catch {
      setApplied((m) => ({ ...m, [key]: "error" }));
    }
  }

  const relancesSummary =
    result && !Array.isArray(result.relances)
      ? result.relances
      : null;

  return (
    <>
      <Button plain type="button" onClick={() => setOpen(true)}>
        {cta}
      </Button>

      <Dialog open={open} onClose={setOpen} size="2xl">
        <DialogTitle>Boucle intelligente après visite</DialogTitle>
        <DialogBody>
          <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">
          Met à jour les signaux, propose des ajustements, recalcule les matchs et crée les relances.
        </p>
        <Button color="indigo" type="button" onClick={run} disabled={state === "loading"}>
          {state === "loading" ? "Traitement…" : result ? "Relancer" : "Générer"}
        </Button>
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      {result && (
        <div className="flex flex-col gap-6">
          {/* Signaux persistés */}
          <section>
            <div className="flex flex-wrap items-center gap-2">
              <Badge color="lime">Signaux enregistrés</Badge>
              <Badge color="zinc">{VISIT_REPORT_INTEREST_LABELS[result.signals.interest]}</Badge>
              <Badge color="zinc">{VISIT_REPORT_OUTCOME_LABELS[result.signals.outcome]}</Badge>
              {result.signals.price_discussed != null && (
                <Badge color="zinc">Prix évoqué&nbsp;: {euros(result.signals.price_discussed)}</Badge>
              )}
            </div>
          </section>

          {/* Suggestions de critères — proposées, l'humain applique */}
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
              Suggestions d&apos;ajustement (à valider)
            </h4>
            {result.suggestions.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">
                Aucun ajustement suggéré à partir de ce compte-rendu.
              </p>
            ) : (
              <ul className="mt-2 flex flex-col gap-3">
                {result.suggestions.map((s) => {
                  const st = applied[s.field];
                  return (
                    <li
                      key={s.field}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-950/10 p-3 dark:border-white/10"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-950 dark:text-white">
                          {FIELD_LABELS[s.field] ?? s.field} :{" "}
                          {s.current != null ? euros(s.current) : "—"} → {euros(s.suggested)}
                        </p>
                        <p className="text-sm text-zinc-500">{s.reason}</p>
                      </div>
                      {result.critereId ? (
                        st === "done" ? (
                          <Badge color="lime">Appliqué</Badge>
                        ) : st === "error" ? (
                          <Badge color="red">Échec</Badge>
                        ) : (
                          <Button
                            plain
                            type="button"
                            disabled={st === "applying"}
                            onClick={() => applySuggestion(s, result.critereId as string)}
                          >
                            {st === "applying" ? "Application…" : "Appliquer"}
                          </Button>
                        )
                      ) : (
                        <Badge color="zinc">Aucun critère lié</Badge>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Relances créées */}
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
              Relances
            </h4>
            {relancesSummary ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge color={relancesSummary.tasks === "created" ? "lime" : "zinc"}>
                  Tâches&nbsp;: {relancesSummary.tasks === "created"
                    ? `${relancesSummary.tasksCreated ?? 0} créée(s)`
                    : relancesSummary.tasks === "unavailable"
                      ? "indisponible"
                      : relancesSummary.tasks === "none"
                        ? "aucune"
                        : "erreur"}
                </Badge>
                <Badge color={relancesSummary.drafts === "created" ? "lime" : "zinc"}>
                  Brouillons&nbsp;: {relancesSummary.drafts === "created"
                    ? `${relancesSummary.draftsCreated ?? 0} (DRAFT)`
                    : relancesSummary.drafts === "unavailable"
                      ? "indisponible"
                      : relancesSummary.drafts === "none"
                        ? "aucun"
                        : "erreur"}
                </Badge>
              </div>
            ) : (
              <p className="mt-2 text-sm text-zinc-500">Aucune relance.</p>
            )}
          </section>

          {/* Matchs recalculés (moteur existant) */}
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
              Matchs recalculés
            </h4>
            {result.matchesStatus !== "live" ? (
              <p className="mt-2 text-sm text-zinc-500">
                {result.matchesStatus === "no_property"
                  ? "Aucun bien lié à cette visite."
                  : result.matchesStatus === "unavailable"
                    ? "Recalcul indisponible (schéma non appliqué)."
                    : "Aucun match."}
              </p>
            ) : result.matches.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">Aucun acquéreur ne matche ce bien.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-2">
                {result.matches.slice(0, 8).map((m) => (
                  <li
                    key={m.critereId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-950/10 p-2 dark:border-white/10"
                  >
                    <span className="text-sm text-zinc-950 dark:text-white">{m.critereNom}</span>
                    <Badge
                      color={
                        m.recommandation === "high_priority"
                          ? "lime"
                          : m.recommandation === "review"
                            ? "amber"
                            : "zinc"
                      }
                    >
                      {m.score}/100
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
          </div>
        </DialogBody>
      </Dialog>
    </>
  );
}
