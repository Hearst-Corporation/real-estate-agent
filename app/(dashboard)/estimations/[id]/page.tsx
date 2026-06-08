import { notFound } from "next/navigation";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { loadOwnedEstimation } from "@/lib/estimation/owned";
import {
  coverageOf,
  canGenerate as canGenerateFromFields,
  nextSuggestions,
  nextFocusLabel,
} from "@/lib/estimation/spec";
import { InterviewView } from "@/app/(dashboard)/estimations/_components/InterviewView";
import { SUGGESTIONS_MAX } from "@/lib/invest/constants";
import type {
  PropertyData,
  FieldStatusMap,
  Valuation,
  MarketAnalysis,
} from "@/lib/estimation/types";

type Msg = { role: "user" | "assistant"; content: string };

export default async function EstimationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const claims = await getSession();
  if (!claims) notFound();

  const sb = getSupabaseAdmin();
  if (!sb) notFound();

  const estimation = await loadOwnedEstimation(
    sb,
    id,
    claims.sub,
    tenantOf(claims)
  );
  if (!estimation) notFound();

  const { data: rawMessages } = await sb
    .from("estimation_messages")
    .select("role, content, tool_input")
    .eq("estimation_id", id)
    .eq("tenant_id", tenantOf(claims))
    .order("created_at", { ascending: true });

  const initialMessages: Msg[] = (rawMessages ?? [])
    .filter(
      (m) => (m.role === "user" || m.role === "assistant") && m.content !== null
    )
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content as string,
    }));

  const initialProperty = (estimation.property ?? {}) as PropertyData;
  const initialFieldStatus = (estimation.field_status ?? {}) as FieldStatusMap;

  const initialCoverage = coverageOf(initialProperty, initialFieldStatus);
  const initialCanGenerate = canGenerateFromFields(initialProperty);
  const initialNextLabel = nextFocusLabel(initialProperty, initialFieldStatus);

  // Suggestions du dernier tour assistant (persistées dans tool_input) ;
  // sinon fallback déterministe aligné sur le prochain champ prioritaire →
  // boîtes restaurées au reload même quand l'agent n'en avait pas émis.
  const lastAssistant = [...(rawMessages ?? [])]
    .reverse()
    .find((m) => m.role === "assistant" && m.tool_input != null);
  const rawSuggestions = (lastAssistant?.tool_input as { suggestions?: unknown } | null)
    ?.suggestions;
  const persistedSuggestions = Array.isArray(rawSuggestions)
    ? rawSuggestions.filter((s): s is string => typeof s === "string").slice(0, SUGGESTIONS_MAX)
    : [];
  const initialSuggestions =
    persistedSuggestions.length > 0
      ? persistedSuggestions
      : nextSuggestions(initialProperty, initialFieldStatus);

  const initialValuation = (estimation.valuation ?? null) as Valuation | null;
  const initialMarket = (estimation.market ?? null) as MarketAnalysis | null;

  return (
    <InterviewView
      id={id}
      initialMessages={initialMessages}
      initialProperty={initialProperty}
      initialFieldStatus={initialFieldStatus}
      initialCoverage={initialCoverage}
      initialCanGenerate={initialCanGenerate}
      initialSuggestions={initialSuggestions}
      initialNextLabel={initialNextLabel}
      initialStatus={estimation.status}
      initialValuation={initialValuation}
      initialMarket={initialMarket}
    />
  );
}
