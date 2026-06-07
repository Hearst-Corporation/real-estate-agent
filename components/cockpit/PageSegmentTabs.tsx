"use client";

/** Onglets locaux (état React) — même look que `PageNavTabs`, sans changement de route. */
export function PageSegmentTabs<T extends string>({
  tabs,
  active,
  onSelect,
  ariaLabel = "Sections",
}: {
  tabs: readonly { id: T; label: string }[];
  active: T;
  onSelect: (id: T) => void;
  ariaLabel?: string;
}) {
  return (
    <nav className="ct-page-header-nav" aria-label={ariaLabel}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`ct-page-header-nav-item${active === tab.id ? " active" : ""}`}
          onClick={() => onSelect(tab.id)}
          aria-current={active === tab.id ? "page" : undefined}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
