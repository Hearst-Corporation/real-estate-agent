import { describe, it, expect } from "vitest";
import { classifyEstimationEmail, extractHints } from "./gmail-estimation";

// ── Détection : vraies demandes acceptées ────────────────────────────────────
describe("classifyEstimationEmail — acceptation", () => {
  it("accepte une vraie demande d'estimation (expression forte)", () => {
    const r = classifyEstimationEmail({
      subject: "Demande d'estimation appartement",
      body: "Bonjour, je souhaite faire estimer mon appartement T3 de 72 m² en vue de le vendre.",
    });
    expect(r.excluded).toBe(false);
    expect(r.score).toBeGreaterThan(0.5);
  });

  it("accepte intention + terme immobilier sans expression forte", () => {
    const r = classifyEstimationEmail({
      subject: "Vente maison",
      body: "Je voudrais une estimation pour ma maison de 4 pièces.",
    });
    expect(r.excluded).toBe(false);
    expect(r.score).toBeGreaterThan(0);
  });
});

// ── Faux positifs rejetés ─────────────────────────────────────────────────────
describe("classifyEstimationEmail — rejets (faux positifs)", () => {
  it("rejette un email énergie/ENGIE (même s'il parle de montant)", () => {
    const r = classifyEstimationEmail({
      subject: "Personnel et confidentiel - dossier ENGIE",
      body: "Votre dossier ENGIE DCP d'un montant de 10 309,37 euros. Facture en attente.",
    });
    expect(r.excluded).toBe(true);
    expect(r.score).toBe(0);
  });

  it("rejette une newsletter", () => {
    const r = classifyEstimationEmail({
      subject: "Notre newsletter du mois",
      body: "Découvrez nos offres. Pour vous désabonner, cliquez ici. Unsubscribe.",
    });
    expect(r.excluded).toBe(true);
    expect(r.score).toBe(0);
  });

  it("rejette une facture / relance de recouvrement", () => {
    const r = classifyEstimationEmail({
      subject: "Relance de paiement - facture impayée",
      body: "Nous vous rappelons votre échéance. Montant dû à régler sous 8 jours. Recouvrement.",
    });
    expect(r.excluded).toBe(true);
    expect(r.score).toBe(0);
  });

  it("rejette une notification e-commerce (livraison/commande)", () => {
    const r = classifyEstimationEmail({
      subject: "Votre commande est en cours de livraison",
      body: "Votre colis arrive demain. Suivez votre livraison.",
    });
    expect(r.excluded).toBe(true);
    expect(r.score).toBe(0);
  });

  it("rejette un email sans intention ni terme immobilier", () => {
    const r = classifyEstimationEmail({
      subject: "Réunion d'équipe",
      body: "On se voit lundi à 10h pour le point hebdo.",
    });
    expect(r.score).toBe(0);
  });

  it("accepte une vraie demande MÊME si un mot d'exclusion traîne (expression forte prioritaire)", () => {
    const r = classifyEstimationEmail({
      subject: "Estimation de mon appartement",
      body: "Je veux faire estimer mon appartement. PS: joindre ma dernière facture d'électricité si besoin.",
    });
    // L'expression forte « faire estimer mon » prime sur l'exclusion.
    expect(r.excluded).toBe(false);
    expect(r.score).toBeGreaterThan(0.5);
  });
});

// ── Extraction d'indices déterministes ────────────────────────────────────────
describe("extractHints — extraction déterministe", () => {
  it("extrait téléphone, code postal, surface et pièces", () => {
    const h = extractHints({
      subject: "Estimation appartement",
      body: "Appartement T3 de 72 m² au 12 rue de Lyon, 75011 Paris. Tél : 06 12 34 56 78.",
    });
    expect(h.phone).toBe("06 12 34 56 78");
    expect(h.postalCode).toBe("75011");
    expect(h.surface).toBe(72);
    expect(h.rooms).toBe(3);
  });

  it("extrait surface en m2 sans symbole et pièces en toutes lettres", () => {
    const h = extractHints({
      subject: "",
      body: "Maison de 120m2, 5 pièces.",
    });
    expect(h.surface).toBe(120);
    expect(h.rooms).toBe(5);
  });

  it("n'invente rien quand les motifs sont absents", () => {
    const h = extractHints({ subject: "Bonjour", body: "Je vends." });
    expect(h.phone).toBeNull();
    expect(h.postalCode).toBeNull();
    expect(h.surface).toBeNull();
    expect(h.rooms).toBeNull();
  });

  it("reconnaît un numéro au format +33", () => {
    const h = extractHints({ subject: "", body: "Joignable au +33 6 11 22 33 44." });
    expect(h.phone).not.toBeNull();
  });
});
