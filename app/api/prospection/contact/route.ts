/**
 * POST /api/prospection/contact — contact vendeur PROTÉGÉ.
 *
 * Ordre des gardes (fail-closed) — AUCUN envoi ne se produit tant que tout n'est
 * pas satisfait :
 *   1. auth + ownership (tenant + user)
 *   2. annonce active (existe, appartient au tenant, PAS demarchage_bloque)
 *   3. coordonnées disponibles pour le canal
 *   4. canal autorisé (sms|whatsapp|email|phone)
 *   5. PAS opted-out (prosp_optout + demarchage_bloque)
 *   6. template complet (aucune variable {{x}} non résolue)
 *   7. idempotency : clé déjà vue → renvoie l'attempt existant (pas de double envoi)
 *   8. anti-doublon récent (fenêtre configurable par canal)
 *   9. anti-spam : rate-limit par user/canal/jour
 *  10. confirmation humaine explicite (`confirmed:true`) → sinon on ne fait qu'un DRAFT
 *  11. mode dégradé : provider non configuré → statut reste `draft`, JAMAIS `sent`
 *
 * États : draft → approved (confirmé humain) → sent | failed.
 * Chaque tentative est journalisée dans prosp_contact_attempts.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { getGpu1Admin } from "@/lib/gpu1";
import { tenantOf } from "@/lib/tenant";
import { rateLimit } from "@/lib/ratelimit";
import { sendWhatsApp, sendSms } from "@/lib/providers/twilio";
import { sendEmail } from "@/lib/providers/resend-email";
import {
  CANAUX,
  type Canal,
  channelDeliverable,
  isOptedOut,
  renderTemplate,
} from "@/lib/prospection/contact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fenêtre anti-doublon par canal (secondes). Configurable via env, défaut 24h.
const DUP_WINDOW_SECONDS = Number.parseInt(
  process.env.PROSP_CONTACT_DUP_WINDOW_SECONDS ?? "86400",
  10,
);
// Cap anti-spam par user × canal × jour.
const CONTACT_CAP_PER_DAY = Number.parseInt(
  process.env.PROSP_CONTACT_CAP_PER_DAY ?? "30",
  10,
);

const BodySchema = z.object({
  annonce_id: z.string().uuid(),
  canal: z.enum(CANAUX as unknown as [Canal, ...Canal[]]),
  template: z.string().trim().min(1).max(4000),
  vars: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).default({}),
  lead_id: z.string().uuid().optional(),
  template_id: z.string().max(120).optional(),
  template_version: z.string().max(40).optional(),
  idempotency_key: z.string().min(8).max(200).optional(),
  confirmed: z.boolean().default(false),
});

type AnnonceRow = {
  id: string;
  demarchage_bloque: boolean | null;
  email_vendeur: string | null;
  telephone_vendeur: string | null;
};

function coordsForCanal(
  canal: Canal,
  a: AnnonceRow,
): { email?: string | null; phone?: string | null; value: string | null } {
  if (canal === "email") return { email: a.email_vendeur, value: a.email_vendeur };
  // sms / whatsapp / phone → téléphone
  return { phone: a.telephone_vendeur, value: a.telephone_vendeur };
}

export async function POST(req: NextRequest) {
  // ── 1. Auth ─────────────────────────────────────────────────────────────────
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getGpu1Admin();
  if (!db) return NextResponse.json({ error: "no_db" }, { status: 503 });

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

  // Header prioritaire sur le body pour l'idempotence.
  const idempotencyKey =
    req.headers.get("idempotency-key")?.trim() || body.idempotency_key || null;

  // ── 7. Idempotency (avant tout travail) : clé déjà vue → renvoie l'existant ──
  if (idempotencyKey) {
    const { data: existing } = await db
      .from("prosp_contact_attempts")
      .select("id,statut,canal,provider,provider_ref,created_at,sent_at")
      .eq("tenant_id", tenantId)
      .eq("idempotency_key", idempotencyKey)
      .limit(1);
    const prior = (existing ?? [])[0];
    if (prior) {
      return NextResponse.json(
        { attempt: prior, deduplicated: true },
        { status: 200 },
      );
    }
  }

  // ── 2. Annonce active + ownership ────────────────────────────────────────────
  const { data: annonceData, error: annonceErr } = await db
    .from("prosp_annonces")
    .select("id,demarchage_bloque,email_vendeur,telephone_vendeur")
    .eq("tenant_id", tenantId)
    .eq("id", body.annonce_id)
    .limit(1);
  if (annonceErr) return NextResponse.json({ error: "internal_error" }, { status: 500 });
  // database.types.ts est désynchronisé du schéma réel gpu1 (colonnes vendeur
  // absentes des types, présentes en base). Cast via unknown, cf. routes voisines.
  const annonce = ((annonceData ?? []) as unknown as AnnonceRow[])[0] as
    | AnnonceRow
    | undefined;
  if (!annonce) return NextResponse.json({ error: "annonce_not_found" }, { status: 404 });
  if (annonce.demarchage_bloque) {
    return NextResponse.json({ error: "demarchage_bloque" }, { status: 409 });
  }

  // ── 3. Coordonnées disponibles pour le canal ─────────────────────────────────
  const coords = coordsForCanal(body.canal, annonce);
  if (!coords.value) {
    return NextResponse.json(
      { error: "no_contact_details", canal: body.canal },
      { status: 422 },
    );
  }

  // ── 5. Opt-out (email/téléphone OU annonce bloquée) ──────────────────────────
  const optout = await isOptedOut(
    db,
    tenantId,
    { email: coords.email, phone: coords.phone },
    body.annonce_id,
  );
  if (optout.optedOut) {
    // On journalise l'issue opted_out sans envoyer.
    await db.from("prosp_contact_attempts").insert({
      tenant_id: tenantId,
      user_id: userId,
      annonce_id: body.annonce_id,
      lead_id: body.lead_id ?? null,
      canal: body.canal,
      statut: "opted_out",
      template_id: body.template_id ?? null,
      template_version: body.template_version ?? null,
      idempotency_key: idempotencyKey,
      created_by: userId,
    });
    return NextResponse.json(
      { error: "opted_out", reason: optout.reason },
      { status: 409 },
    );
  }

  // ── 6. Template complet (aucune variable non résolue) ────────────────────────
  const rendered = renderTemplate(body.template, body.vars);
  if (!rendered.ok) {
    return NextResponse.json(
      { error: "template_unresolved", missing: rendered.missing },
      { status: 422 },
    );
  }
  const message = rendered.text;

  // ── 8. Anti-doublon récent (même annonce × canal × user dans la fenêtre) ─────
  const since = new Date(Date.now() - DUP_WINDOW_SECONDS * 1000).toISOString();
  const { data: recent } = await db
    .from("prosp_contact_attempts")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("annonce_id", body.annonce_id)
    .eq("canal", body.canal)
    .in("statut", ["approved", "sent", "replied"])
    .gte("created_at", since)
    .limit(1);
  if ((recent ?? [])[0]) {
    return NextResponse.json(
      { error: "duplicate_recent", window_seconds: DUP_WINDOW_SECONDS },
      { status: 409 },
    );
  }

  // ── 10. Confirmation humaine → sinon DRAFT (pas d'envoi) ─────────────────────
  if (!body.confirmed) {
    const { data: draft, error: draftErr } = await db
      .from("prosp_contact_attempts")
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        annonce_id: body.annonce_id,
        lead_id: body.lead_id ?? null,
        canal: body.canal,
        statut: "draft",
        template_id: body.template_id ?? null,
        template_version: body.template_version ?? null,
        idempotency_key: idempotencyKey,
        created_by: userId,
      })
      .select("id,statut,canal,created_at")
      .single();
    if (draftErr) return NextResponse.json({ error: "internal_error" }, { status: 500 });
    return NextResponse.json(
      {
        attempt: draft,
        message,
        sent: false,
        info: "brouillon généré — confirmation humaine (confirmed:true) requise pour envoyer",
      },
      { status: 201 },
    );
  }

  // ── 9. Anti-spam : cap par user × canal × jour ───────────────────────────────
  const capKey = `prosp-contact:${tenantId}:${userId}:${body.canal}:${new Date()
    .toISOString()
    .slice(0, 10)}`;
  const underCap = await rateLimit(capKey, CONTACT_CAP_PER_DAY, 86400).catch(() => false);
  if (!underCap) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  // ── 11. Mode dégradé : provider non configuré → DRAFT, jamais sent ───────────
  const deliverable = channelDeliverable(body.canal);
  if (!deliverable) {
    const { data: draft } = await db
      .from("prosp_contact_attempts")
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        annonce_id: body.annonce_id,
        lead_id: body.lead_id ?? null,
        canal: body.canal,
        statut: "draft",
        template_id: body.template_id ?? null,
        template_version: body.template_version ?? null,
        idempotency_key: idempotencyKey,
        provider: body.canal === "email" ? "resend" : "twilio",
        error: "provider_not_configured",
        created_by: userId,
      })
      .select("id,statut,canal,created_at")
      .single();
    return NextResponse.json(
      {
        attempt: draft,
        message,
        sent: false,
        degraded: true,
        info: "provider non configuré (mode dégradé) — copier le message manuellement, aucun envoi effectué",
      },
      { status: 201 },
    );
  }

  // ── Envoi réel (canal livrable + confirmé) ───────────────────────────────────
  // On insère d'abord l'attempt `approved` (avec la clé d'idempotence → l'index
  // unique bloque tout double envoi concurrent), puis on tente l'envoi.
  const { data: attempt, error: insErr } = await db
    .from("prosp_contact_attempts")
    .insert({
      tenant_id: tenantId,
      user_id: userId,
      annonce_id: body.annonce_id,
      lead_id: body.lead_id ?? null,
      canal: body.canal,
      statut: "approved",
      template_id: body.template_id ?? null,
      template_version: body.template_version ?? null,
      idempotency_key: idempotencyKey,
      provider: body.canal === "email" ? "resend" : "twilio",
      created_by: userId,
    })
    .select("id,statut,canal")
    .single();

  if (insErr) {
    // Conflit d'unicité sur idempotency_key → un envoi concurrent a gagné.
    const code = String((insErr as { code?: string }).code ?? "");
    if (code === "23505" && idempotencyKey) {
      const { data: existing } = await db
        .from("prosp_contact_attempts")
        .select("id,statut,canal,provider,provider_ref")
        .eq("tenant_id", tenantId)
        .eq("idempotency_key", idempotencyKey)
        .limit(1);
      return NextResponse.json(
        { attempt: (existing ?? [])[0], deduplicated: true },
        { status: 200 },
      );
    }
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
  // Fail-closed : sans ligne insérée on n'envoie jamais (pas de `sent` orphelin).
  if (!attempt) {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  try {
    let providerRef: string | null = null;
    let providerDry = false;

    if (body.canal === "email") {
      const r = await sendEmail({
        to: coords.value,
        subject: "Contact — proposition d'estimation",
        html: `<p>${message.replace(/\n/g, "<br>")}</p>`,
      });
      if (r.dry) providerDry = true;
      else providerRef = r.id ?? null;
    } else if (body.canal === "whatsapp") {
      const r = await sendWhatsApp(coords.value, message);
      if (r.dry) providerDry = true;
      else providerRef = r.sid ?? null;
    } else {
      // sms (phone n'est jamais deliverable → jamais ici)
      const r = await sendSms(coords.value, message);
      if (r.dry) providerDry = true;
      else providerRef = r.sid ?? null;
    }

    // Défense en profondeur : si le provider a renvoyé dry-run malgré tout,
    // on NE marque JAMAIS `sent` — on reste en draft dégradé.
    if (providerDry) {
      await db
        .from("prosp_contact_attempts")
        .update({ statut: "draft", error: "provider_dry_run" })
        .eq("id", attempt.id)
        .eq("tenant_id", tenantId);
      return NextResponse.json(
        {
          attempt: { ...attempt, statut: "draft" },
          message,
          sent: false,
          degraded: true,
          info: "provider dry-run — aucun envoi effectué",
        },
        { status: 201 },
      );
    }

    await db
      .from("prosp_contact_attempts")
      .update({
        statut: "sent",
        provider_ref: providerRef,
        sent_at: new Date().toISOString(),
      })
      .eq("id", attempt.id)
      .eq("tenant_id", tenantId);

    return NextResponse.json(
      { attempt: { ...attempt, statut: "sent", provider_ref: providerRef }, sent: true },
      { status: 201 },
    );
  } catch (e) {
    // Log serveur, réponse générique. Jamais le détail provider au client.
    console.error("[prospection/contact] send failed:", (e as Error).message);
    await db
      .from("prosp_contact_attempts")
      .update({ statut: "failed", error: "send_failed" })
      .eq("id", attempt.id)
      .eq("tenant_id", tenantId);
    return NextResponse.json({ error: "send_failed" }, { status: 502 });
  }
}
