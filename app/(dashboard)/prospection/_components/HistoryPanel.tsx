"use client";

import { useEffect, useState } from "react";
import { ClockIcon } from "@heroicons/react/24/outline";
import { UI } from "@/lib/ui-strings";
import { Badge } from "@/components/ui/badge";
import { Subheading } from "@/components/ui/heading";
import { Text, Strong } from "@/components/ui/text";
import { signalOutcome, type DbSignal } from "@/lib/prospection/feedback";
import type { Critere, HistoryData, PropositionRow, ContactAttemptRow } from "./types";

const t = UI.prospection;

// ── Libellés / couleurs des signaux de proposition ──
function outcomeLabel(signal: string): string {
  const s = signalOutcome(signal as DbSignal);
  return s === "retenue"
    ? t.historyRetenue
    : s === "refusee"
      ? t.historyRefusee
      : s === "contactee"
        ? t.historyContactee
        : t.historyVisitee;
}
function outcomeColor(signal: string): "indigo" | "zinc" | "amber" {
  return signal === "like" ? "indigo" : signal === "dislike" ? "amber" : "zinc";
}

// ── Libellés / couleurs des statuts de tentative de contact ──
function attemptLabel(statut: string): string {
  switch (statut) {
    case "draft":
      return t.historyContactDraft;
    case "approved":
      return t.historyContactApproved;
    case "sent":
      return t.historyContactSent;
    case "failed":
      return t.historyContactFailed;
    case "opted_out":
      return t.historyContactOptedOut;
    case "replied":
      return t.historyContactReplied;
    default:
      return statut;
  }
}
function attemptColor(statut: string): "indigo" | "zinc" | "amber" {
  return statut === "sent" || statut === "replied" ? "indigo" : statut === "failed" || statut === "opted_out" ? "amber" : "zinc";
}

function priceLabel(prix: number | null | undefined): string | null {
  return prix != null ? `${Math.round(prix / 1000)}k€` : null;
}

/** Ligne de proposition (feedback). */
function PropRow({ p }: { p: PropositionRow }) {
  const meta = [p.annonce?.ville, priceLabel(p.annonce?.prix), p.score_match != null ? t.historyScore(p.score_match) : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2.5">
      <div className="min-w-0">
        <Text className="truncate">{p.annonce?.titre ?? "—"}</Text>
        {meta && <span className="text-xs text-zinc-500 dark:text-zinc-400">{meta}</span>}
      </div>
      <Badge color={outcomeColor(p.signal)}>{outcomeLabel(p.signal)}</Badge>
    </li>
  );
}

/**
 * Historique des propositions par acquéreur (LIVE). Regroupe les signaux
 * (prosp_match_feedback) par critère → acquéreur. Ajoute les tentatives de
 * contact réelles (prosp_contact_attempts) — un « brouillon » n'est jamais
 * présenté comme un envoi réalisé.
 */
export function HistoryPanel({ criteres }: { criteres: Critere[] }) {
  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/prospection/history");
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error ?? `Erreur HTTP ${res.status}`);
          return;
        }
        setData(json.data ?? { propositions: [], contactAttempts: [] });
      } catch {
        if (!cancelled) setError(t.historyLoadError);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12">
        <span className="size-4 animate-spin rounded-full border-2 border-accent-500 border-t-transparent dark:border-accent-400" aria-hidden="true" />
        <Text>{t.loading}</Text>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 p-4">
        <Badge color="red">{UI.common.error}</Badge>
        <Text>{error}</Text>
      </div>
    );
  }

  const propositions = data?.propositions ?? [];
  const attempts = data?.contactAttempts ?? [];

  if (propositions.length === 0 && attempts.length === 0) {
    return (
      <div className="surface flex flex-col items-center gap-3 px-6 py-12 text-center">
        <ClockIcon aria-hidden="true" className="size-10 text-zinc-400 dark:text-zinc-500" />
        <Strong>{t.historyEmpty}</Strong>
        <Text className="max-w-md">{t.historyEmptyHint}</Text>
      </div>
    );
  }

  // Nom d'acquéreur par critere_id (via la liste des critères chargée par la page).
  const nameByCritere = new Map(criteres.map((c) => [c.id, c.nom]));

  // Grouper les propositions par critère.
  const byCritere = new Map<string, PropositionRow[]>();
  const orphans: PropositionRow[] = [];
  for (const p of propositions) {
    if (p.critere_id && nameByCritere.has(p.critere_id)) {
      const arr = byCritere.get(p.critere_id) ?? [];
      arr.push(p);
      byCritere.set(p.critere_id, arr);
    } else {
      orphans.push(p);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Subheading>{t.historyTitle}</Subheading>
        <Text className="mt-1">{t.historyHint}</Text>
      </div>

      {[...byCritere.entries()].map(([critereId, props]) => {
        const retenues = props.filter((p) => p.signal === "like").length;
        const refusees = props.filter((p) => p.signal === "dislike").length;
        return (
          <div key={critereId} className="surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-950/8 pb-3 dark:border-white/10">
              <Strong className="text-base">{nameByCritere.get(critereId)}</Strong>
              <div className="flex items-center gap-1.5">
                {retenues > 0 && <Badge color="indigo">{t.historyCountRetenues(retenues)}</Badge>}
                {refusees > 0 && <Badge color="amber">{t.historyCountRefusees(refusees)}</Badge>}
              </div>
            </div>
            <ul className="mt-1 divide-y divide-zinc-950/5 dark:divide-white/5">
              {props.map((p) => (
                <PropRow key={p.id} p={p} />
              ))}
            </ul>
          </div>
        );
      })}

      {orphans.length > 0 && (
        <div className="surface p-5">
          <Strong className="text-base">{t.acquereurNoLead}</Strong>
          <ul className="mt-2 divide-y divide-zinc-950/5 dark:divide-white/5">
            {orphans.map((p) => (
              <PropRow key={p.id} p={p} />
            ))}
          </ul>
        </div>
      )}

      {attempts.length > 0 && <ContactAttempts attempts={attempts} />}
    </div>
  );
}

function ContactAttempts({ attempts }: { attempts: ContactAttemptRow[] }) {
  return (
    <div className="surface p-5">
      <Subheading>{t.historyContactAttempts}</Subheading>
      <ul className="mt-2 divide-y divide-zinc-950/5 dark:divide-white/5">
        {attempts.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <Text>{a.canal}</Text>
            <Badge color={attemptColor(a.statut)}>{attemptLabel(a.statut)}</Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}
