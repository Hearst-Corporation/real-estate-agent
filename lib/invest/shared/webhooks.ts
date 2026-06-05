/**
 * lib/invest/shared/webhooks.ts — Pattern B : webhooks signés + dédup (I8).
 *
 * Tout webhook entrant (Sumsub, Yousign, escrow EMI, Circle, Monerium, indexer
 * chaîne) suit TROIS étapes, et UNIQUEMENT celles-ci :
 *   1. vérifier la signature HMAC (`verifyHmacSignature`) — rejet 401 sinon ;
 *   2. dédup par (provider, provider_event_id) UNIQUE (`dedupeWebhook`) — un
 *      doublon est un 200 no-op ;
 *   3. enfiler un ÉVÉNEMENT DE DOMAINE (Inngest) qui portera la logique métier.
 *
 * ⚠️ Le webhook ne fait JAMAIS la logique métier inline : il vérifie, déduplique,
 * puis enfile. Toute la robustesse (retries, idempotence) vit côté worker.
 * `verifyHmacSignature` est PUR (testable) et la comparaison est TIMING-SAFE.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { getSupabaseAdmin } from "../../server/supabase";
import { DEFAULT_TENANT_ID } from "./types";

/**
 * Vérifie une signature HMAC-SHA256 d'un corps brut, en comparaison
 * TIMING-SAFE (`crypto.timingSafeEqual`) pour ne pas fuiter via le temps de
 * réponse. PUR → testable sans I/O.
 *
 * Le header peut être la signature hex brute ou préfixée `sha256=...` (style
 * GitHub/Stripe) — on tolère ce préfixe. Toute longueur incohérente → false
 * (timingSafeEqual exige des buffers de même taille).
 *
 * @param rawBody          corps EXACT reçu (jamais le JSON re-sérialisé).
 * @param signatureHeader  valeur du header de signature fourni par le provider.
 * @param secret           secret partagé du webhook (env, jamais hardcodé).
 */
export function verifyHmacSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string,
): boolean {
  if (!signatureHeader || !secret) return false;

  const provided = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice("sha256=".length)
    : signatureHeader;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");

  // timingSafeEqual lève si les longueurs diffèrent → on garde la propriété
  // constant-time en comparant des buffers de taille fixe (hex sha256 = 64).
  let providedBuf: Buffer;
  let expectedBuf: Buffer;
  try {
    providedBuf = Buffer.from(provided, "hex");
    expectedBuf = Buffer.from(expected, "hex");
  } catch {
    return false;
  }
  if (providedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(providedBuf, expectedBuf);
}

/**
 * Store de dédup injectable. `insertEvent` applique ON CONFLICT DO NOTHING sur
 * la contrainte unique (provider, provider_event_id) et retourne `true` si la
 * ligne est neuve (événement jamais vu), `false` si c'était un doublon.
 */
export interface WebhookStore {
  /** @returns true si l'événement est NEUF, false si déjà reçu (doublon). */
  insertEvent(provider: string, providerEventId: string): Promise<boolean>;
}

/**
 * Déduplique un webhook via `inv_webhook_events`.
 *
 * @returns true  = événement NOUVEAU (à traiter / enfiler) ;
 *          false = DOUBLON (200 no-op, ne pas ré-enfiler).
 */
export async function dedupeWebhook(
  store: WebhookStore,
  provider: string,
  providerEventId: string,
): Promise<boolean> {
  return store.insertEvent(provider, providerEventId);
}

// ─── Adaptateur Supabase par défaut (service-role, colonnes 0021) ─────────────

/**
 * Store Supabase aligné sur `inv_webhook_events` (migration 0021).
 * Colonnes utilisées : `tenant_id`, `provider`, `provider_event_id`.
 * Dédup sur la contrainte unique (provider, provider_event_id).
 *
 * @param tenantId tenant courant (défaut : `real-estate-agent`).
 */
export function supabaseWebhookStore(
  tenantId: string = DEFAULT_TENANT_ID,
): WebhookStore {
  const db = getSupabaseAdmin();
  if (!db) {
    throw new Error("[webhooks] Supabase service-role non configuré");
  }
  return {
    async insertEvent(provider, providerEventId) {
      const { data, error } = await db
        .from("inv_webhook_events")
        .upsert(
          {
            tenant_id: tenantId,
            provider,
            provider_event_id: providerEventId,
          },
          { onConflict: "provider,provider_event_id", ignoreDuplicates: true },
        )
        .select("id");
      if (error) throw error;
      // 0 ligne renvoyée = la contrainte unique a absorbé un doublon.
      return Array.isArray(data) && data.length > 0;
    },
  };
}
