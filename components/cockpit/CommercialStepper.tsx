/**
 * Stepper « Suite commerciale » (REA-UX-012, LOT 2.E).
 * =================================================================
 *
 * Frise métier du pipeline Estimation → Propriétaire → Opportunité → Décision.
 * Trois états visuellement DISTINCTS, jamais quatre coches identiques :
 *   - `done`    : étape accomplie — pastille or pleine, coche, libellé net.
 *   - `current` : étape en cours — pastille cerclée accent + halo, libellé
 *                 dominant (c'est là que l'agent doit agir).
 *   - `todo`    : étape future — pastille creuse, libellé atténué.
 *
 * Responsive : frise HORIZONTALE à partir de `@sm` (connecteurs courts entre
 * pastilles) ; sur petit écran, bascule en liste VERTICALE (connecteur = trait
 * vertical court), aucun débordement, chaque étape lisible sur sa ligne.
 *
 * Purement présentationnel : aucune action, aucune mutation.
 */

export type StepState = "done" | "current" | "todo";

export interface CommercialStep {
  /** Libellé de l'étape. */
  label: string;
  state: StepState;
  /** Sous-titre optionnel : état/prochaine action, atténué. */
  hint?: string;
}

const DOT_BASE =
  "relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors";
const DOT_BY_STATE: Record<StepState, string> = {
  done: "bg-accent-500 text-zinc-950 ring-1 ring-accent-600/40",
  current: "border-2 border-accent-500 bg-accent-500/10 text-accent-800 ring-4 ring-accent-500/15",
  todo: "border border-zinc-950/15 bg-white text-zinc-400",
};

const LABEL_BY_STATE: Record<StepState, string> = {
  done: "text-zinc-900 font-semibold",
  current: "text-accent-800 font-semibold",
  todo: "text-zinc-500 font-medium",
};

export function CommercialStepper({
  steps,
  labels,
}: {
  steps: CommercialStep[];
  /** Libellés d'état pour lecteurs d'écran (done / current / todo). */
  labels: { done: string; current: string; todo: string };
}) {
  return (
    <ol className="flex flex-col gap-0 @sm:flex-row @sm:items-start @sm:gap-0">
      {steps.map((step, i) => {
        const first = i === 0;
        const prevDone = i > 0 && steps[i - 1].state === "done";
        return (
          <li
            key={step.label}
            className="flex flex-1 items-start gap-3 @sm:flex-col @sm:items-center @sm:gap-2 @sm:text-center"
          >
            {/* Connecteur + pastille */}
            <div className="flex flex-col items-center @sm:w-full @sm:flex-row">
              {/* Connecteur entrant (vertical en mobile, horizontal en @sm). */}
              {!first && (
                <span
                  aria-hidden="true"
                  className={`h-3 w-px @sm:h-px @sm:w-full @sm:flex-1 ${
                    prevDone || step.state === "done" ? "bg-accent-400" : "bg-zinc-950/10"
                  }`}
                />
              )}
              <span className={`${DOT_BASE} ${DOT_BY_STATE[step.state]}`} aria-hidden="true">
                {step.state === "done" ? "✓" : i + 1}
              </span>
              {/* Connecteur sortant (mobile : trait vertical court pour relier). */}
              {i < steps.length - 1 && (
                <span
                  aria-hidden="true"
                  className={`h-3 w-px @sm:h-px @sm:w-full @sm:flex-1 ${
                    step.state === "done" ? "bg-accent-400" : "bg-zinc-950/10"
                  }`}
                />
              )}
            </div>

            {/* Libellé + éventuel indice */}
            <div className="min-w-0 pt-0.5 @sm:pt-0">
              <p className={`truncate text-sm ${LABEL_BY_STATE[step.state]}`}>
                {step.label}
                <span className="sr-only"> — {labels[step.state]}</span>
              </p>
              {step.hint && (
                <p className="mt-0.5 truncate text-xs text-zinc-500">{step.hint}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
