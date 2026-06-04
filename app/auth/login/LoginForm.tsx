"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { UI } from "@/lib/ui-strings";

export default function LoginForm() {
  const t = UI.login;
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
        setError(t.errors[body.error] ?? t.errors.generic);
        return;
      }
      const data = await res.json();
      window.location.href = data.redirect ?? "/"; // top-level nav pour que le cookie suive
    } catch {
      setError(t.errors.network);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="ct-form">
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
