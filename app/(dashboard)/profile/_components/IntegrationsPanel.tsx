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
    return <p className="text-sm text-slate-400">{UI.common.loading}</p>;
  }
  if (phase === "error") {
    return <p className="text-sm text-red-400">{t.loadError}</p>;
  }
  // Clé API Composio absente → tout est indisponible (état honnête).
  if (!status?.configured) {
    return <p className="text-sm text-slate-400">{t.notConfigured}</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2">
      {PROVIDERS.map(({ toolkit, icon, key }) => {
        const provider = t.providers[key];
        const connected = key === "gmail" ? status.gmail : status.calendar;
        return (
          <div
            key={toolkit}
            className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4"
          >
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-indigo-300" aria-hidden="true">
                <Icon name={icon} className="size-4" />
              </span>
              <span className="text-sm font-semibold text-slate-100">{provider.name}</span>
              <span
                className={`ml-auto inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                  connected
                    ? "bg-emerald-400/10 text-emerald-300"
                    : "bg-white/[0.06] text-slate-400"
                }`}
              >
                {connected ? t.connected : t.disconnected}
              </span>
            </div>

            <p className="text-sm text-slate-400">{provider.description}</p>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {t.capabilitiesLabel}
              </span>
              <ul className="flex flex-col gap-1 text-sm text-slate-300">
                {provider.capabilities.map((cap) => (
                  <li key={cap} className="flex gap-1.5">
                    <span className="text-slate-600" aria-hidden="true">•</span>
                    {cap}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-1 flex flex-col gap-2">
              {connected ? (
                <span className="text-xs text-slate-500">{t.testInChat}</span>
              ) : (
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-lg bg-indigo-500 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={connecting === toolkit}
                  onClick={() => connect(toolkit)}
                >
                  {connecting === toolkit ? t.connecting : `${t.connect} ${provider.name}`}
                </button>
              )}
              {note?.toolkit === toolkit ? <p className="text-sm text-red-400">{note.msg}</p> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
