"use client";

import { UI } from "@/lib/ui-strings";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Text } from "@/components/ui/text";
import type { Match, Recommandation } from "./types";
import { matchReco, scoreFactors } from "./reco";

const t = UI.prospection;

export const RECO_LABEL: Record<Recommandation, string> = {
  high_priority: t.recoHighPriority,
  review: t.recoReview,
  low_priority: t.recoLowPriority,
  rejected: t.recoRejected,
};

// Priorité haute = mise en avant ; review = neutre ; basse = neutre ; écarté = secondaire.
export const RECO_VARIANT: Record<Recommandation, BadgeVariant> = {
  high_priority: "brand",
  review: "neutral",
  low_priority: "neutral",
  rejected: "outline",
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

/** Groupe de facteurs (label + points) rendu en badges. */
function FactorGroup({
  title,
  factors,
  variant,
}: {
  title: string;
  factors: Array<{ label: string; points: number }>;
  variant: BadgeVariant;
}) {
  if (factors.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {title}
      </p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {factors.map((f) => (
          <Badge key={f.label} variant={variant}>
            {t.matchFactorPts(f.label, f.points)}
          </Badge>
        ))}
      </div>
    </div>
  );
}

/** Liste simple de libellés (données manquantes) en badges neutres. */
function LabelGroup({ title, labels }: { title: string; labels: string[] }) {
  if (labels.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {title}
      </p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {labels.map((l) => (
          <Badge key={l} variant="neutral">
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
        <FactorGroup title={t.matchSatisfied} factors={exp.satisfaits} variant="brand" />
        <FactorGroup title={t.matchImperfect} factors={exp.imparfaits} variant="neutral" />
        <FactorGroup title={t.matchBlocking} factors={exp.bloquants} variant="neutral" />
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
      <FactorGroup title={t.matchSatisfied} factors={positifs} variant="brand" />
      <FactorGroup title={t.matchImperfect} factors={nuls} variant="neutral" />
      <FactorGroup title={t.matchBlocking} factors={negatifs} variant="neutral" />
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
