// Poids du moteur de matching acquéreur (0-100 final)
export const MATCH_WEIGHTS = {
  zone: 40,        // code postal dans la liste demandée
  budget: 20,      // prix dans la fourchette
  surface: 15,     // surface dans la fourchette
  pieces: 10,      // pièces dans la fourchette
  typeBien: 10,    // type de bien match
  confort: 5,      // bonus confort souples (cap +10 pts via extra)
} as const;

export const DPE_ORDER = ["A","B","C","D","E","F","G"] as const;
