/**
 * Sous-layout de la section INVEST (Epic 0.4 — plateforme d'investissement
 * immobilier tokenisé). Applique l'accent produit GOLD à TOUTE la section via
 * `data-product="gold"` posé sur un wrapper (sélecteur d'attribut générique
 * défini dans app/cockpit.css). Aucune modification du switch global : les
 * autres sections (CRM/estimation, bordeaux) ne sont pas affectées.
 *
 * `display: contents` (.inv-section) → le wrapper ne casse pas le flux du
 * CockpitShell parent ; il ne sert qu'à porter l'attribut d'accent.
 */
export default function InvestLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-product="gold" className="inv-section">
      {children}
    </div>
  );
}
