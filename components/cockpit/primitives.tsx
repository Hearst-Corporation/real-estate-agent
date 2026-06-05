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

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="ct-card">
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
