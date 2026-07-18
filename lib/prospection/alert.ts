import { sendWhatsApp } from "@/lib/providers/twilio";
import { rateLimit } from "@/lib/ratelimit";
import type { Annonce, CritereAcquereur } from "./types";

const WA_CAP_PER_TENANT_PER_DAY = 10;
const WA_COOLDOWN_SECONDS = 60 * 60 * 24; // 24h par annonce×critère

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function alertKey(tenantId: string, critereId: string, annonceId: string): string {
  return `prosp-alert:${tenantId}:${critereId}:${annonceId}`;
}

function waCap(tenantId: string): string {
  return `prosp-wa-cap:${tenantId}:${today()}`;
}

export async function sendMatchAlerte(
  tenantId: string,
  critere: CritereAcquereur,
  annonce: Annonce,
  score: number,
): Promise<{ sent: boolean; channel?: string; reason?: string }> {
  // Cooldown 24h par couple critère×annonce (évite doublons inter-runs)
  const cooldownKey = alertKey(tenantId, critere.id, annonce.id);
  const allowed = await rateLimit(cooldownKey, 1, WA_COOLDOWN_SECONDS).catch(() => true);
  if (!allowed) return { sent: false, reason: "cooldown" };

  const msg = formatAlerte(annonce, score);

  if (critere.alerteWhatsapp && critere.telephone) {
    // Cap WhatsApp 10/j/tenant (fail-closed)
    const capKey = waCap(tenantId);
    const underCap = await rateLimit(capKey, WA_CAP_PER_TENANT_PER_DAY, 86400).catch(() => false);
    if (!underCap) return { sent: false, reason: "wa_cap_reached" };

    await sendWhatsApp(critere.telephone, msg);
    return { sent: true, channel: "whatsapp" };
  }

  if (critere.alerteEmail && critere.leadId) {
    // On doit avoir un email — passé en paramètre dans le contexte réel
    // Ici on envoie à l'agent (pas d'email acquéreur direct sans RGPD)
    return { sent: false, reason: "no_email_configured" };
  }

  return { sent: false, reason: "no_channel" };
}

function formatAlerte(a: Annonce, score: number): string {
  const prix = a.prix ? `${Math.round(a.prix / 1000)}k€` : "Prix NC";
  const surface = a.surface ? `${a.surface}m²` : "";
  const pieces = a.pieces ? `${a.pieces}p` : "";
  return [
    `🏠 Nouveau match ${score}/100`,
    `${a.titre ?? a.typeBien} · ${[surface, pieces].filter(Boolean).join(" · ")} · ${prix}`,
    `📍 ${a.ville ?? a.codePostal ?? ""}`,
    a.url ? `🔗 ${a.url}` : "",
  ].filter(Boolean).join("\n");
}
