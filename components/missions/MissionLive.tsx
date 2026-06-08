"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MissionView, PhaseStatus } from "@/lib/missions/types";
import { PageStack, Card } from "@/components/cockpit/primitives";
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
  const [sending, setSending] = useState<string | null>(null);
  const [decisionErr, setDecisionErr] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`/api/missions/${id}`, { cache: "no-store" });
      if (!r.ok) return;
      const json = (await r.json()) as { view?: MissionView };
      if (json.view && alive.current) setV(json.view);
    } catch {
      /* moteur indispo : on garde l'état connu */
    }
  }, [id]);

  /** Soumet le choix d'un moment de décision, puis re-poll immédiatement. */
  async function choose(value: string) {
    setSending(value);
    setDecisionErr(false);
    try {
      const r = await fetch(`/api/missions/${id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      if (!r.ok) {
        if (alive.current) setDecisionErr(true);
        return;
      }
      await refresh();
    } catch {
      if (alive.current) setDecisionErr(true);
    } finally {
      if (alive.current) setSending(null);
    }
  }

  useEffect(() => {
    if (!ACTIVE.has(v.status)) return;
    const iv = setInterval(refresh, POLL_MS);
    return () => clearInterval(iv);
  }, [refresh, v.status]);

  const headPill =
    v.status === "done"
      ? "mv-pill-done"
      : v.status === "failed" || v.status === "awaiting_decision"
        ? "mv-pill-ask"
        : v.status === "paused"
          ? "mv-pill-wait"
          : "mv-pill-now";

  return (
    <PageStack>
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
        <Card title={t.progression}>
          {v.phases.map((p) => (
            <div key={p.key} className={`mv-story-line${p.status === "todo" ? " is-todo" : ""}`}>
              <span className="mv-story-ic">{STORY_ICON[p.status]}</span>
              <span className="mv-story-tx">{p.story}</span>
            </div>
          ))}
        </Card>

        <Card title={t.canvas}>
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
                        <span className={`mv-pill mv-ch-pill ${PHASE_PILL[p.status]}`}>
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
        </Card>
      </div>

      {/* État d'erreur humain */}
      {v.error && (
        <div className="mv-err">
          <div className="mv-err-h">{t.errorTitle}</div>
          <div className="mv-err-b">{v.error}</div>
        </div>
      )}

      {/* Moment de décision — émis par le moteur (status paused_hitl) */}
      {v.decision && (
        <div className="mv-dock">
          <span className="mv-pill mv-pill-ask">{t.decisionPill}</span>
          <div className="mv-q">{v.decision.question}</div>
          {v.decision.hint && <div className="mv-hint">{v.decision.hint}</div>}
          <div className="mv-choices">
            {v.decision.options.map((o) => (
              <button
                key={o.value}
                type="button"
                className="mv-choice"
                disabled={sending !== null}
                aria-busy={sending === o.value}
                onClick={() => choose(o.value)}
              >
                {sending === o.value ? t.decisionBusy : o.label}
              </button>
            ))}
          </div>
          {decisionErr && <div className="mv-hint mv-dock-err">{t.decisionError}</div>}
        </div>
      )}

      {/* Aperçu du résultat */}
      {v.output && (
        <Card title={t.output}>
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
        </Card>
      )}
    </PageStack>
  );
}
