"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowPathIcon,
  UserGroupIcon,
  HomeModernIcon,
  EnvelopeIcon,
  CheckCircleIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";
import { Heading, Subheading } from "@/components/ui/heading";
import { Text, Strong } from "@/components/ui/text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { eur, dateFr } from "@/lib/crm/format";
import type { DormantProspect } from "@/lib/reactivation/types";
import type { ReactivationResponse } from "@/app/api/reactivation/route";

type LoadState =
  | { phase: "loading" }
  | { phase: "error" }
  | { phase: "ready"; data: ReactivationResponse };

/** État de matérialisation d'un brouillon, par candidat (source_id). */
type DraftState = "idle" | "creating" | "created" | "unavailable" | "error";

const THRESHOLDS = [30, 45, 60, 90] as const;

function ChannelBadge({ channel }: { channel: DormantProspect["suggested_channel"] }) {
  if (!channel) return <Badge color="zinc">Sans coordonnée</Badge>;
  const label = channel === "email" ? "Email" : channel === "whatsapp" ? "WhatsApp" : "SMS";
  return <Badge color="zinc">{label}</Badge>;
}

function ProspectCard({
  prospect,
  draftState,
  onDraft,
}: {
  prospect: DormantProspect;
  draftState: DraftState;
  onDraft: () => void;
}) {
  const Icon = prospect.role === "acquereur" ? UserGroupIcon : HomeModernIcon;
  const roleLabel = prospect.role === "acquereur" ? "Acquéreur" : "Propriétaire";

  return (
    <li className="surface rounded-xl p-4 sm:p-5">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-500/10 text-accent-600 dark:text-accent-400">
          <Icon className="size-5" aria-hidden />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Text className="font-medium text-zinc-950 dark:text-white">{prospect.full_name}</Text>
            <Badge color="zinc">{roleLabel}</Badge>
            <ChannelBadge channel={prospect.suggested_channel} />
          </div>
          <Text className="mt-0.5 flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400">
            <ClockIcon className="size-4" aria-hidden />
            Inactif depuis {prospect.jours_inactif} j · dernière activité {dateFr(prospect.last_activity_at)}
          </Text>

          {/* Pourquoi ce prospect ressort (explicable, déterministe) */}
          <ul className="mt-2 flex flex-col gap-1">
            {prospect.reasons.map((r) => (
              <li key={r.code} className="flex items-start gap-1.5 text-sm text-zinc-600 dark:text-zinc-300">
                <CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-accent-600 dark:text-accent-400" aria-hidden />
                <span>{r.label}</span>
              </li>
            ))}
          </ul>

          {prospect.match_hints.length > 0 && (
            <ul className="mt-2 flex flex-col gap-0.5 border-l-2 border-accent-500/30 pl-3">
              {prospect.match_hints.map((h) => (
                <li key={h.property_id} className="truncate text-sm text-zinc-500 dark:text-zinc-400">
                  {[h.title ?? "Bien", h.city, h.asking_price != null ? eur(h.asking_price) : null]
                    .filter(Boolean)
                    .join(" · ")}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="shrink-0">
          {draftState === "created" ? (
            <Badge color="lime">Brouillon créé</Badge>
          ) : draftState === "unavailable" ? (
            <Badge color="amber">Outbox indisponible</Badge>
          ) : (
            <Button
              color="indigo"
              onClick={onDraft}
              disabled={draftState === "creating" || !prospect.suggested_channel}
              aria-label={`Générer un brouillon pour ${prospect.full_name}`}
            >
              <EnvelopeIcon />
              {draftState === "creating" ? "Création…" : "Brouillon"}
            </Button>
          )}
        </div>
      </div>

      {draftState === "created" && (
        <Text className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
          Brouillon déposé dans l&apos;Outbox en attente de votre validation —{" "}
          <Button href="/outbox" plain className="!p-0 align-baseline">
            l&apos;ouvrir
          </Button>
          .
        </Text>
      )}
      {draftState === "unavailable" && (
        <Text className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
          La table Outbox n&apos;est pas encore provisionnée sur cette base (migration 0050).
        </Text>
      )}
      {draftState === "error" && (
        <Text className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
          Impossible de générer le brouillon. Réessaie dans un instant.
        </Text>
      )}
    </li>
  );
}

export default function ReactivationPage() {
  const [thresholdDays, setThresholdDays] = useState<number>(45);
  const [state, setState] = useState<LoadState>({ phase: "loading" });
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});

  const fetchProspects = useCallback(async (days: number): Promise<LoadState> => {
    try {
      const res = await fetch(`/api/reactivation?days=${days}`, { cache: "no-store" });
      if (!res.ok) return { phase: "error" };
      const data = (await res.json()) as ReactivationResponse;
      return { phase: "ready", data };
    } catch {
      return { phase: "error" };
    }
  }, []);

  const refresh = useCallback(
    (days: number) => {
      setState({ phase: "loading" });
      setDrafts({});
      void fetchProspects(days).then(setState);
    },
    [fetchProspects],
  );

  useEffect(() => {
    let alive = true;
    void fetchProspects(thresholdDays).then((next) => {
      if (alive) setState(next);
    });
    return () => {
      alive = false;
    };
  }, [thresholdDays, fetchProspects]);

  async function createDraft(prospect: DormantProspect) {
    const key = prospect.source_id;
    setDrafts((d) => ({ ...d, [key]: "creating" }));
    try {
      const res = await fetch("/api/reactivation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source_id: prospect.source_id,
          role: prospect.role,
          lead_id: prospect.lead_id,
          days: thresholdDays,
        }),
      });
      if (res.status === 503) {
        setDrafts((d) => ({ ...d, [key]: "unavailable" }));
        return;
      }
      if (!res.ok) {
        setDrafts((d) => ({ ...d, [key]: "error" }));
        return;
      }
      setDrafts((d) => ({ ...d, [key]: "created" }));
    } catch {
      setDrafts((d) => ({ ...d, [key]: "error" }));
    }
  }

  const prospects = state.phase === "ready" ? state.data.prospects : [];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Heading>Réactivation des prospects</Heading>
          <Text className="mt-1 text-zinc-500 dark:text-zinc-400">
            Acquéreurs et propriétaires sans activité récente. Chaque relance reste un{" "}
            <Strong>brouillon</Strong> — validation humaine obligatoire avant tout envoi.
          </Text>
        </div>
        <Button
          plain
          onClick={() => refresh(thresholdDays)}
          disabled={state.phase === "loading"}
          aria-label="Rafraîchir"
        >
          <ArrowPathIcon className={state.phase === "loading" ? "animate-spin" : undefined} />
          Rafraîchir
        </Button>
      </header>

      {/* Seuil de dormance configurable */}
      <div className="surface flex flex-wrap items-center gap-3 rounded-xl p-4">
        <Subheading className="mr-1">Seuil d&apos;inactivité</Subheading>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Seuil d'inactivité en jours">
          {THRESHOLDS.map((d) => {
            const selected = thresholdDays === d;
            const variant = selected ? { color: "indigo" as const } : { plain: true as const };
            return (
              <Button
                key={d}
                {...variant}
                onClick={() => setThresholdDays(d)}
                aria-pressed={selected}
              >
                {d} j
              </Button>
            );
          })}
        </div>
      </div>

      {state.phase === "loading" && (
        <div className="flex flex-col gap-4" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="surface h-28 animate-pulse rounded-xl" />
          ))}
        </div>
      )}

      {state.phase === "error" && (
        <div className="surface flex flex-col items-start gap-3 rounded-xl p-6">
          <Text className="text-zinc-950 dark:text-white">
            <Strong>Impossible de charger les prospects.</Strong>
          </Text>
          <Text className="text-zinc-500 dark:text-zinc-400">
            Vérifie ta connexion ou réessaie dans un instant.
          </Text>
          <Button color="indigo" onClick={() => refresh(thresholdDays)}>
            Réessayer
          </Button>
        </div>
      )}

      {state.phase === "ready" && prospects.length === 0 && (
        <div className="surface rounded-xl p-6">
          <Text className="text-zinc-500 dark:text-zinc-400">
            Aucun prospect dormant au-delà de {state.data.threshold_days} jours. Baisse le seuil pour
            élargir, ou revenez plus tard — la liste se met à jour automatiquement.
          </Text>
        </div>
      )}

      {state.phase === "ready" && prospects.length > 0 && (
        <ul className="flex flex-col gap-4">
          {prospects.map((p) => (
            <ProspectCard
              key={`${p.role}-${p.source_id}`}
              prospect={p}
              draftState={drafts[p.source_id] ?? "idle"}
              onDraft={() => void createDraft(p)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
