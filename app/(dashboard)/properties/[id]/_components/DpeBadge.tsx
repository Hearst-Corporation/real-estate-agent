import { UI } from "@/lib/ui-strings";
import { DPE_COLORS, DPE_FALLBACK, dpeNeedsDarkText } from "@/lib/crm/dpe";
import { Text } from "@/components/ui/text";

interface DpeBadgeProps {
  letter: string | null | undefined;
  label?: string;
}

/**
 * Pastille étiquette énergie DPE — data-viz réglementaire (échelle A→G figée).
 * La couleur vient de la norme, pas de l'accent applicatif (cf. lib/crm/dpe).
 */
export function DpeBadge({ letter, label }: DpeBadgeProps) {
  const t = UI.properties.dpe;
  if (!letter) return <Text>{t.none}</Text>;
  const bg = DPE_COLORS[letter] ?? DPE_FALLBACK;
  const dark = dpeNeedsDarkText(letter);
  return (
    <span
      className={`inline-flex size-8 items-center justify-center rounded-lg text-sm font-bold ${
        dark ? "text-zinc-900" : "text-white"
      }`}
      style={{ backgroundColor: bg }}
      aria-label={`${label ?? t.label} : ${letter}`}
    >
      {letter}
    </span>
  );
}
