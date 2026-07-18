/**
 * lib/agent-gateway/response.ts — enveloppe de sortie standard gateway (§4).
 *
 * Chaque route répond avec un objet discriminé par `kind` (nom de l'interface)
 * portant toujours un `status` de vérité — jamais null, jamais objet vide.
 */
import "server-only";
import { NextResponse } from "next/server";
import type { TruthStatusT } from "./contracts";

interface GatewayResponseInput<TData extends Record<string, unknown> = Record<string, never>> {
  kind: string;
  status: TruthStatusT;
  requestId: string;
  reason?: string;
  data?: TData;
}

const HTTP_STATUS_BY_TRUTH: Record<TruthStatusT, number> = {
  AVAILABLE: 200,
  UNAVAILABLE: 200, // réponse typée valide, pas une erreur HTTP — §4
  DENIED: 403,
  TIMEOUT: 504,
};

export function gatewayResponse<TData extends Record<string, unknown> = Record<string, never>>(
  input: GatewayResponseInput<TData>,
): NextResponse {
  const { kind, status, requestId, reason, data } = input;
  const httpStatus = HTTP_STATUS_BY_TRUTH[status];
  return NextResponse.json(
    {
      kind,
      status,
      request_id: requestId,
      ...(reason ? { reason } : {}),
      ...(data ?? {}),
    },
    { status: httpStatus },
  );
}

/** Réponse 401/403 avant tout accès DB — token absent/invalide (fail-closed). */
export function deniedAuthResponse(kind: string, requestId: string, reason: string): NextResponse {
  return NextResponse.json(
    { kind, status: "DENIED" as const, request_id: requestId, reason },
    { status: 401 },
  );
}

/** Réponse 400 — payload hors schéma (bornes/enums/type). */
export function invalidBodyResponse(requestId: string, issues: unknown): NextResponse {
  return NextResponse.json(
    { status: "DENIED" as const, request_id: requestId, reason: "invalid_body", issues },
    { status: 400 },
  );
}
