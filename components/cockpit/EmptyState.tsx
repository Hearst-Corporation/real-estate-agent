import type { ReactNode } from "react";
import { Strong, Text } from "@/components/ui/text";
import { AzigoWatermark } from "./AzigoWatermark";

/**
 * État vide / indisponible — primitive PARTAGÉE (REA-UX-012, LOT 4).
 * =================================================================
 *
 * Remplace les copies locales dispersées (prospection, agents, approvals…) par
 * une seule surface cohérente. Deux tons :
 *   - `default`     : rien à afficher pour l'instant (filet or plein).
 *   - `unavailable` : donnée non disponible sur cet environnement (filet
 *                     pointillé + libellé explicite — jamais un bouton mort).
 *
 * Le filigrane Azigo se pose discrètement au-dessus du bloc, sans gêner le texte
 * (opacité ~4 %, `pointer-events-none`, `aria-hidden`).
 */

export function EmptyState({
  icon,
  title,
  description,
  steps,
  stepsAriaLabel,
  action,
  tone = "default",
  watermark = true,
}: {
  /** Icône déjà rendue (ex. `<Icon name="agents" className="size-6" />`). */
  icon?: ReactNode;
  title?: string;
  description: string;
  /** Étapes numérotées optionnelles (onboarding d'une surface vide). */
  steps?: string[];
  stepsAriaLabel?: string;
  action?: ReactNode;
  tone?: "default" | "unavailable";
  watermark?: boolean;
}) {
  const ring =
    tone === "unavailable"
      ? "border border-dashed border-zinc-950/15"
      : "border border-zinc-950/10";
  return (
    <div className="surface relative overflow-hidden">
      {watermark && <AzigoWatermark placement="empty" />}
      <div className="relative flex flex-col items-center gap-3 px-6 py-14 text-center">
        {icon && (
          <span
            aria-hidden="true"
            className={`flex size-12 items-center justify-center rounded-2xl text-zinc-400 ${ring}`}
          >
            {icon}
          </span>
        )}
        {title && <Strong className="text-base">{title}</Strong>}
        <Text className="max-w-md">{description}</Text>

        {steps && steps.length > 0 && (
          <ol className="mt-2 flex flex-col gap-2 text-left" aria-label={stepsAriaLabel}>
            {steps.map((s, i) => (
              <li key={i} className="flex items-center gap-2.5 text-sm text-zinc-600">
                <span
                  aria-hidden="true"
                  className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-500/15 text-xs font-semibold text-accent-700"
                >
                  {i + 1}
                </span>
                {s}
              </li>
            ))}
          </ol>
        )}

        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}
