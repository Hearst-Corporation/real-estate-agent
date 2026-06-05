// ─── External API endpoints (frozen) ─────────────────────────────────────────

export const ENDPOINTS = Object.freeze({
  /** Géocodage primaire — BAN (Base Adresse Nationale) */
  BAN: 'https://api-adresse.data.gouv.fr/search/',

  /** Géocodage failover — Géoplateforme IGN */
  GEOCODEUR_FAILOVER: 'https://data.geopf.fr/geocodage/search/',

  /** Demandes de Valeurs Foncières */
  DVF: 'https://app.dvf.etalab.gouv.fr/api/mutations3',

  /** Cadastre parcellaire IGN */
  CADASTRE: 'https://apicarto.ign.fr/api/cadastre/parcelle',

  /** DPE ADEME data.gouv */
  ADEME: 'https://data.ademe.fr/data-fair/api/v1/datasets',
} as const);

export const ALLOWED_HOSTS = Object.freeze([
  'api-adresse.data.gouv.fr',
  'data.geopf.fr',
  'app.dvf.etalab.gouv.fr',
  'apicarto.ign.fr',
  'data.ademe.fr',
] as const);
