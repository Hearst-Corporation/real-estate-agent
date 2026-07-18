/**
 * lib/onboarding/checklist-client.ts — accès navigateur à la checklist (W6).
 *
 * Ne connaît NI la DB NI les secrets : il interroge `/api/onboarding/checklist`,
 * qui impose lui-même tenant_id + user_id depuis la session. Aucune identité
 * n'est envoyée d'ici. Requête GET uniquement — rien n'est jamais muté.
 *
 * ── HONNÊTETÉ ───────────────────────────────────────────────────────────────
 * Une réponse illisible/refusée ne devient jamais une checklist vide « tout à
 * faire » : elle devient `null`, et l'appelant n'affiche alors rien plutôt
 * qu'un état inventé.
 */

import {
  CHECKLIST_ITEM_IDS,
  summarize,
  type ChecklistItem,
  type ChecklistItemId,
  type ChecklistItemState,
  type ChecklistSummary,
  type ChecklistUnknownReason,
} from "@/lib/onboarding/checklist";

const CHECKLIST_URL = "/api/onboarding/checklist";

const ITEM_IDS = new Set<string>(CHECKLIST_ITEM_IDS);
const STATES = new Set<string>(["done", "todo", "unknown"]);
const REASONS = new Set<string>(["schema_missing", "probe_failed"]);

/**
 * Ne fait CONFIANCE à rien : chaque item est revalidé (id connu, état connu,
 * compteur entier). Une forme inattendue est ignorée plutôt qu'interprétée —
 * `summarize` recomplètera les manquants en `unknown`.
 */
function parseItem(raw: unknown): ChecklistItem | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || !ITEM_IDS.has(o.id)) return null;
  if (typeof o.state !== "string" || !STATES.has(o.state)) return null;

  const count = typeof o.count === "number" && Number.isFinite(o.count) ? o.count : null;
  const reason =
    typeof o.reason === "string" && REASONS.has(o.reason)
      ? (o.reason as ChecklistUnknownReason)
      : undefined;

  return {
    id: o.id as ChecklistItemId,
    state: o.state as ChecklistItemState,
    count,
    ...(reason ? { reason } : {}),
  };
}

/**
 * Lit la checklist de l'utilisateur courant.
 * `null` = état inconnu (session expirée, DB non configurée, réseau KO) →
 * l'appelant n'affiche RIEN, il n'invente pas une checklist vierge.
 */
export async function fetchChecklist(signal?: AbortSignal): Promise<ChecklistSummary | null> {
  let res: Response;
  try {
    res = await fetch(CHECKLIST_URL, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return null;
  }

  const rawItems = (body as { items?: unknown })?.items;
  if (!Array.isArray(rawItems)) return null;

  const items = rawItems.map(parseItem).filter((i): i is ChecklistItem => i !== null);
  // Les compteurs sont recalculés localement : on ne reprend pas les totaux du
  // serveur sans les avoir vérifiés contre les items réellement reçus.
  return summarize(items);
}
