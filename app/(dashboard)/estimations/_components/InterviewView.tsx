"use client";

import { useEffect, useState } from "react";
import { InterviewChat } from "./InterviewChat";
import { FicheLive } from "./FicheLive";
import { ValuationPanel } from "./ValuationPanel";
import { UI } from "@/lib/ui-strings";
import type {
  PropertyData,
  FieldStatusMap,
  Valuation,
  MarketAnalysis,
} from "@/lib/estimation/types";

type Msg = { role: "user" | "assistant"; content: string };

type Props = {
  id: string;
  initialMessages: Msg[];
  initialProperty: PropertyData;
  initialFieldStatus: FieldStatusMap;
  initialBlock: number;
  initialCanGenerate: boolean;
  initialStatus: string;
  initialValuation?: Valuation | null;
  initialMarket?: MarketAnalysis | null;
};

export function InterviewView({
  id,
  initialMessages,
  initialProperty,
  initialFieldStatus,
  initialBlock,
  initialCanGenerate,
  initialStatus,
  initialValuation,
  initialMarket,
}: Props) {
  const [property, setProperty] = useState<PropertyData>(initialProperty);
  const [fieldStatus, setFieldStatus] =
    useState<FieldStatusMap>(initialFieldStatus);
  const [block, setBlock] = useState(initialBlock);
  const [canGenerate, setCanGenerate] = useState(initialCanGenerate);

  // Valuation state
  const [status, setStatus] = useState(initialStatus);
  const [valuation, setValuation] = useState<Valuation | null>(
    initialValuation ?? null
  );
  const [market, setMarket] = useState<MarketAnalysis | null>(
    initialMarket ?? null
  );
  const [generating, setGenerating] = useState(false);
  const [progressStep, setProgressStep] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

  useEffect(() => {
    function onEstimationUpdated(event: Event) {
      const detail = (event as CustomEvent<{
        estimationId?: string | null;
        field?: keyof PropertyData;
        value?: PropertyData[keyof PropertyData];
      }>).detail;
      if (detail?.estimationId !== id || !detail.field) return;
      setProperty((current) => ({ ...current, [detail.field!]: detail.value }));
      setFieldStatus((current) => ({ ...current, [detail.field!]: "answered" }));
    }

    window.addEventListener("cockpit:estimation-updated", onEstimationUpdated);
    return () => window.removeEventListener("cockpit:estimation-updated", onEstimationUpdated);
  }, [id]);

  function handleState(
    p: PropertyData,
    fs: FieldStatusMap,
    b: number,
    cg: boolean
  ) {
    setProperty(p);
    setFieldStatus(fs);
    setBlock(b);
    setCanGenerate(cg);
  }

  async function handleGenerate() {
    if (generating) return;
    setGenerating(true);
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
              // Non-fatal error from pipeline — keep going but show the message
              setGenerateError(frame.message);
            } else if (frame.type === "done") {
              setValuation(frame.valuation);
              setMarket(frame.market);
              setStatus("ready");
              setProgressStep(null);
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
    } finally {
      setGenerating(false);
    }
  }

  const isReady = status === "ready";

  return (
    <div className="est-grid-escape">
    <div className="est-grid">
      <div className="est-grid-chat">
        <InterviewChat
          id={id}
          initialMessages={initialMessages}
          property={property}
          fieldStatus={fieldStatus}
          initialBlock={block}
          initialCanGenerate={canGenerate}
          generating={generating}
          progressStep={progressStep}
          generateError={generateError}
          onState={handleState}
          onGenerate={handleGenerate}
        />
      </div>
      <div className="est-grid-fiche">
        <FicheLive
          property={property}
          fieldStatus={fieldStatus}
          block={block}
        />
        {isReady && valuation ? (
          <ValuationPanel id={id} valuation={valuation} market={market} />
        ) : null}
      </div>
    </div>
    </div>
  );
}
