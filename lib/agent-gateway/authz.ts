/**
 * lib/agent-gateway/authz.ts — frontière de confiance de la gateway (durcissement A2).
 *
 * Le Bearer token (auth.ts) prouve seulement "un appelant de confiance". Il ne dit
 * RIEN sur QUEL tenant / QUEL acteur / QUELLES capacités. Sans cette couche, le
 * payload choisirait librement `tenant_id` / `actor_user_id` / `agent_id` — un
 * appelant pourrait agir sur un autre tenant, au nom d'un autre utilisateur, sur
 * n'importe quelle interface. Ce module ferme cette faille, fail-closed partout :
 *
 *   1. TENANT/PROJET dérivés de la CONFIG du token (env), jamais du payload.
 *      `payload.tenant_id` ≠ tenant du token → DENIED. Idem projet.
 *   2. AGENT identifié + validé contre une allowlist configurée. Agent absent /
 *      inconnu → DENIED. Allowlist vide (registre Aigent vide) ⇒ gateway
 *      effectivement CLOSE — comportement voulu et honnête.
 *   3. SCOPE : l'interface exige `read` ou `write` (scopes.ts) ; scope non accordé
 *      au token → DENIED. Écritures strictement plus exigeantes que lectures.
 *   4. ACTEUR vérifié : `actor_user_id` doit être un UUID existant, APPARTENANT au
 *      tenant du token (owner-check DB scopé — le service-role bypasse RLS).
 *      Acteur inconnu / hors tenant → DENIED. Alternative : délégation signée
 *      explicite (HMAC) portée par le payload (`delegation`) — voir delegation.ts.
 *
 * Toute config absente ⇒ fail-closed (pas de tenant par défaut, pas de scope par
 * défaut, allowlist vide). Aucun secret n'est loggé ni renvoyé.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { requiredScope, type Scope } from "./scopes";
import { verifyDelegation, type DelegationClaim } from "./delegation";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AuthzDecision =
  | { ok: true; tenantId: string; actorUserId: string; agentId: string; scope: Scope }
  | { ok: false; reason: string };

/** Entrée minimale qu'attend l'autorisation, extraite du payload validé. */
export interface AuthzInput {
  tenant_id: string;
  actor_user_id: string;
  agent_id?: string;
  delegation?: DelegationClaim;
}

/** Configuration du token gateway, lue depuis l'environnement (server-only). */
export interface GatewayConfig {
  tenantId: string | null;
  projectKey: string | null;
  allowedAgents: Set<string>;
  grantedScopes: Set<Scope>;
}

function parseCsvSet(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );
}

/**
 * Lit la config du token depuis l'env. Aucune valeur par défaut permissive :
 * tenant/projet absents ⇒ null (fail-closed), scopes/agents absents ⇒ ensembles
 * vides (aucun accès). Exporté pour test déterministe.
 */
export function loadGatewayConfig(): GatewayConfig {
  const scopeRaw = parseCsvSet(process.env.AGENT_GATEWAY_SCOPES);
  const grantedScopes = new Set<Scope>();
  if (scopeRaw.has("read")) grantedScopes.add("read");
  if (scopeRaw.has("write")) grantedScopes.add("write");
  return {
    tenantId: process.env.AGENT_GATEWAY_TENANT_ID?.trim() || null,
    projectKey: process.env.AGENT_GATEWAY_PROJECT_KEY?.trim() || null,
    allowedAgents: parseCsvSet(process.env.AGENT_GATEWAY_ALLOWED_AGENTS),
    grantedScopes,
  };
}

/**
 * Vérifie que l'acteur existe et appartient au tenant du token (owner-check DB).
 * "system" n'est PAS un acteur vérifiable en base → refusé ici ; un job autonome
 * doit passer par une délégation signée explicite (voir applyAuthz).
 */
async function actorBelongsToTenant(
  db: SupabaseClient<Database>,
  actorUserId: string,
  tenantId: string,
): Promise<boolean> {
  if (!UUID_RE.test(actorUserId)) return false;
  const { data, error } = await db
    .from("users")
    .select("id")
    .eq("id", actorUserId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}

/**
 * Applique la frontière de confiance complète. Ordre fail-closed : config → tenant
 * → projet → agent → scope → acteur (DB ou délégation). Premier échec → DENIED
 * avec une `reason` courte SANS PII (jamais une valeur du payload autre que des
 * identifiants techniques déjà connus). Retourne les valeurs DÉRIVÉES DE L'AUTH
 * (tenant/acteur/agent), qui priment ensuite sur le payload.
 */
export async function applyAuthz(
  db: SupabaseClient<Database>,
  interfaceName: string,
  input: AuthzInput,
): Promise<AuthzDecision> {
  const cfg = loadGatewayConfig();

  // 1. Config du token — sans binding tenant/projet, la gateway est close.
  if (!cfg.tenantId) return { ok: false, reason: "gateway_tenant_not_configured" };
  if (!cfg.projectKey) return { ok: false, reason: "gateway_project_not_configured" };

  // 2. Tenant : le payload ne CHOISIT jamais un tenant — il doit MATCHER le token.
  if (input.tenant_id !== cfg.tenantId) return { ok: false, reason: "tenant_mismatch" };

  // 3. Agent : obligatoire + présent dans l'allowlist configurée. Allowlist vide
  //    (registre Aigent vide) ⇒ tout agent refusé ⇒ gateway effectivement close.
  const agentId = input.agent_id?.trim();
  if (!agentId) return { ok: false, reason: "agent_id_required" };
  if (!cfg.allowedAgents.has(agentId)) return { ok: false, reason: "agent_not_allowed" };

  // 4. Scope : l'interface exige read|write ; le token doit l'avoir. `write`
  //    n'implique PAS `read` et réciproquement — chaque scope est explicite.
  const scope = requiredScope(interfaceName);
  if (!cfg.grantedScopes.has(scope)) return { ok: false, reason: `scope_denied:${scope}` };

  // 5. Acteur : vérifié en base (appartient au tenant) OU porté par une délégation
  //    signée (HMAC) liée au même tenant/agent/acteur. Sinon DENIED.
  if (input.delegation) {
    const del = verifyDelegation(input.delegation, {
      tenantId: cfg.tenantId,
      agentId,
      actorUserId: input.actor_user_id,
    });
    if (!del.ok) return { ok: false, reason: del.reason };
    // Délégation valide : l'acteur est autorisé même sans ligne `users` (ex. job
    // autonome délégué par un humain qui a signé). Le sujet délégué prime.
    return {
      ok: true,
      tenantId: cfg.tenantId,
      actorUserId: del.actorUserId,
      agentId,
      scope,
    };
  }

  const belongs = await actorBelongsToTenant(db, input.actor_user_id, cfg.tenantId);
  if (!belongs) return { ok: false, reason: "actor_not_in_tenant" };

  return {
    ok: true,
    tenantId: cfg.tenantId,
    actorUserId: input.actor_user_id,
    agentId,
    scope,
  };
}
