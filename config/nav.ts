/**
 * NAVIGATION — manifeste unique du cockpit.
 * =================================================================
 *
 * SOURCE DE VÉRITÉ de toute la navigation. Le rail gauche (RailLeft),
 * les onglets de sous-nav (PageNavTabs) et le typage des routes (AppRoute)
 * en dérivent. Ajouter une page = ajouter UNE entrée ici.
 *
 *   - `NAV`         : items du rail gauche (groupes "primary" + "crm").
 *   - `TAB_GROUPS`  : groupes d'onglets de sous-nav, partagés entre pages
 *                     (fini la duplication de `CRM_TABS` dans chaque page).
 *   - `AppRoute`    : union typée de toutes les routes connues → un href
 *                     fautif casse `tsc` au lieu de partir en prod.
 *
 * Le rendu ne doit jamais coder une route en dur : passer par ce fichier.
 */

import type { IconName } from "@/components/cockpit/Icon";
import { UI } from "@/lib/ui-strings";

/** Groupes visuels du rail gauche. */
export type NavGroup = "primary" | "crm";

/** Clé d'un groupe d'onglets de sous-nav. */
export type TabGroupKey = "crm" | "swarms";

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  group: NavGroup;
  /** Groupe d'onglets affiché en sous-nav de cette page (optionnel). */
  tabs?: TabGroupKey;
};

/**
 * Items du rail gauche, dans l'ordre d'affichage.
 * `as const satisfies` : garde les littéraux (pour AppRoute) ET valide la forme.
 */
export const NAV = [
  { href: "/missions", label: UI.nav.missions, icon: "network", group: "primary" },
  { href: "/estimations", label: UI.nav.estimations, icon: "estimate", group: "primary" },
  { href: "/prospection", label: UI.nav.prospection, icon: "search", group: "primary" },
  { href: "/swarms", label: UI.nav.swarms, icon: "network", group: "primary", tabs: "swarms" },
  { href: "/properties", label: UI.nav.properties, icon: "properties", group: "crm", tabs: "crm" },
  { href: "/leads", label: UI.nav.leads, icon: "leads", group: "crm", tabs: "crm" },
  { href: "/visits", label: UI.nav.visits, icon: "visits", group: "crm", tabs: "crm" },
  { href: "/mandates", label: UI.nav.mandates, icon: "mandates", group: "crm", tabs: "crm" },
  { href: "/agenda", label: UI.nav.agenda, icon: "agenda", group: "crm", tabs: "crm" },
] as const satisfies readonly NavItem[];

/** Sélecteurs de groupe (rail). */
export const navPrimary = NAV.filter((i) => i.group === "primary");
export const navCrm = NAV.filter((i) => i.group === "crm");

/** Item-cible du raccourci "CRM" du rail (premier de son groupe). */
export const CRM_ENTRY = navCrm[0];

/**
 * Routes typées. Dérivées du manifeste (rail) + routes hors-rail connues
 * (racine, profil, admin, invest, sous-routes swarms). Ajouter une route
 * hors-rail ici pour qu'un `<Link href>` typé l'accepte.
 */
export type AppRoute =
  | (typeof NAV)[number]["href"]
  | "/"
  | "/profile"
  | "/admin"
  | "/invest"
  | "/swarms/analytics"
  | "/swarms/prospection";

export type TabItem = { href: AppRoute; label: string };

/**
 * Groupes d'onglets de sous-nav. `crm` est dérivé de NAV (mêmes pages que le
 * groupe rail). `swarms` ajoute des sous-routes absentes du rail.
 */
export const TAB_GROUPS: Record<TabGroupKey, readonly TabItem[]> = {
  crm: navCrm.map((i) => ({ href: i.href, label: i.label })),
  swarms: [
    { href: "/swarms", label: "Tous les agents" },
    { href: "/swarms/analytics", label: "Analytique" },
    { href: "/swarms/prospection", label: "Prospection" },
  ],
};
