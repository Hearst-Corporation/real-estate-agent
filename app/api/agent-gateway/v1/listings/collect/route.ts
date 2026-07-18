/**
 * POST /api/agent-gateway/v1/listings/collect — interface `listings.collect`.
 *
 * Mapping honnête : réutilise exactement le pipeline de
 * app/api/prospection/ingest/route.ts (upsertAnnonces + moteurimmo/apify
 * providers + prosp_ingestion_runs), sans passer par credentials source en
 * clair dans le payload agent (les clés API providers vivent en env, jamais
 * dans le body). Idempotence : clé gateway dédiée (agent_gateway_idempotency_keys),
 * distincte de prosp_idempotency_keys (celle-ci reste au service du cron/route
 * produit) — un rejeu de la MÊME clé gateway sur la MÊME fenêtre ne duplique
 * aucun bien (l'upsert sous-jacent est lui-même idempotent par hash_dedup).
 */
import "server-only";
import { z } from "zod";
import { getGpu1Admin } from "@/lib/gpu1";
import { GatewayEnvelopeSchema, IdempotencyKeySchema } from "@/lib/agent-gateway/contracts";
import { defineGatewayRoute } from "@/lib/agent-gateway/handler";
import { runIdempotentWrite } from "@/lib/agent-gateway/idempotent-write";
import { searchListings, moteurImmoIsConfigured } from "@/lib/providers/moteurimmo";
import { searchListingsApify, apifyProspectionIsConfigured } from "@/lib/prospection/apify-source";
import { upsertAnnonces, startIngestionRun, finishIngestionRun } from "@/lib/prospection/ingest";
import type { IngestStats } from "@/lib/prospection/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ZONES = 5;

const BodySchema = GatewayEnvelopeSchema.extend({
  idempotency_key: IdempotencyKeySchema,
  zones: z.array(z.string().trim().min(2).max(10)).min(1).max(MAX_ZONES),
}).strict();

export const POST = defineGatewayRoute({
  interfaceName: "listings.collect",
  schema: BodySchema,
  timeoutMs: 90_000, // opération de collecte par lot — budget long, distinct des lectures unitaires
  handler: async (input) => {
    const db = getGpu1Admin();
    if (!db) return { status: "UNAVAILABLE", reason: "db_not_configured" };

    const useMoteurImmo = moteurImmoIsConfigured();
    if (!useMoteurImmo && !apifyProspectionIsConfigured()) {
      return { status: "UNAVAILABLE", reason: "no_listings_provider_configured" };
    }
    const provider = useMoteurImmo ? "moteurimmo" : "apify_lbc";

    return runIdempotentWrite(
      input.tenant_id,
      "listings.collect",
      input.idempotency_key,
      input,
      async () => {
        const run = await startIngestionRun(input.tenant_id, provider, input.zones);
        const totals: IngestStats = { inserted: 0, updated: 0, duplicates: 0, errors: 0 };
        const rejected: string[] = [];

        for (const zone of input.zones) {
          try {
            const listings = useMoteurImmo
              ? await searchListings({ codePostal: zone, perPage: 50 })
              : await searchListingsApify(zone);
            const stats = await upsertAnnonces(input.tenant_id, listings, provider);
            totals.inserted += stats.inserted;
            totals.updated += stats.updated;
            totals.duplicates += stats.duplicates;
            totals.errors += stats.errors;
          } catch (e) {
            totals.errors += 1;
            rejected.push(`${zone}: ${e instanceof Error ? e.message : "error"}`);
          }
        }

        const failed = totals.errors > 0 && totals.inserted + totals.updated === 0;
        if (run) {
          await finishIngestionRun(
            run,
            failed ? "failed" : "completed",
            totals,
            rejected.join(" | ") || null,
          );
        }

        if (failed) {
          return { status: "UNAVAILABLE", reason: "collection_failed" };
        }

        return {
          status: "AVAILABLE",
          data: {
            run_id: run?.id ?? null,
            provider,
            collected: totals.inserted + totals.updated,
            inserted: totals.inserted,
            updated: totals.updated,
            duplicates: totals.duplicates,
            rejected,
          },
        };
      },
    );
  },
});
