"use client";

import { useEffect, useRef, useState } from "react";
import { WizardStepper } from "./WizardStepper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Text } from "@/components/ui/text";
import { UI } from "@/lib/ui-strings";
import { RECAP_FIELDS } from "@/lib/estimation/spec";
import type { Coverage } from "@/lib/estimation/spec";
import type { PropertyData, FieldStatusMap } from "@/lib/estimation/types";

/**
 * Codes d'erreur signalant une panne du provider LLM (et non une erreur de
 * saisie). Ils déclenchent le mode dégradé : message clair, saisie préservée,
 * génération toujours possible depuis les données déjà collectées.
 */
const LLM_FAILURE_CODES = new Set([
  "interview_not_configured", // provider absent / clé manquante (503)
  "stream_error", // exception serveur pendant le stream
  "stream_failed", // réponse non-OK sans corps exploitable
]);

/** Trace d'activité de l'agent pour un tour : sa réflexion + ce qu'il a fait. */
type AgentActivity = { reasoning: string; events: string[] };
type Msg = { role: "user" | "assistant"; content: string; activity?: AgentActivity };

/** field → libellé FR (pour nommer les données enregistrées dans l'activité). */
const FIELD_LABELS: Partial<Record<keyof PropertyData, string>> = Object.fromEntries(
  RECAP_FIELDS.map(({ field, label }) => [field, label])
);

/** Normalise une valeur de champ pour comparer deux snapshots. */
function normValue(v: PropertyData[keyof PropertyData]): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.join(",");
  return String(v);
}

/** Inline : gras (**…**) + code (`…`). */
function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("`"))
      parts.push(<code key={i++}>{tok.slice(1, -1)}</code>);
    else parts.push(<strong key={i++}>{tok.slice(2, -2)}</strong>);
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const BULLET_RE = /^\s*[-*•]\s+(.*)$/;
const ORDERED_RE = /^\s*(\d+)[.)]\s+(.*)$/;

/**
 * Bloc : découpe le texte en paragraphes, listes à puces et listes numérotées.
 * Aère la lecture — chaque puce sur sa ligne, paragraphes espacés.
 */
function renderBlocks(text: string): React.ReactNode {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let para: string[] = [];
  let bullets: string[] = [];
  let ordered: string[] = [];
  let key = 0;

  const flushPara = () => {
    if (para.length === 0) return;
    blocks.push(
      <p key={key++} className="leading-relaxed">
        {renderInline(para.join(" "))}
      </p>
    );
    para = [];
  };
  const flushBullets = () => {
    if (bullets.length === 0) return;
    blocks.push(
      <ul key={key++} className="list-disc space-y-1 pl-5 leading-relaxed">
        {bullets.map((b, i) => (
          <li key={i}>{renderInline(b)}</li>
        ))}
      </ul>
    );
    bullets = [];
  };
  const flushOrdered = () => {
    if (ordered.length === 0) return;
    blocks.push(
      <ol key={key++} className="list-decimal space-y-1 pl-5 leading-relaxed">
        {ordered.map((b, i) => (
          <li key={i}>{renderInline(b)}</li>
        ))}
      </ol>
    );
    ordered = [];
  };
  const flushAll = () => {
    flushPara();
    flushBullets();
    flushOrdered();
  };

  for (const line of lines) {
    // Ligne vide : ne ferme QUE le paragraphe. Une liste en cours reste
    // ouverte (les items numérotés espacés par une ligne vide forment
    // une seule liste → numérotation 1,2,3 continue, pas 1,1,1).
    if (line.trim() === "") {
      flushPara();
      continue;
    }
    const bm = line.match(BULLET_RE);
    if (bm) {
      flushPara();
      flushOrdered();
      bullets.push(bm[1]);
      continue;
    }
    const om = line.match(ORDERED_RE);
    if (om) {
      flushPara();
      flushBullets();
      ordered.push(om[2]);
      continue;
    }
    // Ligne de texte normale → ferme les listes en cours.
    flushBullets();
    flushOrdered();
    para.push(line.trim());
  }
  flushAll();

  return blocks;
}

type Props = {
  id: string;
  initialMessages: Msg[];
  initialCoverage: Coverage;
  initialCanGenerate: boolean;
  initialSuggestions: string[];
  initialNextLabel: string | null;
  initialProperty: PropertyData;
  initialFieldStatus: FieldStatusMap;
  generateError: string | null;
  onState: (
    property: PropertyData,
    fieldStatus: FieldStatusMap,
    coverage: Coverage,
    canGenerate: boolean,
    nextLabel: string | null
  ) => void;
  onGenerate: () => void;
};

export function EstimationWizard({
  id,
  initialMessages,
  initialCoverage,
  initialCanGenerate,
  initialSuggestions,
  initialNextLabel,
  initialProperty,
  initialFieldStatus,
  generateError,
  onState,
  onGenerate,
}: Props) {
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [coverage, setCoverage] = useState<Coverage>(initialCoverage);
  const [nextLabel, setNextLabel] = useState<string | null>(initialNextLabel);
  const [canGenerate, setCanGenerate] = useState(initialCanGenerate);
  const [suggestions, setSuggestions] = useState<string[]>(initialSuggestions);
  const [thinking, setThinking] = useState(false);
  const [liveReasoning, setLiveReasoning] = useState("");
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Snapshots pour differ ce que l'agent enregistre à chaque tour.
  const propRef = useRef<PropertyData>(initialProperty);
  const fsRef = useRef<FieldStatusMap>(initialFieldStatus);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, suggestions]);

  async function send(textArg?: string) {
    const text = (textArg ?? input).trim();
    if (!text || busy) return;
    setError(null);
    setInput("");
    setSuggestions([]);
    setThinking(false);
    setLiveReasoning("");
    setMessages((m) => [
      ...m,
      { role: "user", content: text },
      { role: "assistant", content: "" },
    ]);
    setBusy(true);

    try {
      const res = await fetch(`/api/estimations/${id}/interview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "stream_failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantAcc = "";
      let reasoningAcc = "";

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
            const frame = JSON.parse(line) as
              | { type: "text"; delta: string }
              | { type: "reasoning"; delta: string }
              | {
                  type: "state";
                  property: PropertyData;
                  fieldStatus: FieldStatusMap;
                  coverage: Coverage;
                  canGenerate: boolean;
                  suggestions?: string[];
                  nextLabel?: string | null;
                }
              | { type: "done" }
              | { type: "error"; message: string };

            if (frame.type === "reasoning") {
              setThinking(true);
              reasoningAcc += frame.delta;
              setLiveReasoning(reasoningAcc);
            } else if (frame.type === "text") {
              setThinking(false);
              assistantAcc += frame.delta;
              const acc = assistantAcc;
              const reasoningSoFar = reasoningAcc;
              setMessages((m) => {
                const copy = [...m];
                const prev = copy[copy.length - 1];
                copy[copy.length - 1] = {
                  ...prev,
                  role: "assistant",
                  content: acc,
                  activity: reasoningSoFar
                    ? { reasoning: reasoningSoFar, events: prev.activity?.events ?? [] }
                    : prev.activity,
                };
                return copy;
              });
            } else if (frame.type === "state") {
              setThinking(false);

              // Diff : quelles données l'agent a-t-il enregistrées ce tour ?
              const events: string[] = [];
              for (const { field, label } of RECAP_FIELDS) {
                const after = normValue(frame.property[field]);
                const before = normValue(propRef.current[field]);
                if (after && after !== before) {
                  events.push(`${FIELD_LABELS[field] ?? label} enregistré`);
                }
              }
              if (frame.coverage.collected > coverage.collected) {
                events.push(
                  `${frame.coverage.collected}/${frame.coverage.total} infos clés réunies`
                );
              }
              propRef.current = frame.property;
              fsRef.current = frame.fieldStatus;

              const reasoningSoFar = reasoningAcc;
              setMessages((m) => {
                const copy = [...m];
                const prev = copy[copy.length - 1];
                copy[copy.length - 1] = {
                  ...prev,
                  activity: { reasoning: reasoningSoFar, events },
                };
                return copy;
              });

              const nl = frame.nextLabel ?? null;
              setCoverage(frame.coverage);
              setNextLabel(nl);
              setCanGenerate(frame.canGenerate);
              setSuggestions(
                Array.isArray(frame.suggestions) ? frame.suggestions : []
              );
              onState(
                frame.property,
                frame.fieldStatus,
                frame.coverage,
                frame.canGenerate,
                nl
              );
            } else if (frame.type === "error") {
              throw new Error(frame.message);
            }
          } catch (parseErr) {
            if (parseErr instanceof SyntaxError) continue;
            throw parseErr;
          }
        }
      }

      // Garde-fou : un tour sans texte (l'agent n'a émis qu'un tool_call)
      // laisserait une bulle vide en chargement perpétuel. On comble.
      if (!assistantAcc.trim()) {
        setMessages((m) => {
          const copy = [...m];
          const prev = copy[copy.length - 1];
          if (prev?.role === "assistant" && !prev.content) {
            copy[copy.length - 1] = { ...prev, content: "C'est noté. 👍" };
          }
          return copy;
        });
      }
    } catch (e) {
      // Mode dégradé : un échec LLM (provider absent, timeout, 5xx, stream cassé)
      // ne bloque PAS l'estimation. On affiche un message clair invitant à
      // réessayer / continuer, jamais un code technique brut. La saisie reste
      // ouverte et la génération se débloque dès que l'essentiel est collecté.
      const code = e instanceof Error ? e.message : "";
      const isLlmFailure = LLM_FAILURE_CODES.has(code);
      setError(isLlmFailure ? UI.estimations.interviewUnavailable : code || UI.common.error);
      setMessages((m) => m.slice(0, -1));
    } finally {
      setBusy(false);
      setThinking(false);
      setLiveReasoning("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  const progressPct =
    coverage.total > 0
      ? Math.round((coverage.collected / coverage.total) * 100)
      : 0;
  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-full flex-col">
      {/* ── Header sticky : stepper + barre ── */}
      <div className="sticky top-0 z-10 flex flex-col gap-3 border-b border-zinc-950/10 bg-white/70 px-4 py-3 backdrop-blur-xl sm:px-6 dark:border-white/10 dark:bg-zinc-950/80">
        <WizardStepper
          coverage={coverage}
          nextLabel={nextLabel}
          canGenerate={canGenerate}
        />
        <div className="h-1 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-indigo-400 transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6" ref={scrollRef}>
        {isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-indigo-500/15 text-2xl font-bold text-indigo-600 dark:text-indigo-300">
              €
            </div>
            <p className="text-lg font-semibold text-zinc-950 dark:text-white">{UI.estimations.interviewTitle}</p>
            <Text className="max-w-sm">{UI.estimations.interviewSub}</Text>
            <Button
              color="indigo"
              className="mt-2"
              disabled={busy}
              onClick={() => send("Bonjour, commençons l'entretien.")}
            >
              Démarrer l&apos;entretien
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
          {messages.map((m, idx) => {
            const isLast = idx === messages.length - 1;
            const act = m.activity;
            const hasActivity = Boolean(act && (act.reasoning || act.events.length));
            const isUser = m.role === "user";
            return (
            <div key={idx} className={`flex items-start gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
              {m.role === "assistant" && (
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-indigo-500/15 text-sm text-indigo-600 dark:text-indigo-300">
                  {UI.chat.assistantAvatar}
                </div>
              )}
              <div className={`flex max-w-[80%] flex-col gap-1.5 ${isUser ? "items-end" : "items-start"}`}>
                <div
                  className={`rounded-2xl px-4 py-2.5 text-sm ${
                    isUser
                      ? "bg-indigo-500/20 text-indigo-950 dark:text-indigo-100"
                      : "border border-zinc-950/10 bg-white/[0.04] text-zinc-700 dark:border-white/10 dark:text-zinc-200"
                  }`}
                >
                  {m.content ? (
                    renderBlocks(m.content)
                  ) : thinking && isLast ? (
                    liveReasoning ? (
                      <span className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
                        <span className="size-1.5 animate-pulse rounded-full bg-indigo-400" />
                        {liveReasoning}
                      </span>
                    ) : (
                      <span className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
                        <span className="size-1.5 animate-pulse rounded-full bg-indigo-400" />
                        Réflexion…
                      </span>
                    )
                  ) : (
                    <span className="flex items-center gap-1">
                      <span className="size-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.3s]" />
                      <span className="size-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.15s]" />
                      <span className="size-1.5 animate-bounce rounded-full bg-zinc-400" />
                    </span>
                  )}
                </div>

                {m.role === "assistant" && hasActivity && (
                  <details className="group w-full max-w-full text-xs text-zinc-500">
                    <summary className="flex cursor-pointer list-none items-center gap-1.5 select-none hover:text-zinc-700 dark:hover:text-zinc-300">
                      <span aria-hidden="true">⚡</span>
                      Activité de l&apos;agent
                      {act!.events.length > 0 && (
                        <span className="rounded-full bg-white/[0.08] px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">
                          {act!.events.length}
                        </span>
                      )}
                    </summary>
                    <div className="mt-2 flex flex-col gap-1.5 rounded-lg border border-zinc-950/10 bg-white/[0.03] p-3 dark:border-white/10">
                      {act!.events.map((e, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-zinc-500 dark:text-zinc-400">
                          <span className="text-indigo-500 dark:text-indigo-400" aria-hidden="true">✓</span> {e}
                        </div>
                      ))}
                      {act!.reasoning && (
                        <div className="mt-1 border-t border-zinc-950/10 pt-2 text-zinc-500 dark:border-white/10">
                          <div className="mb-1 font-semibold text-zinc-500 dark:text-zinc-400">Réflexion</div>
                          {act!.reasoning}
                        </div>
                      )}
                    </div>
                  </details>
                )}
              </div>
            </div>
            );
          })}
          </div>
        )}
        {error ? (
          <div className="mt-3 flex items-center gap-2">
            <Badge color="red">{UI.chat.errorPrefix}</Badge>
            <Text>{error}</Text>
          </div>
        ) : null}
      </div>

      {/* ── Footer : suggestions + input ── */}
      {!isEmpty && (
        <div className="flex flex-col gap-3 border-t border-zinc-950/10 bg-white/70 px-4 py-3 backdrop-blur-xl sm:px-6 dark:border-white/10 dark:bg-zinc-950/80">
          {suggestions.length > 0 && !busy && (
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s, i) => (
                <Button key={i} plain className="!rounded-full" onClick={() => send(s)}>
                  {s}
                </Button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Input
                ref={inputRef}
                aria-label={UI.chat.placeholder}
                placeholder={UI.chat.placeholder}
                value={input}
                disabled={busy}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
            </div>
            <Button
              color="indigo"
              disabled={busy || !input.trim()}
              onClick={() => send()}
              aria-label="Envoyer"
            >
              →
            </Button>
          </div>

          {generateError && (
            <div className="flex items-center gap-2">
              <Badge color="red">{UI.chat.errorPrefix}</Badge>
              <Text>{generateError}</Text>
            </div>
          )}

          {canGenerate && (
            <Button color="indigo" onClick={onGenerate}>
              {UI.estimations.generate}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
