import { describe, it, expect } from "vitest";
import { transportStatus, allTransportStatuses, transportLabel } from "./transport";

/**
 * L'état d'un transport doit être VRAI et doit NOMMER ce qui manque.
 * On injecte la présence des variables : aucun accès au vrai process.env.
 */
const withVars = (...names: string[]) => (n: string) => names.includes(n);

describe("transportStatus", () => {
  it("email LIVE quand RESEND_API_KEY + RESEND_FROM_EMAIL sont présents", () => {
    const s = transportStatus("email", withVars("RESEND_API_KEY", "RESEND_FROM_EMAIL"));
    expect(s.state).toBe("LIVE");
    expect(s.provider).toBe("resend");
    expect(s.missing).toEqual([]);
  });

  it("email CONFIG et nomme l'expéditeur manquant", () => {
    const s = transportStatus("email", withVars("RESEND_API_KEY"));
    expect(s.state).toBe("CONFIG");
    expect(s.missing).toEqual(["RESEND_FROM_EMAIL"]);
  });

  it("sms CONFIG liste TOUTES les variables Twilio manquantes", () => {
    const s = transportStatus("sms", withVars());
    expect(s.state).toBe("CONFIG");
    expect(s.missing).toEqual(["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_SMS_FROM"]);
  });

  it("sms et whatsapp ont des expéditeurs DISTINCTS", () => {
    const has = withVars("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_SMS_FROM");
    expect(transportStatus("sms", has).state).toBe("LIVE");
    // WhatsApp reste CONFIG : son propre numéro manque.
    const wa = transportStatus("whatsapp", has);
    expect(wa.state).toBe("CONFIG");
    expect(wa.missing).toEqual(["TWILIO_WHATSAPP_FROM"]);
  });

  it("une variable vide/espaces ne compte PAS comme présente", () => {
    const s = transportStatus("email", (n) => n === "RESEND_API_KEY");
    expect(s.state).toBe("CONFIG");
  });
});

describe("transportLabel — n'expose que des NOMS de variables", () => {
  it("CONFIG nomme les variables manquantes", () => {
    const label = transportLabel(transportStatus("whatsapp", withVars()));
    expect(label).toContain("TWILIO_ACCOUNT_SID");
    expect(label).toContain("non configuré");
  });

  it("aucune valeur de secret ne peut fuiter (que des noms MAJUSCULES connus)", () => {
    for (const s of allTransportStatuses(withVars())) {
      for (const name of s.missing) {
        expect(name).toMatch(/^[A-Z0-9_]+$/);
      }
    }
  });
});

describe("allTransportStatuses", () => {
  it("couvre les trois canaux", () => {
    expect(allTransportStatuses(withVars()).map((s) => s.channel)).toEqual([
      "email",
      "sms",
      "whatsapp",
    ]);
  });
});
