/**
 * lib/invest/ports/esignature.ts — ESignaturePort (eIDAS, ex. Yousign).
 *
 * Signature opposable du bulletin de souscription + contrat d'émission (③).
 * Preuve eIDAS archivée chiffrée (R2). I8 : demande idempotente par souscription.
 * Pattern B : webhook signé + dédup. Aucune impl.
 */

import type { IdempotencyKey } from "../shared/types";

/** Type de document à signer (aligné inv_signature_envelopes.doc_kind). */
export type ESignDocKind =
  | "bulletin_souscription"
  | "contrat_emission"
  | "cgu_disclosures"
  | "cap_warning"
  | "intercreditor";

/** Niveau de signature (aligné inv_signature_envelopes.signature_level). */
export type ESignLevel = "SES" | "AdES" | "QES";

/** Statut d'enveloppe normalisé (aligné inv_signature_envelopes.state). */
export type ESignState =
  | "DRAFT"
  | "SENT"
  | "VIEWED"
  | "SIGNED"
  | "SEALED"
  | "ARCHIVED"
  | "EXPIRED"
  | "DECLINED";

/** Événement e-signature normalisé issu d'un webhook (Pattern B). */
export interface ESignDomainEvent {
  envelopeId: string;
  state: ESignState;
  /** Hash du document signé (intégrité). */
  docSha256: string | null;
  providerEventId: string;
}

export interface ESignaturePort {
  /** Env lue paresseusement (I7). */
  isConfigured(): boolean;

  /**
   * Crée une demande de signature eIDAS. Idempotent par `idempotencyKey`
   * (I8, ex. esign:{subscriptionId}) — un retry ne crée pas 2 enveloppes.
   */
  requestSignature(input: {
    subscriptionId: string;
    docKind: ESignDocKind;
    level: ESignLevel;
    signerEmail: string;
    idempotencyKey: IdempotencyKey;
  }): Promise<{ envelopeId: string; signUrl: string }>;

  /** Vérifie la signature HMAC d'un webhook e-sign (Pattern B). */
  verifyWebhook(req: { rawBody: string; signature: string }): boolean;

  /** Parse un webhook vérifié en événement de domaine normalisé. */
  parseEvent(rawBody: string): ESignDomainEvent;
}
