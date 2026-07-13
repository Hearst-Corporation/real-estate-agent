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

/** Badge de recommandation (dérivé du score si l'API ne le fournit pas). */
export function RecoBadge({ match }: { match: Match }) {
  const reco = matchReco(match);
  return (
    <Badge color={RECO_COLOR[reco]} title={t.recoTitleAria}>
      {RECO_LABEL[reco]}
    </Badge>
  );
}

/**
 * Raisons du match : facteurs de score réels (score_breakdown) + explain
 * (satisfaits/bloquants/données manquantes) si l'API les expose.
 */
export function MatchReasons({ match }: { match: Match }) {
  const factors = scoreFactors(match);
  const ex = match.explain;
  const satisfaits = ex?.satisfaits ?? [];
  const bloquants = ex?.bloquants ?? [];
  const manquantes = ex?.donneesManquantes ?? [];
  const capped = ex?.scorePlafonne === true;

  const hasContent =
    factors.length > 0 ||
    satisfaits.length > 0 ||
    bloquants.length > 0 ||
    manquantes.length > 0;

  if (!hasContent) {
    return <Text>{t.reasonsNone}</Text>;
  }

  return (
    <div className="flex flex-col gap-2">
      {satisfaits.length > 0 && (
        <div>
          <Text>{t.reasonsSatisfied}</Text>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {satisfaits.map((s) => (
              <Badge key={s} color="indigo">
                {s}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {factors.length > 0 && satisfaits.length === 0 && (
        <div className="flex flex-wrap gap-1.5">
          {factors.slice(0, 6).map(([label, pts]) => (
            <Badge key={label} color="zinc">
              {t.reasonsFactor(label, pts)}
            </Badge>
          ))}
        </div>
      )}

      {bloquants.length > 0 && (
        <div>
          <Text>{t.reasonsBlocking}</Text>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {bloquants.map((b) => (
              <Badge key={b} color="amber">
                {b}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {manquantes.length > 0 && (
        <div>
          <Text>{t.reasonsMissing}</Text>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {manquantes.map((m) => (
              <Badge key={m} color="zinc">
                {m}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {capped && <Text>{t.reasonsScoreCapped}</Text>}
    </div>
  );
}
