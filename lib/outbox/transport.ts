/**
 * lib/outbox/transport.ts — ÉTAT RÉEL des transports de l'outbox (LOT6).
 *
 * Répond à une seule question, honnêtement : « ce canal peut-il réellement
 * envoyer, et si non, QUELLE variable manque ? ».
 *
 * Deux états, jamais un troisième :
 *   - LIVE   : toutes les variables du transport sont présentes → un envoi réel
 *              est possible, et seul un identifiant fournisseur le prouvera.
 *   - CONFIG : au moins une variable manque → AUCUNE tentative d'envoi, le
 *              draft reste 'approved'. On nomme les variables manquantes.
 *
 * Il n'existe PAS d'état UNAVAILABLE ici : la table outbox_drafts est déployée
 * (migration 0050). UNAVAILABLE reste réservé à une panne de schéma réelle,
 * détectée à la lecture (codes 42P01/42703), pas supposée à l'avance.
 *
 * SÉCURITÉ : ce module ne lit que la PRÉSENCE des variables (Boolean), jamais
 * leur valeur. Rien de ce qu'il renvoie ne peut contenir un secret — seulement
 * des NOMS de variables, destinés à être affichés à un humain.
 */

import type { OutboxChannel } from "@/lib/outbox/types";

/** Variables requises par transport. NOMS uniquement — jamais de valeur. */
const REQUIRED_VARS = {
  resend: ["RESEND_API_KEY"],
  twilio: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"],
} as const;

/**
 * Variable d'expéditeur requise selon le canal. Twilio refuse un envoi sans
 * `From` : SMS et WhatsApp n'utilisent pas le même numéro.
 */
const SENDER_VAR: Record<OutboxChannel, string> = {
  email: "RESEND_FROM_EMAIL",
  sms: "TWILIO_SMS_FROM",
  whatsapp: "TWILIO_WHATSAPP_FROM",
};

export type TransportState = "LIVE" | "CONFIG";

export interface TransportStatus {
  channel: OutboxChannel;
  provider: "resend" | "twilio";
  state: TransportState;
  /** Noms des variables absentes (vide si LIVE). Jamais de valeur. */
  missing: string[];
}

/** Une variable d'env est-elle réellement renseignée (non vide) ? */
function present(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

/**
 * État réel d'un canal. `env` injectable pour tester sans toucher au process.
 *
 * Pour l'email, RESEND_FROM_EMAIL est requis : le provider a un fallback en dur
 * (`alerte@real-estate-agent.app`) qui n'est pas un domaine vérifié — compter
 * dessus produirait un échec Resend, pas un envoi. On l'exige donc explicitement.
 */
export function transportStatus(
  channel: OutboxChannel,
  has: (name: string) => boolean = present,
): TransportStatus {
  const provider = channel === "email" ? "resend" : "twilio";
  const required = [...REQUIRED_VARS[provider], SENDER_VAR[channel]];
  const missing = required.filter((name) => !has(name));
  return {
    channel,
    provider,
    state: missing.length === 0 ? "LIVE" : "CONFIG",
    missing,
  };
}

/** État des trois canaux — consommé par l'UI pour afficher la vérité. */
export function allTransportStatuses(
  has: (name: string) => boolean = present,
): TransportStatus[] {
  return (["email", "sms", "whatsapp"] as const).map((c) => transportStatus(c, has));
}

/** Phrase lisible pour un humain. Ne contient QUE des noms de variables. */
export function transportLabel(status: TransportStatus): string {
  if (status.state === "LIVE") {
    return `${status.provider} configuré — envoi réel actif`;
  }
  return `${status.provider} non configuré — variable(s) manquante(s) : ${status.missing.join(", ")}`;
}
