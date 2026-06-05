/**
 * StatusPill — pastille d'état (deal ou position). Server component.
 * Icône + libellé (jamais la couleur seule — WCAG 1.4.1).
 */
import type { ReactNode } from "react";

export type StatusTone = "open" | "soon" | "funded" | "closed" | "late" | "default" | "neutral";

const TONE_CLASS: Record<StatusTone, string> = {
  open: "",
  soon: "soon",
  funded: "funded",
  closed: "closed",
  late: "late",
  default: "default",
  neutral: "muted",
};

export function StatusPill({ tone = "open", children }: { tone?: StatusTone; children: ReactNode }) {
  const cls = TONE_CLASS[tone];
  return (
    <span className={`inv-pill${cls ? ` ${cls}` : ""}`}>
      <span className="inv-pill-dot" aria-hidden />
      {children}
    </span>
  );
}
