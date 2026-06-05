/**
 * lib/invest/adapters/kyc.sumsub.ts — Adaptateur KycPort → Sumsub.
 *
 * Pattern providers existant : env lue paresseusement (I7), isConfigured() via
 * envPresent, throw ProviderUnavailableError si non configuré → fail-soft (le
 * caller vérifie isConfigured() avant d'appeler ; jamais d'appel réseau sans clé).
 *
 * Implémente la VRAIE logique d'intégration Sumsub avec `fetch` natif (AUCUN SDK npm) :
 *   - startCase  : crée/réutilise un applicant + génère un accessToken SDK.
 *                  Requêtes signées HMAC-SHA256 (X-App-Token / X-App-Access-Sig /
 *                  X-App-Access-Ts), cf. docs Sumsub « App Tokens ».
 *   - verifyWebhook : HMAC-SHA256 du corps brut avec SUMSUB_WEBHOOK_SECRET
 *                     (header `x-payload-digest`), comparaison TIMING-SAFE.
 *   - parseEvent : mappe `reviewResult.reviewAnswer` (GREEN/RED) → statut normalisé.
 *
 * Idempotence (I8) : `startCase` utilise `externalUserId` = externalRef ; relancer
 * le même applicant ne crée pas de doublon côté Sumsub. La garde withIdempotency
 * de la route protège en amont (kyc:{userId}).
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { envPresent } from "../../providers/types";
import { ProviderUnavailableError } from "../shared/errors";
import type { KycPort, KycDomainEvent, KycLevel, KycStatus } from "../ports/kyc";

const PROVIDER = "sumsub";
const BASE_URL = "https://api.sumsub.com";
const DEFAULT_TIMEOUT_MS = 12_000;

/** Nom du « level » Sumsub par défaut (configurable via env). */
function levelName(level: KycLevel): string {
  if (level === "enhanced") {
    return process.env.SUMSUB_LEVEL_ENHANCED || "enhanced-kyc";
  }
  return process.env.SUMSUB_LEVEL_STANDARD || "basic-kyc-level";
}

export function sumsubIsConfigured(): boolean {
  // I7 : env lue à l'appel, jamais au module load.
  return envPresent("SUMSUB_APP_TOKEN", "SUMSUB_SECRET_KEY");
}

/**
 * Signe une requête Sumsub (App Token). La signature est
 * HMAC-SHA256(secret, ts + METHOD + path + body), en hex.
 * @returns les headers de signature à joindre à la requête.
 */
function signRequest(
  method: string,
  pathWithQuery: string,
  body: string,
): Record<string, string> {
  const appToken = process.env.SUMSUB_APP_TOKEN as string;
  const secret = process.env.SUMSUB_SECRET_KEY as string;
  const ts = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", secret)
    .update(ts + method.toUpperCase() + pathWithQuery + body)
    .digest("hex");
  return {
    "X-App-Token": appToken,
    "X-App-Access-Sig": signature,
    "X-App-Access-Ts": ts,
  };
}

/** Appel HTTP signé avec timeout + erreur typée (corps non logué). */
async function sumsubFetch<T>(
  method: string,
  pathWithQuery: string,
  body?: unknown,
): Promise<T> {
  const payload = body === undefined ? "" : JSON.stringify(body);
  const sig = signRequest(method, pathWithQuery, payload);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${pathWithQuery}`, {
      method,
      headers: {
        Accept: "application/json",
        ...(payload ? { "Content-Type": "application/json" } : {}),
        ...sig,
      },
      body: payload || undefined,
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`sumsub HTTP ${res.status} ${method} ${pathWithQuery} — ${text.slice(0, 160)}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Crée (ou récupère) un applicant pour un externalUserId donné. */
async function ensureApplicant(externalUserId: string, level: KycLevel): Promise<string> {
  const lvl = levelName(level);
  try {
    const created = await sumsubFetch<{ id: string }>(
      "POST",
      `/resources/applicants?levelName=${encodeURIComponent(lvl)}`,
      { externalUserId },
    );
    return created.id;
  } catch (e) {
    // L'applicant existe déjà pour cet externalUserId → on le récupère.
    const existing = await sumsubFetch<{ id: string }>(
      "GET",
      `/resources/applicants/-;externalUserId=${encodeURIComponent(externalUserId)}/one`,
    ).catch(() => {
      throw e; // remonte l'erreur initiale si la récupération échoue aussi.
    });
    return existing.id;
  }
}

/** Génère un accessToken SDK (Web/Mobile) pour l'applicant. */
async function createAccessToken(externalUserId: string, level: KycLevel): Promise<string> {
  const lvl = levelName(level);
  const ttl = process.env.SUMSUB_TOKEN_TTL_SECS || "1800";
  const res = await sumsubFetch<{ token: string }>(
    "POST",
    `/resources/accessTokens?userId=${encodeURIComponent(externalUserId)}&levelName=${encodeURIComponent(lvl)}&ttlInSecs=${encodeURIComponent(ttl)}`,
  );
  return res.token;
}

/** Mappe le verdict Sumsub (reviewAnswer GREEN/RED + reviewRejectType) → statut normalisé. */
function mapReviewAnswer(answer: string | undefined, rejectType: string | undefined): KycStatus {
  if (answer === "GREEN") return "approved";
  if (answer === "RED") {
    // RETRY = à corriger (review) ; FINAL = rejet définitif.
    return rejectType === "RETRY" ? "review" : "rejected";
  }
  return "pending";
}

/** Forme (partielle) d'un webhook Sumsub `applicantReviewed`. */
interface SumsubWebhook {
  applicantId?: string;
  externalUserId?: string;
  type?: string;
  reviewResult?: { reviewAnswer?: string; reviewRejectType?: string };
  reviewStatus?: string;
}

export const sumsubKycAdapter: KycPort = {
  isConfigured: sumsubIsConfigured,

  async startCase(input) {
    if (!sumsubIsConfigured()) throw new ProviderUnavailableError(PROVIDER);
    const applicantId = await ensureApplicant(input.externalRef, input.level);
    const sdkToken = await createAccessToken(input.externalRef, input.level);
    return { providerCaseId: applicantId, sdkToken };
  },

  verifyWebhook(req) {
    if (!sumsubIsConfigured()) throw new ProviderUnavailableError(PROVIDER);
    const secret = process.env.SUMSUB_WEBHOOK_SECRET;
    if (!secret || !req.signature) return false;
    const expected = createHmac("sha256", secret).update(req.rawBody).digest("hex");
    let provided: Buffer;
    let exp: Buffer;
    try {
      provided = Buffer.from(req.signature, "hex");
      exp = Buffer.from(expected, "hex");
    } catch {
      return false;
    }
    if (provided.length !== exp.length) return false;
    return timingSafeEqual(provided, exp);
  },

  parseEvent(rawBody): KycDomainEvent {
    if (!sumsubIsConfigured()) throw new ProviderUnavailableError(PROVIDER);
    const evt = JSON.parse(rawBody) as SumsubWebhook;
    const status = mapReviewAnswer(
      evt.reviewResult?.reviewAnswer,
      evt.reviewResult?.reviewRejectType,
    );
    // providerEventId : Sumsub ne fournit pas d'id d'événement stable universel ;
    // on compose une clé déterministe (applicant + type + verdict) pour la dédup.
    const providerEventId = [
      evt.applicantId ?? evt.externalUserId ?? "unknown",
      evt.type ?? "event",
      evt.reviewResult?.reviewAnswer ?? evt.reviewStatus ?? "n/a",
    ].join(":");
    return {
      providerCaseId: evt.applicantId ?? evt.externalUserId ?? "",
      status,
      // Origine des fonds : vérifiée seulement si verdict GREEN (LCB-FT ⑧).
      fundOriginVerified: status === "approved",
      providerEventId,
    };
  },
};
