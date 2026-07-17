"use client";

import { UI } from "@/lib/ui-strings";
import { Badge } from "@/components/ui/badge";
import { Text } from "@/components/ui/text";
import type { Match, Recommandation } from "./types";
import { matchReco, scoreFactors } from "./reco";

const t = UI.prospection;

const RECO_LABEL: Record<Recommandation, string> = {
  high_priority: t.recoHighPriority,
  review: t.recoReview,
  low_priority: t.recoLowPriority,
  rejected: t.recoRejected,
};

// Priorité haute = accent fort ; à revoir = zinc plein ; basse/écarté = discret.
const RECO_COLOR: Record<Recommandation, "indigo" | "zinc"> = {
  high_priority: "indigo",
  review: "zinc",
  low_priority: "zinc",
  rejected: "zinc",
};

/** Prochaine action recommandée dérivée de la recommandation (source unique). */
export function nextActionLabel(reco: Recommandation): string {
  switch (reco) {
    case "high_priority":
      return t.matchNextPropose;
    case "review":
      return t.matchNextReview;
    case "rejected":
      return t.matchNextLowPriority;
    default:
      return t.matchNextLowPriority;
  }
}

/** Badge de recommandation (dérivé du score si l'API ne le fournit pas). */
export function RecoBadge({ match }: { match: Match }) {
  const reco = matchReco(match);
  return (
    <Badge color={RECO_COLOR[reco]} title={t.recoTitleAria}>
      {RECO_LABEL[reco]}
    </Badge>
  );
}

/** Groupe de facteurs (label + points) rendu en badges. */
function FactorGroup({
  title,
  factors,
  color,
}: {
  title: string;
  factors: Array<{ label: string; points: number }>;
  color: "indigo" | "zinc" | "amber";
}) {
  if (factors.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {title}
      </p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {factors.map((f) => (
          <Badge key={f.label} color={color}>
            {t.matchFactorPts(f.label, f.points)}
          </Badge>
        ))}
      </div>
    </div>
  );
}

/** Liste simple de libellés (données manquantes) en badges zinc. */
function LabelGroup({ title, labels }: { title: string; labels: string[] }) {
  if (labels.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {title}
      </p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {labels.map((l) => (
          <Badge key={l} color="zinc">
            {l}
          </Badge>
        ))}
      </div>
    </div>
  );
}

/**
 * Raisons du match, structurées et HONNÊTES :
 *   critères satisfaits · critères imparfaits · éléments bloquants · données
 *   manquantes · prochaine action recommandée.
 *
 * Priorité aux données calculées côté route (`explanation`, dérivée du
 * score_breakdown + features_snapshot LIVE). Repli sur `score_breakdown` brut si
 * la route n'a pas fourni d'explication. Aucune raison inventée.
 */
export function MatchReasons({ match, showNextAction = false }: { match: Match; showNextAction?: boolean }) {
  const exp = match.explanation;
  const reco = matchReco(match);

  if (exp) {
    const hasContent =
      exp.satisfaits.length > 0 ||
      exp.imparfaits.length > 0 ||
      exp.bloquants.length > 0 ||
      exp.donneesManquantes.length > 0;

    if (!hasContent) {
      return <Text>{t.matchExplainNone}</Text>;
    }

    return (
      <div className="flex flex-col gap-2.5">
        <FactorGroup title={t.matchSatisfied} factors={exp.satisfaits} color="indigo" />
        <FactorGroup title={t.matchImperfect} factors={exp.imparfaits} color="zinc" />
        <FactorGroup title={t.matchBlocking} factors={exp.bloquants} color="amber" />
        <LabelGroup title={t.matchMissingData} labels={exp.donneesManquantes} />
        {showNextAction && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {t.matchNextRecommended}
            </p>
            <Text className="mt-0.5">{nextActionLabel(reco)}</Text>
          </div>
        )}
      </div>
    );
  }

  // ── Repli : breakdown brut (aucune explication calculée) ──
  const factors = scoreFactors(match).map(([label, points]) => ({ label, points }));
  if (factors.length === 0) return <Text>{t.matchExplainNone}</Text>;
  const positifs = factors.filter((f) => f.points > 0);
  const negatifs = factors.filter((f) => f.points < 0);
  const nuls = factors.filter((f) => f.points === 0);
  return (
    <div className="flex flex-col gap-2.5">
      <FactorGroup title={t.matchSatisfied} factors={positifs} color="indigo" />
      <FactorGroup title={t.matchImperfect} factors={nuls} color="zinc" />
      <FactorGroup title={t.matchBlocking} factors={negatifs} color="amber" />
      {showNextAction && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {t.matchNextRecommended}
          </p>
          <Text className="mt-0.5">{nextActionLabel(reco)}</Text>
        </div>
      )}
    </div>
  );
}
