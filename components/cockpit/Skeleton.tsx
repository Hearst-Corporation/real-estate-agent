import type { CSSProperties } from "react";

/**
 * Skeleton — placeholder de chargement Cockpit qui mime la forme finale
 * (pas de spinner plein écran). Server component, décoratif (`aria-hidden`).
 * Le conteneur portant le Skeleton doit exposer `aria-busy="true"`.
 *
 * Largeur / hauteur / radius = exception data-driven tolérée : valeurs
 * dimensionnelles via `style` inline, jamais de couleur (shimmer = classe
 * `.ct-skeleton`, tokens --ct-* uniquement). Cf. cockpit/10-shell.css.
 */
export function Skeleton({
  width,
  height = 16,
  radius,
  className,
  style,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  className?: string;
  style?: CSSProperties;
}) {
  const px = (v: number | string) => (typeof v === "number" ? `${v}px` : v);
  return (
    <span
      className={`ct-skeleton${className ? ` ${className}` : ""}`}
      aria-hidden
      style={{
        width: width != null ? px(width) : "100%",
        height: px(height),
        ...(radius != null ? { borderRadius: px(radius) } : null),
        ...style,
      }}
    />
  );
}

/** Bloc de lignes en skeleton (mime un paragraphe / une carte de contenu). */
export function SkeletonLines({ count = 3 }: { count?: number }) {
  return (
    <div className="ct-skeleton-stack" aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} width={i === count - 1 ? "60%" : "100%"} height={14} />
      ))}
    </div>
  );
}
