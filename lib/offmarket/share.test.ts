import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { signSelectionToken, verifySelectionToken } from "./share";

const OLD = process.env.OFFMARKET_SHARING_SECRET;
const OLD_R = process.env.REPORT_SHARING_SECRET;

beforeEach(() => {
  process.env.OFFMARKET_SHARING_SECRET = "test-secret-offmarket-0123456789";
  delete process.env.REPORT_SHARING_SECRET;
});
afterEach(() => {
  if (OLD === undefined) delete process.env.OFFMARKET_SHARING_SECRET;
  else process.env.OFFMARKET_SHARING_SECRET = OLD;
  if (OLD_R === undefined) delete process.env.REPORT_SHARING_SECRET;
  else process.env.REPORT_SHARING_SECRET = OLD_R;
});

describe("offmarket share token", () => {
  it("round-trip signe puis vérifie l'id de sélection", async () => {
    const id = "55555555-5555-5555-5555-555555555555";
    const token = await signSelectionToken(id);
    const verified = await verifySelectionToken(token);
    expect(verified?.selectionId).toBe(id);
  });

  it("rejette un token bidon", async () => {
    expect(await verifySelectionToken("not-a-jwt")).toBeNull();
  });

  it("rejette un token expiré", async () => {
    const token = await signSelectionToken("66666666-6666-6666-6666-666666666666", -10);
    expect(await verifySelectionToken(token)).toBeNull();
  });

  it("rejette un token signé avec un autre secret", async () => {
    const token = await signSelectionToken("77777777-7777-7777-7777-777777777777");
    process.env.OFFMARKET_SHARING_SECRET = "un-autre-secret-completement-different";
    expect(await verifySelectionToken(token)).toBeNull();
  });

  it("retombe sur REPORT_SHARING_SECRET si OFFMARKET_SHARING_SECRET absent", async () => {
    delete process.env.OFFMARKET_SHARING_SECRET;
    process.env.REPORT_SHARING_SECRET = "fallback-secret-report-0123456789";
    const token = await signSelectionToken("88888888-8888-8888-8888-888888888888");
    expect((await verifySelectionToken(token))?.selectionId).toBe("88888888-8888-8888-8888-888888888888");
  });

  it("verify renvoie null si aucun secret configuré", async () => {
    delete process.env.OFFMARKET_SHARING_SECRET;
    delete process.env.REPORT_SHARING_SECRET;
    expect(await verifySelectionToken("whatever")).toBeNull();
  });
});
