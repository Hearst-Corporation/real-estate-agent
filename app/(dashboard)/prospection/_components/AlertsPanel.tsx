"use client";

import { useState } from "react";
import { BellAlertIcon, CheckCircleIcon, EyeIcon } from "@heroicons/react/24/outline";
import { UI } from "@/lib/ui-strings";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Subheading } from "@/components/ui/heading";
import { Text, Strong } from "@/components/ui/text";
import { ALERT_GUARDRAILS } from "@/lib/prospection/alert-preview";
import type { Critere, AlerteFrequence } from "./types";

const t = UI.prospection;
const FREQUENCES: AlerteFrequence[] = ["immediate", "quotidien", "hebdo", "off"];

function freqOptLabel(f: AlerteFrequence): string {
  return f === "immediate" ? t.freqImmediate : f === "quotidien" ? t.freqQuotidien : f === "hebdo" ? t.freqHebdo : t.freqOff;
}

/** Sélecteur de fréquence LIVE pour un profil (persiste via PATCH). */
function FrequencyRow({ critere, onChanged }: { critere: Critere; onChanged: () => void | Promise<void> }) { // strings-lint-allow
  const [freq, setFreq] = useState<AlerteFrequence>(critere.alerte_frequence ?? "off");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function update(next: AlerteFrequence) {
    const prev = freq;
    setFreq(next);
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/prospection/criteres", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: critere.id, alerte_frequence: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFreq(prev);
        setError(json.detail ?? json.error ?? t.alertsSaveError);
        return;
      }
      setSaved(true);
      await onChanged();
    } catch {
      setFreq(prev);
      setError(t.alertsSaveError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <Text className="truncate">{critere.nom}</Text>
        {saved && !error && (
          <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-accent-600 dark:text-accent-400">
            <CheckCircleIcon aria-hidden="true" className="size-3.5" />
            {t.alertsSaved}
          </span>
        )}
        {error && <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">{error}</span>}
      </div>
      <div className="w-44 shrink-0">
        <label className="sr-only" htmlFor={`freq-${critere.id}`}>
          {t.alertsFrequencyFor(critere.nom)}
        </label>
        <Select
          id={`freq-${critere.id}`}
          value={freq}
          disabled={saving}
          onChange={(e) => update(e.target.value as AlerteFrequence)}
          aria-label={t.alertsFrequencyFor(critere.nom)}
        >
          {FREQUENCES.map((f) => (
            <option key={f} value={f}>
              {freqOptLabel(f)}
            </option>
          ))}
        </Select>
      </div>
    </li>
  );
}

/**
 * Préférences d'alertes. La FRÉQUENCE est persistée en LIVE (alerte_frequence,
 * 0043). L'ENVOI n'est PAS branché → badge honnête « Aperçu — envoi non branché »,
 * garde-fous affichés comme réglages à venir. On ne simule aucun envoi.
 */
export function AlertsPanel({ criteres, onChanged }: { criteres: Critere[]; onChanged: () => void | Promise<void> }) { // strings-lint-allow
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Subheading>{t.alertsTitle}</Subheading>
          <Text className="mt-1 max-w-xl">{t.alertsHint}</Text>
        </div>
        <Badge color="amber">
          <EyeIcon aria-hidden="true" className="size-3.5" />
          {t.alertsPreviewBadge}
        </Badge>
      </div>

      {/* Bandeau d'honnêteté : rien n'est envoyé depuis cet écran. */}
      <div className="surface flex items-start gap-3 p-4">
        <BellAlertIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-zinc-400 dark:text-zinc-500" />
        <Text>{t.alertsPreviewExplain}</Text>
      </div>

      {/* Fréquence par profil (LIVE) */}
      {criteres.length > 0 && (
        <div className="surface p-5">
          <ul className="divide-y divide-zinc-950/5 dark:divide-white/5">
            {criteres.map((c) => (
              <FrequencyRow key={c.id} critere={c} onChanged={onChanged} />
            ))}
          </ul>
        </div>
      )}

      {/* Garde-fous d'envoi (aperçu) */}
      <div className="surface p-5">
        <Strong>{t.alertsGuardrailsTitle}</Strong>
        <ul className="mt-3 flex flex-col gap-2">
          <GuardItem label={t.alertsGuardHumanConfirm} />
          <GuardItem label={t.alertsGuardCooldown(ALERT_GUARDRAILS.cooldownHours)} />
          <GuardItem label={t.alertsGuardCap(ALERT_GUARDRAILS.whatsappCapPerDay)} />
          <GuardItem label={t.alertsGuardOptOut} />
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <Badge color="zinc">{t.alertsChannelEmail}</Badge>
          <Badge color="zinc">{t.alertsChannelWhatsapp}</Badge>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">{t.alertsChannelHint}</span>
        </div>
      </div>
    </div>
  );
}

function GuardItem({ label }: { label: string }) {
  return (
    <li className="flex items-center gap-2.5 text-sm text-zinc-700 dark:text-zinc-300">
      <span className="size-1.5 shrink-0 rounded-full bg-accent-500" aria-hidden="true" />
      {label}
    </li>
  );
}
