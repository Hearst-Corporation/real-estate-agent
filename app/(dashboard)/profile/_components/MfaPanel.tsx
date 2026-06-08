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

  if (phase === "loading") {
    return (
      <Card title={UI.profile.mfa.title} titleAs="section">
        <p className="ct-placeholder">Chargement…</p>
      </Card>
    );
  }

  if (phase === "unavailable") {
    return (
      <Card title={UI.profile.mfa.title} titleAs="section">
        <p className="ct-placeholder">
          2FA bientôt disponible (migration en attente).
        </p>
      </Card>
    );
  }

  // ── État : désactivé ─────────────────────────────────────────────────────
  if (phase === "disabled") {
    return (
      <Card title={UI.profile.mfa.title} titleAs="section">
        <p className="ct-mb-sm">
          Protégez votre compte avec un code temporaire (TOTP) en plus de votre mot de passe.
        </p>
        {error && <p className="ct-error">{error}</p>}
        <button
          type="button"
          className="ct-seg-btn primary"
          disabled={busy}
          onClick={startSetup}
        >
          {busy ? "Chargement…" : "Activer la double authentification"}
        </button>
      </Card>
    );
  }

  // ── État : setup — affiche secret + URI ──────────────────────────────────
  if (phase === "setup" || phase === "enabling") {
    return (
      <Card title={UI.profile.mfa.title} titleAs="section">
        <div className="ct-stack-sm">
          <p className="ct-mb-sm">
            <strong>{UI.profile.mfa.step1}</strong> Dans Google Authenticator, Authy ou une app TOTP, sélectionnez
            «&nbsp;Ajouter un compte manuellement&nbsp;» et saisissez la clé ci-dessous.
          </p>

          <div className="mfa-secret-block">
            <span className="ct-field-label">{UI.profile.mfa.secretLabel}</span>
            <code className="mfa-secret-code">
              {setup ? formatSecret(setup.secret) : "—"}
            </code>
          </div>

          {setup?.otpauthUrl && (
            <div className="mfa-uri-block">
              <span className="ct-field-label">{UI.profile.mfa.uriLabel}</span>
              <code className="mfa-uri-code">{setup.otpauthUrl}</code>
              <span className="ct-subtext">
                Note : le QR code sera disponible dans une prochaine mise à jour.
              </span>
            </div>
          )}

          <p className="ct-mb-sm">
            <strong>{UI.profile.mfa.step2}</strong> Saisissez le code à 6 chiffres généré par l’application.
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

          {error && <p className="ct-error">{error}</p>}

          <div style={{ display: "flex", gap: "var(--ct-space-sm)" }}>
            <button
              type="button"
              className="ct-seg-btn primary"
              disabled={busy || code.length < 6}
              onClick={confirmEnable}
            >
              {busy ? "Vérification…" : "Valider et activer"}
            </button>
            <button
              type="button"
              className="ct-seg-btn"
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
        <div className="ct-stack-sm">
          <div className="mfa-success-badge">
            <Badge>{UI.profile.mfa.badge}</Badge>
          </div>

          <div className="mfa-backup-warning">
            <strong>{UI.profile.mfa.backupWarning}</strong>
            <p>
              Ces codes permettent d&apos;accéder à votre compte si vous perdez accès à
              votre application d&apos;authentification. Ils ne seront affichés qu&apos;une seule fois.
            </p>
          </div>

          <ul className="mfa-backup-list">
            {backupCodes.map((c) => (
              <li key={c}><code>{c}</code></li>
            ))}
          </ul>

          <button
            type="button"
            className="ct-seg-btn"
            onClick={copyBackupCodes}
          >
            {copied ? "Copié !" : "Copier les codes"}
          </button>

          <button
            type="button"
            className="ct-seg-btn primary"
            onClick={() => setPhase("enabled")}
          >
            J&apos;ai noté mes codes
          </button>
        </div>
      </Card>
    );
  }

  // ── État : activé ────────────────────────────────────────────────────────
  if (phase === "enabled" || phase === "disabling") {
    return (
      <Card title={UI.profile.mfa.title} titleAs="section">
        <div className="ct-stack-sm">
          <div className="mfa-success-badge">
            <Badge>{UI.profile.mfa.badge}</Badge>
          </div>
          <p className="ct-mb-sm">
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

          {error && <p className="ct-error">{error}</p>}

          <button
            type="button"
            className="ct-seg-btn"
            disabled={busy || code.length < 6}
            onClick={disableMfa}
          >
            {busy ? "Désactivation…" : "Désactiver la 2FA"}
          </button>
        </div>
      </Card>
    );
  }

  return null;
}
