/**
 * Setup partagé des tests Vitest.
 * =================================================================
 *
 * S'exécute une fois PAR FICHIER de test (node comme jsdom). Il ne doit donc
 * RIEN casser pour les ~1100 tests de logique pure qui tournent en environnement
 * Node : tout ce qui touche au DOM est gardé derrière `typeof document`.
 *
 * Pour les tests de COMPOSANT (fichiers marqués `// @vitest-environment jsdom`) :
 *   - nettoyage automatique de l'arbre React monté après chaque test
 *     (évite les fuites de DOM d'un test à l'autre) ;
 *   - `IS_REACT_ACT_ENVIRONMENT` est posé par @testing-library/react lui-même.
 */

import { afterEach } from "vitest";

// Le nettoyage n'a de sens qu'en présence d'un DOM (environnement jsdom).
if (typeof document !== "undefined") {
  // Import dynamique : ne charge testing-library que dans les fichiers jsdom,
  // jamais dans les tests Node purs.
  const { cleanup } = await import("@testing-library/react");
  afterEach(() => cleanup());
}
