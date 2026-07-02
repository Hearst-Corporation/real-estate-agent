import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/cockpit/Icon";

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="text-xs font-semibold uppercase tracking-widest text-indigo-300">
      {children}
    </div>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return <h1 className="text-2xl font-bold tracking-tight text-white">{children}</h1>;
}

export function Sub({ children }: { children: ReactNode }) {
  return <p className="text-sm text-slate-400">{children}</p>;
}

/** H2 de section — titre lisible sous le H1 de page. */
export function SectionTitle({ children, as: Tag = "h2" }: { children: ReactNode; as?: "h2" | "div" }) {
  return <Tag className="text-lg font-semibold text-slate-100">{children}</Tag>;
}

/** H3 de sous-section. */
export function SubsectionTitle({ children, as: Tag = "h3" }: { children: ReactNode; as?: "h3" | "div" }) {
  return <Tag className="text-sm font-semibold text-slate-200">{children}</Tag>;
}

/** Meta secondaire (dates, heures, compteurs discrets). */
export function Caption({ children, as: Tag = "p" }: { children: ReactNode; as?: "p" | "span" | "div" }) {
  return <Tag className="text-xs text-slate-500">{children}</Tag>;
}

export function PageHeader({
  kicker,
  title,
  meta,
  action,
  nav,
  kpis,
  className,
}: {
  kicker?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  nav?: ReactNode;
  kpis?: { label: string; value: ReactNode; icon?: IconName }[];
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-4 pb-6 ${className ?? ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {kicker ? (
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-indigo-300">
              {kicker}
            </p>
          ) : null}
          <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>
          {meta ? <div className="mt-1 text-sm text-slate-400">{meta}</div> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>

      {nav ? (
        <nav className="flex flex-wrap items-center gap-1 border-b border-white/10 pb-2">
          {nav}
        </nav>
      ) : null}

      {kpis && kpis.length > 0 ? (
        <div className="flex flex-wrap gap-3">
          {kpis.map((kpi, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2"
            >
              {kpi.icon ? (
                <span className="text-indigo-300" aria-hidden="true">
                  <Icon name={kpi.icon} className="size-4" />
                </span>
              ) : null}
              <span className="flex items-baseline gap-1.5 text-xs text-slate-400">
                <span>{kpi.label}</span>
                <strong className="text-sm font-semibold text-slate-100">{kpi.value}</strong>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function PageStack({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-6 pb-12">{children}</div>;
}

const CARD_VARIANT: Record<"hero" | "chart" | "dense", string> = {
  hero: "bg-gradient-to-br from-indigo-500/10 via-white/[0.03] to-white/[0.03]",
  chart: "p-4",
  dense: "p-3",
};

export function Card({
  title,
  titleAs = "label",
  children,
  variant,
  className,
}: {
  title?: string;
  /** `label` = micro uppercase (défaut) · `section` = H2 de section lisible */
  titleAs?: "label" | "section";
  children: ReactNode;
  variant?: "hero" | "chart" | "dense";
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-lg shadow-black/20 backdrop-blur-sm ${
        variant ? CARD_VARIANT[variant] : ""
      } ${className ?? ""}`}
    >
      {title ? (
        titleAs === "section" ? (
          <div className="mb-3">
            <SectionTitle as="div">{title}</SectionTitle>
          </div>
        ) : (
          <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
            {title}
          </div>
        )
      ) : null}
      <div>{children}</div>
    </section>
  );
}

export function KpiGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`grid grid-cols-2 gap-3 @2xl:grid-cols-4 ${className ?? ""}`}>{children}</div>
  );
}

export function KpiCard({
  label,
  value,
  accent,
  className,
  children,
}: {
  label?: string;
  value?: string;
  accent?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        accent ? "border-indigo-400/40 bg-indigo-500/10" : "border-white/10 bg-white/[0.03]"
      } ${className ?? ""}`}
    >
      {children ?? (
        <>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
          <div className="mt-1 text-2xl font-bold text-white">{value}</div>
        </>
      )}
    </div>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-xs font-medium text-slate-200">
      {children}
    </span>
  );
}
