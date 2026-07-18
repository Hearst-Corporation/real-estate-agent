/**
 * RÉACTIVATION — génération du BROUILLON personnalisé.
 * =================================================================
 * Pur : à partir d'un candidat dormant, produit le contenu d'un brouillon
 * (subject + body) personnalisé (nom, ancienneté, critères, biens pertinents).
 *
 * VÉRITÉ : ce module ne fait qu'assembler du texte. Il ne décide JAMAIS d'un
 * envoi. Le brouillon est destiné à l'outbox en status='draft' — la validation
 * humaine (HITL) reste obligatoire avant tout envoi réel.
 */

import { eur } from "@/lib/crm/format";
import type { OutboxChannel } from "@/lib/outbox/types";
import type { DormantProspect } from "@/lib/reactivation/types";

export type DraftContent = {
  channel: OutboxChannel;
  subject: string | null;
  body: string;
};

/** Prénom probable (premier mot) pour une salutation légère. */
function firstName(fullName: string): string {
  const w = fullName.trim().split(/\s+/)[0];
  return w || fullName.trim() || "";
}

/** Liste des biens pertinents en puces textuelles (acquéreur). */
function propertyLines(prospect: DormantProspect): string {
  if (prospect.match_hints.length === 0) return "";
  const lines = prospect.match_hints.map((h) => {
    const bits = [h.title ?? "Bien"];
    if (h.city) bits.push(h.city);
    if (h.asking_price != null) bits.push(eur(h.asking_price));
    return `- ${bits.join(" · ")}`;
  });
  return `\n\nQuelques biens de mon portefeuille qui pourraient vous intéresser :\n${lines.join("\n")}`;
}

/**
 * Construit le brouillon pour un candidat. `channel` par défaut = canal
 * suggéré, sinon email. Le subject n'est renseigné que pour l'email.
 */
export function buildDraft(
  prospect: DormantProspect,
  opts: { channel?: OutboxChannel; agentName?: string } = {},
): DraftContent {
  const channel: OutboxChannel = opts.channel ?? prospect.suggested_channel ?? "email";
  const prenom = firstName(prospect.full_name);
  const salut = prenom ? `Bonjour ${prenom},` : "Bonjour,";
  const signature = opts.agentName ? `\n\n${opts.agentName}` : "";

  if (prospect.role === "acquereur") {
    const criteresActifs = prospect.reasons.some((r) => r.code === "active_criteria");
    const relance = criteresActifs
      ? "Je reviens vers vous concernant votre recherche immobilière, toujours d'actualité de mon côté."
      : "Je reviens vers vous concernant votre projet d'acquisition.";
    const body =
      `${salut}\n\n${relance}` +
      propertyLines(prospect) +
      `\n\nSouhaitez-vous que nous fassions le point ensemble ?${signature}`;
    const subject = channel === "email" ? "Votre recherche immobilière — on refait le point ?" : null;
    return { channel, subject, body };
  }

  // Propriétaire
  const activeMandate = prospect.reasons.find((r) => r.code === "active_mandate");
  const contexte = activeMandate
    ? "Je souhaitais faire le point avec vous sur la commercialisation de votre bien."
    : "Je souhaitais reprendre contact au sujet de votre projet immobilier.";
  const body =
    `${salut}\n\n${contexte}\n\n` +
    "Le marché évolue et je peux vous proposer un point d'avancement ainsi que, si besoin, " +
    "un ajustement de notre stratégie de mise en vente.\n\n" +
    `Êtes-vous disponible cette semaine pour un échange ?${signature}`;
  const subject = channel === "email" ? "Point sur la vente de votre bien" : null;
  return { channel, subject, body };
}
