"use client";

/**
 * /mandate-renewal — Renouvellement des mandats.
 *
 * Liste les mandats proches de l'expiration avec, pour chacun : résumé
 * d'activité, retours/objections, évolution marché et proposition de prochaine
 * action DÉTERMINISTE (renouveler / ajuster le prix / changer de stratégie).
 * Un bouton génère un BROUILLON propriétaire dans l'Outbox (DRAFT, HITL) — aucun
 * envoi. Chaque bien renvoie vers son tableau propriétaire existant.
 *
 * Tout vient de GPU1 (aucune donnée inventée) : liste vide, section absente ou
 * schéma manquant → état honnête (empty / UNAVAILABLE).
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarDaysIcon,
  ArrowTopRightOnSquareIcon,
  ArrowPathIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";
import { Heading } from "@/components/ui/heading";
import { Text, Strong } from "@/components/ui/text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { eur, dateFr } from "@/lib/crm/format";
import {
  RENEWAL_ACTION_LABELS,
  type MandateRenewalAnalysis,
  type RenewalAction,
} from "@/lib/mandate-renewal/aggregate";

// La forme renvoyée par l'API (aligne le sous-ensemble consommé ici).
interface RenewalItem {
  analysis: MandateRenewalAnalysis;
  propertyLabel: string;
  owner: { leadId: string | null; name: string | null; email: string | null; phone: string | null };
}

type LoadState =
  | { phase: "loading" }
  | { phase: "error" }
  | { phase: "ready"; items: RenewalItem[] };

/** Draft status par mandat (id → état du bouton). */
type DraftState =
  | { phase: "idle" }
  | { phase: "saving" }
  | { phase: "done" }
  | { phase: "unavailable" }
  | { phase: "error" };

function expiryBadge(jours: number): { color: "amber" | "zinc"; label: string } {
  if (jours < 0) return { color: "amber", label: `Expiré (${Math.abs(jours)} j)` };
  if (jours <= 7) return { color: "amber", label: `${jours} j restants` };
  return { color: "zinc", label: `${jours} j restants` };
}

function actionBadge(action: RenewalAction): "amber" | "zinc" {
  return action === "renew" ? "zinc" : "amber";
}

export default function MandateRenewalPage() {
  const [state, setState] = useState<LoadState>({ phase: "loading" });
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});

  const load = useCallback(async (): Promise<LoadState> => {
    try {
      const res = await fetch("/api/mandate-renewal", { cache: "no-store" });
      if (!res.ok) return { phase: "error" };
      const json = (await res.json()) as { items: RenewalItem[] };
      return { phase: "ready", items: json.items ?? [] };
    } catch {
      return { phase: "error" };
    }
  }, []);

  const refresh = useCallback(() => {
    setState({ phase: "loading" });
    void load().then(setState);
  }, [load]);

  // setState uniquement dans le callback async (jamais synchrone dans l'effet).
  useEffect(() => {
    let alive = true;
    void load().then((next) => {
      if (alive) setState(next);
    });
    return () => {
      alive = false;
    };
  }, [load]);

  const generateDraft = useCallback(async (mandateId: string) => {
    setDrafts((d) => ({ ...d, [mandateId]: { phase: "saving" } }));
    try {
      const res = await fetch("/api/mandate-renewal/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mandateId }),
      });
      if (res.status === 503) {
        setDrafts((d) => ({ ...d, [mandateId]: { phase: "unavailable" } }));
        return;
      }
      if (!res.ok) {
        setDrafts((d) => ({ ...d, [mandateId]: { phase: "error" } }));
        return;
      }
      setDrafts((d) => ({ ...d, [mandateId]: { phase: "done" } }));
    } catch {
      setDrafts((d) => ({ ...d, [mandateId]: { phase: "error" } }));
    }
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-500/10 text-accent-600 dark:text-accent-400">
            <CalendarDaysIcon className="size-5" aria-hidden />
          </span>
          <div>
            <Heading>Renouvellement des mandats</Heading>
            <Text className="text-zinc-500 dark:text-zinc-400">
              Mandats proches de l&apos;échéance, avec proposition d&apos;action et brouillon
              propriétaire.
            </Text>
          </div>
        </div>
        <Button outline onClick={refresh} disabled={state.phase === "loading"}>
          <ArrowPathIcon data-slot="icon" aria-hidden />
          Actualiser
        </Button>
      </header>

      {state.phase === "loading" && (
        <div className="surface rounded-xl p-6">
          <Text className="text-zinc-500">Chargement…</Text>
        </div>
      )}

      {state.phase === "error" && (
        <div className="surface rounded-xl border border-dashed border-zinc-950/10 p-6 dark:border-white/10">
          <Text className="text-zinc-500">
            Impossible de charger les mandats. Réessayez.
          </Text>
        </div>
      )}

      {state.phase === "ready" && state.items.length === 0 && (
        <div className="surface rounded-xl border border-dashed border-zinc-950/10 p-8 text-center dark:border-white/10">
          <Text className="text-zinc-500">
            Aucun mandat n&apos;arrive à échéance dans la fenêtre suivie.
          </Text>
        </div>
      )}

      {state.phase === "ready" &&
        state.items.map((item) => (
          <MandateCard
            key={item.analysis.mandateId}
            item={item}
            draft={drafts[item.analysis.mandateId] ?? { phase: "idle" }}
            onGenerate={() => void generateDraft(item.analysis.mandateId)}
          />
        ))}
    </div>
  );
}

function MandateCard({
  item,
  draft,
  onGenerate,
}: {
  item: RenewalItem;
  draft: DraftState;
  onGenerate: () => void;
}) {
  const { analysis, propertyLabel, owner } = item;
  const exp = expiryBadge(analysis.daysUntilExpiry);

  return (
    <section className="surface rounded-xl p-4 sm:p-6">
      {/* En-tête bien + échéance */}
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Strong>{propertyLabel}</Strong>
            <Badge color={exp.color}>{exp.label}</Badge>
          </div>
          <Text className="mt-0.5 text-zinc-500">
            Mandat {analysis.kind}
            {analysis.reference ? ` · ${analysis.reference}` : ""}
            {analysis.expiresAt ? ` · échéance ${dateFr(analysis.expiresAt)}` : ""}
          </Text>
        </div>
        {analysis.propertyId ? (
          <Link
            href={`/properties/${analysis.propertyId}/owner-report`}
            className="inline-flex items-center gap-1 text-sm font-medium text-accent-600 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 dark:text-accent-400"
          >
            Tableau propriétaire
            <ArrowTopRightOnSquareIcon className="size-4" aria-hidden />
          </Link>
        ) : null}
      </header>

      {/* Résumé chiffré */}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Visites" value={String(analysis.activity.visitsDone)} sub="réalisées" />
        <Stat label="À venir" value={String(analysis.activity.visitsUpcoming)} sub="programmées" />
        <Stat
          label="Retours +"
          value={String(analysis.feedback.positiveSignals)}
          sub="positifs"
        />
        <Stat
          label="Prix affiché"
          value={eur(analysis.market.askingPrice)}
          sub={
            analysis.market.available && analysis.market.latestMarketValue != null
              ? `marché ${eur(analysis.market.latestMarketValue)}`
              : "sans estimation"
          }
        />
      </dl>

      {/* Objections */}
      {analysis.feedback.objections.length > 0 && (
        <div className="mt-4">
          <Text className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Retours / objections
          </Text>
          <ul className="mt-1.5 flex flex-col gap-1">
            {analysis.feedback.objections.slice(0, 3).map((o) => (
              <li key={o.visitId} className="text-sm text-zinc-700 dark:text-zinc-300">
                • {o.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Proposition déterministe */}
      <div className="mt-4 rounded-lg bg-zinc-950/[0.03] p-4 dark:bg-white/[0.04]">
        <div className="flex flex-wrap items-center gap-2">
          <Text className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Proposition
          </Text>
          <Badge color={actionBadge(analysis.proposal.action)}>
            {RENEWAL_ACTION_LABELS[analysis.proposal.action]}
          </Badge>
          {analysis.proposal.suggestedPrice != null && (
            <Text className="text-sm text-zinc-600 dark:text-zinc-400">
              → {eur(analysis.proposal.suggestedPrice)}
            </Text>
          )}
        </div>
        <ul className="mt-2 flex flex-col gap-1">
          {analysis.proposal.reasons.map((r, i) => (
            <li key={i} className="text-sm text-zinc-600 dark:text-zinc-400">
              {r}
            </li>
          ))}
        </ul>
      </div>

      {/* Action : brouillon propriétaire (DRAFT / HITL) */}
      <footer className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          color="indigo"
          onClick={onGenerate}
          disabled={draft.phase === "saving" || draft.phase === "done"}
        >
          <DocumentTextIcon data-slot="icon" aria-hidden />
          {draft.phase === "saving"
            ? "Génération…"
            : draft.phase === "done"
              ? "Brouillon créé"
              : "Générer un brouillon propriétaire"}
        </Button>
        {draft.phase === "done" && (
          <Link
            href="/outbox?status=draft"
            className="inline-flex items-center gap-1 text-sm font-medium text-accent-600 underline-offset-4 hover:underline dark:text-accent-400"
          >
            Voir dans l&apos;Outbox
            <ArrowTopRightOnSquareIcon className="size-4" aria-hidden />
          </Link>
        )}
        {draft.phase === "unavailable" && (
          <Text className="text-sm text-amber-700 dark:text-amber-400">
            Outbox indisponible (schéma absent) — brouillon non enregistré.
          </Text>
        )}
        {draft.phase === "error" && (
          <Text className="text-sm text-amber-700 dark:text-amber-400">
            Échec de la génération. Réessayez.
          </Text>
        )}
        {!owner.email && (
          <Text className="text-xs text-zinc-500">
            Propriétaire sans email connu : brouillon à compléter manuellement.
          </Text>
        )}
      </footer>
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg bg-zinc-950/[0.03] px-3 py-2.5 dark:bg-white/[0.04]">
      <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
        {value}
      </dd>
      <dd className="text-xs text-zinc-500">{sub}</dd>
    </div>
  );
}
