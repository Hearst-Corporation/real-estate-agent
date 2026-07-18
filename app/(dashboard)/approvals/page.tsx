import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/session";
import { getGpu1Admin } from "@/lib/gpu1";
import { tenantOf } from "@/lib/tenant";
import { listApprovals } from "@/lib/approvals/db";
import { ApprovalsInbox, type ApprovalsInitial } from "./_components/ApprovalsInbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INITIAL_LIMIT = 100;

/**
 * Page `/approvals` — BOÎTE D'APPROBATION HUMAINE (HITL).
 * =================================================================
 * L'humain du tenant voit les actions d'agents EN ATTENTE (pending) et tranche
 * approve / reject. La décision est PERSISTÉE (pending → approved/rejected) ;
 * l'action elle-même n'est JAMAIS exécutée ici — la gateway consomme une
 * approbation plus tard. Fetch serveur initial (pas de flash), état honnête :
 * DB absente / table non déployée → UNAVAILABLE, jamais de fausse approbation.
 */
export default async function ApprovalsPage() {
  const claims = await getSession();
  if (!claims) redirect("/auth/login");

  let initial: ApprovalsInitial;
  const db = getGpu1Admin();
  if (!db) {
    initial = { kind: "unavailable" };
  } else {
    const result = await listApprovals(db, tenantOf(claims), "pending", INITIAL_LIMIT);
    initial = result.ok
      ? { kind: "loaded", rows: result.rows }
      : { kind: "unavailable" };
  }

  return <ApprovalsInbox initial={initial} />;
}
