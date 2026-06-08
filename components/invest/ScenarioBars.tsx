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

const CLASS: Record<ScenarioKey, string> = { pessimiste: "pess", central: "cent", optimiste: "opt" };

export function ScenarioBars({ chart }: { chart: ChartScenarios }) {
  // Échelle commune sur la valeur absolue max des TRI (min 1 % pour éviter /0).
  const maxAbs = Math.max(...chart.barres.map((b) => Math.abs(b.irr ?? 0)), 0.01);

  return (
    <div>
      <div className="inv-scenario-grid">
        {chart.barres.map((bar) => {
          const irr = bar.irr ?? 0;
          const h = Math.max(4, (Math.abs(irr) / maxAbs) * 100);
          return (
            <div className="inv-scenario-bar-wrap" key={bar.key}>
              <span className="inv-scenario-val">{pct(bar.irr)}</span>
              <div className={`inv-scenario-bar ${CLASS[bar.key]}`} style={{ height: `${h}%` }} />
              <span className="inv-scenario-lab">{bar.label}</span>
            </div>
          );
        })}
      </div>
      <table className="inv-sr-only">
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
