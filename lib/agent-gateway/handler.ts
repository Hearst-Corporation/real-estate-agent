/**
 * lib/agent-gateway/handler.ts — squelette commun aux 15 routes gateway.
 *
 * Ordre des gardes (fail-closed, non négociable — durcissement A2) :
 *   1. Bearer token service-to-service (AVANT tout accès DB) — auth.ts.
 *   2. Parse JSON.
 *   3. Schéma d'entrée (tenant_id + actor_user_id obligatoires + champs métier).
 *   4. AUTORISATION — frontière de confiance (authz.ts) : tenant/projet dérivés
 *      de la CONFIG du token (jamais du payload), agent validé contre allowlist,
 *      scope de l'interface accordé, acteur vérifié en base (appartient au tenant)
 *      OU délégation signée. Tout écart → DENIED, AVANT le handler métier.
 *   5. Handler métier → statut de vérité (AVAILABLE/UNAVAILABLE/DENIED/TIMEOUT),
 *      exécuté sur l'identité DÉRIVÉE DE L'AUTH (tenant/acteur), pas sur le payload.
 *   6. Audit systématique (même en cas de DENIED/erreur), quelle que soit l'issue.
 *
 * `timeoutMs` fait courir le handler métier sous Promise.race : dépassement →
 * TIMEOUT, jamais un retry silencieux.
 */
import "server-only";
import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { checkGatewayAuth } from "./auth";
import { applyAuthz } from "./authz";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { newRequestId, recordGatewayAudit } from "./audit";
import { deniedAuthResponse, deniedAuthzResponse, invalidBodyResponse, gatewayResponse } from "./response";
import type { TruthStatusT } from "./contracts";
import type { Scope } from "./scopes";

export interface GatewayHandlerResult<
  TData extends Record<string, unknown> = Record<string, never>,
> {
  status: TruthStatusT;
  reason?: string;
  data?: TData;
}

/** Contexte passé au handler métier — identité DÉRIVÉE DE L'AUTH, pas du payload. */
export interface GatewayHandlerCtx {
  requestId: string;
  tenantId: string;
  actorUserId: string;
  agentId: string;
  scope: Scope;
}

interface DefineGatewayRouteOptions<TInput, TData extends Record<string, unknown>> {
  interfaceName: string; // ex. "crm.create_lead"
  schema: ZodType<TInput>;
  timeoutMs: number;
  handler: (input: TInput, ctx: GatewayHandlerCtx) => Promise<GatewayHandlerResult<TData>>;
}

/**
 * Race le handler contre un budget temps. Le timer est TOUJOURS libéré une fois la
 * course tranchée (clearTimeout dans finally) : sans ça, un handler qui gagne la
 * course laisserait un setTimeout pendant, gardant l'event loop éveillé et fuyant
 * un timer par appel gateway. Dépassement → "TIMEOUT", jamais un retry silencieux.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | "TIMEOUT"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"TIMEOUT">((resolve) => {
    timer = setTimeout(() => resolve("TIMEOUT"), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export function defineGatewayRoute<
  TInput extends {
    tenant_id: string;
    actor_user_id: string;
    agent_id?: string;
    delegation?: import("./delegation").DelegationClaim;
  },
  TData extends Record<string, unknown> = Record<string, never>,
>(options: DefineGatewayRouteOptions<TInput, TData>) {
  const { interfaceName, schema, timeoutMs, handler } = options;

  return async function POST(req: Request): Promise<NextResponse> {
    const requestId = newRequestId();
    const startedAt = Date.now();

    // 1. Auth Bearer — AVANT tout accès DB (fail-closed).
    const auth = checkGatewayAuth(req);
    if (!auth.ok) {
      await recordGatewayAudit({
        interface: interfaceName,
        tenantId: "unknown",
        userId: null,
        agentId: null,
        requestId,
        status: "DENIED",
        reason: auth.reason,
        durationMs: Date.now() - startedAt,
      });
      return deniedAuthResponse(interfaceName, requestId, auth.reason);
    }

    // 2. Parse JSON.
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      await recordGatewayAudit({
        interface: interfaceName,
        tenantId: "unknown",
        userId: null,
        agentId: null,
        requestId,
        status: "DENIED",
        reason: "invalid_json",
        durationMs: Date.now() - startedAt,
      });
      return invalidBodyResponse(requestId, "invalid_json");
    }

    // 3. Schéma d'entrée strict (tenant + acteur obligatoires + champs métier).
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      const tenantGuess =
        raw &&
        typeof raw === "object" &&
        "tenant_id" in raw &&
        typeof (raw as Record<string, unknown>).tenant_id === "string"
          ? ((raw as Record<string, unknown>).tenant_id as string)
          : "unknown";
      await recordGatewayAudit({
        interface: interfaceName,
        tenantId: tenantGuess,
        userId: null,
        agentId: null,
        requestId,
        status: "DENIED",
        reason: "invalid_body",
        durationMs: Date.now() - startedAt,
      });
      return invalidBodyResponse(requestId, parsed.error.flatten());
    }

    const input = parsed.data;

    // 4. AUTORISATION — frontière de confiance (tenant/projet/agent/scope/acteur).
    //    Nécessite la DB pour l'owner-check acteur ; sans DB configurée → close.
    const db = getSupabaseAdmin();
    if (!db) {
      await recordGatewayAudit({
        interface: interfaceName,
        tenantId: input.tenant_id,
        userId: null,
        agentId: input.agent_id ?? null,
        requestId,
        status: "DENIED",
        reason: "db_not_configured",
        durationMs: Date.now() - startedAt,
      });
      return deniedAuthzResponse(interfaceName, requestId, "db_not_configured");
    }

    const authz = await applyAuthz(db, interfaceName, {
      tenant_id: input.tenant_id,
      actor_user_id: input.actor_user_id,
      agent_id: input.agent_id,
      delegation: input.delegation,
    });
    if (!authz.ok) {
      await recordGatewayAudit({
        interface: interfaceName,
        tenantId: input.tenant_id,
        // On n'attribue PAS un userId qui n'a pas été vérifié : null tant que
        // l'acteur n'est pas prouvé appartenir au tenant.
        userId: null,
        agentId: input.agent_id ?? null,
        requestId,
        status: "DENIED",
        reason: authz.reason,
        durationMs: Date.now() - startedAt,
      });
      return deniedAuthzResponse(interfaceName, requestId, authz.reason);
    }

    // Identité DÉRIVÉE DE L'AUTH — prime sur le payload. On réécrit tenant/acteur
    // dans l'input pour que TOUT handler downstream opère sur l'identité prouvée,
    // même en cas de dérive future d'un schéma de route.
    input.tenant_id = authz.tenantId;
    input.actor_user_id = authz.actorUserId;
    const ctx: GatewayHandlerCtx = {
      requestId,
      tenantId: authz.tenantId,
      actorUserId: authz.actorUserId,
      agentId: authz.agentId,
      scope: authz.scope,
    };

    // 5. Handler métier, budgété par timeout.
    let result: GatewayHandlerResult<TData>;
    try {
      const raced = await withTimeout(handler(input, ctx), timeoutMs);
      if (raced === "TIMEOUT") {
        result = { status: "TIMEOUT", reason: "budget_exceeded" };
      } else {
        result = raced;
      }
    } catch (err) {
      console.error(`[agent-gateway] ${interfaceName} handler_threw`, {
        requestId,
        error: err instanceof Error ? err.message : String(err),
      });
      result = { status: "UNAVAILABLE", reason: "internal_error" };
    }

    // 6. Audit systématique — sur l'identité vérifiée (agent inclus).
    await recordGatewayAudit({
      interface: interfaceName,
      tenantId: ctx.tenantId,
      userId: ctx.actorUserId,
      agentId: ctx.agentId,
      requestId,
      status: result.status,
      reason: result.reason ?? null,
      durationMs: Date.now() - startedAt,
    });

    return gatewayResponse({
      kind: interfaceName,
      status: result.status,
      requestId,
      reason: result.reason,
      data: result.data,
    });
  };
}
