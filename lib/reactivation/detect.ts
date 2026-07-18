/**
 * RÉACTIVATION — détection PURE des prospects dormants.
 * =================================================================
 * Aucune I/O : on reçoit des lignes DB brutes (leads, critères acquéreur,
 * mandats, visites, messages, biens), on renvoie des candidats dormants triés
 * par inactivité décroissante, chacun avec une explication DÉTERMINISTE.
 *
 * Règle de dormance : `last_activity_at` = le PLUS RÉCENT des signaux connus
 * d'un prospect (dernier contact via updated_at, dernière visite, dernier
 * message d'estimation, signature/màj de mandat). Si ce max remonte à plus de
 * `thresholdDays` jours → dormant. Le seuil est configurable côté appelant.
 *
 * Testable en isolation sur fixtures (`now` injecté).
 */

import {
  REACTIVATION_ELIGIBLE_LEAD_STATUSES,
  REACTIVATION_ACTIVE_MANDATE_STATUSES,
  REACTIVATION_MATCH_HINT_LIMIT,
} from "@/config/reactivation";
import type { OutboxChannel } from "@/lib/outbox/types";
import type {
  DormantProspect,
  MatchHint,
  ProspectRole,
  ReactivationReason,
} from "@/lib/reactivation/types";

const MS_PER_DAY = 86_400_000;

/** Jours entiers écoulés entre `from` et `now` (>= 0, arrondi bas). NaN → 0. */
export function daysBetween(from: string | null | undefined, now: Date): number {
  if (!from) return 0;
  const t = Date.parse(from);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((now.getTime() - t) / MS_PER_DAY));
}

/** Renvoie l'ISO le plus récent d'une liste (ignore null/invalides). null si vide. */
export function mostRecent(dates: Array<string | null | undefined>): string | null {
  let bestIso: string | null = null;
  let bestTs = Number.NEGATIVE_INFINITY;
  for (const d of dates) {
    if (!d) continue;
    const t = Date.parse(d);
    if (!Number.isFinite(t)) continue;
    if (t > bestTs) {
      bestTs = t;
      bestIso = d;
    }
  }
  return bestIso;
}

/** Canal recommandé selon les coordonnées : email prioritaire, sinon whatsapp/sms. */
export function suggestChannel(
  contact: { email?: string | null; phone?: string | null } | null | undefined,
): OutboxChannel | null {
  if (contact?.email?.trim()) return "email";
  if (contact?.phone?.trim()) return "whatsapp";
  return null;
}

// ─── Entrées attendues (sous-ensembles des Row DB) ─────────────────────────────

export type LeadRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  kind: string; // "acheteur" | "vendeur" (+ variantes)
  status: string;
  updated_at: string;
  created_at: string;
};

export type CritereRow = {
  id: string;
  lead_id: string | null;
  nom: string;
  telephone: string | null;
  actif: boolean;
  type_bien: string[] | null;
  budget_min: number | null;
  budget_max: number | null;
  surface_min: number | null;
  surface_max: number | null;
  pieces_min: number | null;
  zones: unknown;
  updated_at: string;
  created_at: string;
};

export type MandateRow = {
  id: string;
  reference: string | null;
  kind: string;
  status: string;
  property_id: string | null;
  asking_price: number | null;
  signed_at: string | null;
  updated_at: string;
  created_at: string;
};

export type VisitRow = {
  lead_id: string | null;
  scheduled_at: string | null;
  updated_at: string;
};

export type MessageRow = {
  /** lead lié (via estimation → lead) déjà résolu par l'appelant, sinon null. */
  lead_id: string | null;
  created_at: string;
};

export type PropertyRow = {
  id: string;
  title: string | null;
  city: string | null;
  postal_code: string | null;
  asking_price: number | null;
  property_type: string | null;
  surface: number | null;
  rooms: number | null;
  status: string;
};

// ─── Helpers de statut ─────────────────────────────────────────────────────────

const ELIGIBLE_LEAD = new Set<string>(REACTIVATION_ELIGIBLE_LEAD_STATUSES);
const ACTIVE_MANDATE = new Set<string>(REACTIVATION_ACTIVE_MANDATE_STATUSES);

/** Un lead acheteur/acquéreur ? (tolère variantes fr/en). */
function isAcquereurKind(kind: string): boolean {
  const k = kind.toLowerCase();
  return k === "acheteur" || k === "acquereur" || k === "buyer";
}

/** Un lead vendeur/propriétaire ? */
function isVendeurKind(kind: string): boolean {
  const k = kind.toLowerCase();
  return k === "vendeur" || k === "proprietaire" || k === "seller";
}

/** Bornes → dernière activité par lead à partir des visites et messages. */
function lastActivityByLead(
  visits: VisitRow[],
  messages: MessageRow[],
): Map<string, string> {
  const acc = new Map<string, string[]>();
  const push = (leadId: string | null, iso: string | null | undefined) => {
    if (!leadId || !iso) return;
    const arr = acc.get(leadId) ?? [];
    arr.push(iso);
    acc.set(leadId, arr);
  };
  for (const v of visits) {
    push(v.lead_id, v.scheduled_at);
    push(v.lead_id, v.updated_at);
  }
  for (const m of messages) push(m.lead_id, m.created_at);

  const out = new Map<string, string>();
  for (const [leadId, isos] of acc) {
    const r = mostRecent(isos);
    if (r) out.set(leadId, r);
  }
  return out;
}

// ─── Matching acquéreur → biens (indicatif, déterministe) ──────────────────────

/**
 * Biens du portefeuille (statut vendeur actif) qui matchent GROSSIÈREMENT un
 * critère acquéreur : budget (asking_price dans [min,max]) + surface + pièces.
 * Indicatif seulement (indice de relance) — pas le moteur de scoring complet.
 */
export function matchHintsFor(critere: CritereRow, properties: PropertyRow[]): MatchHint[] {
  const budgetMin = critere.budget_min ?? null;
  const budgetMax = critere.budget_max ?? null;
  const surfMin = critere.surface_min ?? null;
  const piecesMin = critere.pieces_min ?? null;

  const hits: MatchHint[] = [];
  for (const p of properties) {
    if (p.status !== "active" && p.status !== "en_vente" && p.status !== "available") continue;
    const price = p.asking_price;
    if (price != null) {
      if (budgetMin != null && price < budgetMin) continue;
      if (budgetMax != null && price > budgetMax) continue;
    }
    if (surfMin != null && p.surface != null && p.surface < surfMin) continue;
    if (piecesMin != null && p.rooms != null && p.rooms < piecesMin) continue;
    hits.push({
      property_id: p.id,
      title: p.title,
      city: p.city ?? p.postal_code,
      asking_price: p.asking_price,
    });
    if (hits.length >= REACTIVATION_MATCH_HINT_LIMIT) break;
  }
  return hits;
}

// ─── Détection principale ──────────────────────────────────────────────────────

export type DetectInput = {
  leads: LeadRow[];
  criteres: CritereRow[];
  mandates: MandateRow[];
  visits: VisitRow[];
  messages: MessageRow[];
  properties: PropertyRow[];
  thresholdDays: number;
  now: Date;
};

/**
 * Détecte les acquéreurs ET propriétaires dormants (>= thresholdDays sans
 * activité), avec explication chiffrée et biens pertinents pour les acquéreurs.
 * Résultat trié par inactivité décroissante, dédupliqué par prospect.
 */
export function detectDormant(input: DetectInput): DormantProspect[] {
  const { leads, criteres, mandates, visits, messages, properties, thresholdDays, now } = input;
  const activityByLead = lastActivityByLead(visits, messages);
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const critereByLead = new Map<string, CritereRow>();
  for (const c of criteres) if (c.lead_id) critereByLead.set(c.lead_id, c);

  // Un prospect est identifié par sa ressource pivot ; on dédup par (role+lead).
  const seen = new Set<string>();
  const out: DormantProspect[] = [];

  const consider = (candidate: DormantProspect) => {
    const key = `${candidate.role}:${candidate.lead_id ?? candidate.source_id}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(candidate);
  };

  // ── Acquéreurs : leads acheteurs ELIGIBLES + critères acquéreur actifs ──
  for (const lead of leads) {
    if (!isAcquereurKind(lead.kind)) continue;
    if (!ELIGIBLE_LEAD.has(lead.status.toLowerCase())) continue;

    const critere = critereByLead.get(lead.id) ?? null;
    const lastActivity =
      mostRecent([
        lead.updated_at,
        activityByLead.get(lead.id) ?? null,
        critere?.updated_at ?? null,
      ]) ?? lead.updated_at;
    const jours = daysBetween(lastActivity, now);
    if (jours < thresholdDays) continue;

    const hints = critere ? matchHintsFor(critere, properties) : [];
    const reasons: ReactivationReason[] = [
      {
        code: "no_activity_since",
        label: `Acquéreur sans activité depuis ${jours} jours`,
      },
    ];
    if (critere?.actif) {
      reasons.push({ code: "active_criteria", label: `Recherche « ${critere.nom} » toujours active` });
    }
    if (hints.length > 0) {
      reasons.push({
        code: "matching_properties",
        label:
          hints.length === 1
            ? "1 bien du portefeuille correspond à ses critères"
            : `${hints.length} biens du portefeuille correspondent à ses critères`,
      });
    }

    consider({
      role: "acquereur",
      lead_id: lead.id,
      source_id: lead.id,
      full_name: lead.full_name,
      email: lead.email,
      phone: lead.phone ?? critere?.telephone ?? null,
      jours_inactif: jours,
      last_activity_at: lastActivity,
      reasons,
      match_hints: hints,
      suggested_channel: suggestChannel({
        email: lead.email,
        phone: lead.phone ?? critere?.telephone ?? null,
      }),
    });
  }

  // ── Acquéreurs : critères actifs SANS lead rattaché ──
  for (const critere of criteres) {
    if (!critere.actif) continue;
    if (critere.lead_id && leadById.has(critere.lead_id)) continue; // déjà couvert
    const lastActivity = critere.updated_at;
    const jours = daysBetween(lastActivity, now);
    if (jours < thresholdDays) continue;

    const hints = matchHintsFor(critere, properties);
    const reasons: ReactivationReason[] = [
      { code: "no_activity_since", label: `Recherche inactive depuis ${jours} jours` },
      { code: "active_criteria", label: `Critère « ${critere.nom} » toujours actif` },
    ];
    if (hints.length > 0) {
      reasons.push({
        code: "matching_properties",
        label:
          hints.length === 1
            ? "1 bien du portefeuille correspond"
            : `${hints.length} biens du portefeuille correspondent`,
      });
    }
    consider({
      role: "acquereur",
      lead_id: critere.lead_id,
      source_id: critere.id,
      full_name: critere.nom,
      email: null,
      phone: critere.telephone,
      jours_inactif: jours,
      last_activity_at: lastActivity,
      reasons,
      match_hints: hints,
      suggested_channel: suggestChannel({ phone: critere.telephone }),
    });
  }

  // ── Propriétaires : mandats actifs dormants ──
  for (const mandate of mandates) {
    if (!ACTIVE_MANDATE.has(mandate.status.toLowerCase())) continue;
    const lastActivity =
      mostRecent([mandate.updated_at, mandate.signed_at]) ?? mandate.updated_at;
    const jours = daysBetween(lastActivity, now);
    if (jours < thresholdDays) continue;

    // Retrouver le lead propriétaire lié via property_id (best-effort).
    const ownerLead = leads.find(
      (l) => isVendeurKind(l.kind) && l.status && mandate.property_id != null,
    );
    const reasons: ReactivationReason[] = [
      { code: "no_activity_since", label: `Propriétaire sans nouvelle depuis ${jours} jours` },
      {
        code: "active_mandate",
        label: mandate.reference
          ? `Mandat ${mandate.reference} (${mandate.kind}) actif`
          : `Mandat ${mandate.kind} actif`,
      },
    ];
    consider({
      role: "proprietaire",
      lead_id: ownerLead?.id ?? null,
      source_id: mandate.id,
      full_name: ownerLead?.full_name ?? (mandate.reference ? `Mandat ${mandate.reference}` : "Propriétaire"),
      email: ownerLead?.email ?? null,
      phone: ownerLead?.phone ?? null,
      jours_inactif: jours,
      last_activity_at: lastActivity,
      reasons,
      match_hints: [],
      suggested_channel: suggestChannel({
        email: ownerLead?.email ?? null,
        phone: ownerLead?.phone ?? null,
      }),
    });
  }

  // ── Propriétaires : leads vendeurs éligibles dormants sans mandat couvert ──
  for (const lead of leads) {
    if (!isVendeurKind(lead.kind)) continue;
    if (!ELIGIBLE_LEAD.has(lead.status.toLowerCase())) continue;
    const lastActivity =
      mostRecent([lead.updated_at, activityByLead.get(lead.id) ?? null]) ?? lead.updated_at;
    const jours = daysBetween(lastActivity, now);
    if (jours < thresholdDays) continue;

    consider({
      role: "proprietaire",
      lead_id: lead.id,
      source_id: lead.id,
      full_name: lead.full_name,
      email: lead.email,
      phone: lead.phone,
      jours_inactif: jours,
      last_activity_at: lastActivity,
      reasons: [
        { code: "no_activity_since", label: `Propriétaire sans nouvelle depuis ${jours} jours` },
      ],
      match_hints: [],
      suggested_channel: suggestChannel({ email: lead.email, phone: lead.phone }),
    });
  }

  out.sort((a, b) => b.jours_inactif - a.jours_inactif);
  return out;
}

/** Résumé du rôle (affichage). */
export function roleLabel(role: ProspectRole): string {
  return role === "acquereur" ? "Acquéreur" : "Propriétaire";
}
