/**
 * lib/providers/apollo.ts — Apollo.io people/contact enrichment (B2B).
 *
 * ⚠️ RGPD : Apollo est une base B2B. À n'utiliser que pour des contacts
 * professionnels (SCI, mandataires, agences) — JAMAIS pour profiler un
 * particulier vendeur/acheteur sans base légale. Le caller doit poser ce garde.
 *
 *   apolloIsConfigured()            → boolean
 *   enrichPerson({ email?, name?, domain? }) → ApolloPerson | null
 */

import { ProviderUnavailableError, envPresent, fetchJson } from "./types";

const ENDPOINT = "https://api.apollo.io/v1/people/match";

export interface ApolloPerson {
  name: string | null;
  title: string | null;
  email: string | null;
  organizationName: string | null;
  linkedinUrl: string | null;
}

export function apolloIsConfigured(): boolean {
  return envPresent("APOLLO_API_KEY");
}

/** Enrichit un contact pro. Renvoie null si pas de match. Throw si non configuré. */
export async function enrichPerson(params: {
  email?: string;
  firstName?: string;
  lastName?: string;
  domain?: string;
}): Promise<ApolloPerson | null> {
  if (!apolloIsConfigured()) throw new ProviderUnavailableError("apollo");

  const body = {
    api_key: process.env.APOLLO_API_KEY,
    email: params.email,
    first_name: params.firstName,
    last_name: params.lastName,
    organization_name: params.domain,
  };

  const data = await fetchJson<{ person?: Record<string, unknown> }>(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const p = data.person;
  if (!p) return null;

  return {
    name: (p.name as string) ?? null,
    title: (p.title as string) ?? null,
    email: (p.email as string) ?? null,
    organizationName:
      ((p.organization as Record<string, unknown> | undefined)?.name as string) ?? null,
    linkedinUrl: (p.linkedin_url as string) ?? null,
  };
}
