"use client";

/**
 * LearningProfileCard — affiche l'apprentissage commercial EXPLICABLE d'un
 * prospect : critères satisfaits / tolérés / bloquants dérivés des feedbacks
 * RÉELS, avec la preuve chiffrée et une raison lisible. Aucun score inventé.
 *
 * États : loading / error / insuffisant (données insuffisantes, honnête) / prêt.
 * Couleurs sémantiques d'état (emerald/amber/red/zinc) → composant déclaré dans
 * STATE_COLOR_OK de scripts/check-catalyst.mjs.
 */

import { Badge } from "@/components/ui/badge";
import { Text, Strong } from "@/components/ui/text";
import type { CriterionSignal, CriterionStatus, LearningProfile } from "@/lib/learning/types";
import type { AdjustedMatch } from "@/lib/learning/rank";

const STATUS_LABEL: Record<CriterionStatus, string> = {
  satisfait: "Satisfait",
  tolere: "Toléré",
  bloquant: "Bloquant",
  insufficient_data: "Données insuffisantes",
};

const STATUS_COLOR: Record<CriterionStatus, "emerald" | "amber" | "red" | "zinc"> = {
  satisfait: "emerald",
  tolere: "amber",
  bloquant: "red",
  insufficient_data: "zinc",
};

function CriterionRow({ signal }: { signal: CriterionSignal }) {
  return (
    <li className="flex flex-col gap-1 border-t border-zinc-950/5 py-3 first:border-t-0 dark:border-white/10 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="flex min-w-0 items-center gap-2">
        <Badge color={STATUS_COLOR[signal.status]}>{STATUS_LABEL[signal.status]}</Badge>
        <span className="truncate text-sm font-medium text-zinc-950 capitalize dark:text-white">
          {signal.criterion}
        </span>
      </div>
      <Text className="min-w-0 text-sm sm:max-w-md sm:text-right">{signal.reason}</Text>
    </li>
  );
}

export interface LearningProfileCardProps {
  profile: LearningProfile | null;
  ranked?: AdjustedMatch[] | null;
  loading?: boolean;
  error?: string | null;
}

export function LearningProfileCard({ profile, ranked, loading, error }: LearningProfileCardProps) {
  if (loading) {
    return (
      <section className="surface rounded-xl p-6" aria-busy="true">
        <div className="h-4 w-40 animate-pulse rounded bg-zinc-950/5 dark:bg-white/10" />
        <div className="mt-4 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-4 w-full animate-pulse rounded bg-zinc-950/5 dark:bg-white/10" />
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="surface rounded-xl p-6">
        <h3 className="text-sm font-semibold text-zinc-950 dark:text-white">Pourquoi ce match</h3>
        <div className="mt-2 flex items-center gap-2">
          <Badge color="red">Erreur</Badge>
          <Text className="text-sm">Impossible de charger l&apos;apprentissage pour l&apos;instant.</Text>
        </div>
      </section>
    );
  }

  if (!profile) {
    return null;
  }

  return (
    <section className="surface rounded-xl p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-950 dark:text-white">Pourquoi ce match</h3>
        <Text className="text-xs text-zinc-500 dark:text-zinc-400">
          {profile.totalFeedback} feedback{profile.totalFeedback > 1 ? "s" : ""} exploité
          {profile.totalFeedback > 1 ? "s" : ""}
        </Text>
      </header>

      {profile.insufficientData ? (
        <Text className="mt-3 text-sm">
          Données insuffisantes : aucun feedback exploitable sur ce prospect pour l&apos;instant. Le
          classement reste celui du moteur, sans ajustement appris.
        </Text>
      ) : (
        <ul className="mt-2">
          {profile.signals.map((s) => (
            <CriterionRow key={s.criterion} signal={s} />
          ))}
        </ul>
      )}

      {ranked && ranked.some((r) => r.changeReasons.length > 0) && (
        <div className="mt-5 border-t border-zinc-950/5 pt-4 dark:border-white/10">
          <h4 className="text-sm font-semibold text-zinc-950 dark:text-white">Pourquoi il a changé</h4>
          <ul className="mt-2 space-y-2">
            {ranked
              .filter((r) => r.changeReasons.length > 0)
              .map((r) => (
                <li key={r.matchId} className="text-sm">
                  <Text className="text-sm">
                    <Strong>
                      {r.delta > 0 ? "+" : ""}
                      {r.delta} pt{Math.abs(r.delta) > 1 ? "s" : ""}
                    </Strong>{" "}
                    ({r.baseScore} → {r.adjustedScore}) — {r.changeReasons.join(" ")}
                  </Text>
                </li>
              ))}
          </ul>
        </div>
      )}
    </section>
  );
}
