import { describe, it, expect, vi, beforeEach } from "vitest";

const getSession = vi.fn();
const getSupabaseAdmin = vi.fn();

vi.mock("@/lib/server/session", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/server/supabase", () => ({ getSupabaseAdmin: () => getSupabaseAdmin() }));

import { POST } from "@/app/api/prospection/annonces/[id]/estimate/route";

const CLAIMS = { sub: "11111111-1111-4111-8111-111111111111", tenant_id: "tenant-1", role: "user", scope: [] };
const ANNONCE_UUID = "22222222-2222-4222-8222-222222222222";
const PROP_UUID = "44444444-4444-4444-8444-444444444444";
const EST_UUID = "55555555-5555-4555-8555-555555555555";

function postReq(body: unknown = {}) {
  return new Request(`http://localhost/api/prospection/annonces/${ANNONCE_UUID}/estimate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const ctx = { params: Promise.resolve({ id: ANNONCE_UUID }) };

type TableProg = {
  select?: { data: unknown; error?: unknown };
  insert?: { data: unknown; error?: unknown };
};

function makeDb(prog: Record<string, TableProg>) {
  const calls = { inserts: [] as { table: string; payload: unknown }[], updates: [] as { table: string; payload: unknown }[] };
  const db = {
    from(table: string) {
      const selectRes = prog[table]?.select ?? { data: [], error: null };
      const insertRes = prog[table]?.insert ?? { data: { id: "generated" }, error: null };
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      Object.assign(builder, {
        select: chain,
        eq: chain,
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
        type_bien: "appartement",
        titre: "T3",
        prix: 300000,
        surface: 60,
        pieces: 3,
        ville: "Lyon",
        code_postal: "69003",
        property_id: null,
        estimation_id: null,
        ...over,
      },
    ],
    error: null,
  },
});

const propertyRow = { select: { data: { id: PROP_UUID, property_type: "appartement", city: "Lyon", surface: 60, rooms: 3 }, error: null } };

beforeEach(() => {
  getSession.mockReset();
  getSupabaseAdmin.mockReset();
});

describe("POST estimate — auth & annonce", () => {
  it("401 sans session", async () => {
    getSession.mockResolvedValue(null);
    expect((await POST(postReq(), ctx)).status).toBe(401);
  });

  it("404 si annonce absente", async () => {
    getSession.mockResolvedValue(CLAIMS);
    const { db } = makeDb({ prosp_annonces: { select: { data: [], error: null } } });
    getSupabaseAdmin.mockReturnValue(db);
    expect((await POST(postReq(), ctx)).status).toBe(404);
  });
});

describe("POST estimate — flux annonce → bien → estimation", () => {
  it("crée le bien à la volée puis l'estimation, avec liens et comparaison pending", async () => {
    getSession.mockResolvedValue(CLAIMS);
    const { db, calls } = makeDb({
      prosp_annonces: annonceRow(),
      // 1er select properties = création (insert.single) ; 2e = chargement (maybeSingle)
      properties: { insert: { data: { id: PROP_UUID }, error: null }, select: propertyRow.select },
      estimations: { insert: { data: { id: EST_UUID, status: "draft", market_value: null }, error: null } },
    });
    getSupabaseAdmin.mockReturnValue(db);

    const res = await POST(postReq(), ctx);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.estimation_id).toBe(EST_UUID);
    expect(body.property_id).toBe(PROP_UUID);
    // Bien créé à la volée + estimation insérée
    expect(calls.inserts.some((c) => c.table === "properties")).toBe(true);
    expect(calls.inserts.some((c) => c.table === "estimations")).toBe(true);
    // Liens bidirectionnels posés
    expect(calls.updates.some((c) => c.table === "properties")).toBe(true);
    expect(calls.updates.some((c) => c.table === "prosp_annonces")).toBe(true);
    // market_value async absent → comparaison en attente
    expect(body.price_comparison.pending).toBe(true);
    expect(body.price_comparison.asking_price).toBe(300000);
  });

  it("comparaison prix calculée quand market_value déjà présent (idempotence)", async () => {
    getSession.mockResolvedValue(CLAIMS);
    const { db, calls } = makeDb({
      prosp_annonces: annonceRow({ property_id: PROP_UUID, estimation_id: EST_UUID }),
      estimations: { select: { data: { id: EST_UUID, status: "ready", market_value: 250000 }, error: null } },
    });
    getSupabaseAdmin.mockReturnValue(db);

    const res = await POST(postReq(), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deduplicated).toBe(true);
    expect(body.estimation_id).toBe(EST_UUID);
    // Rien recréé
    expect(calls.inserts.length).toBe(0);
    // écart prix : 300000 - 250000 = +50000 (+20%)
    expect(body.price_comparison.pending).toBe(false);
    expect(body.price_comparison.delta_eur).toBe(50000);
    expect(body.price_comparison.delta_pct).toBe(20);
  });

  it("rattache un propertyId existant fourni (ownership) sans créer de bien", async () => {
    getSession.mockResolvedValue(CLAIMS);
    const { db, calls } = makeDb({
      prosp_annonces: annonceRow(),
      properties: propertyRow, // maybeSingle = ownership OK + chargement
      estimations: { insert: { data: { id: EST_UUID, status: "draft", market_value: null }, error: null } },
    });
    getSupabaseAdmin.mockReturnValue(db);

    const res = await POST(postReq({ propertyId: PROP_UUID }), ctx);
    expect(res.status).toBe(201);
    expect((await res.json()).property_id).toBe(PROP_UUID);
    // Aucun bien créé (propertyId fourni)
    expect(calls.inserts.some((c) => c.table === "properties")).toBe(false);
  });

  it("404 si propertyId fourni n'appartient pas au user", async () => {
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
