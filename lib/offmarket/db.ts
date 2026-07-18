/**
 * lib/offmarket/db.ts — Persistance des sélections off-market + feedback.
 *
 * Dégrade PROPREMENT si les tables `offmarket_*` (migration 0050) ne sont pas
 * encore appliquées sur gpu1 : chaque opération renvoie un état explicite
 * `UNAVAILABLE` plutôt que de planter. Aucun faux « enregistré ».
 *
 * Sécurité : le client est le service-role (bypass RLS) → owner-check
 * `user_id + tenant_id` explicite sur CHAQUE requête propriétaire. L'accès
 * public (via token) est borné à un `selection_id` déjà vérifié par signature.
 */

import "server-only";
import type { Gpu1Client } from "@/lib/gpu1";

/** Codes PostgREST/PG signalant une table/relation absente → UNAVAILABLE. */
function isMissingTable(code?: string): boolean {
  return code === "42P01" || code === "PGRST205" || code === "PGRST202";
}

export type OffmarketVerdict = "interesse" | "pas_interesse" | "a_revoir";

export interface SelectionItemInput {
  propertyId: string;
  scoreMatch: number | null;
  scoreBreakdown: Record<string, number>;
}

export interface CreateSelectionInput {
  userId: string;
  tenantId: string;
  titre: string;
  leadId: string | null;
  critereId: string | null;
  shareToken: string;
  items: SelectionItemInput[];
}

export type DbOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "unavailable" | "not_found" | "error" };

/**
 * Crée une sélection + ses items. Renvoie l'id de la sélection créée.
 * `shareToken` = jeton opaque non prédictible stocké en DB (ancre + révocation) ;
 * le JWT public référence l'id retourné.
 */
export async function createSelection(
  sb: Gpu1Client,
  input: CreateSelectionInput,
): Promise<DbOutcome<{ selectionId: string }>> {
  const selectionId = crypto.randomUUID();

  const { error: selErr } = await sb.from("offmarket_selections").insert({
    id: selectionId,
    tenant_id: input.tenantId,
    user_id: input.userId,
    lead_id: input.leadId,
    critere_id: input.critereId,
    titre: input.titre,
    share_token: input.shareToken,
    statut: "active",
  });

  if (selErr) {
    if (isMissingTable(selErr.code)) return { ok: false, reason: "unavailable" };
    return { ok: false, reason: "error" };
  }

  if (input.items.length > 0) {
    const rows = input.items.map((it, i) => ({
      id: crypto.randomUUID(),
      tenant_id: input.tenantId,
      selection_id: selectionId,
      property_id: it.propertyId,
      score_match: it.scoreMatch,
      score_breakdown: it.scoreBreakdown,
      position: i,
    }));
    const { error: itErr } = await sb.from("offmarket_selection_items").insert(rows);
    if (itErr) {
      if (isMissingTable(itErr.code)) return { ok: false, reason: "unavailable" };
      return { ok: false, reason: "error" };
    }
  }

  return { ok: true, data: { selectionId } };
}

export interface PublicSelectionItem {
  itemId: string;
  propertyId: string;
  title: string | null;
  propertyType: string | null;
  city: string | null;
  postalCode: string | null;
  surface: number | null;
  rooms: number | null;
  askingPrice: number | null;
  dpe: string | null;
  hasTerrace: boolean;
  hasParking: boolean;
  hasGarden: boolean;
  hasPool: boolean;
  hasElevator: boolean;
  scoreMatch: number | null;
  verdict: OffmarketVerdict | null;
  commentaire: string | null;
}

export interface PublicSelection {
  selectionId: string;
  titre: string;
  statut: string;
  items: PublicSelectionItem[];
}

/**
 * Charge une sélection pour l'affichage PUBLIC (via token déjà vérifié).
 * Borné au `selectionId` — aucune énumération. Joint biens + feedback courant.
 */
export async function loadPublicSelection(
  sb: Gpu1Client,
  selectionId: string,
): Promise<DbOutcome<PublicSelection>> {
  const { data: sel, error: selErr } = await sb
    .from("offmarket_selections")
    .select("id, titre, statut")
    .eq("id", selectionId)
    .maybeSingle();

  if (selErr) {
    if (isMissingTable(selErr.code)) return { ok: false, reason: "unavailable" };
    return { ok: false, reason: "error" };
  }
  if (!sel || (sel as { statut: string }).statut !== "active") {
    return { ok: false, reason: "not_found" };
  }

  const { data: items, error: itErr } = await sb
    .from("offmarket_selection_items")
    .select(
      `id, property_id, score_match, position,
       properties!offmarket_selection_items_property_id_fkey(
         title, property_type, city, postal_code, surface, rooms, asking_price,
         dpe_letter, has_terrace, has_parking, has_garden, has_pool, has_elevator
       ),
       offmarket_feedback!offmarket_feedback_item_key(verdict, commentaire)`,
    )
    .eq("selection_id", selectionId)
    .order("position", { ascending: true })
    .limit(200);

  if (itErr) {
    if (isMissingTable(itErr.code)) return { ok: false, reason: "unavailable" };
    return { ok: false, reason: "error" };
  }

  type RawItem = {
    id: string;
    property_id: string;
    score_match: number | null;
    properties: {
      title: string | null;
      property_type: string | null;
      city: string | null;
      postal_code: string | null;
      surface: number | null;
      rooms: number | null;
      asking_price: number | null;
      dpe_letter: string | null;
      has_terrace: boolean;
      has_parking: boolean;
      has_garden: boolean;
      has_pool: boolean;
      has_elevator: boolean;
    } | null;
    offmarket_feedback: { verdict: string; commentaire: string | null } | Array<{ verdict: string; commentaire: string | null }> | null;
  };

  const mapped: PublicSelectionItem[] = ((items ?? []) as unknown as RawItem[]).map((r) => {
    const p = r.properties;
    const fb = Array.isArray(r.offmarket_feedback)
      ? r.offmarket_feedback[0]
      : r.offmarket_feedback;
    return {
      itemId: r.id,
      propertyId: r.property_id,
      title: p?.title ?? null,
      propertyType: p?.property_type ?? null,
      city: p?.city ?? null,
      postalCode: p?.postal_code ?? null,
      surface: p?.surface ?? null,
      rooms: p?.rooms ?? null,
      askingPrice: p?.asking_price ?? null,
      dpe: p?.dpe_letter ?? null,
      hasTerrace: Boolean(p?.has_terrace),
      hasParking: Boolean(p?.has_parking),
      hasGarden: Boolean(p?.has_garden),
      hasPool: Boolean(p?.has_pool),
      hasElevator: Boolean(p?.has_elevator),
      scoreMatch: r.score_match ?? null,
      verdict: (fb?.verdict as OffmarketVerdict | undefined) ?? null,
      commentaire: fb?.commentaire ?? null,
    };
  });

  return {
    ok: true,
    data: {
      selectionId,
      titre: (sel as { titre: string }).titre,
      statut: (sel as { statut: string }).statut,
      items: mapped,
    },
  };
}

/**
 * Enregistre (upsert) le feedback d'un acquéreur sur un item, borné à la
 * sélection portée par le token. Vérifie que l'item appartient bien à la
 * sélection (anti-injection d'item d'une autre sélection).
 */
export async function upsertFeedback(
  sb: Gpu1Client,
  args: {
    selectionId: string;
    itemId: string;
    verdict: OffmarketVerdict;
    commentaire: string | null;
  },
): Promise<DbOutcome<{ feedbackId: string }>> {
  // La sélection doit être active + récupérer son tenant_id (pour la ligne feedback).
  const { data: sel, error: selErr } = await sb
    .from("offmarket_selections")
    .select("id, tenant_id, statut")
    .eq("id", args.selectionId)
    .maybeSingle();

  if (selErr) {
    if (isMissingTable(selErr.code)) return { ok: false, reason: "unavailable" };
    return { ok: false, reason: "error" };
  }
  if (!sel || (sel as { statut: string }).statut !== "active") {
    return { ok: false, reason: "not_found" };
  }
  const tenantId = (sel as { tenant_id: string }).tenant_id;

  // L'item DOIT appartenir à cette sélection — sinon 404 (pas d'énumération).
  const { data: item, error: itErr } = await sb
    .from("offmarket_selection_items")
    .select("id, selection_id")
    .eq("id", args.itemId)
    .eq("selection_id", args.selectionId)
    .maybeSingle();

  if (itErr) {
    if (isMissingTable(itErr.code)) return { ok: false, reason: "unavailable" };
    return { ok: false, reason: "error" };
  }
  if (!item) return { ok: false, reason: "not_found" };

  const feedbackId = crypto.randomUUID();
  const { error: fbErr } = await sb
    .from("offmarket_feedback")
    .upsert(
      {
        id: feedbackId,
        tenant_id: tenantId,
        selection_id: args.selectionId,
        item_id: args.itemId,
        verdict: args.verdict,
        commentaire: args.commentaire,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "item_id" },
    );

  if (fbErr) {
    if (isMissingTable(fbErr.code)) return { ok: false, reason: "unavailable" };
    return { ok: false, reason: "error" };
  }

  return { ok: true, data: { feedbackId } };
}
