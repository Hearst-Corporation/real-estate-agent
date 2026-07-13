"use client";

import { useEffect, useState } from "react";
import { UI } from "@/lib/ui-strings";
import { Subheading } from "@/components/ui/heading";
import { Text, Strong, Code } from "@/components/ui/text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Label } from "@/components/ui/fieldset";
import { Input } from "@/components/ui/input";

/** Durée d'affichage du feedback "Copié !" (ms). */
const COPY_FEEDBACK_DURATION_MS = 2500;

type Phase =
  | "loading"
  | "unavailable"
  | "disabled"
  | "setup" // POST setup ok, affiche secret + uri
  | "enabling" // POST enable en cours
  | "backup" // POST enable ok, affiche backup codes
  | "enabled"
  | "disabling";

type SetupData = { otpauthUrl: string; secret: string };

/** Formate un secret TOTP en groupes de 4 pour lisibilité. */
function formatSecret(s: string): string {
  return s.replace(/(.{4})/g, "$1 ").trim();
}

/** Conteneur de section MFA (remplace la Card Cockpit maison). */
function MfaSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="surface p-5">
      <Subheading level={2} className="font-titre">
        {title}
      </Subheading>
      <div className="mt-3">{children}</div>
    </section>
  );
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
    return () => {
      alive = false;
    };
  }, []);

  async function startSetup() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/mfa/setup", { method: "POST" });
      if (res.status === 503) {
        setPhase("unavailable");
        return;
      }
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
      if (res.status === 503) {
        setPhase("unavailable");
        return;
      }
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
      if (res.status === 503) {
        setPhase("unavailable");
        return;
      }
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

  const errorNode = error ? (
    <Text>
      <Badge color="red">{error}</Badge>
    </Text>
  ) : null;

  if (phase === "loading") {
    return (
      <MfaSection title={UI.profile.mfa.title}>
        <Text>Chargement…</Text>
      </MfaSection>
    );
  }

  if (phase === "unavailable") {
    return (
      <MfaSection title={UI.profile.mfa.title}>
        <Text>2FA bientôt disponible (migration en attente).</Text>
      </MfaSection>
    );
  }

  // ── État : désactivé ─────────────────────────────────────────────────────
  if (phase === "disabled") {
    return (
      <MfaSection title={UI.profile.mfa.title}>
        <div className="flex flex-col gap-3">
          <Text>
            Protégez votre compte avec un code temporaire (TOTP) en plus de votre mot de passe.
          </Text>
          {errorNode}
          <div>
            <Button color="indigo" disabled={busy} onClick={startSetup}>
              {busy ? "Chargement…" : "Activer la double authentification"}
            </Button>
          </div>
        </div>
      </MfaSection>
    );
  }

  // ── État : setup — affiche secret + URI ──────────────────────────────────
  if (phase === "setup" || phase === "enabling") {
    return (
      <MfaSection title={UI.profile.mfa.title}>
        <div className="flex flex-col gap-4">
          <Text>
            <Strong>{UI.profile.mfa.step1}</Strong> Dans Google Authenticator, Authy ou une app
            TOTP, sélectionnez «&nbsp;Ajouter un compte manuellement&nbsp;» et saisissez la clé
            ci-dessous.
          </Text>

          <div className="flex flex-col gap-1.5 rounded-lg border border-zinc-950/10 p-3 dark:border-white/10">
            <Text className="text-xs">{UI.profile.mfa.secretLabel}</Text>
            <Code className="break-all">{setup ? formatSecret(setup.secret) : "—"}</Code>
          </div>

          {setup?.otpauthUrl && (
            <div className="flex flex-col gap-1.5 rounded-lg border border-zinc-950/10 p-3 dark:border-white/10">
              <Text className="text-xs">{UI.profile.mfa.uriLabel}</Text>
              <Code className="break-all text-xs">{setup.otpauthUrl}</Code>
              <Text className="text-xs">
                Note : le QR code sera disponible dans une prochaine mise à jour.
              </Text>
            </div>
          )}

          <Text>
            <Strong>{UI.profile.mfa.step2}</Strong> Saisissez le code à 6 chiffres généré par
            l’application.
          </Text>

          <Field>
            <Label>{UI.profile.mfa.codeLabel}</Label>
            <Input
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

          {errorNode}

          <div className="flex gap-2">
            <Button color="indigo" disabled={busy || code.length < 6} onClick={confirmEnable}>
              {busy ? "Vérification…" : "Valider et activer"}
            </Button>
            <Button
              outline
              disabled={busy}
              onClick={() => {
                setPhase("disabled");
                setError(null);
                setCode("");
              }}
            >
              Annuler
            </Button>
          </div>
        </div>
      </MfaSection>
    );
  }

  // ── État : backup codes (juste après activation) ─────────────────────────
  if (phase === "backup") {
    return (
      <MfaSection title={UI.profile.mfa.titleEnabled}>
        <div className="flex flex-col gap-4">
          <div>
            <Badge color="lime">{UI.profile.mfa.badge}</Badge>
          </div>

          <div className="rounded-lg border border-zinc-950/10 p-3 dark:border-white/10">
            <div className="mb-1">
              <Badge color="amber">{UI.profile.mfa.backupWarning}</Badge>
            </div>
            <Text>
              Ces codes permettent d&apos;accéder à votre compte si vous perdez accès à votre
              application d&apos;authentification. Ils ne seront affichés qu&apos;une seule fois.
            </Text>
          </div>

          <ul className="grid grid-cols-2 gap-2 rounded-lg border border-zinc-950/10 p-3 @sm:grid-cols-3 dark:border-white/10">
            {backupCodes.map((c) => (
              <li key={c}>
                <Code>{c}</Code>
              </li>
            ))}
          </ul>

          <div className="flex gap-2">
            <Button outline onClick={copyBackupCodes}>
              {copied ? "Copié !" : "Copier les codes"}
            </Button>
            <Button color="indigo" onClick={() => setPhase("enabled")}>
              J&apos;ai noté mes codes
            </Button>
          </div>
        </div>
      </MfaSection>
    );
  }

  // ── État : activé ────────────────────────────────────────────────────────
  if (phase === "enabled" || phase === "disabling") {
    return (
      <MfaSection title={UI.profile.mfa.title}>
        <div className="flex flex-col gap-4">
          <div>
            <Badge color="lime">{UI.profile.mfa.badge}</Badge>
          </div>
          <Text>
            Votre compte est protégé par un second facteur. Pour désactiver, saisissez un code de
            votre application d&apos;authentification.
          </Text>

          <Field>
            <Label>{UI.profile.mfa.codeLabel}</Label>
            <Input
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

          {errorNode}

          <div>
            <Button outline disabled={busy || code.length < 6} onClick={disableMfa}>
              {busy ? "Désactivation…" : "Désactiver la 2FA"}
            </Button>
          </div>
        </div>
      </MfaSection>
    );
  }

  return null;
}
