"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "Email ou mot de passe incorrect.",
  invalid_body: "Formulaire invalide.",
  supabase_not_configured: "Backend indisponible. Réessaie dans 1 min.",
  jwt_not_configured: "Backend mal configuré (JWT).",
  rate_limited: "Trop de tentatives. Réessaie dans 1 min.",
};

export default function LoginForm() {
  const next = useSearchParams().get("next") ?? "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
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
        setError(ERROR_MESSAGES[body.error] ?? "Erreur de connexion.");
        return;
      }
      const data = await res.json();
      window.location.href = data.redirect ?? "/"; // top-level nav pour que le cookie suive
    } catch {
      setError("Erreur réseau.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <label className="ct-field">
        <span className="ct-field-label">Email</span>
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
        <span className="ct-field-label">Mot de passe</span>
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
      <button type="submit" disabled={busy} className="ct-seg-btn primary" style={{ marginTop: "4px", padding: "11px 16px" }}>
        {busy ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}
