"use client";

import { useEffect, useRef, useState } from "react";
import { WizardStepper } from "./WizardStepper";
import { UI } from "@/lib/ui-strings";
import { TOTAL_BLOCKS } from "@/lib/estimation/spec";
import type { PropertyData, FieldStatusMap } from "@/lib/estimation/types";

type Msg = { role: "user" | "assistant"; content: string };

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
  initialBlock: number;
  initialConfirmedCount: number;
  initialCanGenerate: boolean;
  initialSuggestions: string[];
  generateError: string | null;
  onState: (
    property: PropertyData,
    fieldStatus: FieldStatusMap,
    block: number,
    canGenerate: boolean,
    confirmedCount: number
  ) => void;
  onGenerate: () => void;
};

export function EstimationWizard({
  id,
  initialMessages,
  initialBlock,
  initialConfirmedCount,
  initialCanGenerate,
  initialSuggestions,
  generateError,
  onState,
  onGenerate,
}: Props) {
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [block, setBlock] = useState(initialBlock);
  const [confirmedCount, setConfirmedCount] = useState(initialConfirmedCount);
  const [canGenerate, setCanGenerate] = useState(initialCanGenerate);
  const [suggestions, setSuggestions] = useState<string[]>(initialSuggestions);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
                  block: number;
                  canGenerate: boolean;
                  suggestions?: string[];
                }
              | { type: "done" }
              | { type: "error"; message: string };

            if (frame.type === "reasoning") {
              setThinking(true);
            } else if (frame.type === "text") {
              setThinking(false);
              assistantAcc += frame.delta;
              const acc = assistantAcc;
              setMessages((m) => {
                const copy = [...m];
                copy[copy.length - 1] = { role: "assistant", content: acc };
                return copy;
              });
            } else if (frame.type === "state") {
              setThinking(false);
              const newConfirmed = Math.max(0, frame.block - 1);
              setBlock(frame.block);
              setConfirmedCount(newConfirmed);
              setCanGenerate(frame.canGenerate);
              setSuggestions(
                Array.isArray(frame.suggestions) ? frame.suggestions : []
              );
              onState(
                frame.property,
                frame.fieldStatus,
                frame.block,
                frame.canGenerate,
                newConfirmed
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
    } catch (e) {
      setError(e instanceof Error ? e.message : UI.common.error);
      setMessages((m) => m.slice(0, -1));
    } finally {
      setBusy(false);
      setThinking(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  const progressPct = Math.round(
    (Math.min(confirmedCount, TOTAL_BLOCKS) / TOTAL_BLOCKS) * 100
  );
  const isEmpty = messages.length === 0;

  return (
    <div className="est-wizard">
      {/* ── Header sticky : stepper + barre ── */}
      <div className="est-wizard-head">
        <WizardStepper block={block} confirmedCount={confirmedCount} />
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
              Démarrer l'entretien
            </button>
          </div>
        ) : (
          messages.map((m, idx) => (
            <div key={idx} className={`est-wizard-msg ${m.role}`}>
              {m.role === "assistant" && (
                <div className="est-wizard-msg-avatar">
                  {UI.chat.assistantAvatar}
                </div>
              )}
              <div className="est-wizard-msg-bubble">
                {m.content ? (
                  renderBlocks(m.content)
                ) : thinking && idx === messages.length - 1 ? (
                  <span className="est-wizard-thinking">
                    <span className="est-wizard-thinking-dot" />
                    Réflexion…
                  </span>
                ) : (
                  <span className="est-wizard-typing">
                    <span /><span /><span />
                  </span>
                )}
              </div>
            </div>
          ))
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
