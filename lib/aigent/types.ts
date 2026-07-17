/**
 * Frontière d'intégration Aigent — CONTRAT CONSOMMATEUR (types).
 * =================================================================
 *
 * Ce workspace (Real Estate Agent) est un **CONSOMMATEUR** d'agents : Aigent est
 * l'usine unique qui conçoit / teste / promeut / POUSSE les agents (copilotes IA
 * métier) dans le repo de ce workspace (`agents/<slug>/` + `agents/_registry.json`).
 * Ce repo ne fabrique JAMAIS d'agent, de graph LangGraph, de node ou de runtime.
 * Il les REÇOIT, les affiche, autorise leur activation, et les EXPLOITE en
 * lecture/lancement — rien de plus (cf. doctrine `/agent-intake`).
 *
 * Ces types décrivent le contrat tel qu'il sera consommé LE JOUR où Aigent sera
 * connecté. Tant qu'aucune config `AIGENT_*` (ou `GITHUB_TOKEN`+`GITHUB_REPO`)
 * n'existe, la frontière est en état **UNAVAILABLE** : aucun agent, run ou
 * résultat n'est jamais fabriqué (règle de vérité absolue du brief).
 *
 * Aucune valeur d'exemple ici — uniquement des formes de données.
 */

/** Statut de vérité d'une donnée exposée (cf. brief : jamais de faux « fonctionnel »). */
export type TruthStatus = "LIVE" | "SNAPSHOT" | "DEMO" | "FALLBACK" | "UNAVAILABLE";

/**
 * Raison pour laquelle la frontière est indisponible. `not_configured` = aucune
 * variable d'environnement Aigent présente (cas courant, honnête, non-erreur).
 */
export type AigentUnavailableReason =
  | "not_configured" // aucune config AIGENT_* — état normal tant que non branché
  | "unreachable" // config présente mais l'endpoint ne répond pas
  | "unauthorized" // config présente mais le token est refusé
  | "error"; // toute autre défaillance côté transport

/**
 * Une capacité qu'un agent Aigent expose au workspace consommateur. Read/launch
 * uniquement — jamais de composition, de choix de nodes, de déploiement.
 */
export interface AigentCapability {
  /** Identifiant machine stable de la capacité (ex. `qualify_lead`). */
  id: string;
  /** Libellé humain de la capacité. */
  label: string;
  /** Description courte de ce que la capacité produit pour l'agent immobilier. */
  description?: string;
  /**
   * `read` = observation seule · `launch` = déclenche une exécution autorisée.
   * Aucune valeur ici n'autorise à MODIFIER l'agent (frontière consommateur).
   */
  kind: "read" | "launch";
  /**
   * Vrai si le lancement de cette capacité exige une validation humaine (HITL)
   * avant de produire un effet — reflété par l'agent, jamais décidé ici.
   */
  requiresHumanApproval: boolean;
}

/**
 * Un agent (copilote IA métier) déployé depuis Aigent, tel que listé dans le
 * registre. Miroir de `agents/_registry.json` + `agents/<slug>/manifest.json`.
 */
export interface AigentAgent {
  /** Slug machine (dossier `agents/<slug>/`). */
  slug: string;
  /** Nom humain de l'agent. */
  name: string;
  /** Rôle / résumé du system prompt (jamais le prompt complet). */
  role?: string;
  /** Version sémantique déployée (le workspace ne bascule jamais tout seul). */
  version: string;
  /** Modèle sous-jacent, à titre informatif uniquement. */
  model?: string;
  /** Runtime déclaré (informatif — jamais reconstruit localement). */
  runtime?: string;
  /** Source de déploiement — toujours `aigent`. */
  source: "aigent";
  /** Horodatage ISO du push par Aigent. */
  pushedAt?: string;
  /** Capacités read/launch exposées par cet agent. */
  capabilities: AigentCapability[];
  /**
   * État côté flotte du workspace : un agent déployé n'est pas actif par défaut,
   * il attend une autorisation explicite (aucune auto-activation).
   */
  fleetState: "deployed" | "active" | "update_available";
}

/** État d'un run déclenché via une capacité `launch` (jamais fabriqué localement). */
export type AigentRunPhase =
  | "queued"
  | "running"
  | "awaiting_human" // interruption HITL — attend validation/refus humain
  | "succeeded"
  | "failed"
  | "cancelled";

export interface AigentRunState {
  /** Identifiant du run côté Aigent. */
  runId: string;
  /** Agent qui exécute. */
  agentSlug: string;
  /** Capacité déclenchée. */
  capabilityId: string;
  phase: AigentRunPhase;
  /** Progression 0–100 si l'agent la fournit. */
  progress?: number;
  /** Horodatage ISO de démarrage. */
  startedAt?: string;
  /** Horodatage ISO de fin (si terminé). */
  finishedAt?: string;
  /** Toujours `LIVE` pour un run réel — jamais `DEMO`/`SNAPSHOT` (pas de faux run). */
  truth: Extract<TruthStatus, "LIVE" | "FALLBACK">;
}

/** Une source citée par un résultat d'agent (provenance vérifiable, jamais inventée). */
export interface AigentResultSource {
  /** Libellé de la source (ex. table, annonce, comparable). */
  label: string;
  /** Référence machine (id/URL interne) permettant de remonter à la source. */
  ref?: string;
  /** Type de provenance de la donnée citée. */
  kind: "db_record" | "document" | "external_listing" | "computation";
}

/**
 * Résultat d'un run d'agent. TOUJOURS accompagné de sa provenance et de ses
 * sources : un résultat sans source citée n'est pas présentable (règle de vérité).
 */
export interface AigentResult {
  runId: string;
  agentSlug: string;
  /** Synthèse texte produite par l'agent. */
  summary: string;
  /** Provenance globale du résultat. */
  provenance: "agent_execution";
  /** Sources citées — au moins une, sinon le résultat n'est pas affiché comme fiable. */
  sources: AigentResultSource[];
  /** Vrai tant qu'une validation humaine est requise avant d'appliquer l'effet. */
  awaitingHumanApproval: boolean;
  /** Statut de vérité — `LIVE` pour un vrai résultat. */
  truth: Extract<TruthStatus, "LIVE">;
}

/**
 * Réponse de feature-detection de la frontière. `available:false` est un état
 * de PREMIÈRE CLASSE, honnête et attendu tant qu'Aigent n'est pas branché.
 */
export type AigentAvailability =
  | {
      available: false;
      reason: AigentUnavailableReason;
      /** Toujours `UNAVAILABLE` quand indisponible. */
      truth: Extract<TruthStatus, "UNAVAILABLE">;
    }
  | {
      available: true;
      /** Endpoint résolu (informatif, jamais un secret). */
      endpoint: string;
      /** `LIVE` uniquement quand une vraie connexion est établie. */
      truth: Extract<TruthStatus, "LIVE">;
    };

/**
 * Capacités PRÉVUES de la frontière consommateur, présentées en état désactivé
 * quand Aigent est indisponible. Aligné sur la doctrine `/agent-intake`
 * (déployé → activer → versionner) SANS jamais permettre de construire un agent.
 */
export type AigentPlannedCapabilityId =
  | "list_agents"
  | "launch_capability"
  | "observe_run"
  | "sourced_results"
  | "human_validation"
  | "resume_or_refuse"
  | "history";
