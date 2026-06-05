/**
 * lib/jobs/inngest/client.ts — Client Inngest (jobs asynchrones).
 *
 * inngestIsConfigured() : miroir de r2IsConfigured()/sentryIsConfigured().
 * Fail-soft : sans clés, les callers retombent sur le chemin synchrone.
 */

import { Inngest } from "inngest";

export const inngest = new Inngest({ id: "real-estate-agent" });

export function inngestIsConfigured(): boolean {
  return Boolean(process.env.INNGEST_SIGNING_KEY && process.env.INNGEST_EVENT_KEY);
}
