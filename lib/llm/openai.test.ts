import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  normalizeOpenAiError,
  openaiIsConfigured,
  OpenAiError,
  openAiErrorMessage,
  shouldFallback,
} from "./openai";

const ORIGINAL_KEY = process.env.OPENAI_API_KEY;

describe("openaiIsConfigured", () => {
  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
  });
  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = ORIGINAL_KEY;
  });

  it("true quand la clé est présente", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    expect(openaiIsConfigured()).toBe(true);
  });

  it("false quand la clé est absente", () => {
    expect(openaiIsConfigured()).toBe(false);
  });

  it("false sur clé vide", () => {
    process.env.OPENAI_API_KEY = "";
    expect(openaiIsConfigured()).toBe(false);
  });
});

describe("normalizeOpenAiError", () => {
  it("401/403 → invalid_key", () => {
    expect(normalizeOpenAiError({ status: 401 }).code).toBe("invalid_key");
    expect(normalizeOpenAiError({ status: 403 }).code).toBe("invalid_key");
  });

  it("429 insufficient_quota → quota", () => {
    expect(normalizeOpenAiError({ status: 429, code: "insufficient_quota" }).code).toBe("quota");
  });

  it("429 générique → rate_limit", () => {
    expect(normalizeOpenAiError({ status: 429 }).code).toBe("rate_limit");
  });

  it("404 → model_unavailable", () => {
    expect(normalizeOpenAiError({ status: 404 }).code).toBe("model_unavailable");
  });

  it("AbortError → aborted", () => {
    const e = new Error("stop");
    e.name = "AbortError";
    expect(normalizeOpenAiError(e).code).toBe("aborted");
  });

  it("timeout SDK → timeout", () => {
    const e = new Error("timed out");
    e.name = "APIConnectionTimeoutError";
    expect(normalizeOpenAiError(e).code).toBe("timeout");
  });

  it("erreur inconnue → unknown", () => {
    expect(normalizeOpenAiError(new Error("boom")).code).toBe("unknown");
  });

  it("préserve un OpenAiError existant", () => {
    const e = new OpenAiError("missing_key");
    expect(normalizeOpenAiError(e)).toBe(e);
  });

  it("ne fuite jamais le message brut du provider", () => {
    const norm = normalizeOpenAiError({ status: 401, message: "sk-secret-leaked-in-message" });
    expect(openAiErrorMessage(norm.code)).not.toContain("sk-secret");
  });
});

describe("shouldFallback", () => {
  it("bascule sur indispo / rate-limit / timeout", () => {
    expect(shouldFallback("model_unavailable")).toBe(true);
    expect(shouldFallback("rate_limit")).toBe(true);
    expect(shouldFallback("timeout")).toBe(true);
  });
  it("ne bascule pas sur clé absente / quota / abort", () => {
    expect(shouldFallback("missing_key")).toBe(false);
    expect(shouldFallback("quota")).toBe(false);
    expect(shouldFallback("aborted")).toBe(false);
  });
});
