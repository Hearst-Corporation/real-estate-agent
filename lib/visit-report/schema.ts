import { z } from "zod";

/**
 * Compte-rendu de visite structuré (W7).
 * Enums miroirs des CHECK DB de la migration 0051_visit_report.sql.
 * Une capacité non connectée (table absente) dégrade en UNAVAILABLE côté route —
 * jamais de faux état.
 */

export const VISIT_REPORT_INTEREST = [
  "tres_interesse",
  "interesse",
  "mitige",
  "peu_interesse",
  "non_interesse",
] as const;
export type VisitReportInterest = (typeof VISIT_REPORT_INTEREST)[number];

export const VISIT_REPORT_OUTCOME = [
  "offre_probable",
  "a_relancer",
  "reflexion",
  "abandon",
] as const;
export type VisitReportOutcome = (typeof VISIT_REPORT_OUTCOME)[number];

/** Libellés FR pour l'UI (ordre = ordre d'affichage). */
export const VISIT_REPORT_INTEREST_LABELS: Record<VisitReportInterest, string> = {
  tres_interesse: "Très intéressé",
  interesse: "Intéressé",
  mitige: "Mitigé",
  peu_interesse: "Peu intéressé",
  non_interesse: "Non intéressé",
};

export const VISIT_REPORT_OUTCOME_LABELS: Record<VisitReportOutcome, string> = {
  offre_probable: "Offre probable",
  a_relancer: "À relancer",
  reflexion: "En réflexion",
  abandon: "Abandon",
};

/** Bornes de texte libre (pas de magic number ailleurs). */
export const VISIT_REPORT_TEXT_MAX = 2000;
export const VISIT_REPORT_PRICE_MAX = 1_000_000_000;

const optionalText = z
  .string()
  .trim()
  .max(VISIT_REPORT_TEXT_MAX)
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

/** Payload accepté par POST/PATCH /api/visits/[id]/report. */
export const visitReportSchema = z.object({
  interest: z.enum(VISIT_REPORT_INTEREST),
  outcome: z.enum(VISIT_REPORT_OUTCOME),
  positives: optionalText,
  objections: optionalText,
  next_action: optionalText,
  price_discussed: z
    .number()
    .finite()
    .min(0)
    .max(VISIT_REPORT_PRICE_MAX)
    .optional()
    .nullable(),
});

export type VisitReportInput = z.infer<typeof visitReportSchema>;

export type VisitReportRow = {
  id: string;
  visit_id: string;
  tenant_id: string;
  user_id: string | null;
  interest: VisitReportInterest;
  positives: string | null;
  objections: string | null;
  price_discussed: number | null;
  next_action: string | null;
  outcome: VisitReportOutcome;
  reported_at: string;
  created_at: string;
  updated_at: string;
};
