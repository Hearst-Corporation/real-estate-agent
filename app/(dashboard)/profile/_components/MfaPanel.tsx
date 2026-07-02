"use client";

import { useEffect, useState } from "react";
import { Card, Badge } from "@/components/cockpit/primitives";
import { Field, TextInput } from "@/components/cockpit/form";
import { UI } from "@/lib/ui-strings";

/** Durée d'affichage du feedback "Copié !" (ms). */
const COPY_FEEDBACK_DURATION_MS = 2500;

type Phase =
  | "loading"
  | "unavailable"
  | "disabled"
  | "setup"        // POST setup ok, affiche secret + uri
  | "enabling"     // POST enable en cours
  | "backup"       // POST enable ok, affiche backup codes
  | "enabled"
  | "disabling";

type SetupData = { otpauthUrl: string; secret: string };

/** Formate un secret TOTP en groupes de 4 pour lisibilité. */
function formatSecret(s: string): string {
  return s.replace(/(.{4})/g, "$1 ").trim();
}

export function MfaPanel() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [setup, setSetup] = useState<SetupData | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // Chargement de l'état MFA au montage.
  useEffect(() => {
    let alive = true;
    fetch("/api/auth/mfa/status")
      .then((r) => {
        if (r.status === 503) {
          if (alive) setPhase("unavailable");
          return null;
        }
        if (!r.ok) throw new Error("status");
        return r.json() as Promise<{ enabled: boolean }>;
      })
      .then((data) => {
        if (!alive || data === null) return;
        setPhase(data.enabled ? "enabled" : "disabled");
      })
      .catch(() => {
        if (alive) setPhase("unavailable");
      });
    return () => { alive = false; };
  }, []);

  async function startSetup() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/mfa/setup", { method: "POST" });
      if (res.status === 503) { setPhase("unavailable"); return; }
      if (!res.ok) throw new Error("setup");
      const data = (await res.json()) as SetupData;
      setSetup(data);
      setCode("");
      setPhase("setup");
    } catch {
      setError("Impossible de démarrer la configuration. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnable() {
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    setPhase("enabling");
    try {
      const res = await fetch("/api/auth/mfa/enable", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      if (res.status === 503) { setPhase("unavailable"); return; }
      if (res.status === 400) {
        setError("Code invalide. Vérifiez l'heure de votre appareil et réessayez.");
        setPhase("setup");
        return;
      }
      if (!res.ok) throw new Error("enable");
      const data = (await res.json()) as { enabled: true; backupCodes: string[] };
      setBackupCodes(data.backupCodes ?? []);
      setCode("");
      setPhase("backup");
    } catch {
      setError("Erreur lors de l'activation. Réessayez.");
      setPhase("setup");
    } finally {
      setBusy(false);
    }
  }

  async function disableMfa() {
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    setPhase("disabling");
    try {
      const res = await fetch("/api/auth/mfa/disable", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      if (res.status === 503) { setPhase("unavailable"); return; }
      if (res.status === 400) {
        setError("Code invalide. Réessayez.");
        setPhase("enabled");
        return;
      }
      if (!res.ok) throw new Error("disable");
      setCode("");
      setPhase("disabled");
    } catch {
      setError("Erreur lors de la désactivation. Réessayez.");
      setPhase("enabled");
    } finally {
      setBusy(false);
    }
  }

  async function copyBackupCodes() {
    try {
      await navigator.clipboard.writeText(backupCodes.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_FEEDBACK_DURATION_MS);
    } catch {
      // Silencieux si le presse-papiers est bloqué.
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const BTN_PRIMARY =
    "inline-flex items-center justify-center rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50";
  const BTN_GHOST =
    "inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50";
  const FIELD_LABEL = "text-xs font-medium text-slate-400";

  if (phase === "loading") {
    return (
      <Card title={UI.profile.mfa.title} titleAs="section">
        <p className="text-sm text-slate-400">Chargement…</p>
      </Card>
    );
  }

  if (phase === "unavailable") {
    return (
      <Card title={UI.profile.mfa.title} titleAs="section">
        <p className="text-sm text-slate-400">
          2FA bientôt disponible (migration en attente).
        </p>
      </Card>
    );
  }

  // ── État : désactivé ─────────────────────────────────────────────────────
  if (phase === "disabled") {
    return (
      <Card title={UI.profile.mfa.title} titleAs="section">
        <p className="mb-3 text-sm text-slate-400">
          Protégez votre compte avec un code temporaire (TOTP) en plus de votre mot de passe.
        </p>
        {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
        <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={startSetup}>
          {busy ? "Chargement…" : "Activer la double authentification"}
        </button>
      </Card>
    );
  }

  // ── État : setup — affiche secret + URI ──────────────────────────────────
  if (phase === "setup" || phase === "enabling") {
    return (
      <Card title={UI.profile.mfa.title} titleAs="section">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-300">
            <strong className="font-semibold text-slate-100">{UI.profile.mfa.step1}</strong> Dans Google Authenticator, Authy ou une app TOTP, sélectionnez
            «&nbsp;Ajouter un compte manuellement&nbsp;» et saisissez la clé ci-dessous.
          </p>

          <div className="flex flex-col gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] p-3">
            <span className={FIELD_LABEL}>{UI.profile.mfa.secretLabel}</span>
            <code className="break-all font-mono text-sm text-slate-100">
              {setup ? formatSecret(setup.secret) : "—"}
            </code>
          </div>

          {setup?.otpauthUrl && (
            <div className="flex flex-col gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] p-3">
              <span className={FIELD_LABEL}>{UI.profile.mfa.uriLabel}</span>
              <code className="break-all font-mono text-xs text-slate-300">{setup.otpauthUrl}</code>
              <span className="text-xs text-slate-500">
                Note : le QR code sera disponible dans une prochaine mise à jour.
              </span>
            </div>
          )}

          <p className="text-sm text-slate-300">
            <strong className="font-semibold text-slate-100">{UI.profile.mfa.step2}</strong> Saisissez le code à 6 chiffres généré par l’application.
          </p>

          <Field label={UI.profile.mfa.codeLabel} htmlFor="mfa-setup-code">
            <TextInput
              id="mfa-setup-code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              autoComplete="one-time-code"
            />
          </Field>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex gap-2">
            <button type="button" className={BTN_PRIMARY} disabled={busy || code.length < 6} onClick={confirmEnable}>
              {busy ? "Vérification…" : "Valider et activer"}
            </button>
            <button
              type="button"
              className={BTN_GHOST}
              disabled={busy}
              onClick={() => { setPhase("disabled"); setError(null); setCode(""); }}
            >
              Annuler
            </button>
          </div>
        </div>
      </Card>
    );
  }

  // ── État : backup codes (juste après activation) ─────────────────────────
  if (phase === "backup") {
    return (
      <Card title={UI.profile.mfa.titleEnabled} titleAs="section">
        <div className="flex flex-col gap-4">
          <div>
            <Badge>{UI.profile.mfa.badge}</Badge>
          </div>

          <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3">
            <strong className="text-sm font-semibold text-amber-300">{UI.profile.mfa.backupWarning}</strong>
            <p className="mt-1 text-sm text-amber-100/80">
              Ces codes permettent d&apos;accéder à votre compte si vous perdez accès à
              votre application d&apos;authentification. Ils ne seront affichés qu&apos;une seule fois.
            </p>
          </div>

          <ul className="grid grid-cols-2 gap-2 rounded-lg border border-white/10 bg-white/[0.04] p-3 @sm:grid-cols-3">
            {backupCodes.map((c) => (
              <li key={c}>
                <code className="font-mono text-sm text-slate-100">{c}</code>
              </li>
            ))}
          </ul>

          <div className="flex gap-2">
            <button type="button" className={BTN_GHOST} onClick={copyBackupCodes}>
              {copied ? "Copié !" : "Copier les codes"}
            </button>
            <button type="button" className={BTN_PRIMARY} onClick={() => setPhase("enabled")}>
              J&apos;ai noté mes codes
            </button>
          </div>
        </div>
      </Card>
    );
  }

  // ── État : activé ────────────────────────────────────────────────────────
  if (phase === "enabled" || phase === "disabling") {
    return (
      <Card title={UI.profile.mfa.title} titleAs="section">
        <div className="flex flex-col gap-4">
          <div>
            <Badge>{UI.profile.mfa.badge}</Badge>
          </div>
          <p className="text-sm text-slate-400">
            Votre compte est protégé par un second facteur.
            Pour désactiver, saisissez un code de votre application d&apos;authentification.
          </p>

          <Field label={UI.profile.mfa.codeLabel} htmlFor="mfa-disable-code">
            <TextInput
              id="mfa-disable-code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6,}"
              maxLength={20}
              placeholder={UI.profile.mfa.codePlaceholderDisable}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\s/g, ""))}
              autoComplete="one-time-code"
            />
          </Field>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button type="button" className={BTN_GHOST} disabled={busy || code.length < 6} onClick={disableMfa}>
            {busy ? "Désactivation…" : "Désactiver la 2FA"}
          </button>
        </div>
      </Card>
    );
  }

  return null;
}
