import { getAvailability } from "@/lib/aigent/client";
import type { AigentPlannedCapabilityId } from "@/lib/aigent/types";
import { UI } from "@/lib/ui-strings";
import { Icon, type IconName } from "@/components/cockpit/Icon";
import { Text } from "@/components/ui/text";
import { Badge } from "@/components/ui/badge";

/**
 * Panneau de la frontière consommateur Aigent — état RÉEL, jamais de faux agent.
 * =================================================================
 *
 * Server component : lit `getAvailability()` (server-only, feature-detection).
 * Tant qu'Aigent n'est pas raccordé (aucune config `AIGENT_*`), affiche un état
 * honnête « Aigent non connecté — capacités en spécification » et présente les
 * capacités PRÉVUES en état désactivé (aria-disabled), avec les frontières dures
 * du consommateur. Aucun agent, run, score ou résultat n'est fabriqué.
 *
 * Contraintes DS : ce fichier n'est PAS exempté de `check:catalyst` → seules les
 * classes `zinc`/`accent` sont utilisées ; les couleurs de statut passent par le
 * primitive Catalyst `<Badge color>`.
 */

const t = UI.aigent;

/** Capacités prévues, dans l'ordre du cycle de vie consommateur. */
const PLANNED: { id: AigentPlannedCapabilityId; icon: IconName }[] = [
  { id: "list_agents", icon: "leads" },
  { id: "launch_capability", icon: "search" },
  { id: "observe_run", icon: "agenda" },
  { id: "sourced_results", icon: "mandates" },
  { id: "human_validation", icon: "user" },
  { id: "resume_or_refuse", icon: "chevron-right" },
  { id: "history", icon: "estimate" },
];

export function AigentPanel() {
  const availability = getAvailability();
  // Frontière consommateur : cette version ne présente QUE l'état indisponible /
  // en spécification (aucun endpoint contrat n'existe encore). Le rendu LIVE
  // (liste d'agents réels) sera ajouté quand `availability.available === true`
  // sera atteint de bout en bout — jamais avant, pour ne rien inventer.
  const reason = availability.available ? "error" : availability.reason;

  return (
    <div className="surface p-5">
      {/* En-tête : titre + statut réel */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-titre text-base font-semibold text-zinc-900">{t.statusTitle}</div>
          <Text className="mt-1">{t.unavailableHeadline}</Text>
        </div>
        <Badge color="zinc">
          <span aria-hidden className="size-1.5 rounded-full bg-zinc-400" />
          {t.statusUnavailable}
        </Badge>
      </div>

      {/* Raison honnête de l'indisponibilité */}
      <p className="mt-3 rounded-lg border border-zinc-950/10 bg-zinc-950/[0.02] px-3.5 py-2.5 text-sm text-zinc-600">
        {t.reasons[reason] ?? t.reasons.error}
      </p>

      {/* Capacités PRÉVUES, en état désactivé */}
      <div className="mt-5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
            {t.plannedTitle}
          </span>
        </div>
        <Text className="mt-1">{t.plannedHint}</Text>

        <ul className="mt-3 grid grid-cols-1 gap-2 @2xl:grid-cols-2">
          {PLANNED.map(({ id, icon }) => {
            const cap = t.planned[id];
            return (
              <li
                key={id}
                className="flex items-start gap-2.5 rounded-xl border border-dashed border-zinc-950/10 bg-zinc-950/[0.015] px-3.5 py-3 opacity-70"
              >
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border border-zinc-950/10 text-zinc-400"
                >
                  <Icon name={icon} className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-semibold text-zinc-700">{cap.label}</span>
                    <Badge color="zinc">{t.unavailableTag}</Badge>
                  </span>
                  <span className="mt-0.5 block text-xs text-zinc-500">{cap.description}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Frontières dures du consommateur */}
      <div className="mt-5 border-t border-zinc-950/10 pt-4">
        <span className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
          {t.boundaryTitle}
        </span>
        <ul className="mt-2 flex flex-col gap-1 text-sm text-zinc-600">
          {t.boundaryItems.map((item) => (
            <li key={item} className="flex gap-1.5">
              <span aria-hidden="true" className="text-zinc-400">
                —
              </span>
              {item}
            </li>
          ))}
        </ul>
        <Text className="mt-2 text-xs">{t.boundaryNote}</Text>
      </div>
    </div>
  );
}
