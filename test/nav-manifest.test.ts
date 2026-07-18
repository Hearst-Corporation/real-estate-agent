import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  NAV,
  navRail,
  TAB_GROUPS,
  MOBILE_SHORTCUTS,
  tabGroupFor,
} from "@/config/nav";

const DASHBOARD = join(process.cwd(), "app", "(dashboard)");

/** Chemin du `page.tsx` attendu pour un href de premier niveau. */
function pageFor(href: string): string {
  return href === "/"
    ? join(DASHBOARD, "page.tsx")
    : join(DASHBOARD, href.replace(/^\//, ""), "page.tsx");
}

describe("manifeste de navigation", () => {
  it("chaque entrée NAV ouvre une page réelle", () => {
    const manquantes = NAV.filter((i) => !existsSync(pageFor(i.href))).map((i) => i.href);
    expect(manquantes).toEqual([]);
  });

  it("aucun href dupliqué", () => {
    const hrefs = NAV.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("aucun libellé vide (tout vient de UI.nav.*)", () => {
    expect(NAV.filter((i) => !i.label.trim())).toEqual([]);
  });

  it("le rail reste borné aux 6 points d'entrée", () => {
    expect(navRail.map((i) => i.href)).toEqual([
      "/",
      "/prospection",
      "/properties",
      "/leads",
      "/agenda",
      "/agents",
    ]);
    // La bottom bar mobile = rail + profil, rien de plus (tenue à 375px).
    expect(MOBILE_SHORTCUTS).toHaveLength(navRail.length + 1);
  });

  it("les parcours canoniques sont tous présents", () => {
    const canoniques = [
      "/", // accueil
      "/action-center", // centre d'actions
      "/leads", // clients
      "/properties", // biens
      "/visits", // visites
      "/estimations", // estimations
      "/prospection", // prospection
      "/radar", // radar
      "/offmarket", // matching / off-market
      "/outbox", // outbox
      "/approvals", // approbations
      "/agents", // agents
      "/assistant", // assistant
    ];
    const hrefs = new Set<string>(NAV.map((i) => i.href));
    expect(canoniques.filter((h) => !hrefs.has(h))).toEqual([]);
    // Administration : hors-rail assumée, mais la page doit exister.
    expect(existsSync(pageFor("/admin"))).toBe(true);
  });

  it("toute surface hors rail est atteignable par un groupe d'onglets", () => {
    const railHrefs = new Set(navRail.map((i) => i.href));
    const orphelines = NAV.filter((i) => {
      if (railHrefs.has(i.href)) return false;
      const group = TAB_GROUPS[(i as { tabs?: keyof typeof TAB_GROUPS }).tabs!];
      return !group?.some((t) => t.href === i.href);
    }).map((i) => i.href);
    expect(orphelines).toEqual([]);
  });

  it("chaque point d'entrée du rail expose le groupe de sa surface", () => {
    // Les 5 groupes sont chacun ancrés sur une entrée de rail (sauf /agenda,
    // autonome par choix : aucune sous-nav).
    expect(tabGroupFor("/")?.map((t) => t.href)).toEqual([
      "/",
      "/action-center",
      "/outbox",
      "/conversion",
    ]);
    expect(tabGroupFor("/prospection")?.map((t) => t.href)).toEqual([
      "/prospection",
      "/radar",
      "/offmarket",
    ]);
    expect(tabGroupFor("/properties")?.map((t) => t.href)).toEqual([
      "/properties",
      "/estimations",
      "/mandates",
      "/mandate-renewal",
    ]);
    expect(tabGroupFor("/leads")?.map((t) => t.href)).toEqual([
      "/leads",
      "/visits",
      "/reactivation",
    ]);
    expect(tabGroupFor("/agents")?.map((t) => t.href)).toEqual([
      "/agents",
      "/assistant",
      "/approvals",
    ]);
    expect(tabGroupFor("/agenda")).toBeNull();
  });

  it("une page de détail hérite du groupe de sa section", () => {
    expect(tabGroupFor("/properties/abc-123")).toBe(TAB_GROUPS.portefeuille);
    expect(tabGroupFor("/estimations/new")).toBe(TAB_GROUPS.portefeuille);
    expect(tabGroupFor("/leads/xyz")).toBe(TAB_GROUPS.clients);
  });

  it("l'accueil ne capture pas les autres routes", () => {
    // `/` est un préfixe de tout : le match doit rester exact.
    expect(tabGroupFor("/radar")).toBe(TAB_GROUPS.prospection);
    expect(tabGroupFor("/profile")).toBeNull();
    expect(tabGroupFor("/admin")).toBeNull();
  });
});
