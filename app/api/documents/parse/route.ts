/**
 * POST /api/documents/parse  (multipart/form-data, champ "file")
 *
 * Parse un document (mandat/DPE/diagnostic, PDF/DOCX) → Markdown via LlamaParse.
 * PAS d'écriture en base (1er atome) : on renvoie le markdown, on cache en R2.
 *
 * - 401 non authentifié · 429 rate-limit · 413 fichier trop gros
 * - 400 fichier manquant · 503 LlamaParse non configuré ou cost-guard fermé
 * - Réponse : { markdown, cached, hash }
 *
 * Idempotence/coût : hash sha256 du contenu → clé R2 durable (court-circuit si
 * déjà parsé) ; cost-guard (cap quotidien + flag) sur l'appel payant réel.
 */

import { createHash } from "node:crypto";
import { getSession } from "@/lib/server/session";
import { rateLimit } from "@/lib/ratelimit";
import { paidCall } from "@/lib/providers/cost-guard";
import { llamaParseIsConfigured, parseDocument } from "@/lib/providers/llamaparse";
import { r2IsConfigured, getObject, putObject } from "@/lib/storage/r2";
import { captureServer } from "@/lib/providers/posthog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024; // 10 MiB
const POLL_CAP = 22; // ~44 s, sous le maxDuration de 60 s
const DAILY_CAP = 30;
const CACHE_TTL_SEC = 3_600;
const RL_LIMIT = 5;
const RL_WINDOW_SEC = 60;

function r2Key(hash: string): string {
  return `documents/parsed/${hash}.md`;
}

function enabled(): boolean {
  return process.env.DOC_INTEL_ENABLED !== "false";
}

export async function POST(req: Request) {
  const claims = await getSession();
  if (!claims) return Response.json({ error: "unauthorized" }, { status: 401 });

  if (!(await rateLimit(`docparse:${claims.sub}`, RL_LIMIT, RL_WINDOW_SEC))) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }

  if (!llamaParseIsConfigured()) {
    return Response.json({ error: "llamaparse_not_configured" }, { status: 503 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") {
    return Response.json({ error: "file_required" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "file_too_large", maxBytes: MAX_BYTES }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const hash = createHash("sha256").update(buffer).digest("hex");

  // 1. Dedup durable via R2 (n'entame pas le quota cost-guard).
  if (r2IsConfigured()) {
    const cached = await getObject(r2Key(hash)).catch(() => null);
    if (cached) {
      return Response.json({ markdown: cached.toString("utf-8"), cached: true, hash });
    }
  }

  // 2. Appel payant réel sous cost-guard (cap quotidien + flag).
  const result = await paidCall<string>(
    "llamaparse",
    hash,
    async () => {
      const markdown = await parseDocument(buffer, file.name, { maxPolls: POLL_CAP });
      // Cache durable best-effort (ne perd pas le résultat si R2 échoue).
      if (r2IsConfigured()) {
        try {
          await putObject(r2Key(hash), Buffer.from(markdown, "utf-8"), "text/markdown");
        } catch {
          /* ignore */
        }
      }
      return markdown;
    },
    { ttlSec: CACHE_TTL_SEC, dailyCap: DAILY_CAP, enabled: enabled() },
  );

  if (!result.ok) {
    const status = result.reason === "disabled" ? 503 : 429;
    return Response.json({ error: result.reason }, { status });
  }
  captureServer(claims.sub, "document_parsed", { size_bytes: buffer.length });
  return Response.json({ markdown: result.data, cached: false, hash });
}
