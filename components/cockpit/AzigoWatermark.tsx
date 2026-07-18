/**
 * Filigrane Azigo — signature discrète, code-native (REA-UX-012, LOT 3).
 * =================================================================
 *
 * Monogramme « A » abstrait posé sur une trame de lignes cadastrales /
 * topographiques (parcelles + courbes de niveau du littoral), évoquant à la fois
 * l'immobilier (le plan) et le territoire (la côte). 100 % SVG local, aucune
 * image distante, aucune animation.
 *
 * Contraintes tenues :
 *   - opacité entre 2 % et 5 % selon le placement ;
 *   - `pointer-events-none` + `aria-hidden` (jamais capté ni annoncé) ;
 *   - jamais en mosaïque, jamais derrière du petit texte, jamais centré-géant
 *     sur une carte : un seul exemplaire, ancré dans un coin de la zone héro / du
 *     grand en-tête / de l'état vide / du fond du panneau d'aide.
 *
 * `placement` règle taille, position et teinte :
 *   - `hero`  : grand, coin haut-droit d'un bandeau héro, teinte or.
 *   - `panel` : plus petit, coin bas-droit du panneau d'aide, teinte bleu profond.
 *   - `empty` : discret, centré-haut d'un état vide, teinte or.
 */

type Placement = "hero" | "panel" | "empty";

const PLACEMENT: Record<
  Placement,
  { wrapper: string; tone: string; opacity: string; size: string }
> = {
  // Coin haut-droit, débordant légèrement — profondeur sans gêner le contenu.
  hero: {
    wrapper: "-right-10 -top-12",
    tone: "text-accent-600",
    opacity: "opacity-[0.05]",
    size: "h-64 w-64",
  },
  // Coin bas-droit du panneau d'aide, teinte bleu Méditerranée.
  panel: {
    wrapper: "-bottom-8 -right-6",
    tone: "text-mediterranee-700",
    opacity: "opacity-[0.04]",
    size: "h-44 w-44",
  },
  // État vide : posé au-dessus, centré, très léger.
  empty: {
    wrapper: "left-1/2 -top-6 -translate-x-1/2",
    tone: "text-accent-600",
    opacity: "opacity-[0.045]",
    size: "h-40 w-40",
  },
};

export function AzigoWatermark({ placement = "hero" }: { placement?: Placement }) {
  const p = PLACEMENT[placement];
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute z-0 select-none ${p.wrapper} ${p.tone} ${p.opacity}`}
    >
      <svg
        viewBox="0 0 200 200"
        className={p.size}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Trame cadastrale — parcelles */}
        <path d="M10 60 L80 20 L150 55 L150 130 L80 170 L10 135 Z" opacity="0.5" />
        <path d="M80 20 L80 170" opacity="0.35" />
        <path d="M10 95 L150 95" opacity="0.35" />
        {/* Courbes de niveau — littoral / topographie */}
        <path d="M20 150 C60 120 120 150 180 110" opacity="0.6" />
        <path d="M30 165 C70 140 130 168 190 128" opacity="0.4" />
        <path d="M25 45 C65 25 110 40 165 25" opacity="0.4" />
        {/* Monogramme « A » abstrait, tracé net par-dessus la trame */}
        <path
          d="M70 150 L100 55 L130 150"
          strokeWidth="3"
          opacity="0.9"
        />
        <path d="M82 118 L118 118" strokeWidth="3" opacity="0.9" />
      </svg>
    </div>
  );
}
