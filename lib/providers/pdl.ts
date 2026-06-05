/**
 * lib/providers/pdl.ts — People Data Labs enrichment.
 *
 * ⚠️ RGPD : même garde que Apollo. Usage pro uniquement, base légale requise.
 *
 *   pdlIsConfigured()        → boolean
 *   enrichPerson({ email?, profile? }) → PdlPerson | null
 */

import { ProviderUnavailableError, envPresent } from "./types";

const ENDPOINT = "https://api.peopledatalabs.com/v5/person/enrich";
const PDL_TIMEOUT_MS = 12_000;
// PDL likelihood scale is 1–10; 6 is the recommended minimum for production use.
const DEFAULT_MIN_LIKELIHOOD = 6;

export interface PdlPerson {
  fullName: string | null;
  jobTitle: string | null;
  jobCompanyName: string | null;
  linkedinUrl: string | null;
  likelihood: number | null;
}

export function pdlIsConfigured(): boolean {
  return envPresent("PDL_API_KEY");
}

/** Enrichit via email ou URL profil. Renvoie null si likelihood faible/no match. */
export async function enrichPerson(params: {
  email?: string;
  profile?: string;
  minLikelihood?: number;
}): Promise<PdlPerson | null> {
  if (!pdlIsConfigured()) throw new ProviderUnavailableError("pdl");

  const qs = new URLSearchParams();
  if (params.email) qs.set("email", params.email);
  if (params.profile) qs.set("profile", params.profile);
  qs.set("min_likelihood", String(params.minLikelihood ?? DEFAULT_MIN_LIKELIHOOD));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PDL_TIMEOUT_MS);

  try {
    const res = await fetch(`${ENDPOINT}?${qs.toString()}`, {
      headers: { "X-Api-Key": process.env.PDL_API_KEY! },
      signal: controller.signal,
    });

    // 404 = no match — cas nominal, pas une erreur
    if (res.status === 404) return null;

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `PDL HTTP ${res.status} — ${text.slice(0, 300)}`,
      );
    }

    const data = (await res.json()) as {
      status: number;
      likelihood?: number;
      data?: Record<string, unknown>;
    };

    if (data.status !== 200 || !data.data) return null;
    const d = data.data;

    return {
      fullName: (d.full_name as string) ?? null,
      jobTitle: (d.job_title as string) ?? null,
      jobCompanyName: (d.job_company_name as string) ?? null,
      linkedinUrl: (d.linkedin_url as string) ?? null,
      likelihood: data.likelihood ?? null,
    };
  } finally {
    clearTimeout(timer);
  }
}
