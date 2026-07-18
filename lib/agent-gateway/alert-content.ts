/**
 * lib/agent-gateway/alert-content.ts — formatage DÉTERMINISTE du contenu d'alerte,
 * partagé par alerts.prepare et alerts.dispatch.
 *
 * L'approbation HITL est liée au HASH du contenu (approval.ts). Pour que la preuve
 * approuvée corresponde à ce qui est réellement envoyé, prepare (qui montre le
 * contenu à l'humain) et dispatch (qui l'émet) DOIVENT produire exactement la même
 * chaîne. Cette fonction est l'unique source de ce formatage — pas de divergence.
 *
 * Le texte n'utilise QUE des données de l'annonce (bien immobilier) — jamais un
 * nom/téléphone/email d'acquéreur (pas de PII personnelle dans le corps de l'alerte
 * agent-facing ; l'identité du destinataire vit dans le critère, pas dans le texte).
 */
import type { Annonce } from "@/lib/prospection/types";

export function formatAlertContent(a: Annonce, score: number): string {
  const prix = a.prix ? `${Math.round(a.prix / 1000)}k€` : "Prix NC";
  const surface = a.surface ? `${a.surface}m²` : "";
  const pieces = a.pieces ? `${a.pieces}p` : "";
  return [
    `Nouveau match ${score}/100`,
    `${a.titre ?? a.typeBien} · ${[surface, pieces].filter(Boolean).join(" · ")} · ${prix}`,
    `${a.ville ?? a.codePostal ?? ""}`,
    a.url ? a.url : "",
  ]
    .filter(Boolean)
    .join("\n");
}
