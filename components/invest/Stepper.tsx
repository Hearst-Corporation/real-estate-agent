/**
 * Stepper — progression d'un funnel multi-étapes (souscription : Montant →
 * Éligibilité → Signature → Versement). Présentation pure (server component).
 *
 * `aria-current="step"` sur l'étape active (WCAG). Les états done/active ne
 * dépendent pas de la couleur seule (numéro / coche + libellé).
 */
import { IconCheck } from "./icons";

export interface Step {
  label: string;
}

export function Stepper({ steps, current }: { steps: Step[]; current: number }) {
  return (
    <ol className="flex items-center" aria-label="Étapes de souscription">
      {steps.map((step, i) => {
        const state = i < current ? "done" : i === current ? "active" : "todo";
        return (
          <li
            className="flex flex-1 items-center last:flex-none"
            key={step.label}
            aria-current={state === "active" ? "step" : undefined}
          >
            <span
              className={`flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                state === "active"
                  ? "border-indigo-400 bg-indigo-500/20 text-indigo-300"
                  : state === "done"
                    ? "border-emerald-400 bg-emerald-500/20 text-emerald-300"
                    : "border-white/15 bg-white/[0.04] text-slate-500"
              }`}
            >
              {state === "done" ? <IconCheck width={11} height={11} /> : i + 1}
            </span>
            <span
              className={`ml-2 whitespace-nowrap text-sm ${
                state === "active" ? "font-semibold text-slate-100" : "text-slate-400"
              }`}
            >
              {step.label}
            </span>
            {i < steps.length - 1 ? (
              <span className="mx-3 h-px flex-1 bg-white/10" aria-hidden />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
