/**
 * Waterfall — cascade de paiement à l'exit (étude P8.3). Server component.
 * Consomme le data contract `ChartWaterfall` du moteur financier (lib/invest/
 * finance). Le rang obligataire (VOUS) est surligné. CSS/markup pur, zéro lib.
 *
 * Une table alternative `.sr-only` est fournie (WCAG 1.1.1).
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
    <div className="flex flex-col gap-3">
      {chart.steps.map((step, index) => {
        const isTotal = step.is_total;
        const you = OBLIGATAIRE_KEYS.has(step.key);
        const senior = SENIOR_KEYS.has(step.key);
        const rank = rankByIndex.get(index);
        const cumulW = Math.max(0, Math.min(100, (Math.abs(step.cumul_eur) / maxCumul) * 100));
        const payW = isTotal ? 0 : Math.max(0, Math.min(100, (Math.abs(step.delta_eur) / maxCumul) * 100));

        // Segment "cumul" = trace neutre jusqu'au montant déjà distribué en amont.
        const cumClass = "bg-white/[0.06]";
        // Segment "pay" = tranche versée à cette étape ; vous (indigo) > senior (slate) > autre (emerald).
        const payClass = you
          ? "bg-indigo-400"
          : senior
            ? "bg-slate-400"
            : "bg-emerald-400";

        return (
          <div className="flex items-center gap-3" key={step.key}>
            <span
              className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                you ? "bg-indigo-500/20 text-indigo-300" : "bg-white/[0.06] text-slate-400"
              }`}
              aria-hidden
            >
              {isTotal ? "Σ" : rank}
            </span>
            <div className="flex-1">
              <div className="mb-1 flex items-baseline justify-between text-sm">
                <span className="text-slate-300">
                  {you ? <b className="text-slate-100">{step.label} (vous)</b> : step.label}
                </span>
                <span className="font-medium text-slate-100">{eur(Math.abs(step.delta_eur))}</span>
              </div>
              <div className="relative h-2 overflow-hidden rounded-full bg-white/[0.03]">
                {isTotal ? (
                  <span
                    className={`absolute inset-y-0 rounded-full ${payClass}`}
                    style={{ left: 0, width: `${cumulW}%` }}
                  />
                ) : (
                  <>
                    <span
                      className={`absolute inset-y-0 rounded-full ${cumClass}`}
                      style={{ left: 0, width: `${cumulW}%` }}
                    />
                    <span
                      className={`absolute inset-y-0 rounded-full ${payClass}`}
                      style={{ left: `${cumulW}%`, width: `${payW}%` }}
                    />
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}

      <table className="sr-only">
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
