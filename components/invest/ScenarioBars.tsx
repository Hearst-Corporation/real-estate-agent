/**
 * ScenarioBars — scénarios de performance en barres groupées (étude P8.5).
 * Server component. Consomme `ChartScenarios` du moteur financier. Le scénario
 * PESSIMISTE est TOUJOURS affiché, au même niveau hiérarchique que le central
 * (L5 — aucun rendement garanti). CSS pur.
 *
 * Les barres représentent le TRI annualisé (cible, non garanti). Une valeur
 * négative est rendue à hauteur minimale + libellée explicitement.
 */
import type { ChartScenarios, ScenarioKey } from "@/lib/invest/finance";
import { UI } from "@/lib/ui-strings";
import { pct } from "./format";

/** pessimiste = amber, central = indigo, optimiste = emerald. */
const CLASS: Record<ScenarioKey, string> = {
  pessimiste: "bg-amber-400",
  central: "bg-indigo-400",
  optimiste: "bg-emerald-400",
};

export function ScenarioBars({ chart }: { chart: ChartScenarios }) {
  // Échelle commune sur la valeur absolue max des TRI (min 1 % pour éviter /0).
  const maxAbs = Math.max(...chart.barres.map((b) => Math.abs(b.irr ?? 0)), 0.01);

  return (
    <div>
      <div className="flex h-40 items-end justify-around gap-4">
        {chart.barres.map((bar) => {
          const irr = bar.irr ?? 0;
          const h = Math.max(4, (Math.abs(irr) / maxAbs) * 100);
          return (
            <div className="flex h-full flex-1 flex-col items-center justify-end gap-1.5" key={bar.key}>
              <span className="text-sm font-semibold text-slate-100">{pct(bar.irr)}</span>
              <div
                className={`w-full max-w-10 rounded-t-md ${CLASS[bar.key]}`}
                style={{ height: `${h}%` }}
              />
              <span className="text-xs text-slate-500">{bar.label}</span>
            </div>
          );
        })}
      </div>
      <table className="sr-only">
        <caption>{chart.titre}</caption>
        <thead>
          <tr>
            <th scope="col">{UI.invest.charts.scenario}</th>
            <th scope="col">{UI.invest.charts.scenarioTriCol}</th>
          </tr>
        </thead>
        <tbody>
          {chart.barres.map((b) => (
            <tr key={b.key}>
              <td>{b.label}</td>
              <td>{pct(b.irr)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
