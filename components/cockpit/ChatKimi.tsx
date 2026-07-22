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
        if (last?.role !== "assistant") return m;
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
    <div className="flex h-full flex-col">
      <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto px-4 py-4" ref={scrollRef}>
        {messages.length === 0 ? <p className="text-sm text-zinc-500">{UI.chat.empty}</p> : null}
        {messages.map((m, idx) => (
          <div key={idx} className={`flex gap-2 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-950/5 text-xs">
              {m.role === "user" ? UI.chat.userAvatar : UI.chat.assistantAvatar}
            </div>
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                m.role === "user" ? "bg-accent-500/15 text-zinc-900" : "bg-zinc-950/5 text-zinc-700"
              }`}
            >
              {m.tools && m.tools.length > 0 ? (
                <div className="mb-1.5 flex flex-wrap gap-1.5">
                  {m.tools.map((t) => (
                    <span
                      key={t.id}
                      className="inline-flex items-center gap-1 rounded-full border border-zinc-950/10 bg-white px-2 py-0.5 text-xs text-zinc-600"
                      title={t.name}
                    >
                      {TOOL_ICON[t.status]} {t.summary}
                    </span>
                  ))}
                </div>
              ) : null}
              {m.content ? renderLight(m.content) : m.tools?.length ? null : <span className="text-zinc-500">…</span>}
            </div>
          </div>
        ))}
        {error ? (
          <p className="text-sm text-red-600">
            {UI.chat.errorPrefix} : {error}
          </p>
        ) : null}
      </div>
      <div className="border-t border-zinc-950/10 p-3">
        <input
          className="w-full rounded-lg border border-zinc-950/10 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-500 focus:border-accent-500/50 focus:outline-none"
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
