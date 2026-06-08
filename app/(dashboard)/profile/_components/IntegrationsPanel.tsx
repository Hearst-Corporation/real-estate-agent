"use client";

import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/cockpit/Icon";
import { UI } from "@/lib/ui-strings";

/** Réponse de GET /api/integrations/composio/status. */
type Status = { gmail: boolean; calendar: boolean; configured: boolean };
type Phase = "loading" | "ready" | "error";
type Toolkit = "gmail" | "googlecalendar";

const PROVIDERS: { toolkit: Toolkit; icon: IconName; key: "gmail" | "calendar" }[] = [
  { toolkit: "gmail", icon: "network", key: "gmail" },
  { toolkit: "googlecalendar", icon: "agenda", key: "calendar" },
];

/**
 * UI 0 — Intégrations. Rend VISIBLE et gérable ce qui existe déjà (routes
 * Composio status/connect). N'ajoute aucune capacité métier, ne refait pas
 * l'OAuth : le bouton « Connecter » délègue à la route connect existante.
 */
export function IntegrationsPanel() {
  const t = UI.profile.integrations;
  const [phase, setPhase] = useState<Phase>("loading");
  const [status, setStatus] = useState<Status | null>(null);
  const [connecting, setConnecting] = useState<Toolkit | null>(null);
  const [note, setNote] = useState<{ toolkit: Toolkit; msg: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/integrations/composio/status", { headers: { accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("status"))))
      .then((d: Status) => {
        if (alive) {
          setStatus(d);
          setPhase("ready");
        }
      })
      .catch(() => {
        if (alive) setPhase("error");
      });
    return () => {
      alive = false;
    };
  }, []);

  async function connect(toolkit: Toolkit) {
    setConnecting(toolkit);
    setNote(null);
    try {
      const res = await fetch("/api/integrations/composio/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolkit }),
      });
      const data = (await res.json().catch(() => ({}))) as { redirectUrl?: string; error?: string };
      if (res.ok && data.redirectUrl) {
        window.location.assign(data.redirectUrl);
        return;
      }
      // Config absente côté serveur pour ce provider (503) ou autre erreur.
      setNote({
        toolkit,
        msg: data.error === "auth_config_manquant" ? t.missingProviderConfig : t.connectError,
      });
    } catch {
      setNote({ toolkit, msg: t.connectError });
    } finally {
      setConnecting(null);
    }
  }

  if (phase === "loading") {
    return <p className="ct-placeholder">{UI.common.loading}</p>;
  }
  if (phase === "error") {
    return <p className="ct-error">{t.loadError}</p>;
  }
  // Clé API Composio absente → tout est indisponible (état honnête).
  if (!status?.configured) {
    return <p className="ct-placeholder">{t.notConfigured}</p>;
  }

  return (
    <div className="integrations-grid">
      {PROVIDERS.map(({ toolkit, icon, key }) => {
        const provider = t.providers[key];
        const connected = key === "gmail" ? status.gmail : status.calendar;
        return (
          <div key={toolkit} className="integration-card">
            <div className="integration-card-head">
              <span className="integration-card-icon" aria-hidden="true">
                <Icon name={icon} />
              </span>
              <span className="integration-card-title">{provider.name}</span>
              <span className={`integration-badge ${connected ? "is-on" : "is-off"}`}>
                {connected ? t.connected : t.disconnected}
              </span>
            </div>

            <p className="integration-card-desc">{provider.description}</p>

            <div className="integration-caps">
              <span className="integration-caps-label">{t.capabilitiesLabel}</span>
              <ul className="integration-caps-list">
                {provider.capabilities.map((cap) => (
                  <li key={cap}>{cap}</li>
                ))}
              </ul>
            </div>

            <div className="integration-card-foot">
              {connected ? (
                <span className="ct-subtext">{t.testInChat}</span>
              ) : (
                <button
                  type="button"
                  className="ct-seg-btn primary"
                  disabled={connecting === toolkit}
                  onClick={() => connect(toolkit)}
                >
                  {connecting === toolkit ? t.connecting : `${t.connect} ${provider.name}`}
                </button>
              )}
              {note?.toolkit === toolkit ? <p className="ct-error">{note.msg}</p> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
