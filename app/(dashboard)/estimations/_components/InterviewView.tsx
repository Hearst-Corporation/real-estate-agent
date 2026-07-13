"use client";

import { useState } from "react";
import Link from "next/link";
import { EstimationWizard } from "./EstimationWizard";
import { GeneratingScreen } from "./GeneratingScreen";
import { ValuationHero } from "./ValuationHero";
import { SidePanel } from "./SidePanel";
import { UI } from "@/lib/ui-strings";
import type { Coverage } from "@/lib/estimation/spec";
import type {
  PropertyData,
  FieldStatusMap,
  Valuation,
  MarketAnalysis,
} from "@/lib/estimation/types";

type Msg = { role: "user" | "assistant"; content: string };
type Phase = "wizard" | "generating" | "ready";

function resolvePhase(status: string): Phase {
  if (status === "ready") return "ready";
  if (status === "valuating") return "generating";
  return "wizard";
}

type Props = {
  id: string;
  initialMessages: Msg[];
  initialProperty: PropertyData;
  initialFieldStatus: FieldStatusMap;
  initialCoverage: Coverage;
  initialCanGenerate: boolean;
  initialSuggestions?: string[];
  initialNextLabel?: string | null;
  initialStatus: string;
  initialValuation?: Valuation | null;
  initialMarket?: MarketAnalysis | null;
  /** Lien retour vers le bien CRM source, si l'estimation en provient. */
  backToPropertyHref?: string | null;
};

export function InterviewView({
  id,
  initialMessages,
  initialProperty,
  initialFieldStatus,
  initialCoverage,
  initialCanGenerate,
  initialSuggestions,
  initialNextLabel,
  initialStatus,
  initialValuation,
  initialMarket,
  backToPropertyHref,
}: Props) {
  const [phase, setPhase] = useState<Phase>(resolvePhase(initialStatus));
  const [property, setProperty] = useState<PropertyData>(initialProperty);
  const [fieldStatus, setFieldStatus] = useState<FieldStatusMap>(initialFieldStatus);
  const [coverage, setCoverage] = useState<Coverage>(initialCoverage);
  const [nextLabel, setNextLabel] = useState<string | null>(initialNextLabel ?? null);
  const [canGenerate, setCanGenerate] = useState(initialCanGenerate);
  const [valuation, setValuation] = useState<Valuation | null>(initialValuation ?? null);
  const [market, setMarket] = useState<MarketAnalysis | null>(initialMarket ?? null);
  const [progressStep, setProgressStep] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

  function handleState(
    p: PropertyData,
    fs: FieldStatusMap,
    cov: Coverage,
    cg: boolean,
    nl: string | null
  ) {
    setProperty(p);
    setFieldStatus(fs);
    setCoverage(cov);
    setCanGenerate(cg);
    setNextLabel(nl);
  }

  async function handleGenerate() {
    setPhase("generating");
    setGenerateError(null);
    setProgressStep(UI.estimations.generating);

    try {
      const res = await fetch(`/api/estimations/${id}/value`, {
        method: "POST",
      });

      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "stream_failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (!line) continue;

          try {
            type ProgressFrame = { type: "progress"; step: string };
            type ErrorFrame = { type: "error"; message: string };
            type DoneFrame = {
              type: "done";
              valuation: Valuation;
              market: MarketAnalysis | null;
            };
            const frame = JSON.parse(line) as
              | ProgressFrame
              | ErrorFrame
              | DoneFrame;

            if (frame.type === "progress") {
              setProgressStep(frame.step);
            } else if (frame.type === "error") {
              setGenerateError(frame.message);
            } else if (frame.type === "done") {
              setValuation(frame.valuation);
              setMarket(frame.market);
              setProgressStep(null);
              setPhase("ready");
            }
          } catch (e) {
            if (e instanceof SyntaxError) continue;
            throw e;
          }
        }
      }
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : UI.common.error);
      setProgressStep(null);
      setPhase("wizard");
    }
  }

  // ── Phase 1 : Wizard ──────────────────────────────────────────────────────
  if (phase === "wizard") {
    return (
      <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-950/10 bg-white">
        <EstimationWizard
          id={id}
          initialMessages={initialMessages}
          initialCoverage={coverage}
          initialCanGenerate={canGenerate}
          initialSuggestions={initialSuggestions ?? []}
          initialNextLabel={nextLabel}
          initialProperty={property}
          initialFieldStatus={fieldStatus}
          generateError={generateError}
          onState={handleState}
          onGenerate={handleGenerate}
        />
      </div>
    );
  }

  // ── Phase 2 : Generating ──────────────────────────────────────────────────
  if (phase === "generating") {
    return (
      <div className="flex h-full flex-col">
        <GeneratingScreen currentStep={progressStep} />
      </div>
    );
  }

  // ── Phase 3 : Ready ───────────────────────────────────────────────────────
  return (
    <div className="pb-12">
      <div className="flex flex-col gap-6">
        {backToPropertyHref && (
          <Link
            href={backToPropertyHref}
            className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-accent-600 hover:text-accent-500"
          >
            <span aria-hidden="true">←</span>
            {UI.estimations.backToProperty}
          </Link>
        )}
        {valuation ? (
          <ValuationHero id={id} valuation={valuation} />
        ) : (
          <p className="text-sm text-zinc-500">{UI.common.error}</p>
        )}
        {valuation ? (
          <SidePanel
            id={id}
            valuation={valuation}
            market={market}
            property={property}
            fieldStatus={fieldStatus}
            coverage={coverage}
          />
        ) : null}
      </div>
    </div>
  );
}
