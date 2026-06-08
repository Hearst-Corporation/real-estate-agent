/**
 * Waterfall — cascade de paiement à l'exit (étude P8.3). Server component.
 * Consomme le data contract `ChartWaterfall` du moteur financier (lib/invest/
 * finance). Le rang obligataire (VOUS) est surligné. CSS/markup pur, zéro lib.
 *
 * Une table alternative `.inv-sr-only` est fournie (WCAG 1.1.1).
 */
import type { ChartWaterfall } from "@/lib/invest/finance";
import { UI } from "@/lib/ui-strings";
import { eur } from "./format";

/** Marches obligataires = celles qui concernent directement le créancier. */
const OBLIGATAIRE_KEYS = new Set(["obligations_principal", "obligations_coupon"]);
const SENIOR_KEYS = new Set(["dette_senior_principal", "dette_senior_interets"]);

export function Waterfall({ chart }: { chart: ChartWaterfall }) {
  // Échelle = plus grand cumul absolu (pour normaliser les largeurs de barre).
  const maxCumul = Math.max(...chart.steps.map((s) => Math.abs(s.cumul_eur)), 1);
  // On rang-numérote uniquement les étages de paiement (hors barres "total").
  // Pré-calcul (pas de mutation pendant le rendu — correctness React).
  const rankByIndex = new Map<number, number>();
  let r = 0;
  chart.steps.forEach((s, i) => {
    if (!s.is_total) {
      r += 1;
      rankByIndex.set(i, r);
    }
  });

  return (
    <div className="inv-waterfall">
      {chart.steps.map((step, index) => {
        const isTotal = step.is_total;
        const you = OBLIGATAIRE_KEYS.has(step.key);
        const senior = SENIOR_KEYS.has(step.key);
        const rank = rankByIndex.get(index);
        const cumulW = Math.max(0, Math.min(100, (Math.abs(step.cumul_eur) / maxCumul) * 100));
        const payW = isTotal ? 0 : Math.max(0, Math.min(100, (Math.abs(step.delta_eur) / maxCumul) * 100));

        return (
          <div className="inv-wf-row" key={step.key}>
            <span className={`inv-wf-rank${you ? " you" : ""}`} aria-hidden>
              {isTotal ? "Σ" : rank}
            </span>
            <div className="inv-wf-bar-wrap">
              <div className="inv-wf-bar-head">
                <span className="inv-wf-bar-lab">
                  {you ? <b>{step.label} (vous)</b> : step.label}
                </span>
                <span className="inv-wf-bar-amt">{eur(Math.abs(step.delta_eur))}</span>
              </div>
              <div className="inv-wf-bar-track">
                {isTotal ? (
                  <span
                    className={`inv-wf-seg pay${you ? " you" : ""}`}
                    style={{ left: 0, width: `${cumulW}%` }}
                  />
                ) : (
                  <>
                    <span className="inv-wf-seg cum" style={{ left: 0, width: `${cumulW}%` }} />
                    <span
                      className={`inv-wf-seg pay${you ? " you" : senior ? " senior" : ""}`}
                      style={{ left: `${cumulW}%`, width: `${payW}%` }}
                    />
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}

      <table className="inv-sr-only">
        <caption>{chart.titre}</caption>
        <thead>
          <tr>
            <th scope="col">{UI.invest.charts.etage}</th>
            <th scope="col">{UI.invest.charts.montant}</th>
            <th scope="col">{UI.invest.charts.cumul}</th>
          </tr>
        </thead>
        <tbody>
          {chart.steps.map((s) => (
            <tr key={s.key}>
              <td>{s.label}</td>
              <td>{eur(s.delta_eur)}</td>
              <td>{eur(s.cumul_eur)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
