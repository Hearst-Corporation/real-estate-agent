/**
 * W4 — visites prospection / radar / off-market (LOTS 5B, 5J, 5F).
 *
 * Ces tests verrouillent le CONTRAT (validité, ancrage, textes) ET la doctrine
 * LOT 10 : une étape MONTRE, elle n'exécute rien. Une définition de tour étant
 * une donnée pure, la preuve « aucune mutation » est structurelle : aucune
 * étape ne porte de callback, de cible cliquable ni d'action.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateTour } from "./progress";
import { getTour } from "./tours";
import { prospectionTour, PROSPECTION_ANCHORS } from "./tours/prospection";
import { radarTour, RADAR_ANCHORS } from "./tours/radar";
import { offmarketTour, OFFMARKET_ANCHORS } from "./tours/offmarket";
import type { TourDefinition } from "./types";

const ROOT = join(__dirname, "..", "..");
const W4_TOURS: readonly TourDefinition[] = [prospectionTour, radarTour, offmarketTour];

/** Ancres exigées par le LOT 2, telles qu'elles doivent exister dans le DOM. */
const REQUIRED_ANCHORS: Record<string, readonly string[]> = {
  prospection: ["prospection-tabs", "prospection-criteria", "prospection-matching"],
  radar: ["radar-price-drops", "radar-dormant", "radar-mandates"],
  offmarket: ["offmarket-properties", "offmarket-matches", "offmarket-selection"],
};

/** Fichiers réels qui doivent porter les `data-tour-id` du tour. */
const ANCHOR_SOURCES: Record<string, readonly string[]> = {
  prospection: [
    join("app", "(dashboard)", "prospection", "page.tsx"),
    join("app", "(dashboard)", "prospection", "_components", "AcquereurProfiles.tsx"),
  ],
  radar: [join("app", "(dashboard)", "radar", "page.tsx")],
  offmarket: [
    join("app", "(dashboard)", "offmarket", "_components", "OffmarketExplorer.tsx"),
  ],
};

function sourcesOf(key: string): string {
  return ANCHOR_SOURCES[key].map((p) => readFileSync(join(ROOT, p), "utf8")).join("\n");
}

describe("W4 — définitions de tours", () => {
  it.each(W4_TOURS.map((t) => [t.key, t] as const))(
    "« %s » est valide, versionné et enregistré",
    (key, tour) => {
      expect(validateTour(tour)).toEqual([]);
      expect(tour.version).toBe(1);
      expect(getTour(tour.key)).toBe(tour);
      expect(key).toBe(tour.key);
    },
  );

  it("livre le nombre d'étapes attendu par le brief", () => {
    expect(prospectionTour.steps.length).toBe(5);
    expect(radarTour.steps.length).toBe(3);
    expect(offmarketTour.steps.length).toBe(5);
  });

  it("chaque étape a un titre et une explication non vides", () => {
    for (const tour of W4_TOURS) {
      for (const s of tour.steps) {
        expect(s.title.trim().length).toBeGreaterThan(0);
        expect(s.body.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("entre sur la route du module", () => {
    expect(prospectionTour.entryRoute).toBe("/prospection");
    expect(radarTour.entryRoute).toBe("/radar");
    expect(offmarketTour.entryRoute).toBe("/offmarket");
  });
});

describe("W4 — ancrage LOT 2", () => {
  it("n'ancre que par identifiant `data-tour-id`, jamais par sélecteur CSS", () => {
    for (const tour of W4_TOURS) {
      for (const s of tour.steps) {
        if (!s.anchor) continue;
        expect(s.anchor).toMatch(/^[a-z0-9-]+$/);
        // Ni classe, ni id CSS, ni nth-child, ni descendance.
        expect(s.anchor).not.toMatch(/[.#>\s:[\]]/);
      }
    }
  });

  it("les constantes d'ancre correspondent aux noms imposés", () => {
    expect(Object.values(PROSPECTION_ANCHORS).sort()).toEqual(
      [...REQUIRED_ANCHORS.prospection].sort(),
    );
    expect(Object.values(RADAR_ANCHORS).sort()).toEqual([...REQUIRED_ANCHORS.radar].sort());
    expect(Object.values(OFFMARKET_ANCHORS).sort()).toEqual(
      [...REQUIRED_ANCHORS.offmarket].sort(),
    );
  });

  it("chaque ancre est réellement posée dans le composant source", () => {
    for (const [key, anchors] of Object.entries(REQUIRED_ANCHORS)) {
      const src = sourcesOf(key);
      for (const anchor of anchors) {
        // Posée via la constante partagée (jamais une chaîne dupliquée à la main).
        expect(src).toMatch(/data-tour-id=\{/);
        expect(src.includes(anchor) || src.includes(constantFor(anchor))).toBe(true);
      }
    }
  });

  it("toute ancre référencée par une étape existe dans les constantes du tour", () => {
    const known = new Set<string>([
      ...Object.values(PROSPECTION_ANCHORS),
      ...Object.values(RADAR_ANCHORS),
      ...Object.values(OFFMARKET_ANCHORS),
    ]);
    for (const tour of W4_TOURS) {
      for (const s of tour.steps) {
        if (s.anchor) expect(known.has(s.anchor)).toBe(true);
      }
    }
  });

  it("une étape sans cible visible reste lisible (jamais de blocage)", () => {
    for (const tour of W4_TOURS) {
      for (const s of tour.steps) {
        if (!s.anchor) continue;
        expect(s.onMissing ?? "center").toMatch(/^(center|skip)$/);
      }
    }
  });
});

/** `prospection-tabs` → `tabs` : retrouve le nom de propriété de la constante. */
function constantFor(anchor: string): string {
  const tail = anchor.split("-").slice(1).join("-");
  return tail.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

describe("W4 — LOT 10 : la visite n'exécute rien", () => {
  it("aucune étape ne porte de callback ni d'action exécutable", () => {
    for (const tour of W4_TOURS) {
      for (const s of tour.steps) {
        for (const value of Object.values(s)) {
          expect(typeof value).not.toBe("function");
        }
        // Le contrat n'expose aucune clé d'exécution : on vérifie qu'aucune
        // n'a été ajoutée en douce sur une étape.
        for (const forbidden of ["onClick", "action", "run", "execute", "mutate", "submit"]) {
          expect(Object.hasOwn(s, forbidden)).toBe(false);
        }
      }
    }
  });

  it("le composant off-market refuse la création de lien public pendant la visite", () => {
    const src = readFileSync(
      join(ROOT, "app", "(dashboard)", "offmarket", "_components", "OffmarketExplorer.tsx"),
      "utf8",
    );
    // Garde en tête de `createSelection`, AVANT tout POST.
    const guardAt = src.indexOf("if (tourActive) return;");
    const postAt = src.indexOf('method: "POST"');
    expect(guardAt).toBeGreaterThan(-1);
    expect(postAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(postAt);
    // Et le bouton est visiblement inactif, pas seulement inerte au clic.
    expect(src).toMatch(/disabled=\{[^}]*tourActive[^}]*\}/);
  });

  it("l'étape « lien partageable » explique le geste sans le déclencher", () => {
    const step = offmarketTour.steps.find((s) => s.id === "lien");
    expect(step).toBeDefined();
    expect(step?.consequence).toBeDefined();
    // Le texte annonce explicitement qu'aucun lien n'est créé.
    expect(step?.consequence).toMatch(/aucun lien public n'est créé/i);
  });

  it("la prospection n'écrit ni critère ni signal de feedback pendant la visite", () => {
    const page = readFileSync(
      join(ROOT, "app", "(dashboard)", "prospection", "page.tsx"),
      "utf8",
    );
    const form = readFileSync(
      join(ROOT, "app", "(dashboard)", "prospection", "_components", "CritereForm.tsx"),
      "utf8",
    );
    // sendFeedback : garde avant le POST /api/prospection/matchs.
    const guardAt = page.indexOf("if (tourActive) return;");
    expect(guardAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(page.indexOf('method: "POST"'));
    // CritereForm.save : garde avant le fetch d'enregistrement.
    const formGuardAt = form.indexOf("if (tourActive) return;");
    expect(formGuardAt).toBeGreaterThan(-1);
    expect(formGuardAt).toBeLessThan(form.indexOf('fetch("/api/prospection/criteres"'));
  });

  it("le radar reste une surface de lecture : aucune étape n'annonce d'écriture", () => {
    for (const s of radarTour.steps) {
      // Chaque signal dit comment OUVRIR la vraie annonce ou le vrai mandat.
      expect(s.consequence).toBeDefined();
      expect(s.consequence).toMatch(/ouvre|emmène/i);
    }
  });
});
