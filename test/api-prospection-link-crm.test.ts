import { describe, it, expect, vi, beforeEach } from "vitest";

const getSession = vi.fn();
const getSupabaseAdmin = vi.fn();

vi.mock("@/lib/server/session", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/server/supabase", () => ({ getSupabaseAdmin: () => getSupabaseAdmin() }));

import { POST } from "@/app/api/prospection/annonces/[id]/link-crm/route";

const CLAIMS = { sub: "11111111-1111-4111-8111-111111111111", tenant_id: "tenant-1", role: "user", scope: [] };
const ANNONCE_UUID = "22222222-2222-4222-8222-222222222222";
const LEAD_UUID = "33333333-3333-4333-8333-333333333333";
const PROP_UUID = "44444444-4444-4444-8444-444444444444";

function postReq(body: unknown) {
  return new Request(`http://localhost/api/prospection/annonces/${ANNONCE_UUID}/link-crm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const ctx = { params: Promise.resolve({ id: ANNONCE_UUID }) };

// ── Fake DB chaînable, programmée par table ─────────────────────────────────────
// Chaque table renvoie un builder thenable. `select().eq()...limit()` et
// `.maybeSingle()` / `.single()` résolvent la réponse programmée ; les insert /
// update sont captés dans `calls` pour assertion (anti-doublon / non-écrasement).

type TableProg = {
  select?: { data: unknown; error?: unknown };
  insert?: { data: unknown; error?: unknown };
};

function makeDb(prog: Record<string, TableProg>) {
  const calls = {
    inserts: [] as { table: string; payload: unknown }[],
    updates: [] as { table: string; payload: unknown }[],
  };
  const db = {
    from(table: string) {
      const selectRes = prog[table]?.select ?? { data: [], error: null };
      const insertRes = prog[table]?.insert ?? { data: { id: "generated" }, error: null };
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      Object.assign(builder, {
        select: chain,
        eq: chain,
        like: chain,
        order: chain,
        range: () => Promise.resolve(selectRes),
        limit: () => Promise.resolve(selectRes),
        maybeSingle: () => Promise.resolve(selectRes),
        single: () => Promise.resolve(insertRes),
        insert: (payload: unknown) => {
          calls.inserts.push({ table, payload });
          return builder;
        },
        update: (payload: unknown) => {
          calls.updates.push({ table, payload });
          // update().eq().eq() est awaité → thenable résolu sans erreur
          return Object.assign(Promise.resolve({ error: null }), { eq: chain });
        },
      });
      return builder;
    },
  };
  return { db, calls };
}

const annonceRow = (over: Record<string, unknown> = {}) => ({
  select: {
    data: [
      {
        id: ANNONCE_UUID,
        source: "leboncoin",
        type_bien: "appartement",
        titre: "T3",
        prix: 200000,
        nom_annonceur: "Jean",
        email_vendeur: "jean@ex.com",
        lead_id: null,
        property_id: null,
        ...over,
      },
    ],
    error: null,
  },
});

beforeEach(() => {
  getSession.mockReset();
  getSupabaseAdmin.mockReset();
});

describe("POST link-crm — auth & validation", () => {
  it("401 sans session", async () => {
    getSession.mockResolvedValue(null);
    expect((await POST(postReq({ createLead: true }), ctx)).status).toBe(401);
  });

  it("400 si body vide (aucune action)", async () => {
    getSession.mockResolvedValue(CLAIMS);
    getSupabaseAdmin.mockReturnValue({});
    expect((await POST(postReq({}), ctx)).status).toBe(400);
  });

  it("400 si createLead ET leadId (mutuellement exclusifs)", async () => {
    getSession.mockResolvedValue(CLAIMS);
    getSupabaseAdmin.mockReturnValue({});
    expect((await POST(postReq({ createLead: true, leadId: LEAD_UUID }), ctx)).status).toBe(400);
  });

  it("404 si annonce absente du tenant", async () => {
    getSession.mockResolvedValue(CLAIMS);
    const { db } = makeDb({ prosp_annonces: { select: { data: [], error: null } } });
    getSupabaseAdmin.mockReturnValue(db);
    expect((await POST(postReq({ createLead: true }), ctx)).status).toBe(404);
  });
});

describe("POST link-crm — création lead + bien", () => {
  it("crée un lead depuis l'annonce et pose le lien bidirectionnel", async () => {
    getSession.mockResolvedValue(CLAIMS);
    const { db, calls } = makeDb({
      prosp_annonces: annonceRow(),
      leads: { insert: { data: { id: LEAD_UUID }, error: null } },
    });
    getSupabaseAdmin.mockReturnValue(db);

    const res = await POST(postReq({ createLead: true }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ lead_id: LEAD_UUID, property_id: null });
    // Lead inséré avec provenance prospection + owner
    const leadInsert = calls.inserts.find((c) => c.table === "leads")!.payload as Record<string, unknown>;
    expect(leadInsert.source).toBe("prospection");
    expect(leadInsert.user_id).toBe(CLAIMS.sub);
    expect(leadInsert.tenant_id).toBe("tenant-1");
    // Lien posé sur l'annonce
    const link = calls.updates.find((c) => c.table === "prosp_annonces")!.payload as Record<string, unknown>;
    expect(link.lead_id).toBe(LEAD_UUID);
  });

  it("crée lead + bien en une passe", async () => {
    getSession.mockResolvedValue(CLAIMS);
    const { db, calls } = makeDb({
      prosp_annonces: annonceRow(),
      leads: { insert: { data: { id: LEAD_UUID }, error: null } },
      properties: { insert: { data: { id: PROP_UUID }, error: null } },
    });
    getSupabaseAdmin.mockReturnValue(db);

    const res = await POST(postReq({ createLead: true, createProperty: true }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ lead_id: LEAD_UUID, property_id: PROP_UUID });
    expect(calls.inserts.some((c) => c.table === "properties")).toBe(true);
  });
});

describe("POST link-crm — idempotence (anti-doublon)", () => {
  it("annonce déjà liée → ne recrée PAS, renvoie l'existant", async () => {
    getSession.mockResolvedValue(CLAIMS);
    const { db, calls } = makeDb({
      prosp_annonces: annonceRow({ lead_id: LEAD_UUID, property_id: PROP_UUID }),
    });
    getSupabaseAdmin.mockReturnValue(db);

    const res = await POST(postReq({ createLead: true, createProperty: true }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ lead_id: LEAD_UUID, property_id: PROP_UUID });
    // Aucun insert lead/bien, aucun re-lien (rien n'a changé).
    expect(calls.inserts.length).toBe(0);
    expect(calls.updates.length).toBe(0);
  });
});

describe("POST link-crm — rattachement existant (ownership)", () => {
  it("rattache un leadId existant appartenant au user (aucun champ modifié)", async () => {
    getSession.mockResolvedValue(CLAIMS);
    const { db, calls } = makeDb({
      prosp_annonces: annonceRow(),
      leads: { select: { data: { id: LEAD_UUID }, error: null } },
    });
    getSupabaseAdmin.mockReturnValue(db);

    const res = await POST(postReq({ leadId: LEAD_UUID }), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).lead_id).toBe(LEAD_UUID);
    // Rattachement seulement : aucun INSERT ni UPDATE sur la table leads (non-écrasement).
    expect(calls.inserts.some((c) => c.table === "leads")).toBe(false);
    expect(calls.updates.some((c) => c.table === "leads")).toBe(false);
  });

  it("404 si le leadId n'appartient pas au user (anti-IDOR)", async () => {
    getSession.mockResolvedValue(CLAIMS);
    const { db } = makeDb({
      prosp_annonces: annonceRow(),
      leads: { select: { data: null, error: null } },
    });
    getSupabaseAdmin.mockReturnValue(db);

    const res = await POST(postReq({ leadId: LEAD_UUID }), ctx);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("lead_not_found");
  });

  it("404 si le propertyId n'appartient pas au user", async () => {
    getSession.mockResolvedValue(CLAIMS);
    const { db } = makeDb({
      prosp_annonces: annonceRow(),
      properties: { select: { data: null, error: null } },
    });
    getSupabaseAdmin.mockReturnValue(db);

    const res = await POST(postReq({ propertyId: PROP_UUID }), ctx);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("property_not_found");
  });
});
