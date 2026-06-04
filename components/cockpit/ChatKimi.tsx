"use client";

import { useEffect, useRef, useState } from "react";
import { UI } from "@/lib/ui-strings";

type Msg = { role: "user" | "assistant"; content: string };

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

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

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
        body: JSON.stringify({ chatId, message: text }),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "stream_failed");
      }
      const newChatId = res.headers.get("X-Chat-Id");
      if (newChatId) setChatId(newChatId);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content: acc };
          return copy;
        });
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
