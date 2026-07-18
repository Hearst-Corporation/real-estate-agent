import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getGpu1Admin } from "@/lib/gpu1";
import { tenantOf } from "@/lib/tenant";
import {
  computePriceDrops,
  computeDormant,
  computeMandateExpiries,
  type AnnonceVersionRow,
  type AnnonceRow,
  type MandateRow,
  type PriceDropSignal,
  type DormantSignal,
  type MandateExpirySignal,
} from "@/lib/radar/signals";
import { RADAR_SECTION_LIMIT } from "@/config/radar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Codes PostgREST/Postgres signalant une table/colonne absente → dégradation. */
function isSchemaMissing(error: { code?: string } | null): boolean {
  const code = String(error?.code ?? "");
  return code === "42P01" || code === "42703";
}

export type RadarSection<T> =
  | { status: "ok"; items: T[] }
  | { status: "unavailable"; items: [] };

export type RadarResponse = {
  price_drops: RadarSection<PriceDropSignal>;
  dormant: RadarSection<DormantSignal>;
  mandate_expiries: RadarSection<MandateExpirySignal>;
};

function unavailable<T>(): RadarSection<T> {
  return { status: "unavailable", items: [] };
}

export async function GET() {
  // 1) Auth AVANT tout accès DB.
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getGpu1Admin();
  if (!db) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });

  const tenantId = tenantOf(claims);
  const now = new Date();

  // ─── Signal 1 : baisses de prix ───────────────────────────────────────────
  // On borne aux annonces actives du tenant, puis on récupère leurs versions.
  let priceDrops: RadarSection<PriceDropSignal> = unavailable();
  let dormant: RadarSection<DormantSignal> = unavailable();
  try {
    const { data: annonces, error: annErr } = await db
      .from("prosp_annonces")
      .select("id,titre,ville,url,prix,actif,date_modif,date_publication,created_at")
      .eq("tenant_id", tenantId)
      .order("updated_at", { ascending: false })
      .limit(1000);

    if (annErr) {
      if (!isSchemaMissing(annErr)) {
        console.error("radar_annonces_fetch_failed", { tenantId, error: annErr.message });
        return NextResponse.json({ error: "internal_error" }, { status: 500 });
      }
      // schéma prospection absent → deux sections dépendantes indisponibles
    } else {
      const rows = (annonces ?? []) as AnnonceRow[];

      // Dormantes : pur calcul depuis les annonces déjà chargées.
      dormant = { status: "ok", items: computeDormant(rows, now).slice(0, RADAR_SECTION_LIMIT) };

      // Baisses : versions des annonces actives du tenant.
      const meta = new Map(rows.map((a) => [a.id, { titre: a.titre, ville: a.ville, url: a.url }]));
      const { data: versions, error: verErr } = await db
        .from("prosp_annonce_versions")
        .select("annonce_id,prix,observed_at")
        .eq("tenant_id", tenantId)
        .order("observed_at", { ascending: false })
        .limit(4000);

      if (verErr) {
        if (!isSchemaMissing(verErr)) {
          console.error("radar_versions_fetch_failed", { tenantId, error: verErr.message });
          return NextResponse.json({ error: "internal_error" }, { status: 500 });
        }
      } else {
        const drops = computePriceDrops((versions ?? []) as AnnonceVersionRow[], meta);
        priceDrops = { status: "ok", items: drops.slice(0, RADAR_SECTION_LIMIT) };
      }
    }
  } catch (e) {
    console.error("radar_prospection_block_failed", { tenantId, error: String(e) });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  // ─── Signal 3 : mandats expirants ─────────────────────────────────────────
  let mandateExpiries: RadarSection<MandateExpirySignal> = unavailable();
  try {
    const { data: mandates, error: manErr } = await db
      .from("mandates")
      .select("id,reference,kind,status,property_id,asking_price,expires_at")
      .eq("user_id", claims.sub)
      .eq("tenant_id", tenantId)
      .not("expires_at", "is", null)
      .order("expires_at", { ascending: true })
      .limit(1000);

    if (manErr) {
      if (!isSchemaMissing(manErr)) {
        console.error("radar_mandates_fetch_failed", { tenantId, error: manErr.message });
        return NextResponse.json({ error: "internal_error" }, { status: 500 });
      }
    } else {
      const expiries = computeMandateExpiries((mandates ?? []) as MandateRow[], now);
      mandateExpiries = { status: "ok", items: expiries.slice(0, RADAR_SECTION_LIMIT) };
    }
  } catch (e) {
    console.error("radar_mandates_block_failed", { tenantId, error: String(e) });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const body: RadarResponse = {
    price_drops: priceDrops,
    dormant,
    mandate_expiries: mandateExpiries,
  };
  return NextResponse.json(body);
}
