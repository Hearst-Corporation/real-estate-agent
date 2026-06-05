/**
 * lib/invest/adapters/esignature.yousign.ts — Adaptateur ESignaturePort → Yousign (eIDAS).
 *
 * Signature opposable du bulletin de souscription + contrat d'émission (③).
 * VRAIE logique d'intégration Yousign (API v3) avec `fetch` natif (AUCUN SDK npm) :
 *   - requestSignature : crée une "Signature Request" (mode QES/AdES/SES selon le
 *     niveau demandé) avec un signataire, en référençant la souscription via
 *     `external_id` (idempotence applicative I8 : un retry ne crée pas 2 demandes
 *     côté Yousign tant que la garde withIdempotency de la route arbitre en amont).
 *   - verifyWebhook : HMAC-SHA256 du corps BRUT avec YOUSIGN_WEBHOOK_SECRET
 *     (header `X-Yousign-Signature-256`, style `sha256=...`), comparaison TIMING-SAFE.
 *   - parseEvent : mappe `event_name` (signature_request.done…) → ESignState normalisé.
 *
 * Fail-soft (I7) : env lue paresseusement ; isConfigured() via envPresent. Si une
 * clé manque → throw ProviderUnavailableError (la route renvoie 502, AUCUN appel
 * réseau n'est tenté). On ne logue jamais la clé.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { envPresent } from "../../providers/types";
import { ProviderUnavailableError } from "../shared/errors";
import type {
  ESignaturePort,
  ESignDomainEvent,
  ESignDocKind,
  ESignLevel,
  ESignState,
} from "../ports/esignature";

const PROVIDER = "yousign";
/** Base API Yousign v3 (configurable env pour le bac à sable). */
const DEFAULT_BASE_URL = "https://api.yousign.app/v3";
const DEFAULT_TIMEOUT_MS = 12_000;

export function yousignIsConfigured(): boolean {
  // I7 : env lue à l'appel, jamais au module load.
  return envPresent("YOUSIGN_API_KEY", "YOUSIGN_WEBHOOK_SECRET");
}

function baseUrl(): string {
  return process.env.YOUSIGN_BASE_URL || DEFAULT_BASE_URL;
}

/** Mappe le niveau de signature interne → valeur d'API Yousign. */
function yousignLevel(level: ESignLevel): string {
  switch (level) {
    case "QES":
      return "qualified_electronic_signature";
    case "AdES":
      return "advanced_electronic_signature";
    default:
      return "electronic_signature"; // SES
  }
}

/** Libellé humain du document à signer (pour le nom de la demande Yousign). */
function docLabel(kind: ESignDocKind): string {
  switch (kind) {
    case "bulletin_souscription":
      return "Bulletin de souscription";
    case "contrat_emission":
      return "Contrat d'émission obligataire";
    case "cgu_disclosures":
      return "Conditions & informations clés";
    case "cap_warning":
      return "Avertissement plafond d'investissement";
    case "intercreditor":
      return "Convention intercréanciers";
    default:
      return "Document de souscription";
  }
}

/** Appel HTTP Yousign (Bearer) avec timeout + erreur typée (corps tronqué, non logué en clair). */
async function yousignFetch<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const apiKey = process.env.YOUSIGN_API_KEY as string;
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl()}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        ...(payload ? { "Content-Type": "application/json" } : {}),
      },
      body: payload,
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`yousign HTTP ${res.status} ${method} ${path} — ${text.slice(0, 160)}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Forme (partielle) de la réponse de création d'une Signature Request Yousign. */
interface YousignSignatureRequest {
  id: string;
  status?: string;
  signers?: Array<{ id?: string; signature_link?: string }>;
}

/** event_name Yousign → état d'enveloppe normalisé (ESignState). */
function mapEventName(eventName: string | undefined): ESignState {
  switch (eventName) {
    case "signature_request.done":
    case "signer.done":
      return "SIGNED";
    case "signature_request.activated":
      return "SENT";
    case "signer.link_opened":
      return "VIEWED";
    case "signature_request.expired":
      return "EXPIRED";
    case "signature_request.declined":
    case "signer.declined":
      return "DECLINED";
    default:
      return "SENT";
  }
}

/** Forme (partielle) d'un webhook Yousign v3. */
interface YousignWebhook {
  event_name?: string;
  event_id?: string;
  data?: {
    signature_request?: {
      id?: string;
      status?: string;
      external_id?: string;
    };
  };
}

export const yousignAdapter: ESignaturePort = {
  isConfigured: yousignIsConfigured,

  async requestSignature(input) {
    if (!yousignIsConfigured()) throw new ProviderUnavailableError(PROVIDER);
    // Crée une Signature Request en mode "ordered", référencée par la souscription
    // (external_id) et porteuse de la clé d'idempotence applicative (I8).
    const created = await yousignFetch<YousignSignatureRequest>("POST", "/signature_requests", {
      name: `${docLabel(input.docKind)} — souscription ${input.subscriptionId}`,
      delivery_mode: "email",
      ordered_signers: false,
      external_id: input.subscriptionId,
      // Métadonnée libre : on y trace la clé d'idempotence (audit / réconciliation).
      metadata: { idempotency_key: input.idempotencyKey, doc_kind: input.docKind },
      signers: [
        {
          info: { email: input.signerEmail },
          signature_level: yousignLevel(input.level),
          signature_authentication_mode: "no_otp",
        },
      ],
    });
    const signUrl = created.signers?.[0]?.signature_link ?? "";
    return { envelopeId: created.id, signUrl };
  },

  verifyWebhook(req) {
    if (!yousignIsConfigured()) throw new ProviderUnavailableError(PROVIDER);
    const secret = process.env.YOUSIGN_WEBHOOK_SECRET;
    if (!secret || !req.signature) return false;
    // Yousign préfixe la signature par `sha256=` (style GitHub) — on tolère.
    const provided = req.signature.startsWith("sha256=")
      ? req.signature.slice("sha256=".length)
      : req.signature;
    const expected = createHmac("sha256", secret).update(req.rawBody).digest("hex");
    let providedBuf: Buffer;
    let expectedBuf: Buffer;
    try {
      providedBuf = Buffer.from(provided, "hex");
      expectedBuf = Buffer.from(expected, "hex");
    } catch {
      return false;
    }
    if (providedBuf.length !== expectedBuf.length) return false;
    return timingSafeEqual(providedBuf, expectedBuf);
  },

  parseEvent(rawBody): ESignDomainEvent {
    if (!yousignIsConfigured()) throw new ProviderUnavailableError(PROVIDER);
    const evt = JSON.parse(rawBody) as YousignWebhook;
    const sr = evt.data?.signature_request;
    const state = mapEventName(evt.event_name);
    // providerEventId : on privilégie l'event_id Yousign ; sinon clé déterministe
    // (signature_request + event_name) pour la dédup (Pattern B).
    const providerEventId =
      evt.event_id ?? [sr?.id ?? "unknown", evt.event_name ?? "event"].join(":");
    return {
      envelopeId: sr?.id ?? "",
      state,
      // Yousign expose le hash du document signé via un autre endpoint ; le webhook
      // ne le porte pas systématiquement → null (l'intégrité fine se fait au pull).
      docSha256: null,
      providerEventId,
    };
  },
};
