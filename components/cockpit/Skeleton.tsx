import type { CSSProperties } from "react";

/**
 * Skeleton — placeholder de chargement Cockpit qui mime la forme finale
 * (pas de spinner plein écran). Server component, décoratif (`aria-hidden`).
 * Le conteneur portant le Skeleton doit exposer `aria-busy="true"`.
 *
 * Largeur / hauteur / radius pilotés par la donnée via `style` inline ; la
 * couleur reste aux utilities (shimmer = classe `animate-pulse`).
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
      className={`inline-block animate-pulse rounded-md bg-white/[0.08]${className ? ` ${className}` : ""}`}
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

