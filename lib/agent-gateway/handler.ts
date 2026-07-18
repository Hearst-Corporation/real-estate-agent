/**
 * lib/agent-gateway/handler.ts — squelette commun aux 14 routes gateway.
 *
 * Ordre des gardes (fail-closed, non négociable — §1/§2 du contrat) :
 *   1. Bearer token service-to-service (AVANT tout accès DB)
 *   2. Parse JSON
 *   3. Schéma d'entrée (tenant_id + actor_user_id obligatoires + champs métier)
 *   4. Handler métier → statut de vérité (AVAILABLE/UNAVAILABLE/DENIED/TIMEOUT)
 *   5. Audit systématique (même en cas de DENIED/erreur), quelle que soit l'issue.
 *
 * `timeoutMs` fait courir le handler métier sous Promise.race : dépassement →
 * TIMEOUT, jamais un retry silencieux (§2).
 */
import "server-only";
import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { checkGatewayAuth } from "./auth";
import { newRequestId, recordGatewayAudit } from "./audit";
import { deniedAuthResponse, invalidBodyResponse, gatewayResponse } from "./response";
import type { TruthStatusT } from "./contracts";

export interface GatewayHandlerResult<
  TData extends Record<string, unknown> = Record<string, never>,
> {
  status: TruthStatusT;
  reason?: string;
  data?: TData;
}

interface DefineGatewayRouteOptions<TInput, TData extends Record<string, unknown>> {
  interfaceName: string; // ex. "crm.create_lead"
  schema: ZodType<TInput>;
  timeoutMs: number;
  handler: (input: TInput, ctx: { requestId: string }) => Promise<GatewayHandlerResult<TData>>;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | "TIMEOUT"> {
  return Promise.race([
    promise,
    new Promise<"TIMEOUT">((resolve) => setTimeout(() => resolve("TIMEOUT"), ms)),
  ]);
}

export function defineGatewayRoute<
  TInput extends { tenant_id: string; actor_user_id: string; agent_id?: string },
  TData extends Record<string, unknown> = Record<string, never>,
>(options: DefineGatewayRouteOptions<TInput, TData>) {
  const { interfaceName, schema, timeoutMs, handler } = options;

  return async function POST(req: Request): Promise<NextResponse> {
    const requestId = newRequestId();
    const startedAt = Date.now();

    // 1. Auth — AVANT tout accès DB (fail-closed).
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

    // 4. Handler métier, budgété par timeout.
    let result: GatewayHandlerResult<TData>;
    try {
      const raced = await withTimeout(handler(input, { requestId }), timeoutMs);
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

    // 5. Audit systématique.
    await recordGatewayAudit({
      interface: interfaceName,
      tenantId: input.tenant_id,
      userId: input.actor_user_id,
      agentId: input.agent_id ?? null,
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
