"use client";

import { useCallback, useState } from "react";
import { Icon } from "@/components/cockpit/Icon";
import { Heading } from "@/components/ui/heading";
import { Text, Strong } from "@/components/ui/text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UI } from "@/lib/ui-strings";
import { useTourActive } from "@/components/onboarding";
import { COMMUNICATIONS_ANCHORS } from "@/lib/onboarding/tours/communications-hitl";
import { blockDuringTour } from "@/lib/onboarding/tour-guard";
import type { ApprovalRow, ViewableStatus } from "@/lib/approvals/db";

/** Libellés (ui-strings est partagé → labels locaux à cette feature). */
const T = {
  kicker: "Supervision agents",
  title: "Approbations",
  subtitle:
    "Les actions d'agents en attente de votre validation. Approuver n'exécute pas l'action — elle laisse l'agent la réaliser ; rejeter l'annule.",
  live: "Connecté",
  unavailable: "Indisponible",
  metaLive: "Décisions persistées en base.",
  metaUnavailable: "Registre d'approbations non déployé.",
  refresh: "Actualiser",
  refreshing: "Actualisation…",
  filterPending: "En attente",
  filterApproved: "Approuvées",
  filterRejected: "Rejetées",
  emptyPending: "Aucune action en attente. Rien à valider pour l'instant.",
  emptyApproved: "Aucune action approuvée.",
  emptyRejected: "Aucune action rejetée.",
  unavailableTitle: "Registre d'approbations indisponible",
  unavailableBody:
    "La table d'approbations n'est pas encore déployée. Aucune donnée à afficher — état honnête, pas de fausse approbation.",
  loadError: "Impossible de charger les approbations.",
  retry: "Réessayer",
  approve: "Approuver",
  reject: "Rejeter",
  deciding: "Enregistrement…",
  agent: "Agent",
  target: "Cible (match)",
  channel: "Canal",
  requested: "Demandée",
  contentHash: "Empreinte contenu",
  alreadyDecided: "Déjà tranchée par ailleurs. Liste actualisée.",
  decisionFailed: "La décision n'a pas pu être enregistrée.",
} as const;

const FILTERS: { key: ViewableStatus; label: string }[] = [
  { key: "pending", label: T.filterPending },
  { key: "approved", label: T.filterApproved },
  { key: "rejected", label: T.filterRejected },
];

export type ApprovalsInitial =
  | { kind: "loaded"; rows: ApprovalRow[] }
  | { kind: "unavailable" };

type View =
  | { kind: "loaded"; rows: ApprovalRow[] }
  | { kind: "unavailable" }
  | { kind: "error" };

/**
 * Boîte d'approbation (client). Rend l'état réel (chargé / vide / indisponible /
 * erreur), filtrable pending/approved/rejected. Une décision appelle la route
 * POST /api/approvals/[id] qui persiste pending → approved/rejected de façon
 * atomique — jamais d'exécution d'action ici, jamais de faux « envoyé ».
 */
export function ApprovalsInbox({ initial }: { initial: ApprovalsInitial }) {
  const [filter, setFilter] = useState<ViewableStatus>("pending");
  const [view, setView] = useState<View>(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  // LOT 10 — aucune décision réelle ne peut être enregistrée pendant une visite.
  const tourActive = useTourActive();

  const load = useCallback(async (status: ViewableStatus) => {
    setRefreshing(true);
    setBanner(null);
    try {
      const res = await fetch(`/api/approvals?status=${status}`, {
        headers: { accept: "application/json" },
      });
      const json = (await res.json().catch(() => null)) as
        | { items?: ApprovalRow[]; unavailable?: boolean; error?: string }
        | null;
      if (!res.ok || !json) {
        setView({ kind: "error" });
      } else if (json.unavailable) {
        setView({ kind: "unavailable" });
      } else {
        setView({ kind: "loaded", rows: json.items ?? [] });
      }
    } catch {
      setView({ kind: "error" });
    } finally {
      setRefreshing(false);
    }
  }, []);

  const selectFilter = useCallback(
    (status: ViewableStatus) => {
      setFilter(status);
      void load(status);
    },
    [load],
  );

  const onDecision = useCallback(
    async (id: string, decision: "approve" | "reject") => {
      if (blockDuringTour(tourActive, "approvals-decision")) return;
      setBanner(null);
      const res = await fetch(`/api/approvals/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (res.ok) {
        // Décision persistée → retirer la ligne de la vue courante (pending).
        setView((v) =>
          v.kind === "loaded"
            ? { kind: "loaded", rows: v.rows.filter((r) => r.id !== id) }
            : v,
        );
        return;
      }
      if (res.status === 409) {
        setBanner(T.alreadyDecided);
        void load(filter);
        return;
      }
      setBanner(T.decisionFailed);
    },
    [filter, load, tourActive],
  );

  const rows = view.kind === "loaded" ? view.rows : [];
  const connected = view.kind !== "unavailable";
  const emptyLabel =
    filter === "pending"
      ? T.emptyPending
      : filter === "approved"
        ? T.emptyApproved
        : T.emptyRejected;

  return (
    <div className="flex flex-col gap-8 pb-12">
      <Header
        connected={connected}
        pendingCount={filter === "pending" && view.kind === "loaded" ? rows.length : null}
        onRefresh={() => load(filter)}
        refreshing={refreshing}
      />

      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Filtre statut">
        {FILTERS.map((f) => {
          const active = f.key === filter;
          return (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => selectFilter(f.key)}
              className={[
                "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2",
                active
                  ? "bg-zinc-900 text-white"
                  : "border border-zinc-950/10 text-zinc-600 hover:bg-zinc-950/5",
              ].join(" ")}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {banner && (
        <div
          role="status"
          className="rounded-xl border border-amber-500/30 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          {banner}
        </div>
      )}

      {tourActive && (
        <p role="status" className="surface border-l-4 border-accent-500 p-3 text-sm text-zinc-700 dark:text-zinc-300">
          {UI.onboarding.guard.notice}
        </p>
      )}

      {/* Ancre de visite : la file d'actions proposées, quel que soit son état
          (chargée, vide, indisponible) — l'explication reste toujours pointable. */}
      <section data-tour-id={COMMUNICATIONS_ANCHORS.pending} className="flex flex-col gap-3">
        {view.kind === "unavailable" && <UnavailableState />}
        {view.kind === "error" && <ErrorState onRetry={() => load(filter)} retrying={refreshing} />}
        {view.kind === "loaded" && rows.length === 0 && <EmptyState label={emptyLabel} />}

        {view.kind === "loaded" && rows.length > 0 && (
          <ul className="flex flex-col gap-3">
            {rows.map((row, index) => (
              <ApprovalItem
                key={row.id}
                row={row}
                decidable={filter === "pending"}
                onDecision={onDecision}
                tourActive={tourActive}
                anchorDecision={index === 0}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function Header({
  connected,
  pendingCount,
  onRefresh,
  refreshing,
}: {
  connected: boolean;
  pendingCount: number | null;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-1 inline-flex items-center gap-2 text-xs font-semibold tracking-widest text-pierre-blonde uppercase">
            <span aria-hidden className="h-px w-5 bg-pierre-blonde/60" />
            {T.kicker}
          </p>
          <Heading className="font-titre">{T.title}</Heading>
          <div className="mt-1.5 flex items-center gap-2">
            <Badge color={connected ? "lime" : "zinc"}>
              <span aria-hidden className="size-1.5 rounded-full bg-current opacity-70" />
              {connected ? T.live : T.unavailable}
            </Badge>
            <Text className="text-sm">{connected ? T.metaLive : T.metaUnavailable}</Text>
          </div>
          <Text className="mt-2 max-w-2xl text-sm">{T.subtitle}</Text>
        </div>

        <Button color="light" onClick={onRefresh} disabled={refreshing}>
          <Icon name="agents" data-slot="icon" />
          {refreshing ? T.refreshing : T.refresh}
        </Button>
      </div>

      {pendingCount !== null && (
        <div className="flex flex-col">
          <span className="font-titre text-2xl font-semibold text-zinc-900 tabular-nums">
            {pendingCount}
          </span>
          <span className="text-xs font-medium tracking-wide text-zinc-500 uppercase">
            {T.filterPending}
          </span>
        </div>
      )}
    </div>
  );
}

function ApprovalItem({
  row,
  decidable,
  onDecision,
  tourActive,
  anchorDecision,
}: {
  row: ApprovalRow;
  decidable: boolean;
  onDecision: (id: string, decision: "approve" | "reject") => Promise<void>;
  /** LOT 10 — visite en cours : la décision est expliquée, jamais enregistrée. */
  tourActive: boolean;
  /** Ancre `approvals-decision` posée sur la 1re ligne uniquement. */
  anchorDecision: boolean;
}) {
  const [busy, setBusy] = useState<null | "approve" | "reject">(null);

  const decide = useCallback(
    async (decision: "approve" | "reject") => {
      if (blockDuringTour(tourActive, "approvals-decision")) return;
      setBusy(decision);
      try {
        await onDecision(row.id, decision);
      } finally {
        setBusy(null);
      }
    },
    [onDecision, row.id, tourActive],
  );

  return (
    <li className="surface flex flex-col gap-4 p-4 @2xl:flex-row @2xl:items-center @2xl:justify-between">
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge color="amber">{row.channel || "—"}</Badge>
          <Badge color={statusColor(row.status)}>{statusLabel(row.status)}</Badge>
        </div>
        <div className="grid grid-cols-1 gap-x-8 gap-y-1 @lg:grid-cols-2">
          <Field label={T.agent} value={row.agent_id || "—"} />
          <Field label={T.target} value={shortId(row.match_id)} mono />
          <Field label={T.requested} value={formatDate(row.created_at)} />
          <Field label={T.contentHash} value={shortHash(row.content_hash)} mono />
        </div>
        {row.decided_at && (
          <Text className="text-xs text-zinc-500">
            {statusLabel(row.status)} · {formatDate(row.decided_at)}
          </Text>
        )}
      </div>

      {decidable && (
        <div
          data-tour-id={anchorDecision ? COMMUNICATIONS_ANCHORS.decision : undefined}
          className="flex shrink-0 items-center gap-2"
        >
          <Button
            color="light"
            onClick={() => decide("reject")}
            disabled={busy !== null || tourActive}
          >
            {busy === "reject" ? T.deciding : T.reject}
          </Button>
          <Button
            color="indigo"
            onClick={() => decide("approve")}
            disabled={busy !== null || tourActive}
          >
            {busy === "approve" ? T.deciding : T.approve}
          </Button>
        </div>
      )}
    </li>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-xs font-medium tracking-wide text-zinc-500 uppercase">{label}</span>
      <span className={["truncate text-sm text-zinc-900", mono ? "font-mono" : ""].join(" ")}>
        {value}
      </span>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="surface flex flex-col items-center gap-3 px-6 py-16 text-center">
      <span
        aria-hidden
        className="flex size-12 items-center justify-center rounded-2xl border border-zinc-950/10 text-zinc-400"
      >
        <Icon name="agents" className="size-6" />
      </span>
      <Text className="max-w-md">{label}</Text>
    </div>
  );
}

function UnavailableState() {
  return (
    <div className="surface flex flex-col items-center gap-3 px-6 py-16 text-center">
      <span
        aria-hidden
        className="flex size-12 items-center justify-center rounded-2xl border border-dashed border-zinc-950/15 text-zinc-400"
      >
        <Icon name="agents" className="size-6" />
      </span>
      <Strong className="text-base">{T.unavailableTitle}</Strong>
      <Text className="max-w-md">{T.unavailableBody}</Text>
    </div>
  );
}

function ErrorState({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <div className="surface flex flex-col items-center gap-3 px-6 py-12 text-center">
      <Badge color="red">Erreur</Badge>
      <Text className="max-w-md">{T.loadError}</Text>
      <Button color="light" onClick={onRetry} disabled={retrying}>
        {retrying ? T.refreshing : T.retry}
      </Button>
    </div>
  );
}

// ─── helpers présentation ────────────────────────────────────────────────────

function statusColor(status: string): "amber" | "lime" | "red" | "zinc" {
  switch (status) {
    case "pending":
      return "amber";
    case "approved":
      return "lime";
    case "rejected":
      return "red";
    default:
      return "zinc";
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "En attente";
    case "approved":
      return "Approuvée";
    case "rejected":
      return "Rejetée";
    case "consumed":
      return "Exécutée";
    case "revoked":
      return "Révoquée";
    default:
      return status || "—";
  }
}

function shortId(id: string): string {
  return id ? `${id.slice(0, 8)}…` : "—";
}

function shortHash(hash: string): string {
  return hash ? `${hash.slice(0, 12)}…` : "—";
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
