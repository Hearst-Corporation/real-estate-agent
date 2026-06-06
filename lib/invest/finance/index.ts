/**
 * MOTEUR FINANCIER — barrel d'export.
 *
 * Point d'entrée unique du domaine `07-moteur-financier`. Importer depuis ici :
 *
 *   import { buildDealSheet, RESIDENCE_HAUSSMANN } from '.../07-moteur-financier';
 *
 * Tout est PUR (aucun IO, aucun LLM, aucun réseau) et déterministe.
 *
 * Architecture (anti-FIA, étude `docs/etude-immobilier-tokenise-2026.md`) :
 *   - L'investisseur est CRÉANCIER obligataire (pas co-investisseur d'un pool).
 *   - 1 SPV = 1 opération ; pas de NAV globale, pas de rebalancing.
 *   - Distribution VARIABLE, jamais garantie.
 */

// Types & contrats de données (inclut les 11 graph contracts).
export * from './types';

// Primitives.
export * from './dates';
export * from './irr';
export * from './waterfall';
export * from './metrics';

// Scénarios & sensibilités.
export * from './scenarios';
export * from './cashflow-projection';

// Générateurs de graphiques.
export * from './charts';

// Orchestrateur racine.
export { buildDealSheet } from './deal-engine';

// Fixtures de référence (Résidence Haussmann, etc.).
export * from './fixtures';
