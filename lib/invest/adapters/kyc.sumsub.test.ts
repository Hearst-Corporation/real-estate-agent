/**
 * lib/invest/adapters/kyc.sumsub.test.ts — adaptateur Sumsub (sans réseau).
 *
 * Vérifie le contrat fail-soft (I7) et la logique PURE de l'adaptateur :
 *   - isConfigured() reflète la présence des env SUMSUB_* ;
 *   - sans config : startCase/verifyWebhook/parseEvent lèvent
 *     ProviderUnavailableError (jamais d'appel réseau) ;
 *   - verifyWebhook : HMAC-SHA256 timing-safe sur le corps brut ;
 *   - parseEvent : mappe reviewAnswer GREEN/RED(+rejectType) → statut normalisé.
 *
 * Aucun test ne déclenche d'appel HTTP : startCase n'est exercé que pour
 * vérifier le rejet fail-soft (config absente).
 */

import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { createHmac } from "node:crypto";
import { sumsubKycAdapter, sumsubIsConfigured } from "./kyc.sumsub";
import { ProviderUnavailableError } from "../shared/errors";

const SAVED = {
  app: process.env.SUMSUB_APP_TOKEN,
  secret: process.env.SUMSUB_SECRET_KEY,
  webhook: process.env.SUMSUB_WEBHOOK_SECRET,
};

function clearEnv() {
  delete process.env.SUMSUB_APP_TOKEN;
  delete process.env.SUMSUB_SECRET_KEY;
  delete process.env.SUMSUB_WEBHOOK_SECRET;
}

afterEach(() => {
  // Restaure l'environnement initial.
  if (SAVED.app === undefined) delete process.env.SUMSUB_APP_TOKEN;
  else process.env.SUMSUB_APP_TOKEN = SAVED.app;
  if (SAVED.secret === undefined) delete process.env.SUMSUB_SECRET_KEY;
  else process.env.SUMSUB_SECRET_KEY = SAVED.secret;
  if (SAVED.webhook === undefined) delete process.env.SUMSUB_WEBHOOK_SECRET;
  else process.env.SUMSUB_WEBHOOK_SECRET = SAVED.webhook;
});

describe("sumsub fail-soft (non configuré)", () => {
  beforeEach(clearEnv);

  it("isConfigured() = false sans clés", () => {
    expect(sumsubIsConfigured()).toBe(false);
  });

  it("startCase lève ProviderUnavailableError (aucun appel réseau)", async () => {
    await expect(
      sumsubKycAdapter.startCase({
        investorId: "p1",
        externalRef: "p1",
        level: "standard",
        idempotencyKey: "kyc:u1",
      }),
    ).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  it("verifyWebhook lève ProviderUnavailableError", () => {
    expect(() => sumsubKycAdapter.verifyWebhook({ rawBody: "{}", signature: "x" })).toThrow(
      ProviderUnavailableError,
    );
  });

  it("parseEvent lève ProviderUnavailableError", () => {
    expect(() => sumsubKycAdapter.parseEvent("{}")).toThrow(ProviderUnavailableError);
  });
});

describe("sumsub configuré", () => {
  const WEBHOOK_SECRET = "whsec_sumsub_test";

  beforeEach(() => {
    process.env.SUMSUB_APP_TOKEN = "app_tok_test";
    process.env.SUMSUB_SECRET_KEY = "secret_test";
    process.env.SUMSUB_WEBHOOK_SECRET = WEBHOOK_SECRET;
  });

  it("isConfigured() = true", () => {
    expect(sumsubIsConfigured()).toBe(true);
  });

  it("verifyWebhook accepte une signature HMAC valide du corps brut", () => {
    const body = JSON.stringify({ applicantId: "a1", type: "applicantReviewed" });
    const sig = createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
    expect(sumsubKycAdapter.verifyWebhook({ rawBody: body, signature: sig })).toBe(true);
  });

  it("verifyWebhook rejette une signature falsifiée / corps altéré", () => {
    const body = JSON.stringify({ applicantId: "a1" });
    const sig = createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
    expect(sumsubKycAdapter.verifyWebhook({ rawBody: body + " ", signature: sig })).toBe(false);
    expect(sumsubKycAdapter.verifyWebhook({ rawBody: body, signature: "deadbeef" })).toBe(false);
  });

  it("parseEvent : GREEN → approved + fundOriginVerified", () => {
    const body = JSON.stringify({
      applicantId: "a1",
      type: "applicantReviewed",
      reviewResult: { reviewAnswer: "GREEN" },
    });
    const e = sumsubKycAdapter.parseEvent(body);
    expect(e.status).toBe("approved");
    expect(e.fundOriginVerified).toBe(true);
    expect(e.providerCaseId).toBe("a1");
    expect(e.providerEventId).toContain("a1");
  });

  it("parseEvent : RED + FINAL → rejected", () => {
    const body = JSON.stringify({
      applicantId: "a2",
      reviewResult: { reviewAnswer: "RED", reviewRejectType: "FINAL" },
    });
    const e = sumsubKycAdapter.parseEvent(body);
    expect(e.status).toBe("rejected");
    expect(e.fundOriginVerified).toBe(false);
  });

  it("parseEvent : RED + RETRY → review", () => {
    const body = JSON.stringify({
      applicantId: "a3",
      reviewResult: { reviewAnswer: "RED", reviewRejectType: "RETRY" },
    });
    expect(sumsubKycAdapter.parseEvent(body).status).toBe("review");
  });

  it("parseEvent : verdict absent → pending", () => {
    const body = JSON.stringify({ applicantId: "a4", type: "applicantPending" });
    expect(sumsubKycAdapter.parseEvent(body).status).toBe("pending");
  });
});
