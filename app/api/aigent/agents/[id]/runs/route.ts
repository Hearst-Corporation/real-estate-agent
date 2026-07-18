import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { createRun } from "@/lib/aigent/runtime";
import { runtimeResultToResponse } from "../../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Forme d'agentId acceptée (contrat §2 : `^[a-z0-9-]{1,200}$`). */
const ID_RE = /^[a-z0-9-]{1,200}$/;

/**
 * Corps de création de run. `input` est OPAQUE au contrat générique (dépend de
 * l'agent) — on borne seulement qu'il soit un objet JSON (pas de string/array
 * brut) et on plafonne sa taille sérialisée pour ne pas relayer un payload
 * démesuré. `idempotencyKey` optionnel (retry réseau sans doublon, contrat §4).
 */
const BODY = z.object({
  input: z.record(z.string(), z.unknown()).default({}),
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
});

const MAX_INPUT_BYTES = 64 * 1024; // 64 KiB — borne dure du payload relayé

/**
 * POST /api/aigent/agents/[id]/runs — lance un run autorisé (OUTBOUND, mutation).
 * Session-authed (401 avant tout). Valide la forme de l'agentId + le corps Zod
 * AVANT tout appel. Le token runtime reste server-only. Une `Idempotency-Key`
 * est toujours transmise (générée si absente) pour dédupliquer les retries.
 * État réel : 404 sur l'agent cible (aucun agent matérialisé).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const claims = await getSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return NextResponse.json({ ok: false, notFound: true }, { status: 404 });

  const raw = await req.json().catch(() => null);
  const parsed = BODY.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  if (JSON.stringify(parsed.data.input).length > MAX_INPUT_BYTES) {
    return NextResponse.json({ error: "input_too_large" }, { status: 413 });
  }

  // Clé d'idempotence : fournie par le client, sinon générée serveur (jamais
  // Math.random — IDs non prédictibles, cf. règles back-end).
  const idempotencyKey = parsed.data.idempotencyKey ?? crypto.randomUUID();

  const result = await createRun(id, parsed.data.input, idempotencyKey);
  return runtimeResultToResponse(result);
}
