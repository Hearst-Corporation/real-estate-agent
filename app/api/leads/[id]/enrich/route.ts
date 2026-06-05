/**
 * POST /api/leads/[id]/enrich
 *
 * Enrichissement B2B d'un lead via Apollo (prioritaire) puis PDL (fallback).
 *
 * GARDE RGPD : le body DOIT contenir { consent: true } — consentement explicite
 * de l'agent immobilier avant tout appel à un data broker externe.
 * - body invalide / non-JSON → 400 invalid_body
 * - champ `consent` absent du body → 400 invalid_body
 * - `consent` présent mais !== true (ex : false) → 403 consent_required
 *
 * Persistance + audit RGPD : le résultat et le consentement sont stockés en base
 * (enriched_*, consent_*). Un enrichissement récent court-circuite tout appel
 * provider (cache + économie de coût).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { rateLimit } from "@/lib/ratelimit";
import {
  apolloIsConfigured,
  apolloEnrich,
  pdlIsConfigured,
  pdlEnrich,
} from "@/lib/providers";
import type { Json } from "@/lib/supabase/database.types";
import { isEnrichable } from "@/lib/crm/enrichable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Un enrichissement de moins de 30 jours est réutilisé tel quel (pas de ré-appel payant).
const ENRICH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// ─── Validation ───────────────────────────────────────────────────────────────

const BodySchema = z.object({
  // Garde RGPD : le caller doit passer consent: true explicitement.
  // z.literal(true) rejette false, 1, "true" — seul le booléen exact est accepté.
  consent: z.literal(true),
});

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  // Auth
  const claims = await getSession();
  if (!claims) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Supabase
  const sb = getSupabaseAdmin();
  if (!sb) {
    return NextResponse.json({ error: "supabase_not_configured" }, { status: 503 });
  }

  // Body validation + garde RGPD
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(rawBody);
  if (!parsed.success) {
    // consent absent → 400 invalid_body ; consent présent mais !== true → 403 consent_required
    const hasConsentField =
      rawBody !== null &&
      typeof rawBody === "object" &&
      "consent" in (rawBody as object);

    if (hasConsentField) {
      return NextResponse.json({ error: "consent_required" }, { status: 403 });
    }
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  // Rate-limit : 10 enrichissements / 60 secondes par utilisateur
  const allowed = await rateLimit(`enrich:${claims.sub}`, 10, 60);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  // Charge le lead — ownership = user_id + tenant_id (même pattern que partout)
  const { data: lead, error: leadError } = await sb
    .from("leads")
    .select("id, full_name, email, type_personne, enriched_at, enriched_source, enriched_data")
    .eq("id", id)
    .eq("user_id", claims.sub)
    .eq("tenant_id", tenantOf(claims))
    .single();

  if (leadError || !lead) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Garde RGPD (allow-list) : on n'enrichit JAMAIS un particulier (ni un type
  // inconnu/null). Avant tout cache ou appel provider.
  if (!isEnrichable(lead.type_personne)) {
    return NextResponse.json({ error: "forbidden_particulier" }, { status: 403 });
  }

  // Court-circuit : enrichissement récent déjà en base → on le réutilise (coût/cache)
  if (lead.enriched_at && lead.enriched_data) {
    const ageMs = Date.now() - new Date(lead.enriched_at).getTime();
    if (ageMs < ENRICH_TTL_MS) {
      return NextResponse.json({
        enriched: true,
        source: lead.enriched_source,
        data: lead.enriched_data,
        cached: true,
      });
    }
  }

  // Un email est requis pour interroger Apollo / PDL dans ce flow
  if (!lead.email) {
    return NextResponse.json({ error: "no_email_to_enrich" }, { status: 422 });
  }

  // Vérifie qu'au moins un provider est configuré
  if (!apolloIsConfigured() && !pdlIsConfigured()) {
    return NextResponse.json({ error: "enrichment_not_configured" }, { status: 503 });
  }

  const email = lead.email;
  let source: "apollo" | "pdl" | null = null;
  let data: unknown = null;

  // Essai Apollo en premier
  if (apolloIsConfigured()) {
    try {
      const result = await apolloEnrich({ email });
      if (result !== null) {
        source = "apollo";
        data = result;
      }
    } catch (err) {
      // ProviderUnavailableError ou réseau — on passe au fallback sans planter
      void err;
    }
  }

  // Fallback PDL si Apollo n'a rien retourné
  if (data === null && pdlIsConfigured()) {
    try {
      const result = await pdlEnrich({ email });
      if (result !== null) {
        source = "pdl";
        data = result;
      }
    } catch (err) {
      // ProviderUnavailableError ou réseau — on échoue soft (enriched: false)
      void err;
    }
  }

  // Aucun résultat exploitable
  if (data === null) {
    return NextResponse.json({ enriched: false, source: null });
  }

  // Persistance + audit consentement (best-effort : ne perd pas le résultat client)
  const nowIso = new Date().toISOString();
  try {
    await sb
      .from("leads")
      .update({
        enriched_at: nowIso,
        enriched_source: source,
        enriched_data: data as Json,
        consent_at: nowIso,
        consent_source: claims.email ?? "api",
      })
      .eq("id", id)
      .eq("user_id", claims.sub)
      .eq("tenant_id", tenantOf(claims));
  } catch (err) {
    console.warn("[enrich] persistance non-fatale échouée:", err);
  }

  return NextResponse.json({ enriched: true, source, data, cached: false });
}
