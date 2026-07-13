/**
 * POST /api/prospection/annonces/[id]/estimate
 *
 * Lance une estimation depuis une annonce de prospection.
 *
 * Doctrine du flux annonce → bien → estimation :
 *   1. Auth + ownership STRICT de l'annonce (tenant).
 *   2. L'estimation s'appuie sur un BIEN CRM (properties). Si l'annonce n'a pas
 *      encore de property_id, on crée le bien À LA VOLÉE (mapAnnonceToProperty) et
 *      on pose le lien — plutôt que de forcer l'utilisateur à appeler link-crm
 *      d'abord (moins de friction, même owner-check). Le body peut aussi fournir
 *      un propertyId existant (ownership vérifié).
 *   3. Création de l'estimation via la logique existante : préremplissage depuis
 *      le bien (propertyRowToPropertyData), insert estimations {status:draft,
 *      property_id, property}, puis lien bidirectionnel properties.estimation_id
 *      ET prosp_annonces.estimation_id.
 *   4. Idempotence : si l'annonce a déjà estimation_id, on renvoie l'existant
 *      sans rien recréer (double-clic / retry sûrs).
 *
 * Comparaison prix : le calcul de valeur est ASYNCHRONE (déclenché ensuite via
 * POST /api/estimations/[id]/value, qui écrit estimations.market_value). À la
 * création, market_value est donc généralement absent → on renvoie
 * `price_comparison` seulement si une valeur est déjà connue (sinon `null` avec
 * `pending:true`). Le champ compare le prix affiché de l'annonce à la valeur
 * estimée (écart absolu + pourcentage).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { propertyRowToPropertyData } from "@/lib/estimation/from-property";
import { mapAnnonceToProperty, type AnnonceRowLike } from "@/lib/prospection/crm-link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    propertyId: z.string().uuid().optional(),
  })
  .strict();

type AnnonceRow = AnnonceRowLike & {
  id: string;
  property_id: string | null;
  estimation_id: string | null;
};

type PriceComparison =
  | { pending: true; asking_price: number | null; market_value: null }
  | {
      pending: false;
      asking_price: number;
      market_value: number;
      delta_eur: number;
      delta_pct: number;
    };

function buildComparison(askingPrice: unknown, marketValue: unknown): PriceComparison {
  const ask = typeof askingPrice === "number" && Number.isFinite(askingPrice) ? askingPrice : null;
  const mv = typeof marketValue === "number" && Number.isFinite(marketValue) ? marketValue : null;
  if (ask == null || mv == null || mv === 0) {
    return { pending: true, asking_price: ask, market_value: null };
  }
  const delta = ask - mv;
  return {
    pending: false,
    asking_price: ask,
    market_value: mv,
    delta_eur: delta,
    delta_pct: Math.round((delta / mv) * 1000) / 10,
  };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: "no_db" }, { status: 503 });

  const { id: annonceId } = await params;
  if (!z.string().uuid().safeParse(annonceId).success) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const tenantId = tenantOf(claims);
  const userId = claims.sub;

  // ── Ownership annonce (tenant-scopé) ─────────────────────────────────────────
  const { data: annonceData, error: annonceErr } = await db
    .from("prosp_annonces")
    .select(
      "id,source,type_bien,titre,prix,surface,pieces,chambres,code_postal,ville,dpe,latitude,longitude,url,property_id,estimation_id",
    )
    .eq("tenant_id", tenantId)
    .eq("id", annonceId)
    .limit(1);

  if (annonceErr) {
    const code = String((annonceErr as { code?: string }).code ?? "");
    if (code === "42P01" || code === "42703") {
      return NextResponse.json({ error: "prospection_schema_missing" }, { status: 503 });
    }
    console.error("[prospection/estimate] annonce_fetch_failed", { code });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
  const annonce = ((annonceData ?? []) as unknown as AnnonceRow[])[0];
  if (!annonce) return NextResponse.json({ error: "annonce_not_found" }, { status: 404 });

  // ── Idempotence : estimation déjà attachée → renvoyer l'existant, rien recréer.
  if (annonce.estimation_id) {
    const { data: existing } = await db
      .from("estimations")
      .select("id,status,market_value")
      .eq("id", annonce.estimation_id)
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        {
          estimation_id: existing.id,
          property_id: annonce.property_id,
          status: existing.status,
          deduplicated: true,
          price_comparison: buildComparison(annonce.prix, existing.market_value),
        },
        { status: 200 },
      );
    }
    // Lien orphelin (estimation supprimée) → on repart proprement ci-dessous.
  }

  // ── Résolution du bien : propertyId fourni (owner-check) OU lien annonce OU
  //    création à la volée depuis l'annonce. ────────────────────────────────────
  let propertyId: string | null = annonce.property_id;

  if (body.propertyId) {
    const { data: property, error } = await db
      .from("properties")
      .select("id")
      .eq("id", body.propertyId)
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) {
      console.error("[prospection/estimate] property_lookup_failed", { code: error.code });
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }
    if (!property) return NextResponse.json({ error: "property_not_found" }, { status: 404 });
    propertyId = property.id;
  }

  if (!propertyId) {
    // Création du bien à la volée depuis l'annonce.
    const payload = mapAnnonceToProperty(annonce);
    const { data: created, error } = await db
      .from("properties")
      .insert({ user_id: userId, tenant_id: tenantId, ...payload })
      .select("id")
      .single();
    if (error || !created) {
      console.error("[prospection/estimate] property_create_failed", { code: error?.code });
      return NextResponse.json({ error: "create_failed" }, { status: 500 });
    }
    propertyId = created.id;
  }

  // ── Chargement du bien (owner-check) pour préremplir l'estimation. ───────────
  const { data: property, error: propErr } = await db
    .from("properties")
    .select("*")
    .eq("id", propertyId)
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (propErr) {
    console.error("[prospection/estimate] property_load_failed", { code: propErr.code });
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }
  if (!property) return NextResponse.json({ error: "property_not_found" }, { status: 404 });

  const propertyData = propertyRowToPropertyData(property);

  // ── Création de l'estimation draft préremplie. ───────────────────────────────
  const { data: estimation, error: estErr } = await db
    .from("estimations")
    .insert({
      user_id: userId,
      tenant_id: tenantId,
      status: "draft",
      property_id: propertyId,
      property: propertyData,
    })
    .select("id,status,market_value")
    .single();
  if (estErr || !estimation) {
    console.error("[prospection/estimate] estimation_create_failed", { code: estErr?.code });
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }

  // ── Liens bidirectionnels : bien → estimation, annonce → estimation (+bien). ─
  const { error: propLinkErr } = await db
    .from("properties")
    .update({ estimation_id: estimation.id })
    .eq("id", propertyId)
    .eq("user_id", userId)
    .eq("tenant_id", tenantId);
  if (propLinkErr) {
    console.error("[prospection/estimate] property_link_failed", { code: propLinkErr.code });
  }

  const annoncePatch: { estimation_id: string; property_id?: string } = {
    estimation_id: estimation.id,
  };
  if (propertyId !== annonce.property_id) annoncePatch.property_id = propertyId;

  const { error: annonceLinkErr } = await db
    .from("prosp_annonces")
    .update(annoncePatch)
    .eq("tenant_id", tenantId)
    .eq("id", annonceId);
  if (annonceLinkErr) {
    console.error("[prospection/estimate] annonce_link_failed", {
      code: (annonceLinkErr as { code?: string }).code,
    });
  }

  return NextResponse.json(
    {
      estimation_id: estimation.id,
      property_id: propertyId,
      status: estimation.status,
      // Le calcul de valeur est asynchrone (POST /api/estimations/[id]/value) :
      // market_value est généralement absent ici → pending:true.
      price_comparison: buildComparison(annonce.prix, estimation.market_value),
    },
    { status: 201 },
  );
}
