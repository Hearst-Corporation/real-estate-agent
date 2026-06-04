import { _electron as electron, expect, test } from "@playwright/test";
import path from "node:path";

const MAIN = path.join(__dirname, "..", "..", "dist-electron", "main.js");

test("splash → sélection env local → app charge", async () => {
  const app = await electron.launch({ args: [MAIN] });
  const splash = await app.firstWindow();

  await expect(splash).toHaveTitle(/.+/);
  const localBtn = splash.locator("button.local");
  await expect(localBtn).toBeVisible();
  await localBtn.click();

  const main = await app.waitForEvent("window");
  await main.waitForLoadState("domcontentloaded", { timeout: 15_000 });

  await app.close();
});
