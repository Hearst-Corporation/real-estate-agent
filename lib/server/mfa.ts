import "server-only";
import { authenticator } from "otplib";
import { createHash, randomBytes } from "node:crypto";

/**
 * MFA TOTP (RFC 6238) — helpers serveur.
 *
 * - Le secret TOTP est stocké tel quel (clair) côté DB : on en a besoin pour recalculer
 *   le code à chaque vérification (impossible à hasher).
 * - Les codes de secours, eux, sont stockés en HASHES sha256 (jamais en clair). Le clair
 *   n'est retourné qu'une fois (à l'activation) pour affichage à l'utilisateur.
 * - Toutes les fonctions sont fail-soft : aucun throw sur input malformé.
 */

// ─── Constantes (pas de magic numbers nus) ───────────────────────────────────

/** Émetteur affiché dans l'app d'authentification (Google Authenticator, etc.). */
const MFA_ISSUER = "Real Estate Agent";

/**
 * Fenêtre de tolérance TOTP : ±N pas de 30 s autour de l'instant courant.
 * window:1 → accepte le code précédent / courant / suivant (couvre le décalage d'horloge).
 */
const TOTP_WINDOW = 1;

/** Nombre de codes de secours générés par défaut. */
const DEFAULT_BACKUP_CODE_COUNT = 10;

/** Longueur (en caractères) d'un code de secours. */
const BACKUP_CODE_LENGTH = 10;

/**
 * Alphabet des codes de secours : base32 "lisible", sans caractères ambigus
 * (pas de 0/O, 1/I/L, etc.) pour éviter les erreurs de recopie manuelle.
 */
const BACKUP_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

// otplib : fenêtre de tolérance commune à toutes les vérifications de cette instance.
authenticator.options = { window: TOTP_WINDOW };

// ─── API ──────────────────────────────────────────────────────────────────────

/** Génère un nouveau secret TOTP base32 (à stocker tel quel côté serveur). */
export function generateMfaSecret(): string {
  return authenticator.generateSecret();
}

/**
 * Construit l'URL `otpauth://` à encoder en QR code pour l'enrôlement.
 * @param email  identité affichée dans l'app d'authentification.
 * @param secret secret TOTP base32 préalablement généré.
 */
export function buildOtpauthUrl(email: string, secret: string): string {
  return authenticator.keyuri(email, MFA_ISSUER, secret);
}

/**
 * Vérifie un code TOTP à 6 chiffres contre le secret.
 * Fail-soft : retourne `false` (jamais de throw) si le token est malformé ou vide.
 */
export function verifyTotp(secret: string, token: string): boolean {
  if (!secret || !token) return false;
  try {
    return authenticator.verify({ token: token.trim(), secret });
  } catch {
    return false;
  }
}

/**
 * Génère `count` codes de secours en CLAIR (à montrer une seule fois à l'utilisateur).
 * Format : `BACKUP_CODE_LENGTH` caractères de l'alphabet base32 lisible.
 * Stocker les HASHES via {@link hashBackupCode}, jamais le clair.
 */
export function generateBackupCodes(count: number = DEFAULT_BACKUP_CODE_COUNT): string[] {
  const safeCount = Number.isInteger(count) && count > 0 ? count : DEFAULT_BACKUP_CODE_COUNT;
  const codes: string[] = [];
  for (let i = 0; i < safeCount; i++) {
    codes.push(randomBackupCode());
  }
  return codes;
}

/**
 * Hash sha256 (hex) d'un code de secours. Normalise (trim + uppercase) avant de hasher,
 * pour matcher quelle que soit la casse / les espaces de saisie de l'utilisateur.
 */
export function hashBackupCode(code: string): string {
  const normalized = String(code ?? "").trim().toUpperCase();
  return createHash("sha256").update(normalized).digest("hex");
}

/**
 * Vérifie un code de secours en clair contre la liste de HASHES stockés, et le consomme.
 * @returns `{ ok: true, remaining }` (hashes sans celui consommé) si le code est valide ;
 *          sinon `{ ok: false, remaining }` avec la liste inchangée.
 * Fail-soft : entrée vide / hashes non-array → `{ ok: false, remaining: [] }`.
 */
export function verifyAndConsumeBackupCode(
  plain: string,
  hashes: string[],
): { ok: boolean; remaining: string[] } {
  const list = Array.isArray(hashes) ? hashes : [];
  if (!plain) return { ok: false, remaining: list };

  const target = hashBackupCode(plain);
  const index = list.indexOf(target);
  if (index === -1) {
    return { ok: false, remaining: list };
  }

  const remaining = list.filter((_, i) => i !== index);
  return { ok: true, remaining };
}

// ─── Interne ────────────────────────────────────────────────────────────────

/** Un code de secours aléatoire (CSPRNG, alphabet lisible sans modulo-bias). */
function randomBackupCode(): string {
  const alphabetLen = BACKUP_CODE_ALPHABET.length;
  // Borne anti-biais : on rejette les octets >= au plus grand multiple de alphabetLen <= 256.
  const maxUnbiased = Math.floor(256 / alphabetLen) * alphabetLen;
  let out = "";
  while (out.length < BACKUP_CODE_LENGTH) {
    const bytes = randomBytes(BACKUP_CODE_LENGTH);
    for (let i = 0; i < bytes.length && out.length < BACKUP_CODE_LENGTH; i++) {
      const b = bytes[i];
      if (b < maxUnbiased) {
        out += BACKUP_CODE_ALPHABET[b % alphabetLen];
      }
    }
  }
  return out;
}
