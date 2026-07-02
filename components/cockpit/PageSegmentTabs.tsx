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
    <nav className="flex flex-wrap items-center gap-1" aria-label={ariaLabel}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            active === tab.id ? "bg-indigo-500/15 text-indigo-300" : "text-slate-400 hover:text-slate-100"
          }`}
          onClick={() => onSelect(tab.id)}
          aria-current={active === tab.id ? "page" : undefined}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
