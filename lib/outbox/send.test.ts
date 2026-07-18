import { describe, it, expect, vi } from "vitest";
import { attemptSend, channelConfigured, providerFor, type SendDeps } from "./send";

/**
 * VÉRITÉ CRITIQUE — la garde d'envoi ne doit JAMAIS produire un faux 'sent'.
 * On teste chaque chemin avec des dépendances injectées (aucun réseau, aucun env).
 */

function deps(over: Partial<SendDeps> = {}): SendDeps {
  return {
    isChannelConfigured: () => true,
    sendEmail: vi.fn(async () => ({ ref: "email-real-id" })),
    sendSms: vi.fn(async () => ({ ref: "sms-real-sid" })),
    sendWhatsApp: vi.fn(async () => ({ ref: "wa-real-sid" })),
    ...over,
  };
}

const ctx = { to: "dest@example.com", subject: "Objet", body: "Bonjour" };

describe("channelConfigured", () => {
  it("délègue l'état PAR CANAL (sms et whatsapp sont indépendants)", () => {
    const d = deps({ isChannelConfigured: (c) => c === "sms" });
    expect(channelConfigured("email", d)).toBe(false);
    expect(channelConfigured("sms", d)).toBe(true);
    // WhatsApp a son propre expéditeur Twilio : il ne suit PAS le SMS.
    expect(channelConfigured("whatsapp", d)).toBe(false);
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
    const d = deps({ isChannelConfigured: () => false });
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

  it("ref NULLE sans dry → 'failed', JAMAIS 'sent' (pas d'id fournisseur = pas de preuve)", async () => {
    // Un provider qui renvoie ni dry ni référence ne PROUVE aucun envoi : sans id
    // Resend / sid Twilio, le message n'est ni traçable ni auditable. On refuse
    // de le marquer 'sent' — c'est exactement le faux positif à empêcher.
    const d = deps({ sendEmail: vi.fn(async () => ({ ref: null })) });
    const out = await attemptSend({ ...ctx, channel: "email" }, d);
    expect(out.status).toBe("failed");
    if (out.status === "failed") expect(out.error).toBe("provider_no_reference");
  });

  it("ref vide/espaces → 'failed', jamais 'sent'", async () => {
    const d = deps({ sendSms: vi.fn(async () => ({ ref: "   " })) });
    const out = await attemptSend({ ...ctx, channel: "sms" }, d);
    expect(out.status).toBe("failed");
  });

  it("INVARIANT — tout outcome 'sent' porte une référence non vide", async () => {
    const cases: Array<Partial<SendDeps>> = [
      {},
      { isChannelConfigured: () => false },
      { sendEmail: vi.fn(async () => ({ dry: true })) },
      { sendEmail: vi.fn(async () => ({ ref: null })) },
      { sendEmail: vi.fn(async () => ({ ref: "" })) },
      {
        sendEmail: vi.fn(async () => {
          throw new Error("boom");
        }),
      },
    ];
    for (const over of cases) {
      const out = await attemptSend({ ...ctx, channel: "email" }, deps(over));
      if (out.status === "sent") {
        expect(out.ref).toBeTruthy();
        expect(out.ref.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
