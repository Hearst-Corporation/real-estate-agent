"use client";

import { useEffect, useState } from "react";

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
      setErrorMsg("Impossible de contacter le serveur. Réessayez.");
    } finally {
      setConnecting(null);
    }
  }

  if (loading) {
    return <p style={{ fontSize: 13, opacity: 0.6 }}>Chargement…</p>;
  }

  if (!status?.configured) {
    return (
      <p style={{ fontSize: 13, opacity: 0.6 }}>
        Intégration non configurée (clé API Composio manquante).
      </p>
    );
  }

  return (
    <div className="ct-stack-sm">
      {/* Gmail */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {status.gmail ? (
          <span style={{ fontSize: 13, fontWeight: 600 }}>
            Gmail ✓ connecté
          </span>
        ) : (
          <button
            type="button"
            className="ct-logout-full"
            disabled={connecting === "gmail"}
            onClick={() => connect("gmail")}
          >
            {connecting === "gmail" ? "Connexion…" : "Connecter Gmail"}
          </button>
        )}
      </div>

      {/* Google Calendar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {status.calendar ? (
          <span style={{ fontSize: 13, fontWeight: 600 }}>
            Agenda Google ✓ connecté
          </span>
        ) : (
          <button
            type="button"
            className="ct-logout-full"
            disabled={connecting === "googlecalendar"}
            onClick={() => connect("googlecalendar")}
          >
            {connecting === "googlecalendar" ? "Connexion…" : "Connecter l'agenda Google"}
          </button>
        )}
      </div>

      {errorMsg ? (
        <p style={{ fontSize: 12, color: "var(--ct-text-danger)" }}>
          {errorMsg}
        </p>
      ) : null}
    </div>
  );
}
