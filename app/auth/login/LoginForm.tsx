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

  const FIELD_INPUT =
    "block w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-400/50 focus:outline-none";
  const FIELD_LABEL = "text-xs font-medium text-slate-400";
  const BTN_PRIMARY =
    "flex w-full items-center justify-center rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-950/40 transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className={FIELD_LABEL}>{t.emailLabel}</span>
        <input
          className={FIELD_INPUT}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={FIELD_LABEL}>{t.passwordLabel}</span>
        <input
          className={FIELD_INPUT}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
      </label>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      <button type="submit" disabled={busy} className={BTN_PRIMARY}>
        {busy ? t.submitBusy : t.submit}
      </button>
    </form>
  );
}
