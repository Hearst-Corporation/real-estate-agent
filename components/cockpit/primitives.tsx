import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/cockpit/Icon";

export function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="ct-eyebrow">{children}</div>;
}

export function Title({ children }: { children: ReactNode }) {
  return <h1 className="ct-title">{children}</h1>;
}

export function Sub({ children }: { children: ReactNode }) {
  return <p className="ct-sub">{children}</p>;
}

/** H2 de section — titre lisible sous le H1 de page. */
export function SectionTitle({ children, as: Tag = "h2" }: { children: ReactNode; as?: "h2" | "div" }) {
  return <Tag className="ct-h2">{children}</Tag>;
}

/** H3 de sous-section. */
export function SubsectionTitle({ children, as: Tag = "h3" }: { children: ReactNode; as?: "h3" | "div" }) {
  return <Tag className="ct-h3">{children}</Tag>;
}

/** Meta secondaire (dates, heures, compteurs discrets). */
export function Caption({ children, as: Tag = "p" }: { children: ReactNode; as?: "p" | "span" | "div" }) {
  return <Tag className="ct-subtext">{children}</Tag>;
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
    <div className={`ct-page-header${className ? ` ${className}` : ""}`}>
      <div className="ct-page-header-topbar">
        <div>
          <div className="ct-page-header-kicker-track">
            {kicker && <p className="ct-page-header-kicker">{kicker}</p>}
          </div>
          <h1 className="ct-title ct-page-header-title">{title}</h1>
          {meta ? <div className="ct-page-header-meta">{meta}</div> : null}
        </div>
        {action ? (
          <div className="ct-page-header-action-track">
            <div>{action}</div>
          </div>
        ) : null}
      </div>

      {nav ? (
        <div className="ct-page-header-nav-track">
          <nav className="ct-page-header-nav">
            {nav}
          </nav>
        </div>
      ) : null}

      {kpis && kpis.length > 0 ? (
        <div className="ct-page-header-kpis-track">
          <div className="ct-page-header-kpis">
            {kpis.map((kpi, i) => (
              <div key={i} className="ct-page-header-kpi">
                {kpi.icon ? (
                  <span className="ct-page-header-kpi-icon" aria-hidden="true">
                    <Icon name={kpi.icon} />
                  </span>
                ) : null}
                <span className="ct-page-header-kpi-text">
                  <span>{kpi.label}</span>
                  <strong>{kpi.value}</strong>
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
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
  const classes = ["ct-card", variant ? `ct-card-${variant}` : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  return (
    <section className={classes}>
      {title ? (
        titleAs === "section" ? (
          <SectionTitle as="div">{title}</SectionTitle>
        ) : (
          <div className="ct-card-title">{title}</div>
        )
      ) : null}
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
