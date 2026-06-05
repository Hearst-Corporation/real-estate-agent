import { notFound } from "next/navigation";
import { UI } from "@/lib/ui-strings";
import { getSession } from "@/lib/server/session";
import { getSupabaseAdmin } from "@/lib/server/supabase";
import { tenantOf } from "@/lib/tenant";
import { loadOwnedEstimation } from "@/lib/estimation/owned";
import { InterviewView } from "@/app/(dashboard)/estimations/_components/InterviewView";
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

  // Suggestions du dernier tour assistant (persistées dans tool_input) —
  // permet de restaurer les boutons cliquables après un reload.
  const lastAssistant = [...(rawMessages ?? [])]
    .reverse()
    .find((m) => m.role === "assistant" && m.tool_input != null);
  const rawSuggestions = (lastAssistant?.tool_input as { suggestions?: unknown } | null)
    ?.suggestions;
  const initialSuggestions = Array.isArray(rawSuggestions)
    ? rawSuggestions.filter((s): s is string => typeof s === "string").slice(0, 8)
    : [];

  const initialProperty = (estimation.property ?? {}) as PropertyData;
  const initialFieldStatus = (estimation.field_status ?? {}) as FieldStatusMap;
  const confirmedBlocks = Array.isArray(estimation.confirmed_blocks)
    ? (estimation.confirmed_blocks as number[])
    : [];

  const initialBlock = Math.min(confirmedBlocks.length + 1, 9);
  const initialCanGenerate = confirmedBlocks.length >= 9;

  const initialValuation = (estimation.valuation ?? null) as Valuation | null;
  const initialMarket = (estimation.market ?? null) as MarketAnalysis | null;

  return (
    <InterviewView
      id={id}
      initialMessages={initialMessages}
      initialProperty={initialProperty}
      initialFieldStatus={initialFieldStatus}
      initialBlock={initialBlock}
      initialCanGenerate={initialCanGenerate}
      initialSuggestions={initialSuggestions}
      initialStatus={estimation.status}
      initialValuation={initialValuation}
      initialMarket={initialMarket}
    />
  );
}
