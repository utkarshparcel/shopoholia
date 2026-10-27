import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestServer, login } from "../test-utils.js";
import type { Repositories } from "../lib/repositories/types.js";

describe("credits", () => {
  let app: Awaited<ReturnType<typeof buildTestServer>>["app"];
  let repos: Repositories;
  let token: string;
  let userId: string;

  beforeEach(async () => {
    const built = await buildTestServer();
    app = built.app;
    repos = built.repos;
    const session = await login(app);
    token = session.accessToken;
    userId = session.userId;
  });

  afterEach(async () => {
    await app.close();
  });

  it("requires FINANCIAL consent before reading credits (403)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/credits",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("lists money accounts after FINANCIAL consent", async () => {
    await app.inject({
      method: "POST",
      url: "/vault/consent",
      headers: { authorization: `Bearer ${token}` },
      payload: { userId, scope: "FINANCIAL", source: "onboarding" },
    });

    const res = await app.inject({
      method: "GET",
      url: "/credits",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().accounts).toEqual([]);

    const tx = await app.inject({
      method: "GET",
      url: "/credits/00000000-0000-4000-8000-000000000001/transactions",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(tx.statusCode).toBe(404);
  });

  it("GET /credits/:id/transactions is 404 for another user's credit and pages its own", async () => {
    await grantFinancialConsent();
    const add = await app.inject({
      method: "POST",
      url: "/credits",
      headers: { authorization: `Bearer ${token}` },
      payload: { kind: "GIFT_CARD", merchant: "Ajio", currency: "INR", balanceMinor: 1000 },
    });
    const accountId = add.json().id as string;
    for (let i = 0; i < 3; i++) {
      await app.inject({
        method: "POST",
        url: `/credits/${accountId}/spend`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          amountMinor: 100,
          idempotencyKey: `12121212-1212-4121-8121-12121212120${i}`,
        },
      });
    }

    const first = await app.inject({
      method: "GET",
      url: `/credits/${accountId}/transactions?limit=3`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().transactions).toHaveLength(3);
    const cursor = first.json().nextCursor as string;
    expect(cursor).toEqual(expect.any(String));
    const second = await app.inject({
      method: "GET",
      url: `/credits/${accountId}/transactions?limit=3&cursor=${cursor}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(second.json().transactions).toHaveLength(1);
    expect(second.json().transactions[0].type).toBe("DEPOSIT");
    expect(second.json().nextCursor).toBeNull();

    const bad = await app.inject({
      method: "GET",
      url: `/credits/${accountId}/transactions?cursor=not-ours`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toBe("invalid_cursor");

    const other = await login(app, "919800000999");
    await app.inject({
      method: "POST",
      url: "/vault/consent",
      headers: { authorization: `Bearer ${other.accessToken}` },
      payload: { userId: other.userId, scope: "FINANCIAL", source: "onboarding" },
    });
    const foreign = await app.inject({
      method: "GET",
      url: `/credits/${accountId}/transactions`,
      headers: { authorization: `Bearer ${other.accessToken}` },
    });
    expect(foreign.statusCode).toBe(404);
  });

  it("rejects unauthenticated credit reads with 401", async () => {
    const res = await app.inject({ method: "GET", url: "/credits" });
    expect(res.statusCode).toBe(401);
  });

  async function grantFinancialConsent() {
    await app.inject({
      method: "POST",
      url: "/vault/consent",
      headers: { authorization: `Bearer ${token}` },
      payload: { userId, scope: "FINANCIAL", source: "onboarding" },
    });
  }

  it("adds a credit and round-trips it through GET /credits", async () => {
    await grantFinancialConsent();

    const add = await app.inject({
      method: "POST",
      url: "/credits",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        kind: "GIFT_CARD",
        merchant: "Amazon",
        currency: "INR",
        balanceMinor: 5000,
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      },
    });
    expect(add.statusCode).toBe(201);
    const account = add.json();
    expect(account.merchant).toBe("Amazon");
    expect(account.balanceCacheMinor).toBe(5000);
    expect(account.kind).toBe("GIFT_CARD");
    expect(account.link).toContain("amazon.in");
    expect(account.link).toContain("tag=shopoholia-21");

    const list = await app.inject({
      method: "GET",
      url: "/credits",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(list.statusCode).toBe(200);
    const accounts = list.json().accounts;
    expect(accounts).toHaveLength(1);
    expect(accounts[0].id).toBe(account.id);
    expect(accounts[0].link).toContain("amazon.in");

    const tx = await app.inject({
      method: "GET",
      url: `/credits/${account.id}/transactions`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(tx.statusCode).toBe(200);
    const ledger = tx.json().transactions;
    expect(ledger).toHaveLength(1);
    expect(ledger[0].type).toBe("DEPOSIT");
    expect(ledger[0].balanceAfter).toBe(5000);
  });

  it("accepts barcode / photo capture metadata when adding a gift card", async () => {
    await grantFinancialConsent();

    const add = await app.inject({
      method: "POST",
      url: "/credits",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        kind: "GIFT_CARD",
        merchant: "Amazon",
        currency: "INR",
        balanceMinor: 2500,
        capture: {
          source: "BARCODE",
          raw: "Amazon|GC-99887766",
          code: "GC-99887766",
          last4: "7766",
        },
      },
    });
    expect(add.statusCode).toBe(201);
    expect(add.json().merchant).toBe("Amazon");
    expect(add.json().balanceCacheMinor).toBe(2500);

    const photo = await app.inject({
      method: "POST",
      url: "/credits",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        kind: "GIFT_CARD",
        merchant: "Myntra",
        currency: "INR",
        balanceMinor: 1000,
        capture: {
          source: "PHOTO",
          last4: "1234",
          imageKey: "captures/demo.jpg",
        },
      },
    });
    expect(photo.statusCode).toBe(201);
    expect(photo.json().merchant).toBe("Myntra");
  });

  it("POST /credits/capture prefills merchant + last4 from barcode", async () => {
    await grantFinancialConsent();

    const res = await app.inject({
      method: "POST",
      url: "/credits/capture",
      headers: { authorization: `Bearer ${token}` },
      payload: { barcode: "Amazon Gift Card Code: AMZNGC99887766" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.merchant).toBe("Amazon");
    expect(body.last4).toBe("7766");
    expect(body.capture.source).toBe("BARCODE");
    expect(body.capture.last4).toBe("7766");
  });

  it("POST /credits/capture/photo uses OCR to prefill gift-card fields", async () => {
    await grantFinancialConsent();

    const boundary = "----worncaptureboundary";
    const head =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="gift-card.jpg"\r\n` +
      `Content-Type: image/jpeg\r\n\r\n`;
    const tail = `\r\n--${boundary}--\r\n`;
    const payload = Buffer.concat([
      Buffer.from(head, "utf8"),
      Buffer.from("fake-image-bytes"),
      Buffer.from(tail, "utf8"),
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/credits/capture/photo",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.merchant).toBe("Amazon");
    expect(body.last4).toBe("7766");
    expect(body.suggestedBalanceMinor).toBe(250_000);
    expect(body.capture.source).toBe("PHOTO");
    expect(body.capture.imageKey).toMatch(/^gift-cards\//);
  });

  it("creates and lists loyalty points and promo credits by kind", async () => {
    await grantFinancialConsent();

    const expiresAt = new Date(Date.now() + 14 * 86_400_000).toISOString();

    const loyalty = await app.inject({
      method: "POST",
      url: "/credits",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        kind: "LOYALTY_POINTS",
        merchant: "Myntra Insider",
        currency: "INR",
        balanceMinor: 2500,
        expiresAt,
      },
    });
    expect(loyalty.statusCode).toBe(201);
    expect(loyalty.json().kind).toBe("LOYALTY_POINTS");
    expect(loyalty.json().balanceCacheMinor).toBe(2500);
    expect(loyalty.json().expiresAt).toBeTruthy();

    const promo = await app.inject({
      method: "POST",
      url: "/credits",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        kind: "PROMO_CREDIT",
        merchant: "Nykaa",
        currency: "INR",
        balanceMinor: 750,
        expiresAt,
      },
    });
    expect(promo.statusCode).toBe(201);
    expect(promo.json().kind).toBe("PROMO_CREDIT");

    const gift = await app.inject({
      method: "POST",
      url: "/credits",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        kind: "GIFT_CARD",
        merchant: "Amazon",
        currency: "INR",
        balanceMinor: 1000,
      },
    });
    expect(gift.statusCode).toBe(201);

    const all = await app.inject({
      method: "GET",
      url: "/credits",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(all.statusCode).toBe(200);
    expect(all.json().accounts).toHaveLength(3);

    const loyaltyList = await app.inject({
      method: "GET",
      url: "/credits?kind=LOYALTY_POINTS",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(loyaltyList.statusCode).toBe(200);
    expect(loyaltyList.json().accounts).toHaveLength(1);
    expect(loyaltyList.json().accounts[0].kind).toBe("LOYALTY_POINTS");
    expect(loyaltyList.json().accounts[0].merchant).toBe("Myntra Insider");

    const promoList = await app.inject({
      method: "GET",
      url: "/credits?kind=PROMO_CREDIT",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(promoList.statusCode).toBe(200);
    expect(promoList.json().accounts).toHaveLength(1);
    expect(promoList.json().accounts[0].kind).toBe("PROMO_CREDIT");

    const giftList = await app.inject({
      method: "GET",
      url: "/credits?kind=GIFT_CARD",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(giftList.statusCode).toBe(200);
    expect(giftList.json().accounts).toHaveLength(1);
    expect(giftList.json().accounts[0].kind).toBe("GIFT_CARD");
  });

  it("rejects unknown kind filter on list", async () => {
    await grantFinancialConsent();
    const res = await app.inject({
      method: "GET",
      url: "/credits?kind=NOT_A_KIND",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it("is idempotent on spend with the same idempotencyKey", async () => {
    await grantFinancialConsent();

    const add = await app.inject({
      method: "POST",
      url: "/credits",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        kind: "STORE_CREDIT",
        merchant: "Myntra",
        balanceMinor: 1000,
      },
    });
    const accountId = add.json().id;

    const idempotencyKey = "11111111-1111-4111-8111-111111111111";

    const first = await app.inject({
      method: "POST",
      url: `/credits/${accountId}/spend`,
      headers: { authorization: `Bearer ${token}` },
      payload: { amountMinor: 400, idempotencyKey },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().balanceMinor).toBe(600);

    const second = await app.inject({
      method: "POST",
      url: `/credits/${accountId}/spend`,
      headers: { authorization: `Bearer ${token}` },
      payload: { amountMinor: 400, idempotencyKey },
    });
    expect(second.statusCode).toBe(200);
    // Same balance — the duplicate was ignored, not applied again.
    expect(second.json().balanceMinor).toBe(600);

    const tx = await app.inject({
      method: "GET",
      url: `/credits/${accountId}/transactions`,
      headers: { authorization: `Bearer ${token}` },
    });
    // The initial deposit is recorded against the account.
    const ledger = tx.json().transactions;
    expect(ledger.some((l: { type: string }) => l.type === "DEPOSIT")).toBe(true);
  });

  it("returns 404 when spending a non-existent account", async () => {
    await grantFinancialConsent();
    const res = await app.inject({
      method: "POST",
      url: "/credits/00000000-0000-4000-8000-000000000099/spend",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        amountMinor: 10,
        idempotencyKey: "22222222-2222-4222-8222-222222222222",
      },
    });
    expect(res.statusCode).toBe(404);
  });

  it("is idempotent on add with the same idempotencyKey", async () => {
    await grantFinancialConsent();

    const idempotencyKey = "33333333-3333-4333-8333-333333333333";
    const payload = {
      kind: "GIFT_CARD" as const,
      merchant: "Flipkart",
      currency: "INR",
      balanceMinor: 2500,
      idempotencyKey,
    };

    const first = await app.inject({
      method: "POST",
      url: "/credits",
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    expect(first.statusCode).toBe(201);
    const account = first.json();
    expect(account.balanceCacheMinor).toBe(2500);

    const second = await app.inject({
      method: "POST",
      url: "/credits",
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    expect(second.statusCode).toBe(201);
    expect(second.json().id).toBe(account.id);
    expect(second.json().balanceCacheMinor).toBe(2500);

    const list = await app.inject({
      method: "GET",
      url: "/credits",
      headers: { authorization: `Bearer ${token}` },
    });
    // Retries must not create a second card.
    expect(list.json().accounts).toHaveLength(1);
  });

  it("deletes orphan zero-balance shell when concurrent add races on idempotencyKey", async () => {
    await grantFinancialConsent();

    const key = "44444444-4444-4444-8444-444444444444";
    const payload = {
      kind: "GIFT_CARD" as const,
      merchant: "Nykaa",
      currency: "INR",
      balanceMinor: 3000,
      idempotencyKey: key,
    };

    const [a, b] = await Promise.all([
      app.inject({
        method: "POST",
        url: "/credits",
        headers: { authorization: `Bearer ${token}` },
        payload,
      }),
      app.inject({
        method: "POST",
        url: "/credits",
        headers: { authorization: `Bearer ${token}` },
        payload,
      }),
    ]);
    expect(a.statusCode).toBe(201);
    expect(b.statusCode).toBe(201);
    expect(a.json().id).toBe(b.json().id);

    const list = await app.inject({
      method: "GET",
      url: "/credits",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(list.json().accounts).toHaveLength(1);
    expect(list.json().accounts[0].balanceCacheMinor).toBe(3000);

    // Repo-level: no leftover zero-balance shells (list API alone could hide filters).
    const all = await repos.listMoneyAccounts(userId);
    expect(all).toHaveLength(1);
    expect(all[0]!.balanceCacheMinor).toBe(3000);
    expect(await repos.purgeOrphanMoneyAccounts(userId)).toBe(0);
  });

  it("five-way concurrent add leaves exactly one funded account", async () => {
    await grantFinancialConsent();
    const key = "55555555-5555-4555-8555-555555555555";
    const payload = {
      kind: "STORE_CREDIT" as const,
      merchant: "Ajio",
      currency: "INR",
      balanceMinor: 1200,
      idempotencyKey: key,
    };
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        app.inject({
          method: "POST",
          url: "/credits",
          headers: { authorization: `Bearer ${token}` },
          payload,
        }),
      ),
    );
    expect(results.every((r) => r.statusCode === 201)).toBe(true);
    const ids = new Set(results.map((r) => (r.json() as { id: string }).id));
    expect(ids.size).toBe(1);
    const accounts = await repos.listMoneyAccounts(userId);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]!.balanceCacheMinor).toBe(1200);
    expect(accounts.every((a) => a.balanceCacheMinor === 0)).toBe(false);
  });

  it("purgeOrphanMoneyAccounts removes only empty ledger-less shells", async () => {
    await grantFinancialConsent();
    const funded = await repos.createMoneyAccount({
      userId,
      kind: "GIFT_CARD",
      merchant: "Myntra",
      currency: "INR",
      balanceCacheMinor: 0,
      expiresAt: null,
      status: "ACTIVE",
    });
    await repos.postMoneyLedger({
      accountId: funded.id,
      userId,
      delta: 500,
      type: "DEPOSIT",
      refType: "credit.add",
      refId: funded.id,
    });
    const orphan = await repos.createMoneyAccount({
      userId,
      kind: "GIFT_CARD",
      merchant: "Shell",
      currency: "INR",
      balanceCacheMinor: 0,
      expiresAt: null,
      status: "ACTIVE",
    });
    expect(await repos.deleteOrphanMoneyAccount(orphan.id, userId)).toBe(true);
    // Re-create orphan and sweep via purge
    const orphan2 = await repos.createMoneyAccount({
      userId,
      kind: "STORE_CREDIT",
      merchant: "Shell2",
      currency: "INR",
      balanceCacheMinor: 0,
      expiresAt: null,
      status: "ACTIVE",
    });
    expect(await repos.purgeOrphanMoneyAccounts(userId)).toBe(1);
    expect(await repos.findMoneyAccount(orphan2.id, userId)).toBeNull();
    const kept = await repos.findMoneyAccount(funded.id, userId);
    expect(kept?.balanceCacheMinor).toBe(500);
  });

  it("demo flag needs FINANCIAL consent and never grants it", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/credits",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        kind: "GIFT_CARD",
        merchant: "ignored",
        currency: "INR",
        balanceMinor: 1,
        demo: true,
      },
    });
    expect(res.statusCode).toBe(403);
    expect(await repos.findActiveConsent(userId, "FINANCIAL")).toBeNull();
    expect(await repos.listMoneyAccounts(userId)).toHaveLength(0);
  });

  it("demo flag seeds ₹500 Myntra once FINANCIAL consent is granted", async () => {
    await grantFinancialConsent();
    const res = await app.inject({
      method: "POST",
      url: "/credits",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        kind: "GIFT_CARD",
        merchant: "ignored",
        currency: "INR",
        balanceMinor: 1,
        demo: true,
      },
    });
    expect(res.statusCode).toBe(201);
    const account = res.json();
    expect(account.merchant).toBe("Myntra");
    expect(account.balanceCacheMinor).toBe(50_000);
    expect(account.kind).toBe("GIFT_CARD");

    const list = await app.inject({
      method: "GET",
      url: "/credits",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().accounts).toHaveLength(1);
  });

  it("demo flag is idempotent per user", async () => {
    await grantFinancialConsent();
    const payload = {
      kind: "GIFT_CARD" as const,
      merchant: "Myntra",
      currency: "INR",
      balanceMinor: 50_000,
      demo: true,
    };
    const first = await app.inject({
      method: "POST",
      url: "/credits",
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    const second = await app.inject({
      method: "POST",
      url: "/credits",
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(first.json().id).toBe(second.json().id);

    const list = await app.inject({
      method: "GET",
      url: "/credits",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(list.json().accounts).toHaveLength(1);
  });

  it("rejects overspend that would go negative", async () => {
    await grantFinancialConsent();
    const add = await app.inject({
      method: "POST",
      url: "/credits",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        kind: "GIFT_CARD",
        merchant: "Amazon",
        currency: "INR",
        balanceMinor: 500,
      },
    });
    const accountId = add.json().id as string;
    const res = await app.inject({
      method: "POST",
      url: `/credits/${accountId}/spend`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        amountMinor: 501,
        idempotencyKey: "66666666-6666-4666-8666-666666666666",
      },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("insufficient_balance");
    const kept = await repos.findMoneyAccount(accountId, userId);
    expect(kept?.balanceCacheMinor).toBe(500);
  });

  it("an idempotencyKey reused on another credit is a 409, not a replay", async () => {
    await grantFinancialConsent();
    const add = (merchant: string) =>
      app.inject({
        method: "POST",
        url: "/credits",
        headers: { authorization: `Bearer ${token}` },
        payload: { kind: "GIFT_CARD", merchant, currency: "INR", balanceMinor: 900 },
      });
    const a = (await add("Ajio")).json().id as string;
    const b = (await add("Nykaa")).json().id as string;
    const key = "67676767-6767-4676-8676-676767676767";
    const first = await app.inject({
      method: "POST",
      url: `/credits/${a}/spend`,
      headers: { authorization: `Bearer ${token}` },
      payload: { amountMinor: 100, idempotencyKey: key },
    });
    expect(first.statusCode).toBe(200);
    const reused = await app.inject({
      method: "POST",
      url: `/credits/${b}/spend`,
      headers: { authorization: `Bearer ${token}` },
      payload: { amountMinor: 100, idempotencyKey: key },
    });
    expect(reused.statusCode).toBe(409);
    expect(reused.json().error).toBe("idempotency_key_reused");
    const confirm = await app.inject({
      method: "POST",
      url: `/credits/${b}/confirm-balance`,
      headers: { authorization: `Bearer ${token}` },
      payload: { balanceMinor: 100, idempotencyKey: key },
    });
    expect(confirm.statusCode).toBe(409);
    expect((await repos.findMoneyAccount(b, userId))?.balanceCacheMinor).toBe(900);
  });

  it("POST /credits/capture/photo returns 400 when neither photo nor barcode is sent", async () => {
    await grantFinancialConsent();
    const boundary = "----wornemptycapture";
    const payload = Buffer.from(`--${boundary}--\r\n`, "utf8");
    const res = await app.inject({
      method: "POST",
      url: "/credits/capture/photo",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/photo or barcode/i);
  });

  it("POST /credits/capture/photo accepts barcode-only multipart (no image)", async () => {
    await grantFinancialConsent();
    const boundary = "----wornbarcodeonly";
    const payload = Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="barcode"\r\n\r\n` +
        `Amazon Gift Card AMZNGC11223344\r\n` +
        `--${boundary}--\r\n`,
      "utf8",
    );
    const res = await app.inject({
      method: "POST",
      url: "/credits/capture/photo",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.capture.source).toBe("BARCODE");
    expect(body.last4).toBe("3344");
    expect(body.capture.imageKey).toBeUndefined();
  });

  it("lists spend + deposit on GET /credits/:id/transactions after spend", async () => {
    await grantFinancialConsent();
    const add = await app.inject({
      method: "POST",
      url: "/credits",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        kind: "STORE_CREDIT",
        merchant: "Myntra",
        balanceMinor: 2000,
      },
    });
    const accountId = add.json().id as string;
    const spend = await app.inject({
      method: "POST",
      url: `/credits/${accountId}/spend`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        amountMinor: 750,
        idempotencyKey: "77777777-7777-4777-8777-777777777777",
      },
    });
    expect(spend.statusCode).toBe(200);
    expect(spend.json().balanceMinor).toBe(1250);

    const tx = await app.inject({
      method: "GET",
      url: `/credits/${accountId}/transactions`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(tx.statusCode).toBe(200);
    const types = (tx.json().transactions as { type: string }[]).map((t) => t.type);
    expect(types).toContain("DEPOSIT");
    expect(types).toContain("SPEND");
  });

  it("POST /credits/capture/photo includes codeLast4 in OCR prefill text", async () => {
    await grantFinancialConsent();
    const origRecognize = app.deps.ocr.recognize.bind(app.deps.ocr);
    app.deps.ocr.recognize = async () => ({
      merchant: "Amazon",
      totalMinor: 50000,
      items: [],
      confidence: 0.88,
      warrantyHint: null,
      claimContactHint: null,
      raw: {
        code: "AMZ-TOP-SECRET",
        codeLast4: "1234",
      },
    });
    const boundary = "----wornlast4";
    const payload = Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="card.jpg"\r\n` +
        `Content-Type: image/jpeg\r\n\r\n` +
        `bytes\r\n` +
        `--${boundary}--\r\n`,
      "utf8",
    );
    try {
      const res = await app.inject({
        method: "POST",
        url: "/credits/capture/photo",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        merchant: string | null;
        code: string | null;
        last4: string | null;
        suggestedBalanceMinor: number | null;
        capture: { raw?: string };
      };
      expect(body.merchant).toBeTruthy();
      expect(body.suggestedBalanceMinor).toBe(50000);
      expect(body.capture.raw ?? "").toMatch(/last4 1234/);
      expect(body.capture.raw ?? "").toMatch(/Code: AMZ-TOP-SECRET/);
    } finally {
      app.deps.ocr.recognize = origRecognize;
    }
  });

  it("POST /credits/capture/photo skips empty file parts and uses giftCardCode OCR fallback", async () => {
    await grantFinancialConsent();
    const origRecognize = app.deps.ocr.recognize.bind(app.deps.ocr);
    app.deps.ocr.recognize = async () => ({
      merchant: "Flipkart",
      totalMinor: 0,
      items: [],
      confidence: 0.7,
      warrantyHint: null,
      claimContactHint: null,
      raw: {
        giftCardCode: "FKGC99887766",
        // no `code` / `codeLast4` — exercises giftCardCode branch
      },
    });

    const boundary = "----wornemptyfile";
    const payload = Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="empty.jpg"\r\n` +
        `Content-Type: image/jpeg\r\n\r\n` +
        `\r\n` +
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="card.jpg"\r\n` +
        `Content-Type: image/jpeg\r\n\r\n` +
        `bytes\r\n` +
        `--${boundary}--\r\n`,
      "utf8",
    );
    try {
      const res = await app.inject({
        method: "POST",
        url: "/credits/capture/photo",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { capture: { source: string }; code: string | null; last4: string | null };
      expect(body.capture.source).toBe("PHOTO");
      expect(body.code).toBe("FKGC99887766");
    } finally {
      app.deps.ocr.recognize = origRecognize;
    }
  });

  it("add with a key another account already holds returns that account, no shell", async () => {
    await grantFinancialConsent();
    const key = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01";
    const winner = await repos.createMoneyAccount({
      userId,
      kind: "GIFT_CARD",
      merchant: "Amazon",
      currency: "INR",
      balanceCacheMinor: 0,
      expiresAt: null,
      status: "ACTIVE",
    });
    await repos.postMoneyLedger({
      accountId: winner.id,
      userId,
      delta: 7500,
      type: "DEPOSIT",
      refType: "credit.add",
      refId: key,
    });
    const res = await app.inject({
      method: "POST",
      url: "/credits",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        kind: "GIFT_CARD",
        merchant: "Amazon",
        currency: "INR",
        balanceMinor: 7500,
        idempotencyKey: key,
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().id).toBe(winner.id);
    expect(res.json().balanceCacheMinor).toBe(7500);
    expect(await repos.listMoneyAccounts(userId)).toHaveLength(1);
  });

  it("add surfaces a storage failure and leaves no account behind", async () => {
    await grantFinancialConsent();
    const orig = repos.createMoneyAccountWithEntry.bind(repos);
    repos.createMoneyAccountWithEntry = async () => {
      throw new Error("disk full");
    };
    try {
      const res = await app.inject({
        method: "POST",
        url: "/credits",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          kind: "GIFT_CARD",
          merchant: "Ajio",
          currency: "INR",
          balanceMinor: 500,
          idempotencyKey: "cccccccc-cccc-4ccc-8ccc-cccccccccc01",
        },
      });
      expect(res.statusCode).toBeGreaterThanOrEqual(500);
    } finally {
      repos.createMoneyAccountWithEntry = orig;
    }
    expect(await repos.listMoneyAccounts(userId)).toHaveLength(0);
  });

  it("POST /credits/capture/photo handles OCR with neither code nor giftCardCode", async () => {
    await grantFinancialConsent();
    const origRecognize = app.deps.ocr.recognize.bind(app.deps.ocr);
    app.deps.ocr.recognize = async () => ({
      merchant: "Amazon",
      totalMinor: 0,
      items: [],
      confidence: 0.4,
      warrantyHint: null,
      claimContactHint: null,
      // Intentionally no code / giftCardCode / last4 — exercises `: null` OCR branch.
      raw: { source: "photo" },
    });
    const boundary = "----wornnocode";
    const payload = Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="card.jpg"\r\n` +
        `Content-Type: image/jpeg\r\n\r\n` +
        `bytes\r\n` +
        `--${boundary}--\r\n`,
      "utf8",
    );
    try {
      const res = await app.inject({
        method: "POST",
        url: "/credits/capture/photo",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { code: string | null; merchant: string | null };
      expect(body.code).toBeNull();
      expect(body.merchant).toBeTruthy();
    } finally {
      app.deps.ocr.recognize = origRecognize;
    }
  });

  it("spend recovers balance when ledger insert races on unique idempotency (23505)", async () => {
    await grantFinancialConsent();
    const add = await app.inject({
      method: "POST",
      url: "/credits",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        kind: "GIFT_CARD",
        merchant: "Amazon",
        currency: "INR",
        balanceMinor: 5000,
      },
    });
    const accountId = add.json().id as string;
    const idempotencyKey = "88888888-8888-4888-8888-888888888801";

    let findCalls = 0;
    const origFind = repos.findMoneyLedgerByRef.bind(repos);
    const origPost = repos.postMoneyLedger.bind(repos);
    repos.findMoneyLedgerByRef = async (uid, refId, type) => {
      findCalls += 1;
      if (findCalls === 1) return null;
      return {
        id: "race-ledger",
        accountId,
        userId: uid,
        delta: -1000,
        type: type ?? "SPEND",
        refType: "credit.spend",
        refId,
        balanceAfter: 4000,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    };
    repos.postMoneyLedger = async () => {
      const err = new Error("duplicate key value violates unique constraint");
      (err as { code?: string }).code = "23505";
      throw err;
    };

    try {
      const res = await app.inject({
        method: "POST",
        url: `/credits/${accountId}/spend`,
        headers: { authorization: `Bearer ${token}` },
        payload: { amountMinor: 1000, idempotencyKey },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().balanceMinor).toBe(4000);
      expect(findCalls).toBeGreaterThanOrEqual(2);
    } finally {
      repos.findMoneyLedgerByRef = origFind;
      repos.postMoneyLedger = origPost;
    }
  });

  it("spend rethrows non-unique ledger errors", async () => {
    await grantFinancialConsent();
    const add = await app.inject({
      method: "POST",
      url: "/credits",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        kind: "GIFT_CARD",
        merchant: "Amazon",
        currency: "INR",
        balanceMinor: 5000,
      },
    });
    const accountId = add.json().id as string;
    const origPost = repos.postMoneyLedger.bind(repos);
    repos.postMoneyLedger = async () => {
      throw new Error("connection reset");
    };
    try {
      const res = await app.inject({
        method: "POST",
        url: `/credits/${accountId}/spend`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          amountMinor: 100,
          idempotencyKey: "88888888-8888-4888-8888-888888888802",
        },
      });
      expect(res.statusCode).toBeGreaterThanOrEqual(500);
    } finally {
      repos.postMoneyLedger = origPost;
    }
  });

  it("spend answers 409 when a unique race leaves no readable winner", async () => {
    await grantFinancialConsent();
    const add = await app.inject({
      method: "POST",
      url: "/credits",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        kind: "GIFT_CARD",
        merchant: "Amazon",
        currency: "INR",
        balanceMinor: 5000,
      },
    });
    const accountId = add.json().id as string;
    const idempotencyKey = "99999999-9999-4999-8999-999999999901";
    const origFind = repos.findMoneyLedgerByRef.bind(repos);
    const origPost = repos.postMoneyLedger.bind(repos);
    repos.findMoneyLedgerByRef = async () => null;
    repos.postMoneyLedger = async () => {
      const err = new Error("duplicate key value violates unique constraint");
      (err as { code?: string }).code = "23505";
      throw err;
    };
    try {
      const res = await app.inject({
        method: "POST",
        url: `/credits/${accountId}/spend`,
        headers: { authorization: `Bearer ${token}` },
        payload: { amountMinor: 500, idempotencyKey },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe("Conflict");
    } finally {
      repos.findMoneyLedgerByRef = origFind;
      repos.postMoneyLedger = origPost;
    }
  });

  it("POST /credits/:id/balance-check refreshes Amazon via stub API path", async () => {
    await grantFinancialConsent();
    const add = await app.inject({
      method: "POST",
      url: "/credits",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        kind: "GIFT_CARD",
        merchant: "Amazon.in",
        currency: "INR",
        balanceMinor: 2000,
      },
    });
    const accountId = add.json().id as string;
    process.env.MERCHANT_BALANCE_STUB_MINOR = "3500";
    try {
      const res = await app.inject({
        method: "POST",
        url: `/credits/${accountId}/balance-check`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.mode).toBe("api");
      expect(body.refreshed).toBe(true);
      expect(body.balanceMinor).toBe(3500);
      expect(body.previousBalanceMinor).toBe(2000);
    } finally {
      delete process.env.MERCHANT_BALANCE_STUB_MINOR;
    }
  });

  it("POST /credits/:id/balance-check returns manual nudge for unknown merchants", async () => {
    await grantFinancialConsent();
    const add = await app.inject({
      method: "POST",
      url: "/credits",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        kind: "GIFT_CARD",
        merchant: "Corner Boutique",
        currency: "INR",
        balanceMinor: 900,
      },
    });
    const accountId = add.json().id as string;
    const res = await app.inject({
      method: "POST",
      url: `/credits/${accountId}/balance-check`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().mode).toBe("manual");
    expect(res.json().refreshed).toBe(false);
    expect(res.json().balanceMinor).toBe(900);
  });

  it("POST /credits/:id/confirm-balance adjusts manual balance", async () => {
    await grantFinancialConsent();
    const add = await app.inject({
      method: "POST",
      url: "/credits",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        kind: "STORE_CREDIT",
        merchant: "Local Tailor",
        currency: "INR",
        balanceMinor: 4000,
      },
    });
    const accountId = add.json().id as string;
    const res = await app.inject({
      method: "POST",
      url: `/credits/${accountId}/confirm-balance`,
      headers: { authorization: `Bearer ${token}` },
      payload: { balanceMinor: 2500 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().balanceMinor).toBe(2500);
    expect(res.json().adjusted).toBe(true);

    const list = await app.inject({
      method: "GET",
      url: "/credits",
      headers: { authorization: `Bearer ${token}` },
    });
    const row = list.json().accounts.find((a: { id: string }) => a.id === accountId);
    expect(row.balanceCacheMinor).toBe(2500);
    expect(row.balanceCheck.mode).toBe("manual");
  });

  it("balance-check and confirm-balance 404 for unknown account", async () => {
    await grantFinancialConsent();
    const missing = "00000000-0000-4000-8000-0000000000aa";
    const check = await app.inject({
      method: "POST",
      url: `/credits/${missing}/balance-check`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(check.statusCode).toBe(404);

    const confirm = await app.inject({
      method: "POST",
      url: `/credits/${missing}/confirm-balance`,
      headers: { authorization: `Bearer ${token}` },
      payload: { balanceMinor: 100 },
    });
    expect(confirm.statusCode).toBe(404);
  });

  it("confirm-balance is idempotent via DEPOSIT then SPEND prior refs", async () => {
    await grantFinancialConsent();
    const add = await app.inject({
      method: "POST",
      url: "/credits",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        kind: "GIFT_CARD",
        merchant: "Local Boutique",
        currency: "INR",
        balanceMinor: 8000,
      },
    });
    const accountId = add.json().id as string;

    const depositKey = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
    await repos.postMoneyLedger({
      accountId,
      userId,
      delta: 500,
      type: "DEPOSIT",
      refType: "credit.balance_confirm",
      refId: depositKey,
    });
    const viaDeposit = await app.inject({
      method: "POST",
      url: `/credits/${accountId}/confirm-balance`,
      headers: { authorization: `Bearer ${token}` },
      payload: { balanceMinor: 1, idempotencyKey: depositKey },
    });
    expect(viaDeposit.statusCode).toBe(200);
    expect(viaDeposit.json().balanceMinor).toBe(8500);
    expect(viaDeposit.json().adjusted).toBe(true);

    const spendKey = "b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2";
    await repos.postMoneyLedger({
      accountId,
      userId,
      delta: -300,
      type: "SPEND",
      refType: "credit.balance_confirm",
      refId: spendKey,
    });
    const viaSpend = await app.inject({
      method: "POST",
      url: `/credits/${accountId}/confirm-balance`,
      headers: { authorization: `Bearer ${token}` },
      payload: { balanceMinor: 1, idempotencyKey: spendKey },
    });
    expect(viaSpend.statusCode).toBe(200);
    expect(viaSpend.json().balanceMinor).toBe(8200);
    expect(viaSpend.json().adjusted).toBe(true);
  });

  describe("U001 undo-spend", () => {
    it("restores balance within 60s and is idempotent", async () => {
      await grantFinancialConsent();
      const add = await app.inject({
        method: "POST",
        url: "/credits",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          kind: "GIFT_CARD",
          merchant: "Myntra",
          balanceMinor: 1000,
        },
      });
      const accountId = add.json().id as string;
      const idempotencyKey = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

      const spend = await app.inject({
        method: "POST",
        url: `/credits/${accountId}/spend`,
        headers: { authorization: `Bearer ${token}` },
        payload: { amountMinor: 400, idempotencyKey },
      });
      expect(spend.statusCode).toBe(200);
      expect(spend.json().balanceMinor).toBe(600);

      const undo = await app.inject({
        method: "POST",
        url: `/credits/${accountId}/undo-spend`,
        headers: { authorization: `Bearer ${token}` },
        payload: { idempotencyKey },
      });
      expect(undo.statusCode).toBe(200);
      expect(undo.json()).toMatchObject({ balanceMinor: 1000, undone: true });

      const again = await app.inject({
        method: "POST",
        url: `/credits/${accountId}/undo-spend`,
        headers: { authorization: `Bearer ${token}` },
        payload: { idempotencyKey },
      });
      expect(again.statusCode).toBe(200);
      expect(again.json().balanceMinor).toBe(1000);
    });

    it("rejects undo after the 60s window", async () => {
      await grantFinancialConsent();
      const add = await app.inject({
        method: "POST",
        url: "/credits",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          kind: "STORE_CREDIT",
          merchant: "Ajio",
          balanceMinor: 800,
        },
      });
      const accountId = add.json().id as string;
      const idempotencyKey = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

      await app.inject({
        method: "POST",
        url: `/credits/${accountId}/spend`,
        headers: { authorization: `Bearer ${token}` },
        payload: { amountMinor: 200, idempotencyKey },
      });

      const spendRow = await repos.findMoneyLedgerByRef(userId, idempotencyKey, "SPEND");
      expect(spendRow).toBeTruthy();
      (spendRow as { createdAt: Date }).createdAt = new Date(Date.now() - 61_000);

      const undo = await app.inject({
        method: "POST",
        url: `/credits/${accountId}/undo-spend`,
        headers: { authorization: `Bearer ${token}` },
        payload: { idempotencyKey },
      });
      expect(undo.statusCode).toBe(400);
      expect(undo.json().message).toMatch(/60s/i);
    });
  });

  describe("U002 credits merge", () => {
    it("merges same-merchant twins and hides the closed source", async () => {
      await grantFinancialConsent();
      const a = await app.inject({
        method: "POST",
        url: "/credits",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          kind: "GIFT_CARD",
          merchant: "Myntra",
          balanceMinor: 3000,
        },
      });
      const b = await app.inject({
        method: "POST",
        url: "/credits",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          kind: "GIFT_CARD",
          merchant: "Myntra",
          balanceMinor: 1200,
        },
      });
      expect(a.statusCode).toBe(201);
      expect(b.statusCode).toBe(201);

      const merge = await app.inject({
        method: "POST",
        url: "/credits/merge",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          targetAccountId: a.json().id,
          sourceAccountId: b.json().id,
        },
      });
      expect(merge.statusCode).toBe(200);
      expect(merge.json().account.balanceCacheMinor).toBe(4200);
      expect(merge.json().mergedFromId).toBe(b.json().id);
      expect(merge.json().transferredMinor).toBe(1200);

      const list = await app.inject({
        method: "GET",
        url: "/credits?kind=GIFT_CARD",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(list.statusCode).toBe(200);
      const ids = list.json().accounts.map((x: { id: string }) => x.id);
      expect(ids).toContain(a.json().id);
      expect(ids).not.toContain(b.json().id);
    });

    it("rejects currency mismatch", async () => {
      await grantFinancialConsent();
      const a = await app.inject({
        method: "POST",
        url: "/credits",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          kind: "GIFT_CARD",
          merchant: "Amazon",
          currency: "INR",
          balanceMinor: 500,
        },
      });
      const b = await app.inject({
        method: "POST",
        url: "/credits",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          kind: "GIFT_CARD",
          merchant: "Amazon",
          currency: "USD",
          balanceMinor: 500,
        },
      });
      const merge = await app.inject({
        method: "POST",
        url: "/credits/merge",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          targetAccountId: a.json().id,
          sourceAccountId: b.json().id,
        },
      });
      expect(merge.statusCode).toBe(409);
    });
  });

  describe("U003 expiry-handled", () => {
    it("returns snoozedUntil ~7d when Redis unavailable (skipped)", async () => {
      await grantFinancialConsent();
      const add = await app.inject({
        method: "POST",
        url: "/credits",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          kind: "GIFT_CARD",
          merchant: "Nykaa",
          balanceMinor: 900,
          expiresAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
        },
      });
      const accountId = add.json().id as string;

      const res = await app.inject({
        method: "POST",
        url: `/credits/${accountId}/expiry-handled`,
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().accountId).toBe(accountId);
      expect(res.json().status).toBe("skipped");
      const until = Date.parse(res.json().snoozedUntil);
      expect(until).toBeGreaterThan(Date.now() + 6 * 86_400_000);
    });
  });
});
