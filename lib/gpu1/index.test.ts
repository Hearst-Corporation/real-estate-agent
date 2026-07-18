// lib/gpu1/index.test.ts — Usine getGpu1Admin() : configuration & garde null.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getGpu1Admin, __resetGpu1AdminForTests, Gpu1PostgrestClient } from "@/lib/gpu1";

const OLD_URL = process.env.GPU1_POSTGREST_URL;
const OLD_TOKEN = process.env.GPU1_POSTGREST_ADMIN_TOKEN;

beforeEach(() => {
  __resetGpu1AdminForTests();
  delete process.env.GPU1_POSTGREST_URL;
  delete process.env.GPU1_POSTGREST_ADMIN_TOKEN;
});

afterEach(() => {
  __resetGpu1AdminForTests();
  if (OLD_URL === undefined) delete process.env.GPU1_POSTGREST_URL;
  else process.env.GPU1_POSTGREST_URL = OLD_URL;
  if (OLD_TOKEN === undefined) delete process.env.GPU1_POSTGREST_ADMIN_TOKEN;
  else process.env.GPU1_POSTGREST_ADMIN_TOKEN = OLD_TOKEN;
});

describe("getGpu1Admin", () => {
  it("retourne null si URL absente (pas de fournisseur révélé)", () => {
    process.env.GPU1_POSTGREST_ADMIN_TOKEN = "token-1234567890-abcdefghij";
    expect(getGpu1Admin()).toBeNull();
  });

  it("retourne null si token absent", () => {
    process.env.GPU1_POSTGREST_URL = "https://db.example.test/rest/v1";
    expect(getGpu1Admin()).toBeNull();
  });

  it("retourne un client quand tout est configuré", () => {
    process.env.GPU1_POSTGREST_URL = "https://db.example.test/rest/v1";
    process.env.GPU1_POSTGREST_ADMIN_TOKEN = "token-1234567890-abcdefghij";
    const c = getGpu1Admin();
    expect(c).toBeInstanceOf(Gpu1PostgrestClient);
  });

  it("mémoïse le client (singleton)", () => {
    process.env.GPU1_POSTGREST_URL = "https://db.example.test/rest/v1";
    process.env.GPU1_POSTGREST_ADMIN_TOKEN = "token-1234567890-abcdefghij";
    expect(getGpu1Admin()).toBe(getGpu1Admin());
  });
});
