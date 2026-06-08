"use client";

/**
 * ClosingLauncher — bouton « Lancer le closing » (back-office opérateur).
 *
 * Déclenche POST /api/invest/deals/{id}/close (gardé 4-eyes + conditions
 * suspensives côté serveur). Désactivé tant que la garde n'est pas satisfaite.
 * Affiche l'issue (async 202 / sync ClosingResult / 422 garde non remplie).
 *
 * DvP : release des fonds en DERNIER ; en cas d'échec avant release, la plateforme
 * rembourse intégralement (séquestre tiers). Le DEEP reste la source de vérité.
 */

import { useState } from "react";

type CloseResponse = {
  mode?: string;
  accepted?: boolean;
  result?: { outcome?: string; compensated?: boolean };
  error?: string;
  unmet?: string[];
  detail?: string;
};

export function ClosingLauncher({ dealId, ready }: { dealId: string; ready: boolean }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [tone, setTone] = useState<"ok" | "warn" | "err">("ok");

  async function launch() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/invest/deals/${dealId}/close`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as CloseResponse;
      if (res.status === 202) {
        setTone("ok");
        setMsg("Closing accepté — traitement asynchrone en cours (saga DvP).");
      } else if (res.ok) {
        const outcome = body.result?.outcome ?? "?";
        setTone(outcome === "compensated" || outcome === "paused" ? "warn" : "ok");
        setMsg(`Saga terminée — issue : ${outcome}${body.result?.compensated ? " (remboursement appliqué)" : ""}.`);
      } else if (res.status === 422) {
        setTone("warn");
        setMsg(
          body.error === "four_eyes_required"
            ? "Double validation (operator + compliance) requise avant le closing."
            : `Conditions suspensives non remplies : ${(body.unmet ?? []).join(", ") || body.detail || "—"}.`,
        );
      } else {
        setTone("err");
        setMsg(body.detail || body.error || "Échec du closing.");
      }
    } catch (e) {
      setTone("err");
      setMsg(e instanceof Error ? e.message : "Erreur réseau.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inv-stack-2xs">
      <button
        type="button"
        onClick={launch}
        disabled={!ready || busy}
        className={`inv-btn-reserve inv-btn-self-start${!ready || busy ? " is-disabled" : ""}`}
      >
        {busy ? "Closing en cours…" : "Lancer le closing"}
      </button>
      {!ready ? (
        <span className="inv-chart-foot">
          La double validation 4-eyes et toutes les conditions suspensives doivent être réunies.
        </span>
      ) : null}
      {msg ? (
        <span
          className={`inv-chart-foot${tone === "err" ? " inv-msg-err" : tone === "warn" ? " inv-msg-warn" : ""}`}
        >
          {msg}
        </span>
      ) : null}
    </div>
  );
}
