/**
 * NAVIGATION — manifeste unique du cockpit.
 * =================================================================
 *
 * SOURCE DE VÉRITÉ de toute la navigation. Le rail gauche (RailLeft),
 * la sous-nav (SubNav / PageNavTabs) et le typage des routes (AppRoute)
 * en dérivent. Ajouter une page = ajouter UNE entrée ici.
 *
 *   - `NAV`              : items du rail gauche + tabs (groupe "main").
 *   - `navRail`          : les 6 items affichés dans le rail (filtré de NAV).
 *   - `MOBILE_SHORTCUTS` : items de la bottom bar, dérivés du même manifeste.
 *   - `TAB_GROUPS`       : groupes d'onglets de sous-nav.
 *   - `tabGroupFor()`    : résout le groupe d'onglets d'un pathname.
 *   - `AppRoute`         : union typée de toutes les routes connues.
 *
 * RÈGLE DE STRUCTURE — le rail ne grossit PAS. Toute surface nouvelle rejoint
 * le GROUPE de travail auquel elle appartient (`tabs`), et devient accessible
 * par la sous-nav de ce groupe. Le rail ne porte que les 6 points d'entrée.
 *
 * Le rendu ne doit jamais coder une route en dur : passer par ce fichier.
 */

import type { IconName } from "@/components/cockpit/Icon";
import { UI } from "@/lib/ui-strings";

/** Groupe visuel unique du rail gauche. */
export type NavGroup = "main";

/**
 * Clé d'un groupe d'onglets de sous-nav.
 * Un groupe = UN travail utilisateur, plusieurs surfaces.
 */
export type TabGroupKey =
  | "pilotage"
  | "prospection"
  | "portefeuille"
  | "clients"
  | "agents";

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
 * Les items sans `tabs` sont autonomes (rail direct, aucune sous-nav).
 * Les items d'un même `tabs` partagent une sous-nav : seul le PREMIER de chaque
 * groupe est un point d'entrée du rail, les autres s'atteignent par les onglets.
 */
export const NAV = [
  // ── Pilotage : ce qu'il faut faire aujourd'hui, et ce qui part. ───────────
  { href: "/",                label: UI.nav.home,         icon: "home",       group: "main", tabs: "pilotage" },
  { href: "/action-center",   label: UI.nav.actionCenter, icon: "agenda",     group: "main", tabs: "pilotage" },
  { href: "/outbox",          label: UI.nav.outbox,       icon: "network",    group: "main", tabs: "pilotage" },
  { href: "/conversion",      label: UI.nav.conversion,   icon: "estimate",   group: "main", tabs: "pilotage" },

  // ── Prospection : trouver du bien et du preneur. ──────────────────────────
  { href: "/prospection",     label: UI.nav.prospection,  icon: "search",     group: "main", tabs: "prospection" },
  { href: "/radar",           label: UI.nav.radar,        icon: "search",     group: "main", tabs: "prospection" },
  { href: "/offmarket",       label: UI.nav.offmarket,    icon: "network",    group: "main", tabs: "prospection" },

  // ── Portefeuille : le stock et sa valeur. ─────────────────────────────────
  { href: "/properties",      label: UI.nav.portefeuille, icon: "properties", group: "main", tabs: "portefeuille" },
  { href: "/estimations",     label: UI.nav.estimations,  icon: "estimate",   group: "main", tabs: "portefeuille" },
  { href: "/mandates",        label: UI.nav.mandates,     icon: "mandates",   group: "main", tabs: "portefeuille" },
  { href: "/mandate-renewal", label: UI.nav.renewal,      icon: "mandates",   group: "main", tabs: "portefeuille" },

  // ── Clients : les gens et le temps qu'on leur donne. ──────────────────────
  { href: "/leads",           label: UI.nav.clients,      icon: "leads",      group: "main", tabs: "clients" },
  { href: "/visits",          label: UI.nav.visits,       icon: "visits",     group: "main", tabs: "clients" },
  { href: "/reactivation",    label: UI.nav.reactivation, icon: "leads",      group: "main", tabs: "clients" },

  // ── Agenda : autonome, aucun groupe. ──────────────────────────────────────
  { href: "/agenda",          label: UI.nav.agenda,       icon: "agenda",     group: "main" },

  // ── Agents : ce que l'automatisation propose, et ce qu'on valide. ─────────
  { href: "/agents",          label: UI.nav.agents,       icon: "agents",     group: "main", tabs: "agents" },
  { href: "/assistant",       label: UI.nav.assistant,    icon: "agents",     group: "main", tabs: "agents" },
  { href: "/approvals",       label: UI.nav.approvals,    icon: "agents",     group: "main", tabs: "agents" },
] as const satisfies readonly NavItem[];

/** Alias complet du manifeste. */
export const navMain = NAV;

/** Les items affichés dans le rail gauche (points d'entrée des groupes). */
// Nav principale AGENT immobilier : Accueil (pilotage), Prospection, Portefeuille
// (biens/estimations/mandats/renouvellements), Clients (leads/visites/réactivation),
// Agenda, Agents (Aigent/assistant/approbations).
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
 * Groupes d'onglets de sous-nav — DÉRIVÉS de NAV (aucune liste parallèle à
 * maintenir : ajouter un `tabs` à une entrée NAV suffit à la faire apparaître).
 * Le libellé d'onglet reprend celui du manifeste, sauf `/properties` dont
 * l'entrée de rail s'appelle « Portefeuille » et l'onglet « Biens ».
 */
const TAB_LABEL_OVERRIDES: Record<string, string> = {
  "/properties": UI.nav.properties,
  "/leads": UI.nav.leads,
};

function buildTabGroups(): Record<TabGroupKey, readonly TabItem[]> {
  const groups = {} as Record<TabGroupKey, TabItem[]>;
  for (const item of NAV) {
    if (!("tabs" in item) || !item.tabs) continue;
    const key = item.tabs as TabGroupKey;
    (groups[key] ??= []).push({
      href: item.href as AppRoute,
      label: TAB_LABEL_OVERRIDES[item.href] ?? item.label,
    });
  }
  return groups;
}

export const TAB_GROUPS: Record<TabGroupKey, readonly TabItem[]> = buildTabGroups();

/**
 * Résout le groupe d'onglets d'un pathname (match du href le plus long).
 * `/properties/<id>` → groupe "portefeuille". `/` → "pilotage" (exact only).
 * Renvoie `null` si la route n'appartient à aucun groupe (ex. `/agenda`).
 */
export function tabGroupFor(pathname: string): readonly TabItem[] | null {
  let best: { href: string; tabs: TabGroupKey } | null = null;
  for (const item of NAV) {
    if (!("tabs" in item) || !item.tabs) continue;
    const match =
      item.href === "/"
        ? pathname === "/"
        : pathname === item.href || pathname.startsWith(item.href + "/");
    if (!match) continue;
    if (!best || item.href.length > best.href.length) {
      best = { href: item.href, tabs: item.tabs as TabGroupKey };
    }
  }
  if (!best) return null;
  const group = TAB_GROUPS[best.tabs];
  return group && group.length > 1 ? group : null;
}
