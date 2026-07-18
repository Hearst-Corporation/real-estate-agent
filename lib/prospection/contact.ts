/**
 * lib/prospection/contact.ts — contact PROTÉGÉ + registre opt-out (RGPD démarchage).
 *
 * Cœur de la logique de démarchage vendeur. Trois responsabilités :
 *   1. Hachage des coordonnées (jamais d'email/téléphone en clair en base opt-out).
 *   2. Vérification d'exclusion (prosp_optout par hash + prosp_annonces.demarchage_bloque).
 *   3. Garde-fous de contact : provider configuré ? doublon récent ? template résolu ?
 *      confirmation humaine ? — AVANT toute tentative d'envoi.
 *
 * Règles de sécurité (voir mission CONTACT & OPT-OUT) :
 *   - Aucun contact auto : un score de matching élevé ne déclenche JAMAIS un envoi.
 *     Le flag `confirmed:true` (humain) est requis pour passer de `draft` à `approved`.
 *   - Mode dégradé OBLIGATOIRE : provider dry-run → statut reste `draft`, jamais `sent`.
 *   - PII : on ne logue jamais un email/téléphone complet, uniquement un hash tronqué.
 *
 * La logique DB est injectable (client Supabase admin passé en paramètre) pour être
 * testable sans réseau. Les fonctions pures (hash, template, normalisation) sont
 * exportées séparément.
 */

import { createHash } from "node:crypto";
import type { Gpu1Client } from "@/lib/gpu1";
import { twilioIsConfigured } from "@/lib/providers/twilio";
import { resendIsConfigured } from "@/lib/providers/resend-email";
import type { Database } from "@/lib/gpu1/database.types";

// ── Types ─────────────────────────────────────────────────────────────────────

export type Canal = "sms" | "whatsapp" | "email" | "phone";
export const CANAUX: readonly Canal[] = ["sms", "whatsapp", "email", "phone"] as const;

export type ContactStatut =
  | "draft"
  | "approved"
  | "sent"
  | "failed"
  | "replied"
  | "opted_out";

/**
 * Client DB requis : le sous-ensemble `from()` de Gpu1Client<Database>.
 * Le vrai client admin le satisfait directement ; le faux client de test se
 * cast en DbLike. Pas de `any` : le type vient du client GPU1/PostgREST.
 */
export type DbLike = Pick<Gpu1Client<Database>, "from">;

export interface Coordonnees {
  email?: string | null;
  phone?: string | null;
}

// ── 1. Hachage déterministe (SHA-256 sur valeur normalisée) ────────────────────

/** Normalise un email : trim + lowercase. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Normalise un numéro de téléphone : ne garde que les chiffres et un éventuel `+`
 * de tête. `06 12.34-56 78` → `0612345678`, `+33 6 12` → `+33612`. Suffisant pour
 * une comparaison d'exclusion déterministe (on ne fait pas de résolution E.164 ici).
 */
export function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  const plus = trimmed.startsWith("+") ? "+" : "";
  return plus + trimmed.replace(/[^\d]/g, "");
}

/**
 * SHA-256 hex d'un email ou téléphone normalisé. Retourne `null` pour une entrée
 * vide/absente afin de ne jamais hacher la chaîne vide (collision de faux positif).
 */
export function hashContact(
  value: string | null | undefined,
  kind: "email" | "phone" = "email",
): string | null {
  if (value == null) return null;
  const normalized =
    kind === "email" ? normalizeEmail(value) : normalizePhone(value);
  if (normalized.length === 0) return null;
  return createHash("sha256").update(normalized).digest("hex");
}

/** Aperçu non identifiant pour les logs (8 premiers hex du hash). Jamais la PII. */
export function hashPreview(hash: string | null): string {
  return hash ? `${hash.slice(0, 8)}…` : "∅";
}

// ── 2. Vérification d'exclusion (opt-out) ──────────────────────────────────────

export interface OptOutCheck {
  optedOut: boolean;
  /** Raison de l'exclusion, pour le diagnostic (jamais de PII). */
  reason?: "optout_email" | "optout_phone" | "annonce_bloquee";
}

/**
 * Vérifie l'exclusion AVANT tout contact. Consulte :
 *   - prosp_optout (par hash email/téléphone) ;
 *   - prosp_annonces.demarchage_bloque (si annonceId fourni).
 *
 * Fail-CLOSED sur la lecture opt-out : si la requête d'exclusion échoue, on
 * considère la personne comme opted-out (on préfère ne pas démarcher plutôt que
 * démarcher un exclu suite à un blip DB). Le blocage annonce est vérifié à part.
 */
export async function isOptedOut(
  db: DbLike,
  tenantId: string,
  coords: Coordonnees,
  annonceId?: string | null,
): Promise<OptOutCheck> {
  const emailHash = hashContact(coords.email, "email");
  const phoneHash = hashContact(coords.phone, "phone");

  if (emailHash || phoneHash) {
    const hashes: string[] = [];
    if (emailHash) hashes.push(emailHash);
    if (phoneHash) hashes.push(phoneHash);

    // Une seule requête : lignes opt-out du tenant dont le hash email OU tel match.
    const orFilter = [
      emailHash ? `email_hash.eq.${emailHash}` : null,
      phoneHash ? `telephone_hash.eq.${phoneHash}` : null,
    ]
      .filter(Boolean)
      .join(",");

    const { data, error } = await db
      .from("prosp_optout")
      .select("email_hash,telephone_hash")
      .eq("tenant_id", tenantId)
      .or(orFilter)
      .limit(1);

    if (error) {
      // Fail-closed : on ne prend pas le risque de démarcher un exclu.
      return { optedOut: true, reason: "optout_email" };
    }
    const row = (data ?? [])[0] as
      | { email_hash?: string | null; telephone_hash?: string | null }
      | undefined;
    if (row) {
      if (emailHash && row.email_hash === emailHash) {
        return { optedOut: true, reason: "optout_email" };
      }
      return { optedOut: true, reason: "optout_phone" };
    }
  }

  if (annonceId) {
    const { data, error } = await db
      .from("prosp_annonces")
      .select("demarchage_bloque")
      .eq("tenant_id", tenantId)
      .eq("id", annonceId)
      .limit(1);
    if (!error) {
      const a = (data ?? [])[0] as { demarchage_bloque?: boolean } | undefined;
      if (a?.demarchage_bloque) return { optedOut: true, reason: "annonce_bloquee" };
    }
  }

  return { optedOut: false };
}

/**
 * Enregistre un opt-out : upsert dans prosp_optout (par hash) + pose
 * opt_out_at / demarchage_bloque sur l'annonce concernée (si fournie).
 * Idempotent grâce aux index uniques (tenant_id, email_hash|telephone_hash).
 */
export async function recordOptOut(
  db: DbLike,
  tenantId: string,
  input: {
    email?: string | null;
    phone?: string | null;
    raison: string;
    source?: string | null;
    annonceId?: string | null;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const emailHash = hashContact(input.email, "email");
  const phoneHash = hashContact(input.phone, "phone");

  if (!emailHash && !phoneHash && !input.annonceId) {
    return { ok: false, error: "aucune coordonnée ni annonce fournie" };
  }

  if (emailHash || phoneHash) {
    // Upsert idempotent : on ne réécrit pas si le hash existe déjà (par index unique).
    // On insère et on ignore le conflit sur (tenant_id, hash).
    const conflictTarget = emailHash ? "tenant_id,email_hash" : "tenant_id,telephone_hash";
    const { error } = await db
      .from("prosp_optout")
      .upsert(
        {
          tenant_id: tenantId,
          email_hash: emailHash,
          telephone_hash: phoneHash,
          raison: input.raison,
          source: input.source ?? null,
        },
        { onConflict: conflictTarget, ignoreDuplicates: true },
      );
    if (error) return { ok: false, error: "insert_optout_failed" };
  }

  if (input.annonceId) {
    const { error } = await db
      .from("prosp_annonces")
      .update({ demarchage_bloque: true, opt_out_at: new Date().toISOString() })
      .eq("tenant_id", tenantId)
      .eq("id", input.annonceId);
    if (error) return { ok: false, error: "update_annonce_failed" };
  }

  return { ok: true };
}

// ── 3. Templates : refus de toute variable non résolue ─────────────────────────

const VAR_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

/** Retourne la liste des variables `{{x}}` non résolues après substitution. */
export function unresolvedVars(
  template: string,
  vars: Record<string, string | number | null | undefined>,
): string[] {
  const missing: string[] = [];
  for (const match of template.matchAll(VAR_RE)) {
    const name = match[1];
    const v = vars[name];
    if (v === undefined || v === null || String(v).trim() === "") {
      missing.push(name);
    }
  }
  return [...new Set(missing)];
}

/**
 * Résout un template. Échoue (`ok:false`) si une variable reste non résolue —
 * on n'envoie JAMAIS un message avec un `{{placeholder}}` visible.
 */
export function renderTemplate(
  template: string,
  vars: Record<string, string | number | null | undefined>,
): { ok: true; text: string } | { ok: false; missing: string[] } {
  const missing = unresolvedVars(template, vars);
  if (missing.length > 0) return { ok: false, missing };
  const text = template.replace(VAR_RE, (_m, name: string) => String(vars[name]));
  return { ok: true, text };
}

// ── 4. Mode dégradé : provider configuré ? ─────────────────────────────────────

/**
 * Un canal est « livrable » seulement si son provider est réellement configuré.
 * - sms / whatsapp → Twilio (dry-run si non configuré).
 * - email          → Resend.
 * - phone          → jamais automatisable (appel humain) → toujours draft.
 */
export function channelDeliverable(canal: Canal): boolean {
  switch (canal) {
    case "sms":
    case "whatsapp":
      return twilioIsConfigured();
    case "email":
      return resendIsConfigured();
    case "phone":
      return false;
    default:
      return false;
  }
}
