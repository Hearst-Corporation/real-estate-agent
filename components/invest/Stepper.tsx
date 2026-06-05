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
    <ol className="inv-stepper" aria-label="Étapes de souscription">
      {steps.map((step, i) => {
        const state = i < current ? "done" : i === current ? "active" : "todo";
        return (
          <li className="inv-step" key={step.label} aria-current={state === "active" ? "step" : undefined}>
            <span className={`inv-step-num${state === "active" ? " active" : state === "done" ? " done" : ""}`}>
              {state === "done" ? <IconCheck width={11} height={11} /> : i + 1}
            </span>
            <span className={`inv-step-lab${state === "active" ? " active" : ""}`}>{step.label}</span>
            {i < steps.length - 1 ? <span className="inv-step-conn" aria-hidden /> : null}
          </li>
        );
      })}
    </ol>
  );
}
