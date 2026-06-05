/**
 * Icônes de navigation du rail gauche (SVG inline, stroke=currentColor).
 * Style aligné sur components/invest/icons.tsx : viewBox 24, strokeWidth 2,
 * linecap/linejoin round. `currentColor` → la couleur vient du token du
 * conteneur (.ct-rail-action). Aucun hex.
 */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { className?: string };

function base(props: IconProps) {
  return {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...props,
  };
}

/** Dashboard — grille de tuiles. */
export function IconDashboard(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

/** Estimations — euro. */
export function IconEstimations(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M17 6a7.5 7.5 0 1 0 0 12" />
      <path d="M3 10h9" />
      <path d="M3 14h9" />
    </svg>
  );
}

/** Biens — immeuble. */
export function IconProperties(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 21h18" />
      <path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16" />
      <path d="M15 21V9h2a2 2 0 0 1 2 2v10" />
      <path d="M9 7h2M9 11h2M9 15h2" />
    </svg>
  );
}

/** Leads — utilisateurs. */
export function IconLeads(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

/** Visites — clé. */
export function IconVisits(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="m10.7 12.3 8.3-8.3" />
      <path d="m16 6 2 2" />
      <path d="m19 3 2 2" />
    </svg>
  );
}

/** Mandats — document signé. */
export function IconMandates(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M8 17c1.5-2 3-2 4 0s2.5 2 4 0" />
    </svg>
  );
}

/** Agenda — calendrier. */
export function IconAgenda(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 2v4M16 2v4" />
      <path d="M8 14h.01M12 14h.01M16 14h.01" />
    </svg>
  );
}

/** Swarms — réseau d'agents. */
export function IconSwarms(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="5" r="2.5" />
      <circle cx="5" cy="18" r="2.5" />
      <circle cx="19" cy="18" r="2.5" />
      <path d="M10.4 6.8 6.6 15.6M13.6 6.8l3.8 8.8M7.5 18h9" />
    </svg>
  );
}

/** Invest — courbe de croissance. */
export function IconInvest(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 3v18h18" />
      <path d="m7 14 4-4 3 3 5-6" />
      <path d="M19 7h-3M19 7v3" />
    </svg>
  );
}

/** Profil — utilisateur. */
export function IconProfile(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="8" r="4" />
      <path d="M5.5 21a7 7 0 0 1 13 0" />
    </svg>
  );
}

/** Admin — bouclier. */
export function IconAdmin(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
