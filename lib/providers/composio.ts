/**
 * lib/providers/composio.ts — Tool router Composio (1500+ actions).
 *
 * Usage immo : automatiser relances leads (Gmail), RDV visites (Calendar),
 * sans recoder chaque intégration. Le client doit avoir un compte connecté.
 *
 *   composioIsConfigured() → boolean
 *   getComposio()          → Composio | null
 */

import { Composio } from "@composio/core";
import { envPresent } from "./types";

let client: Composio | null | undefined;

export function composioIsConfigured(): boolean {
  return envPresent("COMPOSIO_API_KEY");
}

export function getComposio(): Composio | null {
  if (client !== undefined) return client;
  client = composioIsConfigured()
    ? new Composio({ apiKey: process.env.COMPOSIO_API_KEY })
    : null;
  return client;
}
