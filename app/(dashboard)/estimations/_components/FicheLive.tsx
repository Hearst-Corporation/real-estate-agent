"use client";

import { Card } from "@/components/cockpit/primitives";
import { RECAP_FIELDS, TOTAL_BLOCKS } from "@/lib/estimation/spec";
import { UI } from "@/lib/ui-strings";
import type { PropertyData, FieldStatusMap } from "@/lib/estimation/types";

/** Conversion d'un ratio en pourcentage de largeur. */
const PCT_MAX = 100;

function formatValue(v: PropertyData[keyof PropertyData]): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v ? UI.common.yes : UI.common.no;
  if (Array.isArray(v)) return v.length > 0 ? v.join(", ") : null;
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v.length > 0 ? v : null;
  return null;
}

type Props = {
  property: PropertyData;
  fieldStatus: FieldStatusMap;
  block: number;
};

export function FicheLive({ property, fieldStatus, block }: Props) {
  const filled = RECAP_FIELDS.filter(({ field }) => {
    const v = property[field];
    if (Array.isArray(v)) return v.length > 0;
    return v !== null && v !== undefined && v !== "";
  });

  return (
    <Card title={UI.estimations.ficheTitle}>
      <div className="est-fiche-progress">
        <span className="ct-placeholder">
          {UI.estimations.blockProgress(Math.min(block, TOTAL_BLOCKS), TOTAL_BLOCKS)}
        </span>
        <div className="est-fiche-bar-track">
          <div
            className="est-fiche-bar-fill"
            style={{ width: `${(Math.min(block, TOTAL_BLOCKS) / TOTAL_BLOCKS) * PCT_MAX}%` }}
          />
        </div>
      </div>

      {RECAP_FIELDS.map(({ field, label }) => {
        const raw = property[field];
        const formatted = formatValue(raw);
        const status = fieldStatus[field];
        const isEmpty = formatted === null;

        return (
          <div key={field} className="est-fiche-row">
            <span className="est-fiche-label">{label}</span>
            <span className={isEmpty ? "ct-placeholder" : "est-fiche-value"}>
              {isEmpty ? UI.common.empty : formatted}
              {!isEmpty && status === "to_confirm" ? (
                <span className="est-fiche-confirm">{UI.estimations.toConfirm}</span>
              ) : null}
            </span>
          </div>
        );
      })}

      {filled.length === 0 && (
        <p className="ct-placeholder est-fiche-empty">{UI.estimations.ficheEmpty}</p>
      )}
    </Card>
  );
}
