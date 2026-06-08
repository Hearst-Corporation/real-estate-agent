/**
 * lib/storage/magic-bytes.ts
 *
 * Détection de type d'image par lecture des octets de signature (magic bytes).
 * N'utilise PAS le content-type déclaré — analyse le contenu réel du buffer.
 *
 * Formats supportés : jpeg, png, webp, heic/heif.
 * Retourne null si le buffer n'est pas reconnu comme une image valide.
 */

export type ImageType = "jpeg" | "png" | "webp" | "heic";

/**
 * Lit les premiers octets d'un Buffer et détecte le type d'image réel.
 *
 * Signatures :
 *  - JPEG  : FF D8 FF                                (3 octets, offset 0)
 *  - PNG   : 89 50 4E 47 0D 0A 1A 0A                (8 octets, offset 0)
 *  - WEBP  : "RIFF" (0-3) + "WEBP" (8-11)           (12 octets minimum)
 *  - HEIC  : "ftyp" (4-7) + marque heic|heif|mif1   (12 octets minimum)
 *
 * @param buf - Buffer contenant le début du fichier (au moins 12 octets recommandés)
 * @returns Le type d'image détecté, ou null si non reconnu comme image valide
 */
export function detectImageType(buf: Buffer): ImageType | null {
  if (!buf || buf.length < 4) return null;

  // ── JPEG : FF D8 FF ──────────────────────────────────────────────────────
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "jpeg";
  }

  // ── PNG : 89 50 4E 47 0D 0A 1A 0A ────────────────────────────────────────
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 && // P
    buf[2] === 0x4e && // N
    buf[3] === 0x47 && // G
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "png";
  }

  // ── WEBP : octets 0-3 = "RIFF" ET octets 8-11 = "WEBP" ─────────────────
  if (buf.length >= 12) {
    const riff = buf.toString("ascii", 0, 4);
    const webp = buf.toString("ascii", 8, 12);
    if (riff === "RIFF" && webp === "WEBP") {
      return "webp";
    }
  }

  // ── HEIC/HEIF/MIF1 : octets 4-7 = "ftyp" ET marque heic|heif|mif1 ──────
  if (buf.length >= 12) {
    const ftyp = buf.toString("ascii", 4, 8);
    if (ftyp === "ftyp") {
      const brand = buf.toString("ascii", 8, 12).toLowerCase();
      // Marques reconnues : heic, heix, heif, hevx, mif1, msf1, miaf, etc.
      if (
        brand.startsWith("hei") ||
        brand.startsWith("hev") ||
        brand === "mif1" ||
        brand === "msf1" ||
        brand === "miaf"
      ) {
        return "heic";
      }
    }
  }

  return null;
}

/**
 * Vérifie que le buffer contient bien une image reconnue (par magic bytes).
 *
 * La validation se fait sur le contenu réel — le MIME déclaré par le client
 * (`_declaredMime`) est filtré en amont et n'intervient pas ici.
 *
 * Règles de tolérance :
 *  - heic et heif sont traités comme équivalents (même conteneur ISO BMFF).
 *  - Un type d'image valide détecté est accepté même si le MIME déclaré diffère
 *    légèrement (ex. image/jpeg vs image/jpg).
 *  - Si detectImageType retourne null → refus (contenu non-image).
 *
 * @param buf           - Buffer du fichier
 * @param _declaredMime - MIME type déclaré par le client (non utilisé — filtré en amont)
 * @returns true si le contenu est une image valide reconnue par ses magic bytes
 */
export function isValidImageContent(buf: Buffer, _declaredMime: string): boolean {
  const detected = detectImageType(buf);

  // Aucun type image reconnu → rejet
  if (detected === null) return false;

  // Le contenu est bien une image valide : on accepte toujours un format image
  // connu, même si le MIME déclaré diffère (ex. client qui envoie "image/heif"
  // avec marque "heic" — c'est le même format).
  // On ne rejette QUE le contenu non-image (detected === null, cas traité ci-dessus).
  return true;
}
