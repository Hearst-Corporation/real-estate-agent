/**
 * Registre RUNTIME Aigent — CONTRAT CONSOMMATEUR (types, direction OUTBOUND).
 * =================================================================
 *
 * Distinct de la gateway INBOUND (`lib/agent-gateway/**`, Aigent → Real Estate
 * Agent). Ici la direction est OUTBOUND : Real Estate Agent (runtime consommateur
 * déployé, `projectKey = "real-estate-agent"`) interroge le registre runtime v1
 * d'Aigent (`/api/runtime/v1/**`) pour :
 *   - lister les agents PUBLIÉS / matérialisés du projet,
 *   - lancer un run autorisé,
 *   - suivre son état (queued/running/waiting_on_input/completed/failed),
 *   - lire ses événements ordonnés,
 *   - reprendre une interruption HITL (resume avec décision humaine).
 *
 * Ce module ne FABRIQUE JAMAIS d'agent, de graph, de node, de run ni de résultat.
 * Il propage tel quel l'état réel du registre (vide / 404 / unavailable). Tant que
 * `AIGENT_RUNTIME_BASE_URL` + `AIGENT_RUNTIME_TOKEN` sont absents, la frontière est
 * `unavailable` et AUCUNE requête réseau n'est émise (état honnête, attendu).
 *
 * Formes alignées sur `AIGENT_RUNTIME_CONTRACT.md` (§5, §7, §10, §12).
 * Aucune valeur d'exemple ici — uniquement des formes de données.
 */

/** projectKey figé de ce workspace consommateur (segment d'URL du contrat §2). */
export const RUNTIME_PROJECT_KEY = "real-estate-agent" as const;

/**
 * Statut de version d'un agent publié (`PublishedAgent.status`, contrat §5).
 * Le registre ne renvoie QUE des agents matérialisés — un agent au stade
 * `specification` côté Aigent n'apparaît pas tant qu'il n'a pas de ligne réelle.
 */
export type PublishedAgentStatus =
  | "specification" // contrat défini, rien de matérialisé
  | "draft" // en construction, non testé
  | "testing" // bench/tests en cours, pas de trafic réel
  | "production" // sert du trafic réel
  | "paused" // existait en prod, désactivé temporairement
  | "unavailable"; // ne peut pas être exécuté (config/dépendance)

/**
 * État d'un run runtime (`RuntimeRun.status`, contrat §7). `waiting_on_input` =
 * interruption HITL : le graphe attend une décision humaine (resume).
 */
export type RuntimeRunStatus =
  | "queued"
  | "running"
  | "waiting_on_input"
  | "completed"
  | "failed"
  /** Run interrompu (refus HITL / annulation). Terminal, comme completed/failed. */
  | "cancelled";

/** Corps d'erreur structuré d'un run échoué (`RuntimeRun.error`, contrat §10). */
export interface RuntimeErrorBody {
  code: string;
  message: string;
  requestId?: string;
}

/**
 * Un agent publié par Aigent pour ce projet (contrat §5, §12). Miroir de
 * `PublishedAgent` côté registre. Aucun champ n'est inventé côté consommateur.
 */
export interface PublishedAgent {
  id: string;
  projectKey: string;
  name: string;
  status: PublishedAgentStatus;
  /** Version sémantique publiée (informatif — le consommateur ne bascule pas seul). */
  version?: string;
  /** Résumé du rôle / de la mission (jamais le system prompt complet). */
  description?: string;
  /** Capacités déclarées, à titre informatif (le registre reste la source). */
  capabilities?: string[];
  /** Modèle sous-jacent, informatif. */
  model?: string;
  /** Vrai si l'agent peut atteindre un point de confirmation HITL. */
  requiresHumanApproval?: boolean;
  /** Horodatage ISO de publication. */
  publishedAt?: string;
}

/**
 * Un événement ordonné du flux d'un run (`RuntimeRunEvent`, contrat §6/§7).
 * `data` est OPAQUE au contrat générique — sa forme dépend de l'agent. On ne
 * l'interprète jamais côté consommateur (pas de rendu de champ inventé).
 */
export interface RuntimeRunEvent {
  /** Numéro de séquence croissant (curseur de polling `?after=`). */
  sequence: number;
  /** Type d'événement déclaré par l'agent (opaque). */
  type: string;
  /** Horodatage ISO de l'événement. */
  at?: string;
  /** Charge utile opaque — jamais interprétée génériquement. */
  data?: unknown;
}

/**
 * Un run runtime (`RuntimeRun`, contrat §7/§10). `output`/`error` ne portent une
 * valeur qu'aux états terminaux correspondants. `output` est opaque (dépend de
 * l'`outputSchema` de l'agent, validé côté producteur — jamais ici).
 */
export interface RuntimeRun {
  id: string;
  projectKey: string;
  agentId: string;
  status: RuntimeRunStatus;
  /** Corrélation incident inter-logs (contrat §3). */
  requestId?: string;
  /** Clé d'idempotence utilisée à la création (contrat §4). */
  idempotencyKey?: string;
  createdAt?: string;
  updatedAt?: string;
  /** Résultat structuré, présent uniquement si `status === "completed"`. */
  output?: unknown;
  /** Erreur structurée, présente uniquement si `status === "failed"`. */
  error?: RuntimeErrorBody;
}

/**
 * Décision humaine transmise à `POST /runs/:runId/resume` pour reprendre un run
 * `waiting_on_input` (contrat §7). Forme volontairement minimale et générique :
 * approuver / modifier / refuser, avec une charge utile opaque optionnelle.
 */
export interface RuntimeResumeDecision {
  /** `approve` reprend tel quel · `modify` reprend avec `payload` · `reject` interrompt. */
  action: "approve" | "modify" | "reject";
  /** Charge utile opaque de la décision (ex. paramètres modifiés). */
  payload?: unknown;
  /** Motif humain (audit) — jamais de PII inventée. */
  reason?: string;
}

/**
 * Raison pour laquelle la frontière runtime est indisponible sans erreur réelle.
 * `not_configured` = vars `AIGENT_RUNTIME_*` absentes (cas courant, honnête).
 */
export type RuntimeUnavailableReason =
  | "not_configured" // vars absentes — aucune requête émise
  | "unreachable" // config présente, endpoint ne répond pas
  | "unauthorized" // token refusé (401/403)
  | "not_provisioned" // registre configuré mais pas encore branché (503 côté Aigent)
  | "error"; // toute autre défaillance transport

/**
 * Résultat feature-detection de la frontière runtime. `available:false` est un
 * état de PREMIÈRE CLASSE, honnête et attendu tant qu'Aigent n'est pas branché.
 */
export type RuntimeAvailability =
  | { available: false; reason: RuntimeUnavailableReason }
  | { available: true };

/**
 * Enveloppe de retour uniforme des appels client. Discrimine sur `ok` : un appel
 * réussi porte `data`, un appel indisponible porte `unavailable` (jamais un
 * throw non géré — la page ne doit jamais casser à cause du registre).
 */
export type RuntimeResult<T> =
  | { ok: true; data: T }
  | { ok: false; unavailable: RuntimeAvailability & { available: false } }
  | { ok: false; notFound: true }
  | { ok: false; conflict: true } // 409 — resume hors état waiting_on_input
  | { ok: false; error: string };

/** Réponse `GET /projects/:projectKey/agents` (contrat §12). */
export interface ListAgentsResponse {
  agents: PublishedAgent[];
}

/** Réponse `GET /runs/:runId/events` (contrat §6). */
export interface ListRunEventsResponse {
  events: RuntimeRunEvent[];
}
