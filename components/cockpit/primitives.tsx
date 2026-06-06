import type { ReactNode } from "react";

export function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="ct-eyebrow">{children}</div>;
}

export function Title({ children }: { children: ReactNode }) {
  return <h1 className="ct-title">{children}</h1>;
}

export function Sub({ children }: { children: ReactNode }) {
  return <p className="ct-sub">{children}</p>;
}

export function PageHeader({
  kicker,
  title,
  action,
  nav,
  kpis,
}: {
  kicker?: ReactNode;
  title: ReactNode;
  action?: ReactNode;
  nav?: ReactNode;
  kpis?: { label: string; value: ReactNode }[];
}) {
  return (
    <div className="ct-page-header">
      <div className="ct-page-header-topbar">
        <div>
          <div className="ct-page-header-kicker-track">
            {kicker && <p className="ct-page-header-kicker">{kicker}</p>}
          </div>
          <h1 className="ct-title ct-page-header-title">{title}</h1>
        </div>
        <div className="ct-page-header-action-track">
          {action && <div>{action}</div>}
        </div>
      </div>

      <div className="ct-page-header-nav-track">
        {nav && (
          <nav className="ct-page-header-nav">
            {nav}
          </nav>
        )}
      </div>

      <div className="ct-page-header-kpis-track">
        {kpis && kpis.length > 0 && (
          <div className="ct-page-header-kpis">
            {kpis.map((kpi, i) => (
              <div key={i} className="ct-page-header-kpi">
                <span>{kpi.label}</span>
                <strong>{kpi.value}</strong>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function PageStack({ children }: { children: ReactNode }) {
  return <div className="ct-page-stack">{children}</div>;
}

export function DashboardGrid({ children }: { children: ReactNode }) {
  return <div className="ct-dashboard-grid">{children}</div>;
}

export function InsightRail({ children }: { children: ReactNode }) {
  return <aside className="ct-insight-rail">{children}</aside>;
}

export function Card({
  title,
  children,
  variant,
  className,
}: {
  title?: string;
  children: ReactNode;
  variant?: "hero" | "chart" | "dense";
  className?: string;
}) {
  const classes = ["ct-card", variant ? `ct-card-${variant}` : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  return (
    <section className={classes}>
      {title ? <div className="ct-card-title">{title}</div> : null}
      <div className="ct-card-body">{children}</div>
    </section>
  );
}

export function KpiGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`ct-kpi-grid${className ? ` ${className}` : ""}`}>{children}</div>;
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
    <div className={`ct-kpi-card${accent ? " accent" : ""}${className ? ` ${className}` : ""}`}>
      {children ?? (
        <>
          <div className="ct-kpi-label">{label}</div>
          <div className="ct-kpi-value">{value}</div>
        </>
      )}
    </div>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return <span className="ct-badge">{children}</span>;
}

export function HeroMetric({
  eyebrow,
  value,
  label,
  children,
}: {
  eyebrow: string;
  value: string;
  label: string;
  children?: ReactNode;
}) {
  return (
    <section className="ct-hero-metric">
      <div>
        <div className="ct-hero-eyebrow">{eyebrow}</div>
        <div className="ct-hero-value">{value}</div>
        <div className="ct-hero-label">{label}</div>
      </div>
      {children ? <div className="ct-hero-extra">{children}</div> : null}
    </section>
  );
}
