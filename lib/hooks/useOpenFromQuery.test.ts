import { describe, it, expect } from "vitest";
import { cleanUrlWithoutParam } from "./useOpenFromQuery";

describe("cleanUrlWithoutParam", () => {
  it("retire le param déclencheur quand il vaut 1", () => {
    const url = cleanUrlWithoutParam("/leads", new URLSearchParams("new=1"), "new");
    expect(url).toBe("/leads");
  });

  it("préserve les autres params, ne retire que le déclencheur", () => {
    const url = cleanUrlWithoutParam(
      "/properties",
      new URLSearchParams("view=list&new=1&sort=price"),
      "new",
    );
    // L'ordre est préservé par URLSearchParams : new est retiré au milieu.
    expect(url).toBe("/properties?view=list&sort=price");
  });

  it("retourne null si le param est absent (rien à nettoyer → pas de replace, pas de boucle)", () => {
    expect(cleanUrlWithoutParam("/visits", new URLSearchParams(""), "new")).toBeNull();
    expect(
      cleanUrlWithoutParam("/visits", new URLSearchParams("view=kanban"), "new"),
    ).toBeNull();
  });

  it("retourne null si le param vaut autre chose que 1", () => {
    expect(cleanUrlWithoutParam("/leads", new URLSearchParams("new=0"), "new")).toBeNull();
    expect(cleanUrlWithoutParam("/leads", new URLSearchParams("new=true"), "new")).toBeNull();
  });

  it("après nettoyage, ré-appeler sur l'URL propre retourne null (idempotence anti-boucle)", () => {
    const first = cleanUrlWithoutParam("/leads", new URLSearchParams("new=1"), "new");
    expect(first).toBe("/leads");
    // Sur l'URL nettoyée, plus de `new` → null → l'effet React ne re-replace pas.
    const second = cleanUrlWithoutParam("/leads", new URLSearchParams(""), "new");
    expect(second).toBeNull();
  });
});
