"use client";

import { useEffect, useState } from "react";
import { UI } from "@/lib/ui-strings";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StatusResponse {
  gmail: boolean;
  calendar: boolean;
  configured: boolean;
}

// ─── Composant ────────────────────────────────────────────────────────────────

export function GmailConnectButton() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<"gmail" | "googlecalendar" | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/integrations/composio/status")
      .then((r) => r.json() as Promise<StatusResponse>)
      .then((data) => {
        if (!cancelled) {
          setStatus(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus({ gmail: false, calendar: false, configured: false });
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function connect(toolkit: "gmail" | "googlecalendar") {
    setConnecting(toolkit);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/integrations/composio/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolkit }),
      });
      const data = (await res.json()) as { redirectUrl?: string; error?: string };
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else {
        setErrorMsg(
          data.error === "auth_config_manquant"
            ? "Intégration non configurée côté serveur."
            : `Erreur : ${data.error ?? "inconnue"}`,
        );
      }
    } catch {
      setErrorMsg(UI.profile.integrations.serverError);
    } finally {
      setConnecting(null);
    }
  }

  if (loading) {
    return <p className="ct-subtext">{UI.common.loading}</p>;
  }

  if (!status?.configured) {
    return (
      <p className="ct-muted-text">{UI.profile.integrations.notConfigured}</p>
    );
  }

  return (
    <div className="ct-stack-sm">
      {/* Gmail */}
      <div className="ct-row-sm">
        {status.gmail ? (
          <span className="ct-status-text">{UI.profile.integrations.gmailConnected}</span>
        ) : (
          <button
            type="button"
            className="ct-logout-full"
            disabled={connecting === "gmail"}
            onClick={() => connect("gmail")}
          >
            {connecting === "gmail" ? UI.profile.integrations.connectGmailBusy : UI.profile.integrations.connectGmail}
          </button>
        )}
      </div>

      <div className="ct-row-sm">
        {status.calendar ? (
          <span className="ct-status-text">{UI.profile.integrations.calendarConnected}</span>
        ) : (
          <button
            type="button"
            className="ct-logout-full"
            disabled={connecting === "googlecalendar"}
            onClick={() => connect("googlecalendar")}
          >
            {connecting === "googlecalendar" ? UI.profile.integrations.connectCalendarBusy : UI.profile.integrations.connectCalendar}
          </button>
        )}
      </div>

      {errorMsg ? <p className="ct-error-danger">{errorMsg}</p> : null}
    </div>
  );
}
