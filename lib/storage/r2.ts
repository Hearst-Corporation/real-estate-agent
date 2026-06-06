/**
 * lib/storage/r2.ts — Client R2 S3-compatible (sigv4 via aws4fetch).
 *
 * Fonctions exportées :
 *   putObject(key, body, contentType)  → void
 *   getObject(key)                      → Buffer | null
 *   deleteObject(key)                   → void
 *   publicUrl(key)                      → string
 *   r2IsConfigured()                    → boolean
 */

import { AwsClient } from "aws4fetch";

function getClient(): AwsClient | null {
  const endpoint  = process.env.R2_ENDPOINT;
  const accessKey = process.env.R2_ACCESS_KEY_ID;
  const secretKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKey || !secretKey) return null;
  return new AwsClient({
    accessKeyId:     accessKey,
    secretAccessKey: secretKey,
    service:         "s3",
    // R2 doesn't need a region, but aws4fetch requires one — use "auto"
    region:          "auto",
  });
}

function bucketUrl(key: string): string {
  const endpoint = process.env.R2_ENDPOINT!;
  const bucket   = process.env.R2_BUCKET!;
  // Trailing-slash-safe join
  const base = endpoint.replace(/\/$/, "");
  return `${base}/${bucket}/${key}`;
}

/** true si toutes les variables R2 sont présentes. */
export function r2IsConfigured(): boolean {
  return !!(
    process.env.R2_ENDPOINT &&
    process.env.R2_BUCKET &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY
  );
}

/**
 * Upload un objet sur R2.
 * Silencieux uniquement si r2IsConfigured() est false (caller doit vérifier).
 * Throw si l'upload échoue (HTTP !2xx).
 */
export async function putObject(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string
): Promise<void> {
  const client = getClient();
  if (!client) throw new Error("R2 not configured");

  const url = bucketUrl(key);
  const res = await client.fetch(url, {
    method:  "PUT",
    headers: { "Content-Type": contentType },
    body:    body as unknown as BodyInit,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`R2 putObject failed: ${res.status} ${text}`);
  }
}

/**
 * Récupère un objet depuis R2.
 * Renvoie null si l'objet n'existe pas (404) ou si R2 n'est pas configuré.
 * Throw si l'erreur est autre que 404.
 */
export async function getObject(key: string): Promise<Buffer | null> {
  const client = getClient();
  if (!client) return null;

  const url = bucketUrl(key);
  const res = await client.fetch(url, { method: "GET" });

  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`R2 getObject failed: ${res.status} ${text}`);
  }

  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

/**
 * Supprime un objet de R2.
 * No-op silencieux si R2 n'est pas configuré ou si l'objet n'existe pas (404).
 * Throw si l'erreur est autre que 404.
 */
export async function deleteObject(key: string): Promise<void> {
  const client = getClient();
  if (!client) return;

  const url = bucketUrl(key);
  const res = await client.fetch(url, { method: "DELETE" });

  if (res.status === 404) return;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`R2 deleteObject failed: ${res.status} ${text}`);
  }
}

/**
 * URL publique d'un objet (nécessite que R2_PUBLIC_URL soit défini
 * et que le bucket ait un domaine public activé).
 */
export function publicUrl(key: string): string {
  const base = (process.env.R2_PUBLIC_URL ?? "").replace(/\/$/, "");
  return `${base}/${key}`;
}
