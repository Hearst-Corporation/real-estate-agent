import { describe, it, expect, vi } from "vitest";
import { attemptSend, channelConfigured, providerFor, type SendDeps } from "./send";

/**
 * VÉRITÉ CRITIQUE — la garde d'envoi ne doit JAMAIS produire un faux 'sent'.
 * On teste chaque chemin avec des dépendances injectées (aucun réseau, aucun env).
 */

function deps(over: Partial<SendDeps> = {}): SendDeps {
  return {
    isEmailConfigured: () => true,
    isSmsConfigured: () => true,
    sendEmail: vi.fn(async () => ({ ref: "email-real-id" })),
    sendSms: vi.fn(async () => ({ ref: "sms-real-sid" })),
    sendWhatsApp: vi.fn(async () => ({ ref: "wa-real-sid" })),
    ...over,
  };
}

const ctx = { to: "dest@example.com", subject: "Objet", body: "Bonjour" };

describe("channelConfigured", () => {
  it("email suit Resend, sms/whatsapp suivent Twilio", () => {
    const d = deps({ isEmailConfigured: () => false, isSmsConfigured: () => true });
    expect(channelConfigured("email", d)).toBe(false);
    expect(channelConfigured("sms", d)).toBe(true);
    expect(channelConfigured("whatsapp", d)).toBe(true);
  });
});

describe("providerFor", () => {
  it("email → resend, autres → twilio", () => {
    expect(providerFor("email")).toBe("resend");
    expect(providerFor("sms")).toBe("twilio");
    expect(providerFor("whatsapp")).toBe("twilio");
  });
});

describe("attemptSend — JAMAIS de faux 'sent'", () => {
  it("provider NON configuré → 'approved' + CONFIG, ZÉRO appel réseau", async () => {
    const d = deps({ isEmailConfigured: () => false });
    const out = await attemptSend({ ...ctx, channel: "email" }, d);
    expect(out.status).toBe("approved");
    if (out.status === "approved") expect(out.reason).toBe("provider_not_configured");
    expect(d.sendEmail).not.toHaveBeenCalled();
  });

  it("provider dry-run malgré config → 'approved', JAMAIS 'sent'", async () => {
    const d = deps({ sendSms: vi.fn(async () => ({ dry: true })) });
    const out = await attemptSend({ ...ctx, channel: "sms" }, d);
    expect(out.status).toBe("approved");
    if (out.status === "approved") expect(out.reason).toBe("provider_dry_run");
  });

  it("exception provider → 'failed', jamais 'sent'", async () => {
    const d = deps({
      sendWhatsApp: vi.fn(async () => {
        throw new Error("network down");
      }),
    });
    const out = await attemptSend({ ...ctx, channel: "whatsapp" }, d);
    expect(out.status).toBe("failed");
  });

  it("ref provider réelle (email) → 'sent' + sent_at + ref", async () => {
    const out = await attemptSend({ ...ctx, channel: "email" }, deps());
    expect(out.status).toBe("sent");
    if (out.status === "sent") {
      expect(out.ref).toBe("email-real-id");
      expect(out.sentAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(out.provider).toBe("resend");
    }
  });

  it("ref provider réelle (sms) → 'sent' via twilio", async () => {
    const out = await attemptSend({ ...ctx, channel: "sms" }, deps());
    expect(out.status).toBe("sent");
    if (out.status === "sent") {
      expect(out.ref).toBe("sms-real-sid");
      expect(out.provider).toBe("twilio");
    }
  });

  it("ref nulle sans dry (cas limite provider) → 'sent' avec ref=null, jamais faux positif inverse", async () => {
    // Un provider qui renvoie ni dry ni ref : on considère l'envoi accepté (200 provider)
    // mais sans référence — statut 'sent', ref null. C'est un envoi réel côté provider.
    const d = deps({ sendEmail: vi.fn(async () => ({ ref: null })) });
    const out = await attemptSend({ ...ctx, channel: "email" }, d);
    expect(out.status).toBe("sent");
    if (out.status === "sent") expect(out.ref).toBeNull();
  });
});
