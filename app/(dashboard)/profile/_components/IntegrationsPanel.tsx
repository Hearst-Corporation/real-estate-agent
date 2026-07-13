"use client";

import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/cockpit/Icon";
import { UI } from "@/lib/ui-strings";
import { Text } from "@/components/ui/text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
    return <Text>{UI.common.loading}</Text>;
  }
  if (phase === "error") {
    return (
      <Text>
        <Badge color="red">{t.loadError}</Badge>
      </Text>
    );
  }
  // Clé API Composio absente → tout est indisponible (état honnête).
  if (!status?.configured) {
    return <Text>{t.notConfigured}</Text>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2">
      {PROVIDERS.map(({ toolkit, icon, key }) => {
        const provider = t.providers[key];
        const connected = key === "gmail" ? status.gmail : status.calendar;
        return (
          <div
            key={toolkit}
            className="flex flex-col gap-3 rounded-xl border border-zinc-950/10 p-4 dark:border-white/10"
          >
            <div className="flex items-center gap-2.5">
              <span
                className="flex size-8 items-center justify-center rounded-lg border border-zinc-950/10 text-indigo-500 dark:border-white/10 dark:text-indigo-400"
                aria-hidden="true"
              >
                <Icon name={icon} className="size-4" />
              </span>
              <span className="text-sm font-semibold text-zinc-950 dark:text-white">
                {provider.name}
              </span>
              <span className="ml-auto">
                <Badge color={connected ? "lime" : "zinc"}>
                  {connected ? t.connected : t.disconnected}
                </Badge>
              </span>
            </div>

            <Text>{provider.description}</Text>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
                {t.capabilitiesLabel}
              </span>
              <ul className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
                {provider.capabilities.map((cap) => (
                  <li key={cap} className="flex gap-1.5">
                    <span className="text-zinc-400 dark:text-zinc-600" aria-hidden="true">
                      •
                    </span>
                    {cap}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-1 flex flex-col gap-2">
              {connected ? (
                <Text className="text-xs">{t.testInChat}</Text>
              ) : (
                <Button
                  color="indigo"
                  disabled={connecting === toolkit}
                  onClick={() => connect(toolkit)}
                >
                  {connecting === toolkit ? t.connecting : `${t.connect} ${provider.name}`}
                </Button>
              )}
              {note?.toolkit === toolkit ? (
                <Text>
                  <Badge color="red">{note.msg}</Badge>
                </Text>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
