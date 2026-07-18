// lib/share-tracking/db.ts — Persistance + lecture des événements de partage.
//
// VÉRITÉ (non négociable) : `recordShareEvent` n'est appelé QUE depuis le
// handler d'une route publique token, APRÈS vérification de la signature du
// token et résolution de la ressource (id + tenant). Un token invalide/expiré/
// révoqué est rejeté AVANT et ne produit donc jamais de ligne. Aucun événement
// « ouvert » sans hit serveur réel.
//
// Dégrade PROPREMENT si la table `share_events` (migration 0056) n'est pas
// appliquée : renvoie `unavailable` sans jamais planter la route publique
// (l'enregistrement du suivi ne doit pas casser la livraison de la brochure ou
// de la page). L'appelant IGNORE l'échec (best-effort, non bloquant).
//
// Sécurité : client service-role (bypass RLS) → on écrit tenant_id + resource_id
// EXPLICITES (déjà vérifiés par signature). En lecture, owner-check applicatif
// tenant_id obligatoire (jamais de lecture cross-tenant).

import "server-only";
import type { Gpu1Client } from "@/lib/gpu1";
import { hashToken, hashValue } from "./hash";
import type {
  RawShareEvent,
  RecordOutcome,
  RecordShareEventInput,
  ShareEventKind,
  ShareResourceType,
  ShareTrackingSummary,
} from "./types";

/** Codes PostgREST/PG signalant une table absente → unavailable (dégradation). */
function isMissingTable(code?: string): boolean {
  return code === "42P01" || code === "PGRST205" || code === "PGRST202";
}

const TABLE = "share_events";

/** Forme d'une ligne insérée (table hors types générés → typage explicite). */
interface ShareEventRow {
  id: string;
  tenant_id: string;
  resource_type: ShareResourceType;
  resource_id: string;
  kind: ShareEventKind;
  token_hash: string;
  ip_hash: string | null;
  ts: string;
}

/**
 * Enregistre un événement de partage RÉEL. Best-effort : ne jette jamais, ne
 * bloque jamais la route publique. Renvoie un état explicite pour le log.
 */
export async function recordShareEvent(
  sb: Gpu1Client,
  input: RecordShareEventInput,
): Promise<RecordOutcome> {
  const row: ShareEventRow = {
    id: crypto.randomUUID(),
    tenant_id: input.resource.tenantId,
    resource_type: input.resource.type,
    resource_id: input.resource.id,
    kind: input.kind,
    token_hash: hashToken(input.token),
    ip_hash: hashValue(input.ip ?? null),
    ts: new Date().toISOString(),
  };

  try {
    const { error } = await sb.from<ShareEventRow>(TABLE).insert(row);
    if (error) {
      if (isMissingTable(error.code)) return { ok: false, reason: "unavailable" };
      return { ok: false, reason: "error" };
    }
    return { ok: true };
  } catch {
    // Le suivi ne doit JAMAIS casser la livraison de la ressource partagée.
    return { ok: false, reason: "error" };
  }
}

/**
 * Charge les événements de partage bruts pour un ensemble de ressources d'un
 * tenant (Timeline). Owner-check applicatif : tenant_id EXPLICITE + bornage sur
 * les resource_id fournis. Retourne [] si la table est absente (dégradation).
 */
export async function fetchShareEvents(
  sb: Gpu1Client,
  args: {
    tenantId: string;
    resourceType: ShareResourceType;
    resourceIds: string[];
    limit?: number;
  },
): Promise<RawShareEvent[]> {
  if (args.resourceIds.length === 0) return [];
  const limit = Math.max(1, Math.min(args.limit ?? 100, 500));
  try {
    const { data, error } = await sb
      .from<RawShareEvent>(TABLE)
      .select("id, resource_type, resource_id, kind, ts")
      .eq("tenant_id", args.tenantId)
      .eq("resource_type", args.resourceType)
      .in("resource_id", args.resourceIds)
      .order("ts", { ascending: false })
      .limit(limit);
    if (error) {
      if (!isMissingTable(error.code)) {
        console.error("[share-tracking] fetch failed", { code: error.code });
      }
      return [];
    }
    return (data ?? []) as RawShareEvent[];
  } catch {
    return [];
  }
}

/**
 * Résume le suivi par ressource (nb ouvertures, nb feedbacks, premier/dernier
 * accès) pour le centre d'actions. Purement dérivé de lignes réelles.
 */
export function summarizeShareEvents(events: RawShareEvent[]): ShareTrackingSummary[] {
  const byResource = new Map<string, ShareTrackingSummary>();
  for (const e of events) {
    const key = `${e.resource_type}:${e.resource_id}`;
    let s = byResource.get(key);
    if (!s) {
      s = {
        resourceType: e.resource_type,
        resourceId: e.resource_id,
        opens: 0,
        feedbacks: 0,
        firstAt: null,
        lastAt: null,
      };
      byResource.set(key, s);
    }
    if (e.kind === "share_open") s.opens += 1;
    else if (e.kind === "share_feedback") s.feedbacks += 1;
    const t = e.ts;
    if (Number.isFinite(Date.parse(t))) {
      if (s.firstAt == null || t < s.firstAt) s.firstAt = t;
      if (s.lastAt == null || t > s.lastAt) s.lastAt = t;
    }
  }
  return [...byResource.values()];
}
