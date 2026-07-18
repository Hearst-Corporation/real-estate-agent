// Helpers d'affichage partagés par la page prospection et ses panneaux.
// Purs, sans I/O. Le texte visible passe par UI.prospection (jamais en dur ici :
// ces fonctions renvoient des libellés déjà tirés de UI.*).

import { UI } from "@/lib/ui-strings";
import type { BadgeVariant } from "@/components/ui/badge";
import type { Critere, AcquereurGroup, Urgence, AlerteFrequence } from "./types";

const t = UI.prospection;

export function zonesLabel(zones: unknown): string {
  if (Array.isArray(zones)) {
    return (
      zones
        .map((z) =>
          typeof z === "string"
            ? z
            : (z as { label?: string; ville?: string; cp?: string })?.label ??
              (z as { ville?: string })?.ville ??
              (z as { cp?: string })?.cp ??
              "",
        )
        .filter(Boolean)
        .join(", ") || "—"
    );
  }
  if (typeof zones === "string") return zones;
  return "—";
}

export function budgetLabel(c: Critere): string {
  const min = c.budget_min ? `${Number(c.budget_min).toLocaleString("fr-FR")} €` : null;
  const max = c.budget_max ? `${Number(c.budget_max).toLocaleString("fr-FR")} €` : null;
  if (min && max) return `${min} – ${max}`;
  return max ?? min ?? "—";
}

export function urgenceLabel(u: Urgence | null | undefined): string {
  switch (u) {
    case "faible":
      return t.urgenceFaible;
    case "normale":
      return t.urgenceNormale;
    case "haute":
      return t.urgenceHaute;
    case "urgente":
      return t.urgenceUrgente;
    default:
      return t.urgenceNone;
  }
}

/** Variante du badge d'urgence : accent pour haute/urgente, neutre sinon. */
export function urgenceColor(u: Urgence | null | undefined): BadgeVariant {
  return u === "haute" || u === "urgente" ? "brand" : "neutral";
}

export function frequenceLabel(f: AlerteFrequence | null | undefined): string {
  switch (f) {
    case "immediate":
      return t.freqImmediate;
    case "quotidien":
      return t.freqQuotidien;
    case "hebdo":
      return t.freqHebdo;
    default:
      return t.freqOff;
  }
}

/**
 * Regroupe les critères par acquéreur (lead_id). Les critères sans lead_id sont
 * rassemblés sous un groupe « non rattaché ». Le nom du groupe = nom du critère
 * si un seul, sinon libellé générique tiré de UI (on ne fabrique pas de nom).
 */
export function groupByAcquereur(criteres: Critere[]): AcquereurGroup[] {
  const byLead = new Map<string, Critere[]>();
  const noLead: Critere[] = [];
  for (const c of criteres) {
    if (c.lead_id) {
      const arr = byLead.get(c.lead_id) ?? [];
      arr.push(c);
      byLead.set(c.lead_id, arr);
    } else {
      noLead.push(c);
    }
  }
  const groups: AcquereurGroup[] = [];
  for (const [leadId, list] of byLead) {
    // Nom du groupe : nom du 1er critère (les critères d'un même lead partagent
    // souvent le nom de l'acquéreur). Honnête : pas de fabrication de nom.
    groups.push({ leadId, nom: list[0]?.nom ?? "—", criteres: list });
  }
  if (noLead.length > 0) {
    groups.push({ leadId: null, nom: t.acquereurNoLead, criteres: noLead });
  }
  return groups;
}
