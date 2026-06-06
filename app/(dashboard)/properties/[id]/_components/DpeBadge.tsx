import { UI } from "@/lib/ui-strings";

const DPE_COLORS: Record<string, string> = {
  A: "#00C853",
  B: "#64DD17",
  C: "#AEEA00",
  D: "#FFD600",
  E: "#FF6D00",
  F: "#DD2C00",
  G: "#B71C1C",
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
