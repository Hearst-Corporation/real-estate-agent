import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { enrichPerson as apolloEnrich, apolloIsConfigured } from "./apollo";
import { enrichPerson as pdlEnrich, pdlIsConfigured } from "./pdl";
import { ProviderUnavailableError } from "./types";

// Mapping des réponses providers → forme normalisée consommée par la route
// d'enrichissement. On mocke `fetch` global : aucune requête réseau réelle.

const realFetch = globalThis.fetch;

beforeEach(() => {
  process.env.APOLLO_API_KEY = "test-apollo-key";
  process.env.PDL_API_KEY = "test-pdl-key";
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

function mockFetch(status: number, jsonBody: unknown) {
  globalThis.fetch = vi.fn(
    async () =>
      new Response(JSON.stringify(jsonBody), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  ) as unknown as typeof fetch;
}

describe("apolloIsConfigured / pdlIsConfigured", () => {
  it("true quand la clé est présente", () => {
    expect(apolloIsConfigured()).toBe(true);
    expect(pdlIsConfigured()).toBe(true);
  });

  it("false quand la clé est absente", () => {
    delete process.env.APOLLO_API_KEY;
    delete process.env.PDL_API_KEY;
    expect(apolloIsConfigured()).toBe(false);
    expect(pdlIsConfigured()).toBe(false);
  });
});

describe("apolloEnrich — mapping", () => {
  it("mappe une personne trouvée vers la forme normalisée", async () => {
    mockFetch(200, {
      person: {
        name: "Tim Cook",
        title: "CEO",
        email: "tim@apple.com",
        organization: { name: "Apple" },
        linkedin_url: "https://linkedin.com/in/tim",
      },
    });
    const p = await apolloEnrich({ email: "tim@apple.com" });
    expect(p).toEqual({
      name: "Tim Cook",
      title: "CEO",
      email: "tim@apple.com",
      organizationName: "Apple",
      linkedinUrl: "https://linkedin.com/in/tim",
    });
  });

  it("renvoie null quand aucune personne (person absent)", async () => {
    mockFetch(200, {});
    expect(await apolloEnrich({ email: "x@y.com" })).toBeNull();
  });

  it("normalise les champs manquants en null", async () => {
    mockFetch(200, { person: { name: "Anon" } });
    const p = await apolloEnrich({ email: "a@b.com" });
    expect(p).toEqual({
      name: "Anon",
      title: null,
      email: null,
      organizationName: null,
      linkedinUrl: null,
    });
  });

  it("throw ProviderUnavailableError si clé absente", async () => {
    delete process.env.APOLLO_API_KEY;
    await expect(apolloEnrich({ email: "x@y.com" })).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );
  });
});

describe("pdlEnrich — mapping", () => {
  it("mappe une personne trouvée (status 200)", async () => {
    mockFetch(200, {
      status: 200,
      likelihood: 9,
      data: {
        full_name: "sean thorne",
        job_title: "Founder",
        job_company_name: "People Data Labs",
        linkedin_url: "linkedin.com/in/seanthorne",
      },
    });
    const p = await pdlEnrich({ email: "sean@pdl.com" });
    expect(p).toEqual({
      fullName: "sean thorne",
      jobTitle: "Founder",
      jobCompanyName: "People Data Labs",
      linkedinUrl: "linkedin.com/in/seanthorne",
      likelihood: 9,
    });
  });

  it("renvoie null sur 404 (no match — cas nominal)", async () => {
    mockFetch(404, { status: 404 });
    expect(await pdlEnrich({ email: "nobody@nowhere.com" })).toBeNull();
  });

  it("renvoie null quand status !== 200 dans le corps", async () => {
    mockFetch(200, { status: 400 });
    expect(await pdlEnrich({ email: "x@y.com" })).toBeNull();
  });

  it("throw ProviderUnavailableError si clé absente", async () => {
    delete process.env.PDL_API_KEY;
    await expect(pdlEnrich({ email: "x@y.com" })).rejects.toBeInstanceOf(ProviderUnavailableError);
  });
});
