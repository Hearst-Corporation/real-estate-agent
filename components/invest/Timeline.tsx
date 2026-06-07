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

export function Timeline({ items }: { items: Milestone[] }) {
  return (
    <ol className="inv-timeline">
      {items.map((m) => (
        <li className="inv-timeline-item" key={m.title}>
          <div className="inv-timeline-rail">
            <span className={`inv-timeline-dot${m.state === "done" ? " done" : m.state === "active" ? " active" : ""}`}>
              {m.state === "done" ? <IconCheck width={12} height={12} /> : null}
            </span>
            <span className="inv-timeline-line" aria-hidden />
          </div>
          <div className="inv-timeline-body">
            <div className="inv-timeline-title">{m.title}</div>
            {m.sub ? <div className="inv-timeline-sub">{m.sub}</div> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
