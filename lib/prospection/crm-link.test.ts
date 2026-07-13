import { describe, it, expect } from "vitest";
import {
  mapAnnonceToLead,
  mapAnnonceToProperty,
  CRM_PROVENANCE,
  type AnnonceRowLike,
} from "./crm-link";

// ── mapAnnonceToLead ────────────────────────────────────────────────────────────

describe("mapAnnonceToLead", () => {
  it("mappe nom/email/telephone et marque la provenance prospection", () => {
    const lead = mapAnnonceToLead({
      nom_annonceur: "  Jean Vendeur  ",
      email_vendeur: "  jean@ex.com ",
      telephone_vendeur: " 06 12 34 56 78 ",
      source: "leboncoin",
      type_annonceur: "particulier",
    });
    expect(lead.full_name).toBe("Jean Vendeur");
    expect(lead.email).toBe("jean@ex.com");
    expect(lead.phone).toBe("06 12 34 56 78");
    expect(lead.kind).toBe("vendeur");
    expect(lead.source).toBe(CRM_PROVENANCE);
    expect(lead.type_personne).toBe("physique");
  });

  it("n'émet QUE les champs présents (pas de clé email/phone à null)", () => {
    const lead = mapAnnonceToLead({ nom_annonceur: "X" });
    expect("email" in lead).toBe(false);
    expect("phone" in lead).toBe(false);
    expect("type_personne" in lead).toBe(false);
  });

  it("fallback full_name quand nom_annonceur absent (full_name requis DB)", () => {
    const lead = mapAnnonceToLead({ email_vendeur: "a@b.c" });
    expect(lead.full_name).toBe("Vendeur (annonce)");
    expect(lead.email).toBe("a@b.c");
  });

  it("mappe un annonceur pro/agence en type_personne morale", () => {
    expect(mapAnnonceToLead({ type_annonceur: "agence" }).type_personne).toBe("morale");
    expect(mapAnnonceToLead({ type_annonceur: "PROFESSIONNEL" }).type_personne).toBe("morale");
  });

  it("ignore un type_annonceur inconnu (pas de type_personne inventé)", () => {
    expect("type_personne" in mapAnnonceToLead({ type_annonceur: "???" })).toBe(false);
  });

  it("traite une chaîne vide comme absente", () => {
    const lead = mapAnnonceToLead({ nom_annonceur: "   ", email_vendeur: "" });
    expect(lead.full_name).toBe("Vendeur (annonce)");
    expect("email" in lead).toBe(false);
  });
});

// ── mapAnnonceToProperty ────────────────────────────────────────────────────────

describe("mapAnnonceToProperty", () => {
  it("mappe type/titre/prix/surface/pieces/ville/cp + provenance dans notes", () => {
    const p = mapAnnonceToProperty({
      type_bien: "Appartement",
      titre: "  T3 lumineux  ",
      prix: 250000,
      surface: 62,
      pieces: 3,
      chambres: 2,
      ville: "Lyon",
      code_postal: "69003",
      dpe: "c",
      latitude: 45.75,
      longitude: 4.85,
      url: "https://ex.com/a1",
      source: "leboncoin",
    });
    expect(p.property_type).toBe("appartement");
    expect(p.title).toBe("T3 lumineux");
    expect(p.asking_price).toBe(250000);
    expect(p.surface).toBe(62);
    expect(p.rooms).toBe(3);
    expect(p.bedrooms).toBe(2);
    expect(p.city).toBe("Lyon");
    expect(p.postal_code).toBe("69003");
    expect(p.status).toBe("prospect");
    // provenance + métadonnées consignées dans notes (colonnes dédiées absentes)
    expect(p.notes).toContain(`Provenance: ${CRM_PROVENANCE}`);
    expect(p.notes).toContain("Source: leboncoin");
    expect(p.notes).toContain("Annonce: https://ex.com/a1");
    expect(p.notes).toContain("DPE: C");
    expect(p.notes).toContain("GPS: 45.75,4.85");
  });

  it("n'émet QUE les champs présents (pas de surface/prix à null)", () => {
    const p = mapAnnonceToProperty({ type_bien: "maison", ville: "Nice" });
    expect("surface" in p).toBe(false);
    expect("asking_price" in p).toBe(false);
    expect("rooms" in p).toBe(false);
    expect(p.property_type).toBe("maison");
    expect(p.city).toBe("Nice");
  });

  it("type_bien inconnu → 'autre' (jamais de crash)", () => {
    expect(mapAnnonceToProperty({ type_bien: "château" }).property_type).toBe("autre");
    expect(mapAnnonceToProperty({}).property_type).toBe("autre");
  });

  it("prix/surface en chaîne numérique sont parsés", () => {
    const p = mapAnnonceToProperty({ prix: "199000", surface: "45" } as AnnonceRowLike);
    expect(p.asking_price).toBe(199000);
    expect(p.surface).toBe(45);
  });

  it("surface < 1 et prix non fini sont ignorés", () => {
    const p = mapAnnonceToProperty({ surface: 0, prix: "abc" });
    expect("surface" in p).toBe(false);
    expect("asking_price" in p).toBe(false);
  });

  it("DPE hors A-G n'est pas consigné", () => {
    const p = mapAnnonceToProperty({ dpe: "Z" });
    expect(p.notes).not.toContain("DPE:");
  });

  it("GPS n'apparaît que si latitude ET longitude présentes", () => {
    expect(mapAnnonceToProperty({ latitude: 45 }).notes).not.toContain("GPS:");
    expect(mapAnnonceToProperty({ latitude: 45, longitude: 4 }).notes).toContain("GPS: 45,4");
  });
});
