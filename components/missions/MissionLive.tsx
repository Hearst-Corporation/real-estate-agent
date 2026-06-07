"use client";

import { useEffect, useState } from "react";
import type { MissionView, PhaseStatus } from "@/lib/missions/types";
import { UI } from "@/lib/ui-strings";

const t = UI.missions;
const STORY_ICON: Record<PhaseStatus, string> = { done: "✓", now: "◐", ask: "⏳", todo: "○" };
const PHASE_PILL: Record<PhaseStatus, string> = {
  done: "mv-pill-done",
  now: "mv-pill-now",
  ask: "mv-pill-ask",
  todo: "mv-pill-wait",
};
const ACTIVE = new Set(["planning", "running", "awaiting_decision"]);
const POLL_MS = 3000;

/** Mission View réelle : poll l'état traduit et l'affiche en langage humain. */
export function MissionLive({ initial, id }: { initial: MissionView; id: string }) {
  const [v, setV] = useState<MissionView>(initial);

  useEffect(() => {
    if (!ACTIVE.has(v.status)) return;
    const iv = setInterval(async () => {
      try {
        const r = await fetch(`/api/missions/${id}`, { cache: "no-store" });
        if (!r.ok) return;
        const json = (await r.json()) as { view?: MissionView };
        if (json.view) setV(json.view);
      } catch {
        /* moteur indispo : on garde l'état connu */
      }
    }, POLL_MS);
    return () => clearInterval(iv);
  }, [id, v.status]);

  const headPill =
    v.status === "done"
      ? "mv-pill-done"
      : v.status === "failed" || v.status === "awaiting_decision"
        ? "mv-pill-ask"
        : v.status === "paused"
          ? "mv-pill-wait"
          : "mv-pill-now";

  return (
    <div className="ct-page-stack">
      {/* Header de mission */}
      <div className="mv-head">
        <div className="mv-head-row">
          <h1 className="mv-title">{v.title}</h1>
        </div>
        <div className="mv-statusline">
          <span className={`mv-pill ${headPill}`}>{v.humanStatus}</span>
          <span>{v.stepLabel}</span>
          <div className="mv-prog">
            <i style={{ width: `${v.progress}%` }} />
          </div>
        </div>
      </div>

      {/* Progression | Espace vivant */}
      <div className="mv-cols">
        <section className="ct-card">
          <div className="ct-card-title">{t.progression}</div>
          <div className="ct-card-body">
            {v.phases.map((p) => (
              <div key={p.key} className={`mv-story-line${p.status === "todo" ? " is-todo" : ""}`}>
                <span className="mv-story-ic">{STORY_ICON[p.status]}</span>
                <span className="mv-story-tx">{p.story}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="ct-card">
          <div className="ct-card-title">{t.canvas}</div>
          <div className="ct-card-body">
            <div className="mv-canvas">
              {v.phases.map((p, i) => {
                const open = p.status === "now" || p.status === "ask";
                return (
                  <div key={p.key}>
                    <div className={`mv-ccard${open ? " is-open" : ""}`}>
                      <div className="mv-ch">
                        <span className="mv-emo">{p.emo}</span>
                        <div>
                          <div className="mv-nm">{p.nm}</div>
                          <div className="mv-one">{p.story}</div>
                        </div>
                        <span style={{ marginLeft: "auto" }} className={`mv-pill ${PHASE_PILL[p.status]}`}>
                          {t.phase[p.status]}
                        </span>
                      </div>
                      {open && (
                        <div className="mv-detail">
                          <div>
                            <div className="mv-det-h">{t.doing}</div>
                            <div className="mv-det-b">{p.doing}</div>
                          </div>
                          {p.found.length > 0 && (
                            <div>
                              <div className="mv-det-h">{t.found}</div>
                              <div className="mv-det-b">
                                <ul>
                                  {p.found.map((f, j) => (
                                    <li key={j}>{f}</li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {i < v.phases.length - 1 && <div className="mv-arrow">↓</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      {/* État d'erreur humain */}
      {v.error && (
        <div className="mv-err">
          <div className="mv-err-h">{t.errorTitle}</div>
          <div className="mv-err-b">{v.error}</div>
        </div>
      )}

      {/* Moment de décision (Slice 2 : actuellement jamais émis) */}
      {v.decision && (
        <div className="mv-dock">
          <span className="mv-pill mv-pill-ask">{t.decisionPill}</span>
          <div className="mv-q">{v.decision.question}</div>
          {v.decision.hint && <div className="mv-hint">{v.decision.hint}</div>}
          <div className="mv-choices">
            {v.decision.options.map((o) => (
              <button key={o.value} type="button" className="mv-choice">
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Aperçu du résultat */}
      {v.output && (
        <section className="ct-card">
          <div className="ct-card-title">{t.output}</div>
          <div className="ct-card-body">
            {v.output.hook && (
              <div className="mv-field">
                <div className="mv-fl">{t.hook}</div>
                <div className="mv-fv mv-fv-big">{v.output.hook}</div>
              </div>
            )}
            {v.output.body && (
              <div className="mv-field">
                <div className="mv-fl">{t.detail}</div>
                <div className="mv-fv">{v.output.body}</div>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
