import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/session";
import { listAgents, runtimeAvailability } from "@/lib/aigent/runtime";
import { RUNTIME_PROJECT_KEY } from "@/lib/aigent/runtime-types";
import { AgentsCockpit, type AgentsInitial } from "./_components/AgentsCockpit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Page `/agents` — COCKPIT D'EXPLOITATION Aigent (jamais un constructeur).
 * =================================================================
 *
 * Registry-driven, honnête : lit l'état RÉEL du registre runtime côté serveur
 * (une seule requête, pas de flash client), puis délègue l'interactivité
 * (actualiser, lancer, suivre, valider HITL) au client. Ne fabrique JAMAIS
 * d'agent : l'état actuel du registre (vide / non connecté) est rendu tel quel.
 *
 * Cette page NE PERMET PAS de créer/éditer un agent, un prompt, un graphe ou un
 * node, ni de déployer/promouvoir/modifier le runtime — ces responsabilités
 * vivent exclusivement dans Aigent (voir la note « cockpit d'exploitation »).
 */
export default async function AgentsPage() {
  const claims = await getSession();
  if (!claims) redirect("/auth/login");

  const availability = runtimeAvailability();

  // Fetch serveur initial UNIQUEMENT si le registre est configuré — sinon on ne
  // fait aucune requête (état honnête « non connecté »).
  let initial: AgentsInitial;
  if (!availability.available) {
    initial = { kind: "unavailable", reason: availability.reason };
  } else {
    const result = await listAgents(RUNTIME_PROJECT_KEY);
    if (result.ok) {
      initial = { kind: "loaded", agents: result.data };
    } else if ("unavailable" in result) {
      initial = { kind: "unavailable", reason: result.unavailable.reason };
    } else {
      initial = { kind: "error" };
    }
  }

  return <AgentsCockpit initial={initial} />;
}
