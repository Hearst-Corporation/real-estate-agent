/**
 * NAVIGATION — manifeste unique du cockpit.
 * =================================================================
 *
 * SOURCE DE VÉRITÉ de toute la navigation. Le rail gauche (RailLeft),
 * les onglets de sous-nav (PageNavTabs) et le typage des routes (AppRoute)
 * en dérivent. Ajouter une page = ajouter UNE entrée ici.
 *
 *   - `NAV`              : items du rail gauche + tabs (groupe "main").
 *   - `navRail`          : les 6 items affichés dans le rail (filtré de NAV).
 *   - `MOBILE_SHORTCUTS` : items de la bottom bar, dérivés du même manifeste.
 *   - `TAB_GROUPS`       : groupes d'onglets de sous-nav.
 *   - `AppRoute`         : union typée de toutes les routes connues.
 *
 * Le rendu ne doit jamais coder une route en dur : passer par ce fichier.
 */

import type { IconName } from "@/components/cockpit/Icon";
import { UI } from "@/lib/ui-strings";

/** Groupe visuel unique du rail gauche. */
export type NavGroup = "main";

/** Clé d'un groupe d'onglets de sous-nav. */
export type TabGroupKey = "portefeuille" | "clients";

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  group: NavGroup;
  /** Groupe d'onglets affiché en sous-nav de cette page (optionnel). */
  tabs?: TabGroupKey;
};

/**
 * Tous les items de navigation connus.
 * Les items sans `tabs` sont dans le rail direct.
 * Les items avec `tabs` partagés (ex: portefeuille) peuvent n'être affichés
 * que comme onglets et non comme entrée de rail directe.
 */
export const NAV = [
  { href: "/",            label: UI.nav.home,         icon: "home",       group: "main" },
  { href: "/prospection", label: UI.nav.prospection,  icon: "search",     group: "main" },
  { href: "/properties",  label: UI.nav.portefeuille, icon: "properties", group: "main", tabs: "portefeuille" },
  { href: "/estimations", label: UI.nav.estimations,  icon: "estimate",   group: "main", tabs: "portefeuille" },
  { href: "/mandates",    label: UI.nav.mandates,     icon: "mandates",   group: "main", tabs: "portefeuille" },
  { href: "/leads",       label: UI.nav.clients,      icon: "leads",      group: "main", tabs: "clients" },
  { href: "/visits",      label: UI.nav.visits,       icon: "visits",     group: "main", tabs: "clients" },
  { href: "/agenda",      label: UI.nav.agenda,       icon: "agenda",     group: "main" },
  { href: "/agents",      label: UI.nav.agents,       icon: "agents",     group: "main" },
] as const satisfies readonly NavItem[];

/** Alias complet du manifeste. */
export const navMain = NAV;

/** Les items affichés dans le rail gauche (entry points des groupes). */
// Nav principale AGENT immobilier : Dashboard, Prospection, Portefeuille
// (biens/estimations/mandats), Clients (leads/visites), Agenda, Agents (Aigent).
const RAIL_HREFS = ["/", "/prospection", "/properties", "/leads", "/agenda", "/agents"] as const;
export const navRail = NAV.filter((i) =>
  (RAIL_HREFS as readonly string[]).includes(i.href)
);

/** Raccourcis de la bottom bar mobile. */
export const MOBILE_SHORTCUTS = [
  ...navRail,
  { href: "/profile", label: UI.nav.profile, icon: "user", group: "main" },
] as const satisfies readonly NavItem[];

/**
 * Routes typées. Dérivées du manifeste + routes hors-rail connues.
 */
export type AppRoute =
  | (typeof NAV)[number]["href"]
  | (typeof MOBILE_SHORTCUTS)[number]["href"]
  | "/profile"
  | "/admin";

export type TabItem = { href: AppRoute; label: string };

/**
 * Groupes d'onglets de sous-nav.
 */
export const TAB_GROUPS: Record<TabGroupKey, readonly TabItem[]> = {
  portefeuille: [
    { href: "/properties",  label: UI.nav.properties },
    { href: "/estimations", label: UI.nav.estimations },
    { href: "/mandates",    label: UI.nav.mandates },
  ],
  clients: [
    { href: "/leads",  label: UI.nav.leads },
    { href: "/visits", label: UI.nav.visits },
  ],
};
