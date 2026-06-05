"use client";

import { useEffect, useRef, useState } from "react";
import { UI } from "@/lib/ui-strings";
import { TOTAL_BLOCKS } from "@/lib/estimation/spec";
import type { PropertyData, FieldStatusMap } from "@/lib/estimation/types";

type Msg = { role: "user" | "assistant"; content: string };

function renderLight(text: string) {
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

type Props = {
  id: string;
  initialMessages: Msg[];
  initialBlock: number;
  initialCanGenerate: boolean;
  generating: boolean;
  progressStep: string | null;
  generateError: string | null;
  onState: (
    property: PropertyData,
    fieldStatus: FieldStatusMap,
    block: number,
    canGenerate: boolean
  ) => void;
  onGenerate: () => void;
};

export function InterviewChat({
  id,
  initialMessages,
  initialBlock,
  initialCanGenerate,
  generating,
  progressStep,
  generateError,
  onState,
  onGenerate,
}: Props) {
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [block, setBlock] = useState(initialBlock);
  const [canGenerate, setCanGenerate] = useState(initialCanGenerate);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    setInput("");
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
              | {
                  type: "state";
                  property: PropertyData;
                  fieldStatus: FieldStatusMap;
                  block: number;
                  canGenerate: boolean;
                }
              | { type: "done" }
              | { type: "error"; message: string };

            if (frame.type === "text") {
              assistantAcc += frame.delta;
              const acc = assistantAcc;
              setMessages((m) => {
                const copy = [...m];
                copy[copy.length - 1] = { role: "assistant", content: acc };
                return copy;
              });
            } else if (frame.type === "state") {
              setBlock(frame.block);
              setCanGenerate(frame.canGenerate);
              onState(
                frame.property,
                frame.fieldStatus,
                frame.block,
                frame.canGenerate
              );
            } else if (frame.type === "error") {
              throw new Error(frame.message);
            }
            // "done" — nothing extra needed
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
    }
  }

  return (
    <div className="ct-chat">
      <div className="ct-chat-status">
        {UI.estimations.interviewTitle} — {UI.estimations.blockProgress(Math.min(block, TOTAL_BLOCKS), TOTAL_BLOCKS)}
      </div>

      <div className="ct-chat-messages" ref={scrollRef}>
        {messages.length === 0 ? (
          <p className="ct-placeholder">{UI.estimations.interviewSub}</p>
        ) : null}
        {messages.map((m, idx) => (
          <div key={idx} className={`ct-chat-msg ${m.role}`}>
            <div className="ct-chat-msg-avatar">
              {m.role === "user" ? UI.chat.userAvatar : UI.chat.assistantAvatar}
            </div>
            <div className="ct-chat-msg-bubble">
              {m.content ? (
                renderLight(m.content)
              ) : (
                <span className="ct-placeholder">…</span>
              )}
            </div>
          </div>
        ))}
        {error ? (
          <p className="ct-error">
            {UI.chat.errorPrefix} : {error}
          </p>
        ) : null}
      </div>

      <div className="ct-chat-input-wrap">
        <input
          className="ct-chat-input"
          placeholder={UI.chat.placeholder}
          value={input}
          disabled={busy || generating}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div className="est-interview-cta">
          {generating ? (
            <p className="ct-placeholder">
              {progressStep ?? UI.estimations.generating}
            </p>
          ) : generateError ? (
            <>
              <p className="ct-placeholder" style={{ color: "var(--ct-text-danger)" }}>
                {generateError}
              </p>
              <button
                className="ct-seg-btn primary"
                disabled={!canGenerate}
                onClick={onGenerate}
              >
                {UI.estimations.generate}
              </button>
            </>
          ) : (
            <button
              className="ct-seg-btn primary"
              disabled={!canGenerate}
              onClick={onGenerate}
            >
              {UI.estimations.generate}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
