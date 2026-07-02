/**
 * Skeleton — placeholder de chargement qui mime la forme finale (pas de
 * spinner plein écran). Server component. `aria-hidden` (décoratif) ; le
 * conteneur portant le Skeleton doit exposer `aria-busy="true"`.
 *
 * Largeur/hauteur pilotées par la donnée (style inline), comme BarList.
 */
export function Skeleton({
  width,
  height = 16,
  radius,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number;
}) {
  return (
    <span
      className="block animate-pulse rounded-md bg-white/[0.06]"
      aria-hidden
      style={{
        width: typeof width === "number" ? `${width}px` : (width ?? "100%"),
        height: typeof height === "number" ? `${height}px` : height,
        ...(radius != null ? { borderRadius: `${radius}px` } : null),
      }}
    />
  );
}

/** Bloc carte en skeleton (mime une DealCard). */
export function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]" aria-busy="true">
      <Skeleton height={150} radius={0} />
      <div className="flex flex-col gap-2 p-4">
        <Skeleton width="40%" height={11} />
        <Skeleton width="70%" height={18} />
        <Skeleton width="100%" height={40} />
        <Skeleton width="100%" height={6} />
      </div>
    </div>
  );
}
