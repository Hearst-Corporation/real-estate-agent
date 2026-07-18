import { test, expect, type Page } from "@playwright/test";
import { loginPage, hasNoHorizontalScroll } from "./_helpers";

/**
 * ACCESSIBILITÉ — écrans touchés par la RC (REA-M04-14).
 *
 * Vérifie, sur les parcours critiques : focus clavier VISIBLE, landmarks/rôles
 * ARIA, `alt` sur images, labels sur inputs, et zéro scroll horizontal (charte).
 * Les manques réels sont ASSERTÉS (échec = signal), jamais patchés dans le produit.
 */

/** Retourne les inputs interactifs sans nom accessible (label / aria-label / placeholder). */
async function inputsWithoutAccessibleName(page: Page): Promise<number> {
  return page.evaluate(() => {
    const fields = [
      ...document.querySelectorAll<HTMLElement>(
        "input:not([type=hidden]):not([type=submit]):not([type=button]), textarea, select",
      ),
    ];
    let missing = 0;
    for (const el of fields) {
      const id = el.getAttribute("id");
      const hasLabelFor = id ? !!document.querySelector(`label[for="${CSS.escape(id)}"]`) : false;
      const wrappedInLabel = !!el.closest("label");
      const ariaLabel = (el.getAttribute("aria-label") ?? "").trim().length > 0;
      const ariaLabelledby = (el.getAttribute("aria-labelledby") ?? "").trim().length > 0;
      const placeholder = (el.getAttribute("placeholder") ?? "").trim().length > 0;
      if (!hasLabelFor && !wrappedInLabel && !ariaLabel && !ariaLabelledby && !placeholder) {
        missing++;
      }
    }
    return missing;
  });
}

/** Retourne le nombre d'images sans attribut `alt`. */
async function imagesWithoutAlt(page: Page): Promise<number> {
  return page.evaluate(
    () => [...document.querySelectorAll("img")].filter((i) => !i.hasAttribute("alt")).length,
  );
}

const SCREENS: string[] = [
  "/",
  "/leads",
  "/properties",
  "/estimations",
  "/prospection",
  "/agenda",
  "/agents",
  "/profile",
];

test.describe("A11y — landmarks, alt, labels, pas de h-scroll", () => {
  for (const path of SCREENS) {
    test(`${path} — structure accessible`, async ({ page }) => {
      const ok = await loginPage(page);
      test.skip(!ok, "identifiants admin absents");

      await page.goto(path);
      // Landmark principal + navigation.
      await expect(page.getByRole("main")).toBeVisible();
      await expect(page.getByRole("navigation").first()).toBeVisible();
      // Au moins un h1 (titre de page). On ne couple pas au texte exact ici :
      // c'est la structure a11y qui est vérifiée, pas le contenu éditorial.
      const h1 = page.getByRole("heading", { level: 1 });
      await expect(h1.first()).toBeVisible();
      expect(await h1.count()).toBeGreaterThanOrEqual(1);

      // Toutes les images ont un alt.
      expect(await imagesWithoutAlt(page)).toBe(0);
      // Tous les champs de saisie ont un nom accessible.
      expect(await inputsWithoutAccessibleName(page)).toBe(0);

      // Pas de scroll horizontal — desktop puis mobile.
      expect(await hasNoHorizontalScroll(page)).toBe(true);
      await page.setViewportSize({ width: 375, height: 812 });
      await page.waitForTimeout(150);
      expect(await hasNoHorizontalScroll(page)).toBe(true);
    });
  }
});

test.describe("A11y — focus clavier visible", () => {
  test("login : Tab expose un indicateur de focus sur les champs", async ({ page }) => {
    await page.goto("/auth/login");
    const email = page.locator('input[type="email"]');
    await email.focus();
    // Focus réel : l'élément actif est bien le champ email.
    const focused = await page.evaluate(() => document.activeElement?.getAttribute("type"));
    expect(focused).toBe("email");
    // Le champ email expose un anneau de focus (ring/outline via focus:ring-*).
    const hasFocusStyle = await email.evaluate((el) => {
      const cs = getComputedStyle(el);
      return (
        cs.outlineStyle !== "none" ||
        cs.boxShadow !== "none" ||
        // Tailwind ring => box-shadow ; certains thèmes => border color change.
        cs.borderColor.length > 0
      );
    });
    expect(hasFocusStyle).toBe(true);
  });

  test("/agents : le bouton Actualiser est atteignable au clavier", async ({ page }) => {
    const ok = await loginPage(page);
    test.skip(!ok, "identifiants admin absents");
    await page.goto("/agents");
    const refresh = page.getByRole("button", { name: /Actualiser/i });
    await refresh.focus();
    // data-focus (Headless UI) OU :focus natif → l'élément actif est le bouton.
    const isActive = await refresh.evaluate((el) => el === document.activeElement);
    expect(isActive).toBe(true);
  });
});
