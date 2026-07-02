import { UI } from "@/lib/ui-strings";

/** Couleurs officielles de l'étiquette énergie DPE (A→G, vert→rouge). */
const DPE_COLORS: Record<string, string> = {
  A: "#00a651",
  B: "#4cb848",
  C: "#bfd730",
  D: "#fff200",
  E: "#fdb913",
  F: "#f47b20",
  G: "#ed1c24",
};

interface DpeBadgeProps {
  letter: string | null | undefined;
  label?: string;
}

export function DpeBadge({ letter, label }: DpeBadgeProps) {
  const t = UI.properties.dpe;
  if (!letter) return <span className="text-sm text-slate-500">{t.none}</span>;
  const bg = DPE_COLORS[letter] ?? "#475569";
  // Lettres D à G sur fond clair (jaune/orange) → texte sombre pour contraste ; A-C sur fond vert → texte blanc.
  const dark = letter === "D" || letter === "E" || letter === "F" || letter === "G";
  return (
    <span
      className={`inline-flex size-8 items-center justify-center rounded-lg text-sm font-bold ${
        dark ? "text-slate-900" : "text-white"
      }`}
      style={{ backgroundColor: bg }}
      aria-label={`${label ?? t.label} : ${letter}`}
    >
      {letter}
    </span>
  );
}
