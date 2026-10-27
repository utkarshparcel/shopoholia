/**
 * U041–U050 ingest/trust ops route smoke tests.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { buildTestServer, login } from "../test-utils.js";
import { clearParserTrainingState } from "../lib/parser-training.js";
import { clearMerchantAliases } from "../lib/merchant-alias.js";
import { clearParserBreakFlags } from "../lib/parser-break-banner.js";
import { clearGiftBudgetLocks } from "../lib/gift-deadline.js";
import { clearReconcileInvestigated } from "../lib/user-reconcile.js";

async function grantEmail(
  app: Awaited<ReturnType<typeof buildTestServer>>["app"],
  token: string,
  userId: string,
) {
  const res = await app.inject({
    method: "POST",
    url: "/vault/consent",
    headers: { authorization: `Bearer ${token}` },
    payload: { userId, scope: "EMAIL", source: "test" },
  });
  expect(res.statusCode).toBe(201);
}

describe("U041–U050 ingest/trust ops routes", () => {
  beforeEach(() => {
    clearParserTrainingState();
    clearMerchantAliases();
    clearParserBreakFlags();
    clearGiftBudgetLocks();
    clearReconcileInvestigated();
  });

  it("U041 correct returns fixtureId without raw body leak", async () => {
    const { app, repos } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    await grantEmail(app, accessToken, userId);
    const doc = await repos.createIngestionDocument({
      userId,
      kind: "EMAIL",
      rawKey: "k1",
      parsedJson: { merchant: "Unknown Merchant", totalMinor: 100, body: "RAW SECRET" },
    });
    const res = await app.inject({
      method: "POST",
      url: `/ingestion/documents/${doc.id}/correct`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { merchant: "Myntra", totalMinor: 19900 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      fixtureId?: string;
      exportQueued?: boolean;
      merchant: string;
    };
    expect(body.fixtureId).toBeTruthy();
    expect(body.exportQueued).toBe(true);
    expect(body.merchant).toBe("Myntra");
    expect(JSON.stringify(body)).not.toMatch(/RAW SECRET/);
  });

  it("U042 unknown queue + alias reprocess", async () => {
    const { app, repos } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    await grantEmail(app, accessToken, userId);
    const { purchase } = await repos.createMerchantPurchase({
      userId,
      source: "EMAIL",
      merchant: "Unknown Merchant",
      purchasedAt: new Date("2026-08-01T00:00:00.000Z"),
      currency: "INR",
      totalMinor: 1000,
      items: [{ title: "Item", priceMinor: 1000, qty: 1 }],
    });
    const doc = await repos.createIngestionDocument({
      userId,
      kind: "EMAIL",
      rawKey: "k2",
      parsedJson: { merchant: "Unknown Merchant" },
    });
    await repos.updateIngestionDocumentStatus(doc.id, "MATCHED", purchase.id);

    const queue = await app.inject({
      method: "GET",
      url: "/ingestion/unknown-merchants",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(queue.statusCode).toBe(200);
    expect((queue.json() as { items: unknown[] }).items.length).toBeGreaterThan(0);

    const alias = await app.inject({
      method: "POST",
      url: "/ingestion/merchant-aliases",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        alias: "Unknown Merchant",
        canonical: "Flipkart",
        documentId: doc.id,
      },
    });
    expect(alias.statusCode).toBe(200);
    const aliasBody = alias.json() as {
      canonical: string;
      reprocessedPurchaseId: string | null;
    };
    expect(aliasBody.canonical).toBe("Flipkart");
    expect(aliasBody.reprocessedPurchaseId).toBe(purchase.id);
  });

  it("U043 mute preview + rule + undo", async () => {
    const { app, repos } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    await grantEmail(app, accessToken, userId);
    const grant = (await repos.listActiveConsents(userId))[0]!;
    const source = await repos.createIngestionSource({
      userId,
      kind: "EMAIL",
      provider: "gmail",
      consentGrantId: grant.id,
    });
    await repos.createIngestionDocument({
      userId,
      kind: "EMAIL",
      rawKey: "k3",
      parsedJson: { subject: "FLASH SALE 50%", from: "promo@x.com" },
    });
    const preview = await app.inject({
      method: "POST",
      url: `/ingestion/sources/${source.id}/mute-preview`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { type: "subject", pattern: "flash" },
    });
    expect(preview.statusCode).toBe(200);
    expect((preview.json() as { count: number }).count).toBe(1);

    const create = await app.inject({
      method: "POST",
      url: `/ingestion/sources/${source.id}/mute-rules`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { type: "subject", pattern: "flash" },
    });
    expect(create.statusCode).toBe(200);
    const ruleId = (create.json() as { rule: { id: string } }).rule.id;
    const undo = await app.inject({
      method: "DELETE",
      url: `/ingestion/sources/${source.id}/mute-rules/${ruleId}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(undo.statusCode).toBe(200);
    expect((undo.json() as { undone: boolean }).undone).toBe(true);
  });

  it("U044 last-sync scope chips", async () => {
    const { app, repos } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    await grantEmail(app, accessToken, userId);
    const grant = (await repos.listActiveConsents(userId))[0]!;
    await repos.createIngestionSource({
      userId,
      kind: "EMAIL",
      provider: "gmail",
      consentGrantId: grant.id,
    });

    const res = await app.inject({
      method: "GET",
      url: "/ingestion/last-sync",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { scopes: Array<{ scope: string }>; note: string };
    expect(body.scopes.some((s) => s.scope === "EMAIL")).toBe(true);
    expect(body.note).toMatch(/no message bodies/i);
  });

  it("U045 retention list + delete-raw keeps purchase link", async () => {
    const { app, repos } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    const { purchase } = await repos.createMerchantPurchase({
      userId,
      source: "EMAIL",
      merchant: "Myntra",
      purchasedAt: new Date(),
      currency: "INR",
      totalMinor: 500,
      items: [{ title: "Kurti", priceMinor: 500, qty: 1 }],
    });
    const doc = await repos.createIngestionDocument({
      userId,
      kind: "EMAIL",
      rawKey: "raw/keep-me",
      parsedJson: { merchant: "Myntra", __userId: userId },
    });
    await repos.updateIngestionDocumentStatus(doc.id, "MATCHED", purchase.id);

    const list = await app.inject({
      method: "GET",
      url: "/ingestion/retention",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(list.statusCode).toBe(200);
    expect((list.json() as { items: unknown[] }).items.length).toBeGreaterThan(0);

    const del = await app.inject({
      method: "POST",
      url: `/ingestion/documents/${doc.id}/delete-raw`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { confirm: true },
    });
    expect(del.statusCode).toBe(200);
    const body = del.json() as {
      rawDeleted: boolean;
      matchedPurchaseId: string | null;
    };
    expect(body.rawDeleted).toBe(true);
    expect(body.matchedPurchaseId).toBe(purchase.id);
    const after = await repos.getIngestionDocumentById(doc.id);
    expect(after?.rawKey).toBeFalsy();
  });

  it("U048 region packs + U049 deadline lock + U050 parser banner", async () => {
    const { app, repos } = await buildTestServer();
    const { accessToken, userId } = await login(app);

    const packs = await app.inject({
      method: "GET",
      url: "/fit/region-packs?region=UK",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(packs.statusCode).toBe(200);
    const packBody = packs.json() as {
      packs: Array<{ region: string; sizeSystem: { label: string } }>;
    };
    expect(packBody.packs[0]?.region).toBe("UK");
    expect(packBody.packs[0]?.sizeSystem.label).toMatch(/UK/i);

    const recipient = await repos.createRecipient({
      userId,
      name: "Mom",
      relationship: "FAMILY",
      region: "IN",
    });
    await repos.upsertRecipientProfile({
      recipientId: recipient.id,
      importantDates: [
        {
          occasion: "BIRTHDAY",
          date: "2026-09-10T00:00:00.000Z",
          label: "Mom bday",
        },
      ],
    });
    const board = await app.inject({
      method: "GET",
      url: "/gifts/deadlines",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(board.statusCode).toBe(200);
    expect((board.json() as { board: unknown[] }).board.length).toBe(1);

    const lock = await app.inject({
      method: "POST",
      url: "/gifts/deadlines/lock",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        recipientId: recipient.id,
        occasion: "BIRTHDAY",
        date: "2026-09-10T00:00:00.000Z",
        budgetLockMinor: 500000,
        // The body schema caps the shortlist at 3 (a 4th id is a 400).
        shortlistIds: ["a", "b", "c"],
      },
    });
    expect(lock.statusCode).toBe(200);
    const lockBody = lock.json() as {
      lock: { shortlistIds: string[]; budgetLockMinor: number };
      reminders: Array<{ leadDays: number }>;
    };
    expect(lockBody.lock.shortlistIds).toEqual(["a", "b", "c"]);
    expect(lockBody.reminders.map((r) => r.leadDays)).toEqual([7, 2]);

    await app.inject({
      method: "POST",
      url: "/ingestion/parser-health/flag",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { merchant: "Myntra", broken: true },
    });
    const health = await app.inject({
      method: "GET",
      url: "/ingestion/parser-health",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(health.statusCode).toBe(200);
    const banner = (
      health.json() as {
        banner: { visible: boolean; inventCredits: boolean; title: string };
      }
    ).banner;
    expect(banner.visible).toBe(true);
    expect(banner.inventCredits).toBe(false);
    expect(banner.title).toMatch(/scanning delayed/i);
  });
});
