"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { UI } from "@/lib/ui-strings";

type LoginStep = "credentials" | "mfa";

export default function LoginForm() {
  const t = UI.login;
  const next = useSearchParams().get("next") ?? "/";

  // Étape credentials
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Étape MFA
  const [mfaCode, setMfaCode] = useState("");

  const [step, setStep] = useState<LoginStep>("credentials");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Étape 1 : POST /api/auth/login ────────────────────────────────────────
  async function submitCredentials(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(t.errors[body.error] ?? t.errors.generic);
        return;
      }
      const data = await res.json();
      if (data.mfa_required) {
        // 2FA active : bascule sur l'écran de code.
        setMfaCode("");
        setStep("mfa");
        return;
      }
      // Pas de 2FA — comportement original inchangé.
      window.location.href = data.redirect ?? "/";
    } catch {
      setError(t.errors.network);
    } finally {
      setBusy(false);
    }
  }

  // ── Étape 2 : POST /api/auth/mfa/verify-login ────────────────────────────
  async function submitMfaCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/mfa/verify-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: mfaCode.trim() }),
      });
      if (res.status === 401) {
        setError("Code invalide. Vérifiez l'heure de votre appareil ou utilisez un code de secours.");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(t.errors[body.error] ?? t.errors.generic);
        return;
      }
      const data = await res.json();
      window.location.href = data.redirect ?? "/";
    } catch {
      setError(t.errors.network);
    } finally {
      setBusy(false);
    }
  }

  // ── Rendu : écran MFA ─────────────────────────────────────────────────────
  if (step === "mfa") {
    return (
      <form onSubmit={submitMfaCode} className="ct-form">
        <p className="ct-mb-sm" style={{ textAlign: "center" }}>
          Code de double authentification
        </p>
        <p className="ct-subtext" style={{ textAlign: "center", marginBottom: "var(--ct-space-md, 1rem)" }}>
          Saisissez le code à 6 chiffres de votre application, ou un code de secours.
        </p>
        <label className="ct-field">
          <span className="ct-field-label">Code 2FA / code de secours</span>
          <input
            className="ct-field-input"
            type="text"
            inputMode="numeric"
            maxLength={20}
            placeholder="123456"
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value.replace(/\s/g, ""))}
            autoComplete="one-time-code"
            autoFocus
            required
          />
        </label>
        {error ? <p className="ct-error">{error}</p> : null}
        <button
          type="submit"
          disabled={busy || mfaCode.length < 6}
          className="ct-seg-btn primary ct-btn-block"
        >
          {busy ? "Vérification…" : "Vérifier"}
        </button>
        <button
          type="button"
          className="ct-seg-btn ct-btn-block"
          disabled={busy}
          onClick={() => { setStep("credentials"); setError(null); setMfaCode(""); }}
          style={{ marginTop: "var(--ct-space-xs, 0.5rem)" }}
        >
          ← Retour
        </button>
      </form>
    );
  }

  // ── Rendu : écran credentials (original, inchangé) ───────────────────────
  return (
    <form onSubmit={submitCredentials} className="ct-form">
      <label className="ct-field">
        <span className="ct-field-label">{t.emailLabel}</span>
        <input
          className="ct-field-input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
      </label>
      <label className="ct-field">
        <span className="ct-field-label">{t.passwordLabel}</span>
        <input
          className="ct-field-input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
      </label>
      {error ? <p className="ct-error">{error}</p> : null}
      <button type="submit" disabled={busy} className="ct-seg-btn primary ct-btn-block">
        {busy ? t.submitBusy : t.submit}
      </button>
    </form>
  );
}
