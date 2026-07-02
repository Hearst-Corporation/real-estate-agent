/**
 * StatusPill — pastille d'état (deal ou position). Server component.
 * Icône + libellé (jamais la couleur seule — WCAG 1.4.1).
 */
import type { ReactNode } from "react";

export type StatusTone = "open" | "soon" | "funded" | "closed" | "late" | "default" | "neutral";

const TONE_CLASS: Record<StatusTone, string> = {
  open: "border-emerald-400/30 bg-emerald-500/10 text-emerald-300",
  soon: "border-amber-400/30 bg-amber-500/10 text-amber-300",
  funded: "border-indigo-400/30 bg-indigo-500/10 text-indigo-300",
  closed: "border-white/10 bg-white/[0.06] text-slate-300",
  late: "border-red-400/30 bg-red-500/10 text-red-300",
  default: "border-white/10 bg-white/[0.06] text-slate-300",
  neutral: "border-white/10 bg-white/[0.06] text-slate-400",
};

const DOT_CLASS: Record<StatusTone, string> = {
  open: "bg-emerald-400",
  soon: "bg-amber-400",
  funded: "bg-indigo-400",
  closed: "bg-slate-400",
  late: "bg-red-400",
  default: "bg-slate-400",
  neutral: "bg-slate-500",
};

export function StatusPill({ tone = "open", children }: { tone?: StatusTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${TONE_CLASS[tone]}`}
    >
      <span className={`size-1.5 rounded-full ${DOT_CLASS[tone]}`} aria-hidden />
      {children}
    </span>
  );
}
