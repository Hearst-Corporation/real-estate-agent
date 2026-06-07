"use client";

import React from "react";

// Renderer markdown léger pour les rapports de swarm (titres, gras, code,
// listes, blocs de code). Pas de dépendance externe.

const INLINE_RE = /(`[^`]+`|\*\*[^*]+\*\*)/g;

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("`")) parts.push(<code key={i++}>{tok.slice(1, -1)}</code>);
    else parts.push(<strong key={i++}>{tok.slice(2, -2)}</strong>);
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const H_RE = /^(#{1,6})\s+(.*)$/;
const BULLET_RE = /^[-*]\s+(.*)$/;
const ORDERED_RE = /^\d+[.)]\s+(.*)$/;

export default function ReportMarkdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let para: string[] = [];
  let bullets: string[] = [];
  let ordered: string[] = [];
  let fence: string[] | null = null;
  let key = 0;

  const flushPara = () => {
    if (!para.length) return;
    blocks.push(
      <p key={key++} className="md-p">
        {renderInline(para.join(" "))}
      </p>
    );
    para = [];
  };
  const flushBullets = () => {
    if (!bullets.length) return;
    blocks.push(
      <ul key={key++} className="md-ul">
        {bullets.map((b, i) => (
          <li key={i}>{renderInline(b)}</li>
        ))}
      </ul>
    );
    bullets = [];
  };
  const flushOrdered = () => {
    if (!ordered.length) return;
    blocks.push(
      <ol key={key++} className="md-ol">
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

  for (const raw of lines) {
    const t = raw.trim();

    // Bloc de code ``` … ```
    if (t.startsWith("```")) {
      if (fence === null) {
        flushAll();
        fence = [];
      } else {
        blocks.push(
          <pre key={key++} className="md-pre">
            <code>{fence.join("\n")}</code>
          </pre>
        );
        fence = null;
      }
      continue;
    }
    if (fence !== null) {
      fence.push(raw);
      continue;
    }

    if (t === "") {
      flushPara();
      continue;
    }

    const h = t.match(H_RE);
    if (h) {
      flushAll();
      const level = h[1].length;
      const content = renderInline(h[2]);
      // # rendu en h2 (la page porte déjà un h1) ; ##→h3 ; ###+→h4
      if (level === 1) blocks.push(<h2 key={key++} className="md-h1">{content}</h2>);
      else if (level === 2) blocks.push(<h3 key={key++} className="md-h2">{content}</h3>);
      else blocks.push(<h4 key={key++} className="md-h3">{content}</h4>);
      continue;
    }

    const bm = t.match(BULLET_RE);
    if (bm) {
      flushPara();
      flushOrdered();
      bullets.push(bm[1]);
      continue;
    }
    const om = t.match(ORDERED_RE);
    if (om) {
      flushPara();
      flushBullets();
      ordered.push(om[1]);
      continue;
    }

    flushBullets();
    flushOrdered();
    para.push(t);
  }

  if (fence !== null) {
    blocks.push(
      <pre key={key++} className="md-pre">
        <code>{fence.join("\n")}</code>
      </pre>
    );
  }
  flushAll();

  return <div className="swarm-report-md">{blocks}</div>;
}
