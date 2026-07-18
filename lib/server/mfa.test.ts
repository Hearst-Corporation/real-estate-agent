/**
 * Tests MFA FAIL-CLOSED (REA-M04-01).
 *
 * Preuve : aucune entrée malformée, aucun secret vide, aucune exception ne peut
 * transformer une vérification en succès. Le 2e facteur ne se contourne pas par erreur.
 *   (1) verifyTotp — code/secret vide ou malformé → false ; un throw interne → false.
 *   (2) un vrai code TOTP courant → true ; un code faux → false.
 *   (3) verifyAndConsumeBackupCode — usage unique, fail-soft sur entrée dégénérée.
 */
import { describe, it, expect } from "vitest";
import { authenticator } from "otplib";
import {
  verifyTotp,
  generateMfaSecret,
  generateBackupCodes,
  hashBackupCode,
  verifyAndConsumeBackupCode,
} from "./mfa";

// ── (1) verifyTotp — fail-closed sur input dégénéré ──────────────────────────
describe("verifyTotp — fail-closed", () => {
  it("secret vide → false (jamais true)", () => {
    expect(verifyTotp("", "123456")).toBe(false);
  });

  it("code vide → false", () => {
    expect(verifyTotp(generateMfaSecret(), "")).toBe(false);
  });

  it("code non numérique / malformé → false (pas de throw)", () => {
    const secret = generateMfaSecret();
    expect(verifyTotp(secret, "not-a-code")).toBe(false);
    expect(verifyTotp(secret, "!!!")).toBe(false);
  });

  it("secret base32 invalide → false (l'exception otplib est avalée en false)", () => {
    // Un secret non-base32 fait throw otplib en interne ; verifyTotp doit renvoyer false.
    expect(verifyTotp("not valid base32 @@@", "123456")).toBe(false);
  });

  it("mauvais code contre un vrai secret → false", () => {
    const secret = generateMfaSecret();
    // "000000" a une chance négligeable d'être le code courant ; on prend le complément
    // du vrai code pour être déterministe.
    const real = authenticator.generate(secret);
    const wrong = real === "000000" ? "111111" : "000000";
    expect(verifyTotp(secret, wrong)).toBe(false);
  });
});

// ── (2) verifyTotp — succès sur code courant ─────────────────────────────────
describe("verifyTotp — succès légitime", () => {
  it("code TOTP courant du secret → true", () => {
    const secret = generateMfaSecret();
    const code = authenticator.generate(secret);
    expect(verifyTotp(secret, code)).toBe(true);
  });

  it("code entouré d'espaces (trim) → true", () => {
    const secret = generateMfaSecret();
    const code = authenticator.generate(secret);
    expect(verifyTotp(secret, `  ${code}  `)).toBe(true);
  });
});

// ── (3) codes de secours — usage unique + fail-soft ──────────────────────────
describe("verifyAndConsumeBackupCode — usage unique, fail-closed", () => {
  it("code valide → ok:true et retiré des restants (non rejouable)", () => {
    const codes = generateBackupCodes(3);
    const hashes = codes.map(hashBackupCode);
    const res = verifyAndConsumeBackupCode(codes[0], hashes);
    expect(res.ok).toBe(true);
    expect(res.remaining).toHaveLength(2);
    expect(res.remaining).not.toContain(hashBackupCode(codes[0]));
    // Rejouer le même code contre la liste réduite → refusé.
    expect(verifyAndConsumeBackupCode(codes[0], res.remaining).ok).toBe(false);
  });

  it("code inconnu → ok:false, liste inchangée", () => {
    const hashes = generateBackupCodes(2).map(hashBackupCode);
    const res = verifyAndConsumeBackupCode("ZZZZZZZZZZ", hashes);
    expect(res.ok).toBe(false);
    expect(res.remaining).toHaveLength(2);
  });

  it("entrée vide / hashes non-array → ok:false (fail-soft, jamais throw)", () => {
    expect(verifyAndConsumeBackupCode("", []).ok).toBe(false);
    // @ts-expect-error — on prouve le comportement sur input non conforme au type.
    expect(verifyAndConsumeBackupCode("ABC", null).ok).toBe(false);
  });

  it("casse / espaces normalisés avant comparaison", () => {
    const code = generateBackupCodes(1)[0];
    const hashes = [hashBackupCode(code)];
    const res = verifyAndConsumeBackupCode(`  ${code.toLowerCase()}  `, hashes);
    expect(res.ok).toBe(true);
  });
});
