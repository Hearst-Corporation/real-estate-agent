/**
 * lib/invest/shared/audit.test.ts — Helper d'audit transverse (Epic 1.6).
 *
 * Vérifie le caractère BEST-EFFORT (recordAudit/withAudit ne cassent JAMAIS
 * l'opération métier, même si le RPC throw ou renvoie une erreur), le retour de
 * `withAudit` (résultat de fn) avec re-lève des erreurs métier, le mapping des
 * rôles, et la garde 4-eyes pure. Aucun réseau : on injecte un faux client `sb`
 * avec une méthode `rpc` simulée.
 */

import { describe, it, expect, vi } from "vitest";
import {
  recordAudit,
  withAudit,
  mapActorRole,
  hasValidFourEyes,
  type AuditSupabase,
  type FourEyesApprovalRow,
} from "./audit";

const TENANT = "real-estate-agent";

/** Faux client service-role minimal : seule `rpc` est utilisée par recordAudit. */
function fakeSb(rpc: (name: string, args: unknown) => Promise<{ data: unknown; error: unknown }>): AuditSupabase {
  return { rpc } as unknown as AuditSupabase;
}

describe("mapActorRole", () => {
  it("mappe les rôles métier vers la granularité technique SQL", () => {
    expect(mapActorRole("admin")).toBe("admin");
    expect(mapActorRole("operator")).toBe("operator");
    expect(mapActorRole("investor")).toBe("user");
    expect(mapActorRole("user")).toBe("user");
    expect(mapActorRole("system")).toBe("system");
    // compliance / auditor / inconnu / null → service (écriture back-office).
    expect(mapActorRole("compliance")).toBe("service");
    expect(mapActorRole("auditor")).toBe("service");
    expect(mapActorRole(null)).toBe("service");
    expect(mapActorRole(undefined)).toBe("service");
    expect(mapActorRole("n_importe_quoi")).toBe("service");
  });
});

describe("recordAudit (best-effort)", () => {
  it("appelle le RPC inv_append_audit_log avec les params mappés et renvoie l'id", async () => {
    const rpc = vi.fn(async () => ({ data: "audit-id-1", error: null }));
    const id = await recordAudit(fakeSb(rpc), {
      tenantId: TENANT,
      action: "deal.published",
      actorRole: "compliance",
      entityType: "inv_deal",
      entityId: "deal-1",
      after: { status: "open" },
    });
    expect(id).toBe("audit-id-1");
    expect(rpc).toHaveBeenCalledTimes(1);
    const [name, args] = rpc.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(name).toBe("inv_append_audit_log");
    expect(args.p_tenant_id).toBe(TENANT);
    expect(args.p_action).toBe("deal.published");
    expect(args.p_actor_role).toBe("service"); // compliance → service
    expect(args.p_entity_type).toBe("inv_deal");
    expect(args.p_entity_id).toBe("deal-1");
  });

  it("ne lève PAS et renvoie null quand le RPC retourne une erreur", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const rpc = vi.fn(async () => ({ data: null, error: { message: "boom" } }));
    const id = await recordAudit(fakeSb(rpc), { tenantId: TENANT, action: "x" });
    expect(id).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("ne lève PAS et renvoie null quand le RPC THROW (exception réseau)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const rpc = vi.fn(async () => {
      throw new Error("network down");
    });
    const id = await recordAudit(fakeSb(rpc), { tenantId: TENANT, action: "x" });
    expect(id).toBeNull();
    warn.mockRestore();
  });

  it("est un no-op silencieux (null) quand aucun client n'est fourni", async () => {
    // sb=null ET getSupabaseAdmin() non configuré (pas d'env) → null, aucun throw.
    const id = await recordAudit(null, { tenantId: TENANT, action: "x" });
    expect(id).toBeNull();
  });
});

describe("withAudit", () => {
  it("exécute fn, audite le succès et RENVOIE le résultat de fn", async () => {
    const rpc = vi.fn(async () => ({ data: "a1", error: null }));
    const result = await withAudit(
      fakeSb(rpc),
      { tenantId: TENANT, actorUserId: "u1", actorRole: "operator" },
      "deal.published",
      { type: "inv_deal", id: "deal-1" },
      async () => ({ ok: true, value: 42 }),
      (r) => ({ value: r.value }),
    );
    expect(result).toEqual({ ok: true, value: 42 });
    const [, args] = rpc.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(args.p_action).toBe("deal.published");
    expect((args.p_after as Record<string, unknown>).ok).toBe(true);
    expect((args.p_after as Record<string, unknown>).value).toBe(42);
  });

  it("re-lève l'erreur métier de fn ET audite l'échec (best-effort)", async () => {
    const rpc = vi.fn(async () => ({ data: "a2", error: null }));
    await expect(
      withAudit(
        fakeSb(rpc),
        { tenantId: TENANT },
        "deal.close",
        { type: "inv_deal", id: "deal-2" },
        async () => {
          throw new Error("metier_ko");
        },
      ),
    ).rejects.toThrow("metier_ko");
    // L'audit d'échec a bien été tenté avec l'action suffixée `.failed`.
    const [, args] = rpc.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(args.p_action).toBe("deal.close.failed");
    expect((args.p_after as Record<string, unknown>).ok).toBe(false);
  });

  it("ne masque PAS l'erreur métier même si l'audit d'échec throw lui-même", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const rpc = vi.fn(async () => {
      throw new Error("audit_down");
    });
    await expect(
      withAudit(fakeSb(rpc), { tenantId: TENANT }, "x", { id: "1" }, async () => {
        throw new Error("metier_ko");
      }),
    ).rejects.toThrow("metier_ko"); // l'erreur métier prime, jamais "audit_down".
    warn.mockRestore();
  });
});

describe("hasValidFourEyes (pur)", () => {
  const rows: FourEyesApprovalRow[] = [
    { action: "deal_close", status: "pending", approver_1: "a", approver_2: null },
    { action: "deal_close", status: "approved", approver_1: "a", approver_2: "b" },
  ];

  it("valide une approbation `approved` avec 2 approbateurs distincts", () => {
    expect(hasValidFourEyes(rows, "deal_close")).toBe(true);
  });

  it("rejette si l'action ne correspond pas", () => {
    expect(hasValidFourEyes(rows, "deal_publish")).toBe(false);
  });

  it("rejette si les deux approbateurs sont identiques", () => {
    expect(
      hasValidFourEyes(
        [{ action: "deal_close", status: "approved", approver_1: "a", approver_2: "a" }],
        "deal_close",
      ),
    ).toBe(false);
  });

  it("rejette si un approbateur manque ou si non approuvé", () => {
    expect(
      hasValidFourEyes(
        [{ action: "deal_close", status: "approved", approver_1: "a", approver_2: null }],
        "deal_close",
      ),
    ).toBe(false);
    expect(
      hasValidFourEyes(
        [{ action: "deal_close", status: "pending", approver_1: "a", approver_2: "b" }],
        "deal_close",
      ),
    ).toBe(false);
  });
});
