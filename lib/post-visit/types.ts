/**
 * lib/post-visit/types.ts — modèle de la boucle post-visite (W3).
 *
 * À partir d'un compte-rendu de visite (`visit_reports`, migration 0051), on
 * DÉRIVE de façon déterministe :
 *   1. des SIGNAUX prospect persistés (niveau d'intérêt + objections) ;
 *   2. des SUGGESTIONS d'ajustement de critères acquéreur — proposées, JAMAIS
 *      appliquées silencieusement (l'humain applique via la route existante
 *      PATCH /api/prospection/criteres) ;
 *   3. un RECALCUL des matchs avec le moteur EXISTANT (lib/prospection +
 *      lib/offmarket) — aucun score parallèle inventé ;
 *   4. des RELANCES (rea_tasks ou brouillon outbox DRAFT).
 *
 * Aucun faux état : une capacité dont la table est absente (0051/0054 non
 * appliquées) dégrade en UNAVAILABLE honnête côté route.
 */

import type { VisitReportInterest, VisitReportOutcome } from "@/lib/visit-report/schema";

/** Codes PostgREST/Postgres « relation/colonne absente » → migration non appliquée. */
export const POST_VISIT_MISSING_CODES = ["PGRST205", "PGRST202", "42P01", "42703"] as const;

export function isPostVisitTableMissing(code: string | null | undefined): boolean {
  return (POST_VISIT_MISSING_CODES as readonly string[]).includes(String(code ?? ""));
}

/**
 * Champ de critère visé par une suggestion. Aligné sur les colonnes réelles de
 * `prosp_criteres_acquereur` éditables via la route existante.
 */
export const SUGGESTION_FIELDS = [
  "budget_max",
  "budget_min",
  "surface_min",
  "pieces_min",
] as const;
export type SuggestionField = (typeof SUGGESTION_FIELDS)[number];

/**
 * Une suggestion d'ajustement de critère. `current` / `suggested` sont explicites
 * pour que l'UI affiche « X → Y » ; `reason` cite la preuve du CR (jamais un
 * chiffre inventé). L'humain applique — on n'écrit RIEN dans le critère ici.
 */
export interface CriteriaSuggestion {
  field: SuggestionField;
  current: number | null;
  suggested: number;
  /** Preuve dérivée du CR (ex. « Budget évoqué 320 000 € > critère 300 000 € »). */
  reason: string;
}

/** Signaux prospect dérivés du CR, prêts à être persistés (table 0054). */
export interface DerivedSignals {
  interest: VisitReportInterest;
  outcome: VisitReportOutcome;
  /** Objections libres reprises du CR (jamais reformulées / inventées). */
  objections: string | null;
  /** Prix évoqué en visite (source des suggestions budget). */
  price_discussed: number | null;
}

/** Type de relance à créer. */
export type RelanceKind = "task" | "draft";

/**
 * Proposition de relance dérivée de l'issue du CR. `channel` n'est renseigné que
 * pour un brouillon outbox. Rien n'est envoyé : une task reste `open`, un draft
 * reste `draft` (HITL).
 */
export interface RelanceProposal {
  kind: RelanceKind;
  /** rea_tasks.entity_type quand kind = 'task'. */
  entityType: "visit" | "lead";
  title: string;
  body: string;
  priority: "basse" | "normale" | "haute";
}
