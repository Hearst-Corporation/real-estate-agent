"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { UI } from "@/lib/ui-strings";

type ToolChip = { id: string; name: string; status: "running" | "ok" | "error"; summary: string };
type Msg = { role: "user" | "assistant"; content: string; tools?: ToolChip[] };

type Frame =
  | { type: "chat"; chatId: string }
  | { type: "text"; delta: string }
  | { type: "tool"; id: string; name: string; status: "running" | "ok" | "error"; summary: string }
  | {
      type: "action";
      action:
        | { type: "navigate"; path: string }
        | { type: "estimation_field"; estimationId: string; field: string; value: string | number | boolean };
    }
  | { type: "error"; message: string }
  | { type: "done" };

const TOOL_ICON: Record<ToolChip["status"], string> = { running: "⏳", ok: "✓", error: "⚠" };

function renderLight(text: string) {
  const parts: React.ReactNode[] = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("`")) parts.push(<code key={i++}>{tok.slice(1, -1)}</code>);
    else parts.push(<strong key={i++}>{tok.slice(2, -2)}</strong>);
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function ChatKimi() {
  const pathname = usePathname();
  return <ChatKimiSession key={pathname} pathname={pathname} />;
}

function ChatKimiSession({ pathname }: { pathname: string }) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [chatId, setChatId] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  /** Applique une frame NDJSON à l'état (dernier message = bulle assistant en cours). */
  function applyFrame(frame: Frame) {
    if (frame.type === "chat") {
      setChatId(frame.chatId);
    } else if (frame.type === "text") {
      setMessages((m) => {
        const c = [...m];
        const last = c[c.length - 1];
        c[c.length - 1] = { ...last, content: last.content + frame.delta };
        return c;
      });
    } else if (frame.type === "tool") {
      setMessages((m) => {
        const c = [...m];
        const last = c[c.length - 1];
        const tools = [...(last.tools ?? [])];
        const idx = tools.findIndex((t) => t.id === frame.id);
        const chip: ToolChip = { id: frame.id, name: frame.name, status: frame.status, summary: frame.summary };
        if (idx >= 0) tools[idx] = chip;
        else tools.push(chip);
        c[c.length - 1] = { ...last, tools };
        return c;
      });
    } else if (frame.type === "action") {
      if (frame.action.type === "navigate") {
        router.push(frame.action.path);
      } else if (frame.action.type === "estimation_field") {
        window.dispatchEvent(
          new CustomEvent("cockpit:estimation-updated", {
            detail: { estimationId: frame.action.estimationId, field: frame.action.field, value: frame.action.value },
          }),
        );
      }
    } else if (frame.type === "error") {
      setError(frame.message);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setBusy(true);
    try {
      const res = await fetch("/api/cockpit-chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chatId, message: text, context: { pathname } }),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "stream_failed");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          try {
            applyFrame(JSON.parse(line) as Frame);
          } catch {
            /* ligne partielle / non-JSON : ignorée */
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setMessages((m) => {
        const last = m[m.length - 1];
        if (!last || last.role !== "assistant") return m;
        // Bulle vide sans outils → on la retire.
        if (last.content === "" && !last.tools?.length) return m.slice(0, -1);
        // Sinon, on débloque les chips d'outils restés en "running".
        if (last.tools?.some((t) => t.status === "running")) {
          const copy = [...m];
          copy[copy.length - 1] = {
            ...last,
            tools: last.tools.map((t) => (t.status === "running" ? { ...t, status: "error" as const } : t)),
          };
          return copy;
        }
        return m;
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ct-chat">
      <div className="ct-chat-status">{UI.chat.status}</div>
      <div className="ct-chat-messages" ref={scrollRef}>
        {messages.length === 0 ? <p className="ct-placeholder">{UI.chat.empty}</p> : null}
        {messages.map((m, idx) => (
          <div key={idx} className={`ct-chat-msg ${m.role}`}>
            <div className="ct-chat-msg-avatar">{m.role === "user" ? UI.chat.userAvatar : UI.chat.assistantAvatar}</div>
            <div className="ct-chat-msg-bubble">
              {m.tools && m.tools.length > 0 ? (
                <div className="ct-chip-row">
                  {m.tools.map((t) => (
                    <span key={t.id} className="ct-badge" title={t.name}>
                      {TOOL_ICON[t.status]} {t.summary}
                    </span>
                  ))}
                </div>
              ) : null}
              {m.content ? renderLight(m.content) : m.tools?.length ? null : <span className="ct-placeholder">…</span>}
            </div>
          </div>
        ))}
        {error ? <p className="ct-error">{UI.chat.errorPrefix} : {error}</p> : null}
      </div>
      <div className="ct-chat-input-wrap">
        <input
          className="ct-chat-input"
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
    </div>
  );
}
