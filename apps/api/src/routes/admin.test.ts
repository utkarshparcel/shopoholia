import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestServer, login } from "../test-utils.js";

describe("admin routes (X-Admin-Secret)", () => {
  let app: Awaited<ReturnType<typeof buildTestServer>>["app"];
  let token: string;
  const originalSecret = process.env.ADMIN_SECRET;

  beforeEach(async () => {
    process.env.ADMIN_SECRET = "test-admin-secret";
    const s = await buildTestServer();
    app = s.app;
    const session = await login(app);
    token = session.accessToken;
  });

  afterEach(async () => {
    await app.close();
    if (originalSecret === undefined) delete process.env.ADMIN_SECRET;
    else process.env.ADMIN_SECRET = originalSecret;
  });

  it("rejects reconcile without X-Admin-Secret even with valid JWT", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/money/reconcile",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects reconcile with wrong X-Admin-Secret even with valid JWT", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/money/reconcile",
      headers: {
        authorization: `Bearer ${token}`,
        "x-admin-secret": "wrong-secret",
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it("accepts reconcile with correct X-Admin-Secret and JWT", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/money/reconcile?fix=false",
      headers: {
        authorization: `Bearer ${token}`,
        "x-admin-secret": "test-admin-secret",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { checked: number; mismatched: number; fixed: number };
    expect(typeof body.checked).toBe("number");
    expect(typeof body.mismatched).toBe("number");
  });

  it("rejects retention purge without secret", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/ingestion/retention/purge",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it("accepts retention purge with correct secret", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/ingestion/retention/purge",
      headers: {
        authorization: `Bearer ${token}`,
        "x-admin-secret": "test-admin-secret",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      purged: number;
      retentionDays: number;
      schedule: { EMAIL: number; SMS: number; RECEIPT: number };
      purgedByKind: { EMAIL: number; SMS: number; RECEIPT: number };
    };
    expect(typeof body.purged).toBe("number");
    expect(typeof body.retentionDays).toBe("number");
    expect(body.schedule.EMAIL).toBeGreaterThan(0);
    expect(body.schedule.SMS).toBeGreaterThan(0);
    expect(body.schedule.RECEIPT).toBeGreaterThan(0);
    expect(body.purgedByKind).toEqual({ EMAIL: 0, SMS: 0, RECEIPT: 0 });
  });

  it("fails closed with 403 when ADMIN_SECRET is unset", async () => {
    delete process.env.ADMIN_SECRET;
    const res = await app.inject({
      method: "GET",
      url: "/admin/money/reconcile",
      headers: {
        authorization: `Bearer ${token}`,
        "x-admin-secret": "anything",
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it("lists OPS playbooks with correct secret", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/ops/playbooks",
      headers: {
        authorization: `Bearer ${token}`,
        "x-admin-secret": "test-admin-secret",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      playbooks: Array<{ id: string; title: string; path: string; summary: string }>;
    };
    expect(body.playbooks.map((p) => p.id).sort()).toEqual([
      "data-deletion",
      "parser-breakage",
      "refund-disputes",
    ]);
    for (const p of body.playbooks) {
      expect(p.path).toMatch(/^docs\/playbooks\/.+\.md$/);
      expect(p.title.length).toBeGreaterThan(0);
      expect(p.summary.length).toBeGreaterThan(0);
    }
  });

  it("rejects ops playbooks without X-Admin-Secret", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/ops/playbooks",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
  });

  describe("CONCIERGE-OPS", () => {
    it("rejects wardrobe list without CONCIERGE consent (403)", async () => {
      const target = await login(app, "919811122233");
      const res = await app.inject({
        method: "GET",
        url: `/admin/concierge/${target.userId}/wardrobe`,
        headers: {
          authorization: `Bearer ${token}`,
          "x-admin-secret": "test-admin-secret",
        },
      });
      expect(res.statusCode).toBe(403);
      expect((res.json() as { message: string }).message).toMatch(/CONCIERGE/i);
    });

    it("rejects photo-dump without admin secret even with consent", async () => {
      const target = await login(app, "919811122244");
      await app.inject({
        method: "POST",
        url: "/vault/consent",
        headers: { authorization: `Bearer ${target.accessToken}` },
        payload: { userId: target.userId, scope: "CONCIERGE", source: "ops-test" },
      });
      const res = await app.inject({
        method: "POST",
        url: `/admin/concierge/${target.userId}/photo-dump`,
        headers: { authorization: `Bearer ${token}` },
        payload: { photos: [{ imageKey: "wardrobe/nike-black-sneakers.jpg" }] },
      });
      expect(res.statusCode).toBe(401);
    });

    it("operator ingest/sort/list with consent and audit", async () => {
      const { clearAuditLog, listAuditRecords } = await import("../lib/audit.js");
      clearAuditLog();

      const target = await login(app, "919811122255");
      const consent = await app.inject({
        method: "POST",
        url: "/vault/consent",
        headers: { authorization: `Bearer ${target.accessToken}` },
        payload: { userId: target.userId, scope: "CONCIERGE", source: "ops-test" },
      });
      expect(consent.statusCode).toBe(201);

      const dump = await app.inject({
        method: "POST",
        url: `/admin/concierge/${target.userId}/photo-dump`,
        headers: {
          authorization: `Bearer ${token}`,
          "x-admin-secret": "test-admin-secret",
        },
        payload: {
          photos: [
            { imageKey: "wardrobe/nike-black-sneakers.jpg" },
            { imageKey: "wardrobe/zara-navy-shirt.jpg" },
          ],
        },
      });
      expect(dump.statusCode).toBe(201);
      const dumpBody = dump.json() as {
        items: Array<{ id: string; tags: string[]; category: string }>;
        created: number;
        tagged: number;
        operatorId: string;
        targetUserId: string;
      };
      expect(dumpBody.created).toBe(2);
      expect(dumpBody.tagged).toBe(2);
      expect(dumpBody.operatorId).toBeTruthy();
      expect(dumpBody.targetUserId).toBe(target.userId);
      expect(dumpBody.items[0]!.tags).toEqual(expect.arrayContaining(["photo-dump", "concierge"]));
      const itemId = dumpBody.items[0]!.id;

      const sort = await app.inject({
        method: "PATCH",
        url: `/admin/concierge/${target.userId}/items/${itemId}`,
        headers: {
          authorization: `Bearer ${token}`,
          "x-admin-secret": "test-admin-secret",
        },
        payload: { category: "sneakers", closetStatus: "ACTIVE", tags: ["photo-dump", "concierge", "sorted"] },
      });
      expect(sort.statusCode).toBe(200);
      expect((sort.json() as { item: { tags: string[] } }).item.tags).toContain("sorted");

      const list = await app.inject({
        method: "POST",
        url: `/admin/concierge/${target.userId}/list`,
        headers: {
          authorization: `Bearer ${token}`,
          "x-admin-secret": "test-admin-secret",
        },
        payload: {
          items: [{ wardrobeItemId: itemId, mode: "SELL", priceMinor: 250000 }],
        },
      });
      expect(list.statusCode).toBe(201);
      expect((list.json() as { listed: number }).listed).toBe(1);

      const wardrobe = await app.inject({
        method: "GET",
        url: `/admin/concierge/${target.userId}/wardrobe`,
        headers: {
          authorization: `Bearer ${token}`,
          "x-admin-secret": "test-admin-secret",
        },
      });
      expect(wardrobe.statusCode).toBe(200);
      expect((wardrobe.json() as { items: unknown[] }).items.length).toBeGreaterThanOrEqual(2);

      expect(listAuditRecords({ userId: target.userId, event: "concierge.ingest" }).length).toBeGreaterThanOrEqual(1);
      expect(listAuditRecords({ userId: target.userId, event: "concierge.sort" }).length).toBeGreaterThanOrEqual(1);
      expect(listAuditRecords({ userId: target.userId, event: "concierge.list" }).length).toBeGreaterThanOrEqual(1);
      expect(
        listAuditRecords({ userId: target.userId, event: "concierge.wardrobe.read" }).length,
      ).toBeGreaterThanOrEqual(1);
    });
  });
});
