"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UI } from "@/lib/ui-strings";
import type { AgentFrame } from "@/lib/agent/types";

type ToolChip = {
  id: string;
  name: string;
  status: "running" | "ok" | "error";
  summary: string;
};

type Msg = { role: "user" | "assistant"; content: string; tools?: ToolChip[] };

function renderLight(text: string) {
  // Markdown léger : `code` inline + **gras**. Pas de lib lourde.
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
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [chatId, setChatId] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "", tools: [] }]);
    setBusy(true);
    try {
      const res = await fetch("/api/cockpit-chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chatId, message: text }),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "stream_failed");
      }

      // Fallback header X-Chat-Id (si pas de frame chat)
      const headerChatId = res.headers.get("X-Chat-Id");
      if (headerChatId) setChatId(headerChatId);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      function processLine(line: string) {
        const trimmed = line.trim();
        if (!trimmed) return; // ignorer les lignes vides
        let frame: AgentFrame;
        try {
          frame = JSON.parse(trimmed) as AgentFrame;
        } catch {
          // ligne partielle ou malformée — on l'ignore sans casser le flux
          return;
        }

        switch (frame.type) {
          case "chat":
            setChatId(frame.chatId);
            break;

          case "text":
            setMessages((msgs) => {
              const copy = [...msgs];
              const last = copy[copy.length - 1];
              if (last?.role === "assistant") {
                copy[copy.length - 1] = { ...last, content: last.content + frame.delta };
              }
              return copy;
            });
            break;

          case "tool": {
            const { id, name, status, summary } = frame;
            setMessages((msgs) => {
              const copy = [...msgs];
              const last = copy[copy.length - 1];
              if (last?.role === "assistant") {
                const existingTools: ToolChip[] = last.tools ?? [];
                const idx = existingTools.findIndex((t) => t.id === id);
                let newTools: ToolChip[];
                if (idx >= 0) {
                  // Mettre à jour le chip existant
                  newTools = existingTools.map((t, i) =>
                    i === idx ? { id, name, status, summary } : t
                  );
                } else {
                  // Ajouter un nouveau chip
                  newTools = [...existingTools, { id, name, status, summary }];
                }
                copy[copy.length - 1] = { ...last, tools: newTools };
              }
              return copy;
            });
            break;
          }

          case "action":
            if (frame.action.type === "navigate") {
              router.push(frame.action.path);
            }
            break;

          case "error":
            setError(frame.message);
            break;

          case "done":
            // fin du stream — rien à faire, le finally gère busy
            break;
        }
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // Flush : traiter la dernière ligne restante dans le buffer
          if (buffer.trim()) processLine(buffer);
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        // La dernière entrée peut être incomplète — on la conserve dans le buffer
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          processLine(line);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setMessages((m) => m.slice(0, -1)); // retirer la bulle assistant vide
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ct-chat">
      <div className="ct-chat-status">{UI.chat.status}</div>
      <div className="ct-chat-messages" ref={scrollRef}>
        {messages.length === 0 ? (
          <p className="ct-placeholder">{UI.chat.empty}</p>
        ) : null}
        {messages.map((m, idx) => (
          <div key={idx} className={`ct-chat-msg ${m.role}`}>
            <div className="ct-chat-msg-avatar">
              {m.role === "user" ? UI.chat.userAvatar : UI.chat.assistantAvatar}
            </div>
            <div className="ct-chat-msg-bubble">
              {m.content ? renderLight(m.content) : <span className="ct-placeholder">…</span>}
              {m.tools && m.tools.length > 0 ? (
                <div className="ct-chat-tools">
                  {m.tools.map((t) => (
                    <span key={t.id} className="ct-chat-tool" data-status={t.status}>
                      {t.status === "running" ? `${t.summary} …` : t.summary}
                    </span>
                  ))}
                </div>
              ) : null}
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
