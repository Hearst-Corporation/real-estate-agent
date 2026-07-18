import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/session";
import { AssistantPanel } from "@/components/assistant/AssistantPanel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Page `/assistant` — ASSISTANT OPÉRATIONNEL (W9).
 *
 * Garde serveur (session obligatoire), puis délègue au panneau client qui
 * charge l'analyse via `/api/assistant-ops`. L'assistant ANALYSE les signaux
 * réels, PROPOSE la prochaine action et peut PRÉPARER un brouillon — il
 * n'exécute jamais d'action directe : toute communication reste un DRAFT
 * validé par un humain, toute mutation sensible passe par les Approbations.
 *
 * L'état de l'automatisation Aigent (LIVE / CONFIG / UNAVAILABLE) est rendu tel
 * quel : Aigent non branché n'empêche pas l'analyse locale et ne produit jamais
 * de faux agent ni de faux run.
 */
export default async function AssistantPage() {
  const claims = await getSession();
  if (!claims) redirect("/auth/login");

  return <AssistantPanel />;
}
