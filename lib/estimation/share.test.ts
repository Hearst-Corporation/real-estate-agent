import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SignJWT } from "jose";
import { signShareToken, verifyShareToken } from "./share";

// Secret de test injecté via l'env (le module lit process.env.REPORT_SHARING_SECRET
// à CHAQUE appel — pas de capture au chargement — donc mutable par test).
const SECRET = "test-share-secret-please-do-not-use-in-prod";
const OTHER_SECRET = "another-secret-entirely-different";

const EID = "275de142-cf6f-48d1-b9a4-bb84e3177792";

/** Signe manuellement un token HS256 { eid, exp } avec un secret arbitraire. */
async function signWith(
  secret: string,
  payload: Record<string, unknown>,
  expOffsetSec: number,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const key = new TextEncoder().encode(secret);
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(now + expOffsetSec)
    .sign(key);
}

describe("share tokens", () => {
  let prev: string | undefined;

  beforeEach(() => {
    prev = process.env.REPORT_SHARING_SECRET;
    process.env.REPORT_SHARING_SECRET = SECRET;
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.REPORT_SHARING_SECRET;
    else process.env.REPORT_SHARING_SECRET = prev;
  });

  it("token valide → payload { estimationId } correct", async () => {
    const token = await signShareToken(EID);
    const verified = await verifyShareToken(token);
    expect(verified).toEqual({ estimationId: EID });
  });

  it("token bidon (non-JWT) → null", async () => {
    expect(await verifyShareToken("not-a-jwt")).toBeNull();
    expect(await verifyShareToken("")).toBeNull();
    expect(await verifyShareToken("a.b.c")).toBeNull();
  });

  it("token expiré → null", async () => {
    // exp dans le passé (-10s), signé avec le BON secret : seule l'expiration
    // doit le rejeter.
    const expired = await signWith(SECRET, { eid: EID }, -10);
    expect(await verifyShareToken(expired)).toBeNull();
  });

  it("token signé avec un autre secret → null", async () => {
    const forged = await signWith(OTHER_SECRET, { eid: EID }, 3600);
    expect(await verifyShareToken(forged)).toBeNull();
  });

  it("token sans champ eid → null", async () => {
    const noEid = await signWith(SECRET, { foo: "bar" }, 3600);
    expect(await verifyShareToken(noEid)).toBeNull();
  });

  it("eid non-string (number) → null", async () => {
    const numEid = await signWith(SECRET, { eid: 123 }, 3600);
    expect(await verifyShareToken(numEid)).toBeNull();
  });

  it("secret absent → verify renvoie null, sign throw", async () => {
    delete process.env.REPORT_SHARING_SECRET;
    const anyToken = await signWith(SECRET, { eid: EID }, 3600);
    expect(await verifyShareToken(anyToken)).toBeNull();
    await expect(signShareToken(EID)).rejects.toThrow(/REPORT_SHARING_SECRET/);
  });

  it("aucune révocation par liste — le token vaut jusqu'à expiration (expiration-only)", async () => {
    // Contrat documenté : payload = { eid, exp }. Pas de jti, pas de liste de
    // révocation. Un token valide non expiré reste valide même après plusieurs
    // vérifications. Ce test documente ce comportement (pas de révocation prévue).
    const token = await signShareToken(EID, 3600);
    expect(await verifyShareToken(token)).toEqual({ estimationId: EID });
    expect(await verifyShareToken(token)).toEqual({ estimationId: EID });
  });
});
