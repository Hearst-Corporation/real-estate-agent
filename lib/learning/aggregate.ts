/**
 * lib/learning/aggregate.ts — lecture des feedbacks RÉELS gpu1 et normalisation
 * en FeedbackEvent[] pour l'apprentissage. Server-only (service-role bypass RLS →
 * filtrage explicite tenant_id + user_id sur CHAQUE requête).
 *
 * Sources exploitées :
 *   - prosp_match_feedback  (signal like|dislike|contact|visite) — TOUJOURS présente.
 *   - offmarket_feedback    (verdict interesse|pas_interesse|a_revoir) — DÉGRADE si absente.
 *   - visit_reports         (interest/outcome) — DÉGRADE si absente.
 *
 * Dégradation honnête : une table absente (migration 0051/0052 non appliquée)
 * n'est PAS une erreur — on ignore la source et on continue. Zéro feedback →
 * profil `insufficientData`.
 *
 * `criteriaMet` d'un match est dérivé du `score_breakdown` réel persisté : un
 * critère est « satisfait » dans le match si ses points atteignent le poids plein
 * du moteur (source unique MATCH_WEIGHTS). Aucune inférence hors des données.
 */

import "server-only";
import type { Gpu1Client } from "@/lib/gpu1";
import { MATCH_WEIGHTS } from "@/lib/prospection/matching/weights";
import { normalizeSignal } from "@/lib/prospection/feedback";
import type { Criterion, FeedbackEvent, Polarity } from "./types";

/** Codes d'erreur PostgREST signifiant « table/relation absente » → dégradation. */
const MISSING_RELATION_CODES = new Set(["42P01", "PGRST205", "PGRST202"]);

function isMissingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code && MISSING_RELATION_CODES.has(error.code)) return true;
  const msg = (error.message ?? "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("could not find") || msg.includes("not found");
}

const CRITERIA_KEYS: Criterion[] = ["zone", "budget", "surface", "pieces", "typeBien", "confort"];

/**
 * Dérive, critère par critère, s'il était satisfait dans un match donné à partir
 * de son breakdown persisté. `null` si le critère n'est pas présent (non évaluable).
 */
export function criteriaMetFromBreakdown(
  breakdown: Record<string, unknown> | null | undefined,
): Partial<Record<Criterion, boolean | null>> {
  const out: Partial<Record<Criterion, boolean | null>> = {};
  const b = breakdown ?? {};
  for (const c of CRITERIA_KEYS) {
    const raw = b[c];
    if (typeof raw !== "number" || !Number.isFinite(raw)) {
      out[c] = null;
      continue;
    }
    // Satisfait = points au poids plein du moteur (demi-score = non satisfait).
    out[c] = raw >= MATCH_WEIGHTS[c];
  }
  return out;
}

/** Polarité d'un signal prosp_match_feedback normalisé. */
function polarityFromSignal(signal: string): Polarity {
  switch (signal) {
    case "like":
    case "contact":
    case "visite":
      return "positive";
    case "dislike":
      return "negative";
    default:
      return "neutral";
  }
}

/** Polarité d'un verdict offmarket_feedback. */
function polarityFromVerdict(verdict: string): Polarity {
  switch (verdict) {
    case "interesse":
      return "positive";
    case "pas_interesse":
      return "negative";
    case "a_revoir":
      return "neutral";
    default:
      return "neutral";
  }
}

/** Polarité d'un compte-rendu de visite (interest + outcome). */
function polarityFromVisit(interest: string, outcome: string): Polarity {
  if (outcome === "abandon" || interest === "non_interesse" || interest === "peu_interesse") return "negative";
  if (outcome === "offre_probable" || interest === "tres_interesse" || interest === "interesse") return "positive";
  return "neutral";
}

type Row = Record<string, unknown>;

/** Lit prosp_match_feedback + le breakdown du match pointé, pour un critère donné. */
async function loadProspMatchEvents(
  db: Gpu1Client,
  tenantId: string,
  userId: string,
  critereId: string,
): Promise<FeedbackEvent[]> {
  // Jointure embarquée sur le match pour récupérer son breakdown réel.
  const { data, error } = await db
    .from("prosp_match_feedback")
    .select("id,created_at,signal,verdict,match:prosp_matchs(id,critere_id,score_breakdown)")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .limit(1000);

  if (error) {
    if (isMissingRelation(error)) return [];
    throw error;
  }

  const events: FeedbackEvent[] = [];
  for (const row of (data ?? []) as Row[]) {
    const matchRaw = row.match as Row | Row[] | null;
    const match = Array.isArray(matchRaw) ? matchRaw[0] : matchRaw;
    if (!match || String(match.critere_id) !== critereId) continue;
    // Types générés = `verdict`, schéma réel gpu1 = `signal` → on lit les deux.
    const signal = normalizeSignal((row.signal ?? row.verdict) as unknown);
    if (!signal) continue;
    events.push({
      source: "prosp_match",
      polarity: polarityFromSignal(signal),
      criteriaMet: criteriaMetFromBreakdown(match.score_breakdown as Record<string, unknown> | null),
      at: typeof row.created_at === "string" ? row.created_at : undefined,
    });
  }
  return events;
}

/**
 * Lit offmarket_feedback pour ce critère (via la sélection liée). Dégrade en []
 * si la table ou une jointure est absente. Les biens off-market n'ont pas de
 * breakdown de matching comparable → criteriaMet vide (le verdict porte la
 * polarité globale, sans attribution par critère). Honnête : on n'invente aucun
 * critère satisfait/non satisfait pour ces évènements.
 */
async function loadOffmarketEvents(
  db: Gpu1Client,
  tenantId: string,
  critereId: string,
): Promise<FeedbackEvent[]> {
  const { data, error } = await db
    .from("offmarket_feedback")
    .select("id,created_at,verdict,selection:offmarket_selections(id,critere_id)")
    .eq("tenant_id", tenantId)
    .limit(1000);

  if (error) {
    if (isMissingRelation(error)) return [];
    throw error;
  }

  const events: FeedbackEvent[] = [];
  for (const row of (data ?? []) as Row[]) {
    const selRaw = row.selection as Row | Row[] | null;
    const sel = Array.isArray(selRaw) ? selRaw[0] : selRaw;
    if (!sel || String(sel.critere_id) !== critereId) continue;
    const verdict = typeof row.verdict === "string" ? row.verdict : "";
    events.push({
      source: "offmarket",
      polarity: polarityFromVerdict(verdict),
      criteriaMet: {},
      at: typeof row.created_at === "string" ? row.created_at : undefined,
    });
  }
  return events;
}

/**
 * Lit visit_reports rattachés à ce critère via le lead. Dégrade en [] si la table
 * est absente. Comme l'off-market, la visite porte une polarité globale sans
 * attribution par critère → criteriaMet vide (aucune inférence fabriquée).
 */
async function loadVisitEvents(
  db: Gpu1Client,
  tenantId: string,
  userId: string,
  leadId: string | null,
): Promise<FeedbackEvent[]> {
  if (!leadId) return [];
  // visit_reports → visits → lead_id. On borne au tenant + user.
  const { data, error } = await db
    .from("visit_reports")
    .select("id,created_at,interest,outcome,visit:visits(id,lead_id)")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .limit(1000);

  if (error) {
    if (isMissingRelation(error)) return [];
    throw error;
  }

  const events: FeedbackEvent[] = [];
  for (const row of (data ?? []) as Row[]) {
    const visitRaw = row.visit as Row | Row[] | null;
    const visit = Array.isArray(visitRaw) ? visitRaw[0] : visitRaw;
    if (!visit || String(visit.lead_id) !== leadId) continue;
    const interest = typeof row.interest === "string" ? row.interest : "";
    const outcome = typeof row.outcome === "string" ? row.outcome : "";
    events.push({
      source: "visit",
      polarity: polarityFromVisit(interest, outcome),
      criteriaMet: {},
      at: typeof row.created_at === "string" ? row.created_at : undefined,
    });
  }
  return events;
}

export interface CollectOptions {
  db: Gpu1Client;
  tenantId: string;
  userId: string;
  critereId: string;
  /** Lead associé au critère (pour rattacher les visites). Optionnel. */
  leadId?: string | null;
}

/**
 * Collecte TOUS les feedbacks réels exploitables pour un prospect. Chaque source
 * dégrade indépendamment (table absente → []) sans faire échouer les autres.
 * L'erreur DB réelle (non « relation absente ») remonte à l'appelant → 500 neutre.
 */
export async function collectFeedbackEvents(opts: CollectOptions): Promise<FeedbackEvent[]> {
  const { db, tenantId, userId, critereId, leadId = null } = opts;
  const [prosp, offmarket, visits] = await Promise.all([
    loadProspMatchEvents(db, tenantId, userId, critereId),
    loadOffmarketEvents(db, tenantId, critereId),
    loadVisitEvents(db, tenantId, userId, leadId),
  ]);
  return [...prosp, ...offmarket, ...visits];
}
