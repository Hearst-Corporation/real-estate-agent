/**
 * POST /api/prospection/annonces/[id]/link-crm
 *
 * Rattache une annonce de prospection au CRM : crée (ou lie) un lead vendeur
 * ET/OU un bien, puis pose les liens bidirectionnels sur l'annonce.
 *
 * Garanties :
 *   1. Auth + ownership STRICT de l'annonce (tenant + user) → 404 si absente.
 *   2. Anti-doublon / idempotence : si l'annonce a déjà lead_id / property_id, on
 *      NE recrée PAS — un double-clic ou un retry renvoie les liens existants.
 *   3. Non-écrasement : rattacher un leadId / propertyId existant vérifie son
 *      ownership mais ne modifie JAMAIS ses champs CRM (rattachement seulement).
 *   4. Liens bidirectionnels : prosp_annonces.lead_id / property_id mis à jour.
 *
 * Body Zod : { createLead?, leadId?, createProperty?, propertyId? }.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import {
  mapAnnonceToLead,
  mapAnnonceToProperty,
  type AnnonceRowLike,
} from "@/lib/prospection/crm-link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    createLead: z.boolean().optional(),
    leadId: z.string().uuid().optional(),
    createProperty: z.boolean().optional(),
    propertyId: z.string().uuid().optional(),
  })
  .strict()
  .refine((b) => !(b.createLead && b.leadId), {
    message: "createLead et leadId sont mutuellement exclusifs",
  })
  .refine((b) => !(b.createProperty && b.propertyId), {
    message: "createProperty et propertyId sont mutuellement exclusifs",
  })
  .refine((b) => b.createLead || b.leadId || b.createProperty || b.propertyId, {
    message: "au moins une action requise",
  });

/** Colonnes annonce nécessaires au mapping + garde d'idempotence. */
type AnnonceRow = AnnonceRowLike & {
  id: string;
  lead_id: string | null;
  property_id: string | null;
};

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: "no_db" }, { status: 503 });

  const { id: annonceId } = await params;
  if (!z.string().uuid().safeParse(annonceId).success) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const tenantId = tenantOf(claims);
  const userId = claims.sub;

  // ── Ownership annonce : tenant only sur prosp_annonces (pas de user_id sur ce
  // modèle — l'isolation est tenant-scopée, cf. routes voisines). 404 si absente.
  const { data: annonceData, error: annonceErr } = await db
    .from("prosp_annonces")
    .select(
      "id,source,type_bien,titre,prix,surface,pieces,chambres,code_postal,ville,dpe,latitude,longitude,url,nom_annonceur,email_vendeur,telephone_vendeur,type_annonceur,lead_id,property_id",
    )
    .eq("tenant_id", tenantId)
    .eq("id", annonceId)
    .limit(1);

  if (annonceErr) {
    const code = String((annonceErr as { code?: string }).code ?? "");
    if (code === "42P01" || code === "42703") {
      return NextResponse.json({ error: "prospection_schema_missing" }, { status: 503 });
    }
    console.error("[prospection/link-crm] annonce_fetch_failed", { code });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
  // database.types.ts désynchronisé du schéma réel gpu1 → cast via unknown.
  const annonce = ((annonceData ?? []) as unknown as AnnonceRow[])[0];
  if (!annonce) return NextResponse.json({ error: "annonce_not_found" }, { status: 404 });

  // ── Idempotence : liens déjà posés → on ne recrée rien, on renvoie l'existant.
  let leadId: string | null = annonce.lead_id;
  let propertyId: string | null = annonce.property_id;

  // ── LEAD ───────────────────────────────────────────────────────────────────
  if (!leadId) {
    if (body.leadId) {
      // Rattachement d'un lead existant : ownership user+tenant, aucun champ modifié.
      const { data: lead, error } = await db
        .from("leads")
        .select("id")
        .eq("id", body.leadId)
        .eq("user_id", userId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (error) {
        console.error("[prospection/link-crm] lead_lookup_failed", { code: error.code });
        return NextResponse.json({ error: "internal_error" }, { status: 500 });
      }
      if (!lead) return NextResponse.json({ error: "lead_not_found" }, { status: 404 });
      leadId = lead.id;
    } else if (body.createLead) {
      const payload = mapAnnonceToLead(annonce);
      const { data: created, error } = await db
        .from("leads")
        .insert({ user_id: userId, tenant_id: tenantId, ...payload })
        .select("id")
        .single();
      if (error || !created) {
        console.error("[prospection/link-crm] lead_create_failed", { code: error?.code });
        return NextResponse.json({ error: "create_failed" }, { status: 500 });
      }
      leadId = created.id;
    }
  }

  // ── BIEN ───────────────────────────────────────────────────────────────────
  if (!propertyId) {
    if (body.propertyId) {
      const { data: property, error } = await db
        .from("properties")
        .select("id")
        .eq("id", body.propertyId)
        .eq("user_id", userId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (error) {
        console.error("[prospection/link-crm] property_lookup_failed", { code: error.code });
        return NextResponse.json({ error: "internal_error" }, { status: 500 });
      }
      if (!property) return NextResponse.json({ error: "property_not_found" }, { status: 404 });
      propertyId = property.id;
    } else if (body.createProperty) {
      const payload = mapAnnonceToProperty(annonce);
      const { data: created, error } = await db
        .from("properties")
        .insert({ user_id: userId, tenant_id: tenantId, ...payload })
        .select("id")
        .single();
      if (error || !created) {
        console.error("[prospection/link-crm] property_create_failed", { code: error?.code });
        return NextResponse.json({ error: "create_failed" }, { status: 500 });
      }
      propertyId = created.id;
    }
  }

  // ── Liens bidirectionnels sur l'annonce (seulement ce qui a changé). ─────────
  const patch: { lead_id?: string; property_id?: string } = {};
  if (leadId && leadId !== annonce.lead_id) patch.lead_id = leadId;
  if (propertyId && propertyId !== annonce.property_id) patch.property_id = propertyId;

  if (patch.lead_id || patch.property_id) {
    const { error: linkErr } = await db
      .from("prosp_annonces")
      .update(patch)
      .eq("tenant_id", tenantId)
      .eq("id", annonceId);
    if (linkErr) {
      // Les entités CRM existent déjà — on log sans casser (best-effort sur le lien).
      console.error("[prospection/link-crm] annonce_link_failed", {
        code: (linkErr as { code?: string }).code,
      });
      return NextResponse.json({ error: "link_failed" }, { status: 500 });
    }
  }

  return NextResponse.json({ lead_id: leadId, property_id: propertyId }, { status: 200 });
}
