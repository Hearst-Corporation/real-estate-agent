import { describe, it, expect } from "vitest";
import type { Gpu1Client } from "@/lib/gpu1";
import {
  recordShareEvent,
  fetchShareEvents,
  summarizeShareEvents,
} from "./db";
import { hashToken, hashValue } from "./hash";
import { shareEventsToTimeline } from "./timeline-source";
import type { RawShareEvent } from "./types";

/**
 * Fake gpu1 client minimal : `from(table)` → builder chaînable thenable. Les
 * inserts sont capturés ; les selects renvoient `data`/`error` configurés.
 */
type Resp = { data?: unknown; error?: { message: string; code?: string } | null };

function makeClient(config: Record<string, Resp>, sink: { inserts: unknown[] }): Gpu1Client {
  function builder(table: string) {
    const cfg = config[table] ?? { data: [], error: null };
    const listResult = { data: cfg.data ?? [], error: cfg.error ?? null, count: null };
    const b: Record<string, unknown> = {};
    const chain = () => b;
    b.select = chain; b.eq = chain; b.in = chain; b.order = chain; b.limit = chain;
    b.insert = (v: unknown) => {
      sink.inserts.push({ table, values: v });
      return { then: (r: (x: unknown) => unknown) => Promise.resolve(r(listResult)) };
    };
    b.then = (r: (x: unknown) => unknown) => Promise.resolve(r(listResult));
    return b;
  }
  return { from: (t: string) => builder(t) } as unknown as Gpu1Client;
}

const RES = { type: "brochure" as const, id: "e1", tenantId: "t1" };

describe("recordShareEvent — vérité (hit réel uniquement)", () => {
  it("insère UNE ligne share_events sur appel (= hit serveur réel côté route)", async () => {
    const sink = { inserts: [] as unknown[] };
    const sb = makeClient({ share_events: { error: null } }, sink);
    const out = await recordShareEvent(sb, { resource: RES, kind: "share_open", token: "opaque-token" });
    expect(out).toEqual({ ok: true });
    expect(sink.inserts).toHaveLength(1);
  });

  it("ne stocke JAMAIS le token en clair — seulement son hash (anti-énumération)", async () => {
    const sink = { inserts: [] as unknown[] };
    const sb = makeClient({ share_events: { error: null } }, sink);
    await recordShareEvent(sb, { resource: RES, kind: "share_open", token: "super-secret-token", ip: "1.2.3.4" });
    const row = (sink.inserts[0] as { values: { token_hash: string; ip_hash: string | null } }).values;
    expect(row.token_hash).toBe(hashToken("super-secret-token"));
    expect(row.token_hash).not.toContain("super-secret-token");
    // IP hachée elle aussi, jamais brute.
    expect(row.ip_hash).toBe(hashValue("1.2.3.4"));
    expect(row.ip_hash).not.toBe("1.2.3.4");
  });

  it("écrit tenant_id + resource_id EXPLICITES (déjà vérifiés par signature)", async () => {
    const sink = { inserts: [] as unknown[] };
    const sb = makeClient({ share_events: { error: null } }, sink);
    await recordShareEvent(sb, { resource: RES, kind: "share_feedback", token: "tok" });
    const row = (sink.inserts[0] as { values: Record<string, unknown> }).values;
    expect(row.tenant_id).toBe("t1");
    expect(row.resource_id).toBe("e1");
    expect(row.resource_type).toBe("brochure");
    expect(row.kind).toBe("share_feedback");
  });

  it("dégrade en unavailable si la table 0056 est absente (42P01) — sans planter", async () => {
    const sink = { inserts: [] as unknown[] };
    const sb = makeClient({ share_events: { error: { message: "x", code: "42P01" } } }, sink);
    const out = await recordShareEvent(sb, { resource: RES, kind: "share_open", token: "tok" });
    expect(out).toEqual({ ok: false, reason: "unavailable" });
  });

  it("dégrade en unavailable sur PGRST205 (cache PostgREST sans la table)", async () => {
    const sink = { inserts: [] as unknown[] };
    const sb = makeClient({ share_events: { error: { message: "x", code: "PGRST205" } } }, sink);
    const out = await recordShareEvent(sb, { resource: RES, kind: "share_open", token: "tok" });
    expect(out).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("fetchShareEvents — lecture bornée tenant", () => {
  it("retourne [] sans requête si aucun resourceId (pas de lecture non bornée)", async () => {
    const sink = { inserts: [] as unknown[] };
    const sb = makeClient({ share_events: { data: [] } }, sink);
    const out = await fetchShareEvents(sb, { tenantId: "t1", resourceType: "brochure", resourceIds: [] });
    expect(out).toEqual([]);
  });

  it("retourne [] si la table est absente (dégradation silencieuse)", async () => {
    const sink = { inserts: [] as unknown[] };
    const sb = makeClient({ share_events: { error: { message: "x", code: "42P01" } } }, sink);
    const out = await fetchShareEvents(sb, { tenantId: "t1", resourceType: "brochure", resourceIds: ["e1"] });
    expect(out).toEqual([]);
  });

  it("mappe les lignes réelles renvoyées", async () => {
    const rows: RawShareEvent[] = [
      { id: "s1", resource_type: "brochure", resource_id: "e1", kind: "share_open", ts: "2026-07-18T10:00:00Z" },
    ];
    const sink = { inserts: [] as unknown[] };
    const sb = makeClient({ share_events: { data: rows } }, sink);
    const out = await fetchShareEvents(sb, { tenantId: "t1", resourceType: "brochure", resourceIds: ["e1"] });
    expect(out).toEqual(rows);
  });
});

describe("summarizeShareEvents", () => {
  it("compte ouvertures/feedbacks et calcule premier/dernier accès", () => {
    const events: RawShareEvent[] = [
      { id: "a", resource_type: "offmarket", resource_id: "sel1", kind: "share_open", ts: "2026-07-18T09:00:00Z" },
      { id: "b", resource_type: "offmarket", resource_id: "sel1", kind: "share_open", ts: "2026-07-18T11:00:00Z" },
      { id: "c", resource_type: "offmarket", resource_id: "sel1", kind: "share_feedback", ts: "2026-07-18T12:00:00Z" },
    ];
    const [s] = summarizeShareEvents(events);
    expect(s.opens).toBe(2);
    expect(s.feedbacks).toBe(1);
    expect(s.firstAt).toBe("2026-07-18T09:00:00Z");
    expect(s.lastAt).toBe("2026-07-18T12:00:00Z");
  });

  it("sépare les ressources distinctes", () => {
    const events: RawShareEvent[] = [
      { id: "a", resource_type: "brochure", resource_id: "e1", kind: "share_open", ts: "2026-07-18T09:00:00Z" },
      { id: "b", resource_type: "offmarket", resource_id: "s1", kind: "share_open", ts: "2026-07-18T10:00:00Z" },
    ];
    expect(summarizeShareEvents(events)).toHaveLength(2);
  });
});

describe("shareEventsToTimeline — source additive", () => {
  it("produit des TimelineEvent avec kinds share_open/share_feedback", () => {
    const events: RawShareEvent[] = [
      { id: "a", resource_type: "brochure", resource_id: "e1", kind: "share_open", ts: "2026-07-18T09:00:00Z" },
      { id: "b", resource_type: "offmarket", resource_id: "s1", kind: "share_feedback", ts: "2026-07-18T10:00:00Z" },
    ];
    const tl = shareEventsToTimeline(events);
    expect(tl).toHaveLength(2);
    expect(tl[0].kind).toBe("share_open");
    expect(tl[0].entityRef.href).toBe("/estimations/e1");
    expect(tl[1].kind).toBe("share_feedback");
  });

  it("écarte une ligne sans horodatage valide (aucun événement fantôme)", () => {
    const events: RawShareEvent[] = [
      { id: "x", resource_type: "brochure", resource_id: "e1", kind: "share_open", ts: "not-a-date" },
    ];
    expect(shareEventsToTimeline(events)).toEqual([]);
  });
});
