/**
 * Timeline — séquence de jalons (closing : séquestre → DEEP → mint → lock-up ;
 * ou jalons de suivi de position). Server component. Liste ordonnée `<ol>`
 * (sémantique). État done/active = coche/point + libellé (jamais couleur seule).
 */
import { IconCheck } from "./icons";

export type MilestoneState = "done" | "active" | "todo";

export interface Milestone {
  title: string;
  sub?: string;
  state: MilestoneState;
}

const DOT_STATE_CLASS: Record<MilestoneState, string> = {
  done: "border-emerald-400 bg-emerald-500/20 text-emerald-300",
  active: "border-indigo-400 bg-indigo-500/20 text-indigo-300",
  todo: "border-white/15 bg-white/[0.04] text-transparent",
};

export function Timeline({ items }: { items: Milestone[] }) {
  return (
    <ol className="flex flex-col">
      {items.map((m, i) => (
        <li className="flex gap-3" key={m.title}>
          <div className="flex flex-col items-center">
            <span
              className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 ${DOT_STATE_CLASS[m.state]}`}
            >
              {m.state === "done" ? <IconCheck width={12} height={12} /> : null}
            </span>
            {i < items.length - 1 ? (
              <span className="w-px flex-1 bg-white/10" aria-hidden />
            ) : null}
          </div>
          <div className="pb-6">
            <div className="text-sm font-semibold text-slate-100">{m.title}</div>
            {m.sub ? <div className="mt-0.5 text-xs text-slate-400">{m.sub}</div> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
