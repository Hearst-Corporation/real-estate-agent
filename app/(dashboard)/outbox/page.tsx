/**
 * /outbox — Outbox de brouillons (W5).
 *
 * Liste owner-scopée des messages en attente. Aucun message ne part tant qu'un
 * humain ne l'a pas validé (draft → approved) puis envoyé, et seulement si le
 * canal est réellement configuré. Sinon état CONFIG honnête, jamais un faux 'sent'.
 *
 * La page dégrade proprement : DB absente → session absente → table non migrée
 * (unavailable) → aucun crash, message d'état explicite.
 */

import { Heading } from "@/components/ui/heading";
import { getSession } from "@/lib/server/session";
import { getGpu1Admin } from "@/lib/gpu1";
import { tenantOf } from "@/lib/tenant";
import { listDrafts } from "@/lib/outbox";
import { OutboxBoard, type DraftView } from "./_components/OutboxBoard";

export const dynamic = "force-dynamic";

export default async function OutboxPage() {
  const claims = await getSession();
  const db = getGpu1Admin();

  let drafts: DraftView[] = [];
  let unavailable = false;

  if (claims && db) {
    const res = await listDrafts(db, tenantOf(claims), claims.sub, { limit: 200 });
    if (res.ok) {
      drafts = res.drafts as DraftView[];
    } else if (res.reason === "unavailable") {
      unavailable = true;
    }
  } else if (!db) {
    // Base non configurée → même traitement honnête qu'un schéma absent.
    unavailable = true;
  }

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex flex-col gap-2 border-b border-zinc-950/10 pb-5 dark:border-white/10">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent-500 dark:text-accent-400">
          Communication
        </p>
        <Heading>Outbox</Heading>
        <p className="max-w-2xl text-sm text-zinc-500">
          Brouillons de messages clients. Rien ne part sans validation humaine — et seulement si le
          canal d&apos;envoi est réellement configuré.
        </p>
      </div>

      <OutboxBoard initial={drafts} unavailable={unavailable} />
    </div>
  );
}
