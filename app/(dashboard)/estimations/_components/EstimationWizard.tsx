"use client";

import { useEffect, useRef, useState } from "react";
import { WizardStepper } from "./WizardStepper";
import { UI } from "@/lib/ui-strings";
import { RECAP_FIELDS } from "@/lib/estimation/spec";
import type { Coverage } from "@/lib/estimation/spec";
import type { PropertyData, FieldStatusMap } from "@/lib/estimation/types";

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
      <p key={key++} className="est-msg-p">
        {renderInline(para.join(" "))}
      </p>
    );
    para = [];
  };
  const flushBullets = () => {
    if (bullets.length === 0) return;
    blocks.push(
      <ul key={key++} className="est-msg-ul">
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
      <ol key={key++} className="est-msg-ol">
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
      setError(e instanceof Error ? e.message : UI.common.error);
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
    <div className="est-wizard">
      {/* ── Header sticky : stepper + barre ── */}
      <div className="est-wizard-head">
        <WizardStepper
          coverage={coverage}
          nextLabel={nextLabel}
          canGenerate={canGenerate}
        />
        <div className="est-wizard-progress-track">
          <div
            className="est-wizard-progress-fill"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* ── Messages ── */}
      <div className="est-wizard-messages" ref={scrollRef}>
        {isEmpty ? (
          <div className="est-wizard-empty">
            <div className="est-wizard-empty-icon">€</div>
            <p className="est-wizard-empty-title">{UI.estimations.interviewTitle}</p>
            <p className="est-wizard-empty-sub">{UI.estimations.interviewSub}</p>
            <button
              className="ct-seg-btn primary est-wizard-start"
              disabled={busy}
              onClick={() => send("Bonjour, commençons l'entretien.")}
            >
              Démarrer l&apos;entretien
            </button>
          </div>
        ) : (
          messages.map((m, idx) => {
            const isLast = idx === messages.length - 1;
            const act = m.activity;
            const hasActivity = Boolean(act && (act.reasoning || act.events.length));
            return (
            <div key={idx} className={`est-wizard-msg ${m.role}`}>
              {m.role === "assistant" && (
                <div className="est-wizard-msg-avatar">
                  {UI.chat.assistantAvatar}
                </div>
              )}
              <div className="est-wizard-msg-col">
                <div className="est-wizard-msg-bubble">
                  {m.content ? (
                    renderBlocks(m.content)
                  ) : thinking && isLast ? (
                    liveReasoning ? (
                      <span className="est-wizard-reasoning-live">
                        <span className="est-wizard-thinking-dot" />
                        {liveReasoning}
                      </span>
                    ) : (
                      <span className="est-wizard-thinking">
                        <span className="est-wizard-thinking-dot" />
                        Réflexion…
                      </span>
                    )
                  ) : (
                    <span className="est-wizard-typing">
                      <span /><span /><span />
                    </span>
                  )}
                </div>

                {m.role === "assistant" && hasActivity && (
                  <details className="est-agent-activity">
                    <summary>
                      <span className="est-agent-activity-icon">⚡</span>
                      Activité de l&apos;agent
                      {act!.events.length > 0 && (
                        <span className="est-agent-activity-count">
                          {act!.events.length}
                        </span>
                      )}
                    </summary>
                    <div className="est-agent-activity-body">
                      {act!.events.map((e, i) => (
                        <div key={i} className="est-agent-event">
                          <span className="est-agent-event-check">✓</span> {e}
                        </div>
                      ))}
                      {act!.reasoning && (
                        <div className="est-agent-reasoning">
                          <div className="est-agent-reasoning-title">Réflexion</div>
                          {act!.reasoning}
                        </div>
                      )}
                    </div>
                  </details>
                )}
              </div>
            </div>
            );
          })
        )}
        {error ? (
          <p className="ct-error est-wizard-error">
            {UI.chat.errorPrefix} : {error}
          </p>
        ) : null}
      </div>

      {/* ── Footer : suggestions + input ── */}
      {!isEmpty && (
        <div className="est-wizard-footer">
          {suggestions.length > 0 && !busy && (
            <div className="est-wizard-suggestions">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  className="est-wizard-chip"
                  onClick={() => send(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <div className="est-wizard-input-row">
            <input
              ref={inputRef}
              className="est-wizard-input"
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
            <button
              className="est-wizard-send"
              disabled={busy || !input.trim()}
              onClick={() => send()}
              aria-label="Envoyer"
            >
              →
            </button>
          </div>

          {generateError && (
            <p className="ct-error est-wizard-error">{generateError}</p>
          )}

          {canGenerate && (
            <button
              className="est-wizard-generate ct-seg-btn primary"
              onClick={onGenerate}
            >
              {UI.estimations.generate}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
