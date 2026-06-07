import { UI } from "@/lib/ui-strings";

const DPE_COLORS: Record<string, string> = {
  A: "var(--dpe-a)",
  B: "var(--dpe-b)",
  C: "var(--dpe-c)",
  D: "var(--dpe-d)",
  E: "var(--dpe-e)",
  F: "var(--dpe-f)",
  G: "var(--dpe-g)",
};

interface DpeBadgeProps {
  letter: string | null | undefined;
  label?: string;
}

export function DpeBadge({ letter, label }: DpeBadgeProps) {
  const t = UI.properties.dpe;
  if (!letter) return <span className="ct-placeholder">{t.none}</span>;
  const bg = DPE_COLORS[letter] ?? "var(--ct-surface-3)";
  return (
    <span
      className="property-dpe-badge"
      style={{ backgroundColor: bg }}
      aria-label={`${label ?? t.label} : ${letter}`}
    >
      {letter}
    </span>
  );
}
