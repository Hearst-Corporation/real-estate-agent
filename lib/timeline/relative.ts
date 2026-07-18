// lib/timeline/relative.ts — Date relative fr-FR PURE (déterministe pour tests).
//
// `relativeFr(ts, now)` : "à l'instant", "il y a 3 h", "il y a 5 j", sinon date
// courte. `now` injectable pour rendre le calcul testable sans horloge globale.

export function relativeFr(ts: string, now: number = Date.now()): string {
  const t = Date.parse(ts);
  if (!Number.isFinite(t)) return "—";
  const diff = now - t;
  const sec = Math.round(diff / 1000);
  const min = Math.round(sec / 60);
  const hr = Math.round(min / 60);
  const day = Math.round(hr / 24);

  if (Math.abs(sec) < 60) return "à l'instant";
  if (Math.abs(min) < 60) return diff >= 0 ? `il y a ${min} min` : `dans ${Math.abs(min)} min`;
  if (Math.abs(hr) < 24) return diff >= 0 ? `il y a ${hr} h` : `dans ${Math.abs(hr)} h`;
  if (Math.abs(day) < 30) return diff >= 0 ? `il y a ${day} j` : `dans ${Math.abs(day)} j`;
  return new Date(t).toLocaleDateString("fr-FR");
}
