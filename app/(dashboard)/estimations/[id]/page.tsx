import { notFound } from "next/navigation";
import { Eyebrow, Title, Sub } from "@/components/cockpit/primitives";
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
  const t = UI.estimations;

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

  // Load conversation history
  const { data: rawMessages } = await sb
    .from("estimation_messages")
    .select("role, content")
    .eq("estimation_id", id)
    .eq("tenant_id", tenantOf(claims))
    .order("created_at", { ascending: true });

  const initialMessages: Msg[] = (rawMessages ?? [])
    .filter(
      (m): m is { role: "user" | "assistant"; content: string } =>
        (m.role === "user" || m.role === "assistant") && m.content !== null
    )
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

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
    <>
      <Eyebrow>{t.eyebrow}</Eyebrow>
      <Title>{t.interviewTitle}</Title>
      <Sub>{t.interviewSub}</Sub>
      <InterviewView
        id={id}
        initialMessages={initialMessages}
        initialProperty={initialProperty}
        initialFieldStatus={initialFieldStatus}
        initialBlock={initialBlock}
        initialCanGenerate={initialCanGenerate}
        initialStatus={estimation.status}
        initialValuation={initialValuation}
        initialMarket={initialMarket}
      />
    </>
  );
}
