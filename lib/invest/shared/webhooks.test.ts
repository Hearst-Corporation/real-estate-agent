/**
 * lib/invest/shared/webhooks.test.ts — Pattern B : HMAC timing-safe + dédup.
 */

import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyHmacSignature, dedupeWebhook, type WebhookStore } from "./webhooks";

const SECRET = "whsec_test_123";
function sign(body: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

describe("verifyHmacSignature", () => {
  const body = JSON.stringify({ event: "kyc.completed", id: "evt_1" });

  it("accepte une signature valide (hex brut)", () => {
    expect(verifyHmacSignature(body, sign(body), SECRET)).toBe(true);
  });
  it("accepte le préfixe sha256=", () => {
    expect(verifyHmacSignature(body, `sha256=${sign(body)}`, SECRET)).toBe(true);
  });
  it("rejette une signature falsifiée de même longueur", () => {
    const bad = sign(body).replace(/.$/, (c) => (c === "0" ? "1" : "0"));
    expect(verifyHmacSignature(body, bad, SECRET)).toBe(false);
  });
  it("rejette si le corps a été altéré", () => {
    expect(verifyHmacSignature(body + " ", sign(body), SECRET)).toBe(false);
  });
  it("rejette un mauvais secret", () => {
    expect(verifyHmacSignature(body, sign(body, "autre"), SECRET)).toBe(false);
  });
  it("rejette un header vide/absent", () => {
    expect(verifyHmacSignature(body, null, SECRET)).toBe(false);
    expect(verifyHmacSignature(body, "", SECRET)).toBe(false);
  });
  it("rejette un secret vide", () => {
    expect(verifyHmacSignature(body, sign(body), "")).toBe(false);
  });
  it("rejette une signature de longueur incohérente (timing-safe)", () => {
    expect(verifyHmacSignature(body, "deadbeef", SECRET)).toBe(false);
  });
  it("rejette un header non-hex sans throw", () => {
    expect(verifyHmacSignature(body, "zzzz-not-hex", SECRET)).toBe(false);
  });
});

/** Store de dédup en mémoire respectant l'unicité (provider, event_id). */
function memWebhookStore(): WebhookStore & { seen: Set<string> } {
  const seen = new Set<string>();
  return {
    seen,
    async insertEvent(provider, providerEventId) {
      const k = `${provider}:${providerEventId}`;
      if (seen.has(k)) return false; // doublon
      seen.add(k);
      return true; // neuf
    },
  };
}

describe("dedupeWebhook", () => {
  it("retourne true au premier événement (neuf)", async () => {
    const store = memWebhookStore();
    expect(await dedupeWebhook(store, "sumsub", "evt_1")).toBe(true);
  });
  it("retourne false sur un doublon (même provider+event_id)", async () => {
    const store = memWebhookStore();
    await dedupeWebhook(store, "sumsub", "evt_1");
    expect(await dedupeWebhook(store, "sumsub", "evt_1")).toBe(false);
  });
  it("distingue deux providers sur le même event_id", async () => {
    const store = memWebhookStore();
    await dedupeWebhook(store, "sumsub", "evt_1");
    expect(await dedupeWebhook(store, "yousign", "evt_1")).toBe(true);
  });
});
