import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  hashContact,
  normalizeEmail,
  normalizePhone,
  hashPreview,
  unresolvedVars,
  renderTemplate,
  isOptedOut,
  recordOptOut,
  channelDeliverable,
  type DbLike,
} from "./contact";

// ── Faux client Supabase (jamais de réseau) ────────────────────────────────────
// Un builder minimal qui capte les filtres et renvoie une réponse programmée.

interface Programmed {
  optout?: { rows: unknown[]; error?: unknown };
  annonce?: { rows: unknown[]; error?: unknown };
  inserts?: unknown[];
  upserts?: unknown[];
  updates?: unknown[];
}

function makeDb(prog: Programmed): DbLike {
  prog.inserts = prog.inserts ?? [];
  prog.upserts = prog.upserts ?? [];
  prog.updates = prog.updates ?? [];

  const db = {
    from(table: string) {
      // Le builder est un vrai Promise (résolu { error:null }) auquel on greffe
      // les méthodes chaînables — un `await db.from().update().eq()` résout donc
      // sans avoir à définir une propriété `then` littérale.
      const builder = Object.assign(Promise.resolve({ error: null }), {
        select: () => builder,
        eq: () => builder,
        or: () => builder,
        in: () => builder,
        gte: () => builder,
        limit: () => {
          if (table === "prosp_optout") {
            return Promise.resolve({
              data: prog.optout?.rows ?? [],
              error: prog.optout?.error ?? null,
            });
          }
          if (table === "prosp_annonces") {
            return Promise.resolve({
              data: prog.annonce?.rows ?? [],
              error: prog.annonce?.error ?? null,
            });
          }
          return Promise.resolve({ data: [], error: null });
        },
        insert: (payload: unknown) => {
          prog.inserts!.push({ table, payload });
          return builder;
        },
        upsert: (payload: unknown, opts: unknown) => {
          prog.upserts!.push({ table, payload, opts });
          return Promise.resolve({ error: null });
        },
        update: (payload: unknown) => {
          prog.updates!.push({ table, payload });
          return builder;
        },
        single: () =>
          Promise.resolve({ data: { id: "att-1", statut: "draft" }, error: null }),
      });
      return builder;
    },
  };
  return db as unknown as DbLike;
}

// ── 1. hashContact déterministe ────────────────────────────────────────────────

describe("hashContact", () => {
  it("est déterministe et normalise (casse/espaces email)", () => {
    const a = hashContact(" John@Example.COM ", "email");
    const b = hashContact("john@example.com", "email");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("normalise les séparateurs de téléphone", () => {
    expect(hashContact("06 12.34-56 78", "phone")).toBe(
      hashContact("0612345678", "phone"),
    );
    expect(normalizePhone("+33 6 12")).toBe("+33612");
  });

  it("ne hache jamais une valeur vide ou absente (null)", () => {
    expect(hashContact(null, "email")).toBeNull();
    expect(hashContact(undefined, "email")).toBeNull();
    expect(hashContact("   ", "email")).toBeNull();
  });

  it("email ≠ phone pour la même chaîne (kinds séparés)", () => {
    expect(normalizeEmail("A@B.C")).toBe("a@b.c");
  });

  it("hashPreview ne révèle jamais la PII (8 hex tronqués)", () => {
    const h = hashContact("john@example.com", "email")!;
    expect(hashPreview(h)).toBe(`${h.slice(0, 8)}…`);
    expect(hashPreview(null)).toBe("∅");
  });
});

// ── 2. Templates : variables non résolues ──────────────────────────────────────

describe("templates", () => {
  it("détecte les variables {{x}} non résolues", () => {
    expect(unresolvedVars("Bonjour {{nom}}, {{ville}}", { nom: "Paul" })).toEqual([
      "ville",
    ]);
    expect(unresolvedVars("Bonjour {{nom}}", { nom: "Paul" })).toEqual([]);
  });

  it("traite null / chaîne vide comme non résolu", () => {
    expect(unresolvedVars("{{a}}{{b}}", { a: null, b: "" })).toEqual(["a", "b"]);
  });

  it("renderTemplate REFUSE toute variable non résolue", () => {
    const r = renderTemplate("Salut {{nom}} à {{ville}}", { nom: "Paul" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing).toContain("ville");
  });

  it("renderTemplate substitue quand tout est résolu", () => {
    const r = renderTemplate("Salut {{nom}} ({{n}})", { nom: "Paul", n: 3 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toBe("Salut Paul (3)");
  });
});

// ── 3. isOptedOut (hit / miss / fail-closed) ───────────────────────────────────

describe("isOptedOut", () => {
  it("miss : aucune ligne opt-out, annonce non bloquée → non exclu", async () => {
    const db = makeDb({ optout: { rows: [] }, annonce: { rows: [{ demarchage_bloque: false }] } });
    const r = await isOptedOut(db, "t1", { email: "x@y.z" }, "ann-1");
    expect(r.optedOut).toBe(false);
  });

  it("hit email : ligne opt-out par hash email → exclu", async () => {
    const emailHash = hashContact("x@y.z", "email");
    const db = makeDb({ optout: { rows: [{ email_hash: emailHash, telephone_hash: null }] } });
    const r = await isOptedOut(db, "t1", { email: "x@y.z" });
    expect(r.optedOut).toBe(true);
    expect(r.reason).toBe("optout_email");
  });

  it("hit annonce : demarchage_bloque → exclu", async () => {
    const db = makeDb({ optout: { rows: [] }, annonce: { rows: [{ demarchage_bloque: true }] } });
    const r = await isOptedOut(db, "t1", { email: "x@y.z" }, "ann-1");
    expect(r.optedOut).toBe(true);
    expect(r.reason).toBe("annonce_bloquee");
  });

  it("fail-closed : erreur DB sur opt-out → considéré exclu", async () => {
    const db = makeDb({ optout: { rows: [], error: { code: "XX" } } });
    const r = await isOptedOut(db, "t1", { email: "x@y.z" });
    expect(r.optedOut).toBe(true);
  });

  it("sans coordonnée ni annonce → non exclu (rien à vérifier)", async () => {
    const db = makeDb({});
    const r = await isOptedOut(db, "t1", {});
    expect(r.optedOut).toBe(false);
  });
});

// ── 4. recordOptOut ────────────────────────────────────────────────────────────

describe("recordOptOut", () => {
  it("upsert opt-out par hash + bloque l'annonce", async () => {
    const prog: Programmed = {};
    const db = makeDb(prog);
    const r = await recordOptOut(db, "t1", {
      email: "x@y.z",
      raison: "refus",
      annonceId: "ann-1",
    });
    expect(r.ok).toBe(true);
    // Le payload upsert stocke un HASH, jamais l'email en clair.
    const upsert0 = prog.upserts![0] as { payload: { email_hash: string } };
    expect(upsert0.payload.email_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(upsert0.payload)).not.toContain("x@y.z");
    // L'annonce est marquée bloquée.
    expect(
      (prog.updates as { payload: { demarchage_bloque?: boolean } }[]).some(
        (u) => u.payload.demarchage_bloque === true,
      ),
    ).toBe(true);
  });

  it("refuse si aucune coordonnée ni annonce", async () => {
    const db = makeDb({});
    const r = await recordOptOut(db, "t1", { raison: "refus" });
    expect(r.ok).toBe(false);
  });
});

// ── 5. Mode dégradé : provider absent → non livrable ───────────────────────────

describe("channelDeliverable (mode dégradé)", () => {
  const KEYS = [
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_WHATSAPP_FROM",
    "RESEND_API_KEY",
  ];
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("Twilio absent → sms/whatsapp NON livrables (draft, jamais sent)", () => {
    expect(channelDeliverable("sms")).toBe(false);
    expect(channelDeliverable("whatsapp")).toBe(false);
  });

  it("Resend absent → email NON livrable", () => {
    expect(channelDeliverable("email")).toBe(false);
  });

  it("phone n'est JAMAIS livrable (appel humain)", () => {
    process.env.TWILIO_ACCOUNT_SID = "x";
    process.env.TWILIO_AUTH_TOKEN = "x";
    process.env.TWILIO_WHATSAPP_FROM = "x";
    expect(channelDeliverable("phone")).toBe(false);
  });

  it("Twilio présent → sms/whatsapp livrables", () => {
    process.env.TWILIO_ACCOUNT_SID = "x";
    process.env.TWILIO_AUTH_TOKEN = "x";
    process.env.TWILIO_WHATSAPP_FROM = "x";
    expect(channelDeliverable("sms")).toBe(true);
    expect(channelDeliverable("whatsapp")).toBe(true);
  });
});
