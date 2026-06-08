import React from "react";

export type IconName = 
  | "estimate" 
  | "search" 
  | "network" 
  | "crm" 
  | "properties" 
  | "leads" 
  | "visits" 
  | "mandates" 
  | "agenda"
  | "home"
  | "user"
  | "plus"
  | "chevron-down"
  | "chevron-right";

interface IconProps extends React.SVGProps<SVGSVGElement> {
  name: IconName;
}

export function Icon({ name, ...props }: IconProps) {
  const common = {
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    "aria-hidden": true,
    ...props
  };
  
  const strokeProps = {
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (name) {
    case "estimate":
      return (
        <svg {...common}>
          <path {...strokeProps} d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
          <path {...strokeProps} d="M9 8h6M9 12h6M9 16h3" />
          <path {...strokeProps} d="M16 16h.01" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <circle {...strokeProps} cx="11" cy="11" r="6" />
          <path {...strokeProps} d="m16 16 4 4" />
          <path {...strokeProps} d="M9 11h4" />
        </svg>
      );
    case "network":
      return (
        <svg {...common}>
          <circle {...strokeProps} cx="12" cy="5" r="2.5" />
          <circle {...strokeProps} cx="6" cy="18" r="2.5" />
          <circle {...strokeProps} cx="18" cy="18" r="2.5" />
          <path {...strokeProps} d="M10.8 7.2 7.2 15.8M13.2 7.2l3.6 8.6M8.5 18h7" />
        </svg>
      );
    case "crm":
      return (
        <svg {...common}>
          <path {...strokeProps} d="M3 6h18M3 12h18M3 18h18" />
          <circle {...strokeProps} cx="7" cy="6" r="1.5" fill="currentColor" stroke="none" />
          <circle {...strokeProps} cx="7" cy="12" r="1.5" fill="currentColor" stroke="none" />
          <circle {...strokeProps} cx="7" cy="18" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      );
    case "properties":
      return (
        <svg {...common}>
          <path {...strokeProps} d="M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M9 21v-4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4" />
          <path {...strokeProps} d="M9 7h6M9 11h6" />
        </svg>
      );
    case "leads":
      return (
        <svg {...common}>
          <path {...strokeProps} d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle {...strokeProps} cx="9" cy="7" r="4" />
          <path {...strokeProps} d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "visits":
      return (
        <svg {...common}>
          <path {...strokeProps} d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z" />
          <circle {...strokeProps} cx="12" cy="10" r="3" />
        </svg>
      );
    case "mandates":
      return (
        <svg {...common}>
          <path {...strokeProps} d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path {...strokeProps} d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
        </svg>
      );
    case "agenda":
      return (
        <svg {...common}>
          <rect {...strokeProps} x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <path {...strokeProps} d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      );
    case "home":
      return (
        <svg {...common}>
          <path {...strokeProps} d="M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
          <path {...strokeProps} d="M9 22V12h6v10" />
        </svg>
      );
    case "plus":
      return (
        <svg {...common}>
          <path {...strokeProps} d="M12 5v14M5 12h14" />
        </svg>
      );
    case "user":
      return (
        <svg {...common}>
          <circle {...strokeProps} cx="12" cy="8" r="4" />
          <path {...strokeProps} d="M4 21a8 8 0 0 1 16 0" />
        </svg>
      );
    case "chevron-down":
      return (
        <svg {...common}>
          <path {...strokeProps} d="m6 9 6 6 6-6" />
        </svg>
      );
    case "chevron-right":
      return (
        <svg {...common}>
          <path {...strokeProps} d="m9 18 6-6-6-6" />
        </svg>
      );
    default:
      return null;
  }
}
