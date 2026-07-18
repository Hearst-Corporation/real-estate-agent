/**
 * lib/outbox/send.ts — GARDE D'ENVOI de l'outbox (W5).
 *
 * VÉRITÉ CRITIQUE : ce module décide si un draft peut réellement partir, et
 * n'autorise le statut 'sent' QUE sur un envoi RÉEL prouvé par le provider.
 *
 * Trois lignes de défense, dans cet ordre :
 *   1. `channelConfigured(channel)` — le provider du canal est-il configuré ?
 *      Non → on ne tente RIEN, l'appelant garde 'approved' + état CONFIG.
 *   2. l'envoi provider peut renvoyer `{ dry: true }` (mode dégradé interne) —
 *      défense en profondeur : on NE marque JAMAIS 'sent' sur un dry-run.
 *   3. seule une référence provider réelle (id Resend / sid Twilio) prouve
 *      l'envoi → statut 'sent' + sent_at. Sinon 'failed' ou 'approved'.
 *
 * Les providers (`sendEmail`/`sendSms`/`sendWhatsApp`) et les détecteurs de
 * config (`resendIsConfigured`/`twilioIsConfigured`) sont réutilisés tels
 * quels depuis lib/providers — même honnêteté que lib/prospection/contact.ts.
 * Ils sont injectables pour tester la garde sans réseau ni env.
 */

import { sendEmail } from "@/lib/providers/resend-email";
import { sendSms, sendWhatsApp } from "@/lib/providers/twilio";
import { transportStatus } from "@/lib/outbox/transport";
import type { OutboxChannel } from "@/lib/outbox/types";

/** Résultat d'un envoi provider unifié (id/sid → ref, dry → dégradé). */
export interface ProviderResult {
  ref?: string | null;
  dry?: boolean;
}

/**
 * Dépendances injectables (tests sans réseau).
 *
 * `isChannelConfigured` est PAR CANAL — et non un booléen global par provider :
 * SMS et WhatsApp ont des expéditeurs Twilio distincts (TWILIO_SMS_FROM vs
 * TWILIO_WHATSAPP_FROM). Un unique `isSmsConfigured` déclarait le SMS
 * « configuré » alors que son expéditeur manquait, ce qui provoquait un aller-
 * retour réseau voué à l'échec au lieu d'un CONFIG honnête.
 */
export interface SendDeps {
  isChannelConfigured: (channel: OutboxChannel) => boolean;
  sendEmail: (opts: { to: string; subject: string; html: string }) => Promise<ProviderResult>;
  sendSms: (to: string, body: string) => Promise<ProviderResult>;
  sendWhatsApp: (to: string, body: string) => Promise<ProviderResult>;
}

/** Dépendances réelles (production) — providers lib/providers. */
export const realSendDeps: SendDeps = {
  isChannelConfigured: (channel) => transportStatus(channel).state === "LIVE",
  sendEmail: async (opts) => {
    const r = await sendEmail(opts);
    return { ref: r.id ?? null, dry: r.dry };
  },
  sendSms: async (to, body) => {
    const r = await sendSms(to, body);
    return { ref: r.sid ?? null, dry: r.dry };
  },
  sendWhatsApp: async (to, body) => {
    const r = await sendWhatsApp(to, body);
    return { ref: r.sid ?? null, dry: r.dry };
  },
};

/** Le transport du canal est-il réellement configuré (toutes variables présentes) ? */
export function channelConfigured(channel: OutboxChannel, deps: SendDeps = realSendDeps): boolean {
  return deps.isChannelConfigured(channel);
}

/** Nom du provider par canal (journalisé, jamais un secret). */
export function providerFor(channel: OutboxChannel): "resend" | "twilio" {
  return channel === "email" ? "resend" : "twilio";
}

/**
 * Issue d'un envoi. `status` est ce que la ligne DOIT devenir — et la garde
 * ne renvoie 'sent' QUE si un envoi réel a eu lieu (ref non nulle, pas de dry).
 */
export type SendOutcome =
  /** `ref` est NON NULLABLE : sans identifiant fournisseur, pas de 'sent'. */
  | { status: "sent"; provider: string; ref: string; sentAt: string }
  | { status: "approved"; provider: string; reason: "provider_not_configured"; missing: string[] }
  | { status: "approved"; provider: string; reason: "provider_dry_run"; missing?: string[] }
  | { status: "failed"; provider: string; error: string };

export interface SendContext {
  channel: OutboxChannel;
  to: string;
  subject: string | null;
  body: string;
}

/**
 * Tente l'envoi réel d'un draft. NE PEUT PAS produire un faux 'sent' :
 *   - provider non configuré  → 'approved' (CONFIG honnête), aucun appel réseau.
 *   - provider dry-run         → 'approved' (dégradé), jamais 'sent'.
 *   - exception               → 'failed' + error.
 *   - ref réelle              → 'sent' + sent_at.
 */
export async function attemptSend(
  ctx: SendContext,
  deps: SendDeps = realSendDeps,
): Promise<SendOutcome> {
  const provider = providerFor(ctx.channel);

  // 1. Transport configuré ? Non → on ne tente rien, et on NOMME ce qui manque.
  if (!channelConfigured(ctx.channel, deps)) {
    return {
      status: "approved",
      provider,
      reason: "provider_not_configured",
      missing: transportStatus(ctx.channel).missing,
    };
  }

  // 2. Envoi réel. Toute erreur → 'failed', jamais 'sent'.
  let result: ProviderResult;
  try {
    if (ctx.channel === "email") {
      result = await deps.sendEmail({
        to: ctx.to,
        subject: ctx.subject ?? "(sans objet)",
        html: `<p>${ctx.body.replace(/\n/g, "<br>")}</p>`,
      });
    } else if (ctx.channel === "whatsapp") {
      result = await deps.sendWhatsApp(ctx.to, ctx.body);
    } else {
      result = await deps.sendSms(ctx.to, ctx.body);
    }
  } catch {
    return { status: "failed", provider, error: "send_failed" };
  }

  // 3. Défense en profondeur : dry-run malgré config → jamais 'sent'.
  if (result.dry) {
    return { status: "approved", provider, reason: "provider_dry_run" };
  }

  // 4. SEUL un identifiant fournisseur réel (id Resend / sid Twilio) prouve
  //    l'envoi. Une réponse acceptée mais sans référence n'est PAS une preuve :
  //    on ne peut ni tracer, ni auditer, ni rejouer le message. On refuse donc
  //    de mentir et on marque 'failed' — jamais 'sent' sur une référence vide.
  const ref = result.ref?.trim();
  if (!ref) {
    return { status: "failed", provider, error: "provider_no_reference" };
  }

  return { status: "sent", provider, ref, sentAt: new Date().toISOString() };
}
