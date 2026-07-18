import { describe, it, expect } from "vitest";
import { buildDraft } from "./draft";
import type { DormantProspect } from "./types";

const acquereur: DormantProspect = {
  role: "acquereur",
  lead_id: "11111111-1111-1111-1111-111111111111",
  source_id: "11111111-1111-1111-1111-111111111111",
  full_name: "Marie Dupont",
  email: "marie@example.com",
  phone: null,
  jours_inactif: 60,
  last_activity_at: "2026-05-19T12:00:00.000Z",
  reasons: [
    { code: "no_activity_since", label: "Acquéreur sans activité depuis 60 jours" },
    { code: "active_criteria", label: "Recherche « T3 Lyon » toujours active" },
    { code: "matching_properties", label: "1 bien du portefeuille correspond à ses critères" },
  ],
  match_hints: [
    { property_id: "33333333-3333-3333-3333-333333333333", title: "Bel appartement", city: "Lyon", asking_price: 300000 },
  ],
  suggested_channel: "email",
};

const proprietaire: DormantProspect = {
  role: "proprietaire",
  lead_id: null,
  source_id: "55555555-5555-5555-5555-555555555555",
  full_name: "Jean Martin",
  email: null,
  phone: "0600000000",
  jours_inactif: 80,
  last_activity_at: "2026-04-29T12:00:00.000Z",
  reasons: [
    { code: "no_activity_since", label: "Propriétaire sans nouvelle depuis 80 jours" },
    { code: "active_mandate", label: "Mandat MAND-001 (exclusif) actif" },
  ],
  match_hints: [],
  suggested_channel: "whatsapp",
};

describe("buildDraft", () => {
  it("acquéreur : personnalise nom, critères, biens ; email a un subject", () => {
    const d = buildDraft(acquereur);
    expect(d.channel).toBe("email");
    expect(d.subject).toBeTruthy();
    expect(d.body).toContain("Bonjour Marie");
    expect(d.body).toContain("Bel appartement");
    expect(d.body).toContain("Lyon");
    // le montant du bien apparaît (format eur)
    expect(d.body).toMatch(/300\s?000/);
  });

  it("propriétaire : contexte mandat, canal whatsapp sans subject", () => {
    const d = buildDraft(proprietaire);
    expect(d.channel).toBe("whatsapp");
    expect(d.subject).toBeNull();
    expect(d.body).toContain("Bonjour Jean");
    expect(d.body.toLowerCase()).toContain("vente");
  });

  it("respecte un canal explicite et injecte la signature agent", () => {
    const d = buildDraft(acquereur, { channel: "sms", agentName: "Sophie — Agence X" });
    expect(d.channel).toBe("sms");
    expect(d.subject).toBeNull(); // pas d'objet hors email
    expect(d.body).toContain("Sophie — Agence X");
  });

  it("acquéreur sans bien matché n'invente aucun bien", () => {
    const bare: DormantProspect = { ...acquereur, match_hints: [], reasons: [acquereur.reasons[0]] };
    const d = buildDraft(bare);
    expect(d.body).not.toContain("portefeuille qui pourraient");
  });
});
