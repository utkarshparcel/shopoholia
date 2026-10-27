import { describe, it, expect } from "vitest";
import type { ReturnDetailResponse, ReturnRequest, ReturnsListResponse } from "@worn/shared";
import { buildTestServer, login } from "../test-utils.js";
import { computeWindowDeadline } from "../lib/return-jobs.js";
import { isValidReturnTransition } from "../lib/returns/state-machine.js";

describe("returns", () => {
  it("creates via POST /returns and initiates/confirms state flow", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);

    // seed a purchase
    const purchase = await app.deps.repos.createMerchantPurchase({
      userId,
      source: "EMAIL",
      merchant: "Myntra",
      purchasedAt: new Date(),
      currency: "INR",
      totalMinor: 20000,
      items: [{ title: "Sneakers", priceMinor: 20000, category: "FOOTWEAR" }],
    });
    // ensure list visibility via receipt link
    await app.deps.repos.createReceipt({
      userId,
      imageKey: "receipts/r.jpg",
      merchant: "Myntra",
      purchasedAt: new Date(),
      totalMinor: 20000,
      ocrJson: {},
      purchaseId: purchase.purchase.id,
    });

    const create = await app.inject({
      method: "POST",
      url: "/returns",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { purchaseId: purchase.purchase.id },
    });
    expect(create.statusCode).toBe(201);
    const created = create.json() as ReturnRequest;
    expect(created.state).toBe("REQUESTED");
    expect(new Date(created.windowDeadline).getTime()).toBeGreaterThan(Date.now());

    const list = await app.inject({
      method: "GET",
      url: "/returns",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(list.statusCode).toBe(200);
    expect((list.json() as ReturnsListResponse).returns.length).toBe(1);

    // Initiate: REQUESTED -> INITIATED
    const initiate = await app.inject({
      method: "POST",
      url: `/returns/${created.id}/initiate`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });
    expect(initiate.statusCode).toBe(200);
    expect((initiate.json() as ReturnRequest).state).toBe("INITIATED");

    // Confirm: INITIATED -> CONFIRMED
    const confirm = await app.inject({
      method: "POST",
      url: `/returns/${created.id}/confirm`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { tracking: "TRK123" },
    });
    expect(confirm.statusCode).toBe(200);
    expect((confirm.json() as ReturnRequest).state).toBe("CONFIRMED");

    // Detail includes events
    const detail = await app.inject({
      method: "GET",
      url: `/returns/${created.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(detail.statusCode).toBe(200);
    const d = detail.json() as ReturnDetailResponse;
    expect(d.request.id).toBe(created.id);
    expect(d.events.length).toBeGreaterThanOrEqual(3);

    // Invalid transition: CONFIRMED cannot go back to INITIATED
    const bad = await app.inject({
      method: "POST",
      url: `/returns/${created.id}/initiate`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });
    expect(bad.statusCode).toBe(409);

    // Refund stub: CONFIRMED -> REFUNDED writes to money_ledger on CASH (not list[0] gift card)
    await app.inject({
      method: "POST",
      url: "/vault/consent",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { userId, scope: "FINANCIAL", source: "onboarding" },
    });
    const gift = await app.inject({
      method: "POST",
      url: "/credits",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { kind: "GIFT_CARD", merchant: "Amazon", currency: "INR", balanceMinor: 500 },
    });
    expect(gift.statusCode).toBe(201);
    const cash = await app.inject({
      method: "POST",
      url: "/credits",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { kind: "CASH", merchant: "Refund", currency: "INR", balanceMinor: 1000 },
    });
    expect(cash.statusCode).toBe(201);
    const cashId = cash.json().id as string;

    const refund = await app.inject({
      method: "POST",
      url: `/returns/${created.id}/refund`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { destination: "ORIGINAL_CARD" },
    });
    expect(refund.statusCode).toBe(200);
    expect((refund.json() as ReturnRequest).state).toBe("REFUNDED");
    expect((refund.json() as { destination?: string }).destination).toBe("ORIGINAL_CARD");

    const cashTx = await app.inject({
      method: "GET",
      url: `/credits/${cashId}/transactions`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const refunds = (cashTx.json() as { transactions: Array<{ type: string }> }).transactions.filter(
      (t) => t.type === "REFUND",
    );
    expect(refunds.length).toBeGreaterThanOrEqual(1);

    // Accountant unified ledger surfaces the same money_ledger REFUND for Vault UI
    const acctLedger = await app.inject({
      method: "GET",
      url: "/accountant/ledger",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(acctLedger.statusCode).toBe(200);
    const ledgerRefunds = (
      acctLedger.json() as { entries: Array<{ kind: string; description: string; amountMinor: number; refId: string | null }> }
    ).entries.filter(
      (e) => e.kind === "LEDGER" && e.description.toUpperCase().startsWith("REFUND") && e.refId === created.id,
    );
    expect(ledgerRefunds.length).toBeGreaterThanOrEqual(1);
    expect(ledgerRefunds[0]!.amountMinor).toBe(20000);

    await app.close();
  });

  it("supports initiate by purchaseItemId as :id", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    const purchase = await app.deps.repos.createMerchantPurchase({
      userId,
      source: "EMAIL",
      merchant: "Amazon",
      purchasedAt: new Date(),
      currency: "INR",
      totalMinor: 3000,
      items: [{ title: "Book", priceMinor: 3000, category: "GENERAL" }],
    });
    const itemId = purchase.items[0]!.id;
    const res = await app.inject({
      method: "POST",
      url: `/returns/${itemId}/initiate`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as ReturnRequest;
    expect(body.state).toBe("INITIATED");
    expect(body.purchaseItemId).toBe(itemId);
    await app.close();
  });

  it("state machine guards and deadline computation", async () => {
    expect(isValidReturnTransition("REQUESTED", "INITIATED")).toBe(true);
    expect(isValidReturnTransition("INITIATED", "CONFIRMED")).toBe(true);
    expect(isValidReturnTransition("CONFIRMED", "REFUNDED")).toBe(true);
    expect(isValidReturnTransition("REQUESTED", "CONFIRMED")).toBe(false);
    expect(isValidReturnTransition("REFUNDED", "CANCELLED")).toBe(false);

    const purchasedAt = new Date("2026-01-01T00:00:00Z");
    const deadlineMyntra = computeWindowDeadline(purchasedAt, "Myntra");
    expect(deadlineMyntra.getTime() - purchasedAt.getTime()).toBe(30 * 86_400_000);
    // Merchants are stored UPPERCASE (ingest); lookup must be case-insensitive.
    const deadlineAmazonUpper = computeWindowDeadline(purchasedAt, "AMAZON");
    expect(deadlineAmazonUpper.getTime() - purchasedAt.getTime()).toBe(30 * 86_400_000);
    const deadlineAmazonMixed = computeWindowDeadline(purchasedAt, "Amazon");
    expect(deadlineAmazonMixed.getTime() - purchasedAt.getTime()).toBe(30 * 86_400_000);
    const deadlineFlipkart = computeWindowDeadline(purchasedAt, "FLIPKART");
    expect(deadlineFlipkart.getTime() - purchasedAt.getTime()).toBe(7 * 86_400_000);
    const deadlineUnknown = computeWindowDeadline(purchasedAt, "UnknownStore");
    expect(deadlineUnknown.getTime() - purchasedAt.getTime()).toBe(14 * 86_400_000);
  });

  it("deadline expiry auto-transitions to EXPIRED on list", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    // Create return with past deadline via direct repo
    const past = new Date(Date.now() - 5 * 86_400_000);
    const req = await app.deps.repos.createReturnRequest({
      userId,
      purchaseId: null,
      purchaseItemId: null,
      windowDeadline: past,
    });
    // manually set to INITIATED with past deadline
    await app.deps.repos.updateReturnRequest(req.id, { state: "INITIATED" });
    const list = await app.inject({
      method: "GET",
      url: "/returns",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const returns = (list.json() as ReturnsListResponse).returns;
    const found = returns.find((r) => r.id === req.id);
    expect(found?.state).toBe("EXPIRED");
    await app.close();
  });

  it("requires auth", async () => {
    const { app } = await buildTestServer();
    const res = await app.inject({ method: "GET", url: "/returns" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("N16 GET /returns/refund-eta board query until ledger credit", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);

    const purchase = await app.deps.repos.createMerchantPurchase({
      userId,
      source: "EMAIL",
      merchant: "Myntra",
      purchasedAt: new Date(),
      currency: "INR",
      totalMinor: 15000,
      items: [{ title: "Denim jacket", priceMinor: 15000, category: "APPAREL" }],
    });

    const create = await app.inject({
      method: "POST",
      url: "/returns",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { purchaseId: purchase.purchase.id },
    });
    expect(create.statusCode).toBe(201);
    const created = create.json() as ReturnRequest;

    await app.inject({
      method: "POST",
      url: `/returns/${created.id}/initiate`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });
    await app.inject({
      method: "POST",
      url: `/returns/${created.id}/confirm`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { tracking: "TRK-ETA" },
    });

    const openBoard = await app.inject({
      method: "GET",
      url: "/returns/refund-eta",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(openBoard.statusCode).toBe(200);
    const openBody = openBoard.json() as {
      board: Array<{
        returnId: string;
        state: string;
        etaAt: string | null;
        ledgerCredited: boolean;
        pipeline: Array<{ id: string; state: string }>;
      }>;
    };
    expect(openBody.board).toHaveLength(1);
    expect(openBody.board[0]!.returnId).toBe(created.id);
    expect(openBody.board[0]!.state).toBe("CONFIRMED");
    expect(openBody.board[0]!.etaAt).toBeTruthy();
    expect(openBody.board[0]!.ledgerCredited).toBe(false);
    expect(openBody.board[0]!.pipeline.map((p) => p.id)).toEqual([
      "INITIATED",
      "CONFIRMED",
      "REFUNDED",
    ]);
    expect(openBody.board[0]!.pipeline.map((p) => p.state)).toEqual([
      "done",
      "current",
      "todo",
    ]);

    await app.inject({
      method: "POST",
      url: "/vault/consent",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { userId, scope: "FINANCIAL", source: "onboarding" },
    });
    await app.inject({
      method: "POST",
      url: "/credits",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { kind: "CASH", merchant: "Refund", currency: "INR", balanceMinor: 0 },
    });

    const refund = await app.inject({
      method: "POST",
      url: `/returns/${created.id}/refund`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { destination: "UPI" },
    });
    expect(refund.statusCode).toBe(200);

    const afterOpen = await app.inject({
      method: "GET",
      url: "/returns/refund-eta",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect((afterOpen.json() as { board: unknown[] }).board).toHaveLength(0);

    const allBoard = await app.inject({
      method: "GET",
      url: "/returns/refund-eta?all=1",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(allBoard.statusCode).toBe(200);
    const allBody = allBoard.json() as {
      board: Array<{
        state: string;
        ledgerCredited: boolean;
        ledgerAmountMinor: number | null;
        etaAt: string | null;
        pipeline: Array<{ id: string; state: string }>;
      }>;
    };
    expect(allBody.board).toHaveLength(1);
    expect(allBody.board[0]!.state).toBe("REFUNDED");
    expect(allBody.board[0]!.ledgerCredited).toBe(true);
    expect(allBody.board[0]!.ledgerAmountMinor).toBe(15000);
    expect(allBody.board[0]!.etaAt).toBeNull();
    expect(allBody.board[0]!.pipeline.at(-1)?.state).toBe("current");

    await app.close();
  });

  it("confirm returns 409 when window already expired", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    const past = new Date(Date.now() - 86_400_000);
    const req = await app.deps.repos.createReturnRequest({
      userId,
      purchaseId: null,
      purchaseItemId: null,
      windowDeadline: past,
    });
    await app.deps.repos.updateReturnRequest(req.id, { state: "INITIATED" });

    const confirm = await app.inject({
      method: "POST",
      url: `/returns/${req.id}/confirm`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });
    expect(confirm.statusCode).toBe(409);
    expect(confirm.json()).toMatchObject({ message: "Return window expired" });

    const listed = await app.inject({
      method: "GET",
      url: `/returns/${req.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(listed.statusCode).toBe(200);
    expect((listed.json() as { request: { state: string } }).request.state).toBe("EXPIRED");
    await app.close();
  });

  it("confirm/refund 404 for unknown return id", async () => {
    const { app } = await buildTestServer();
    const { accessToken } = await login(app);
    const missing = "00000000-0000-4000-8000-0000000000aa";
    const confirm = await app.inject({
      method: "POST",
      url: `/returns/${missing}/confirm`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });
    expect(confirm.statusCode).toBe(404);
    const refund = await app.inject({
      method: "POST",
      url: `/returns/${missing}/refund`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { destination: "ORIGINAL_CARD" },
    });
    expect(refund.statusCode).toBe(404);
    await app.close();
  });

  it("WV01-PICKUP-BOOK: initiate pre-fills merchantReturnUrl and books pickup slot", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    const purchase = await app.deps.repos.createMerchantPurchase({
      userId,
      source: "EMAIL",
      merchant: "Myntra",
      purchasedAt: new Date(),
      currency: "INR",
      totalMinor: 99900,
      items: [
        {
          title: "Jacket",
          priceMinor: 99900,
          category: "APPAREL",
          imageKey: "purchases/jacket.jpg",
        },
      ],
    });

    const create = await app.inject({
      method: "POST",
      url: "/returns",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        purchaseId: purchase.purchase.id,
        purchaseItemId: purchase.items[0]!.id,
      },
    });
    expect(create.statusCode).toBe(201);
    const created = create.json() as ReturnRequest;
    expect(created.merchantReturnUrl).toContain("myntra.com");

    const initiate = await app.inject({
      method: "POST",
      url: `/returns/${created.id}/initiate`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });
    expect(initiate.statusCode).toBe(200);
    const initiated = initiate.json() as ReturnRequest;
    expect(initiated.state).toBe("INITIATED");
    expect(initiated.merchantReturnUrl).toContain("myntra.com");

    const slot = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const pickup = await app.inject({
      method: "POST",
      url: `/returns/${created.id}/pickup`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { pickupSlotAt: slot },
    });
    expect(pickup.statusCode).toBe(200);
    const booked = pickup.json() as ReturnRequest;
    expect(booked.state).toBe("PICKUP_SCHEDULED");
    expect(booked.pickupSlotAt).toBeTruthy();
    expect(new Date(booked.pickupSlotAt!).toISOString()).toBe(new Date(slot).toISOString());

    const confirm = await app.inject({
      method: "POST",
      url: `/returns/${created.id}/confirm`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { tracking: "PKP-1" },
    });
    expect(confirm.statusCode).toBe(200);
    expect((confirm.json() as ReturnRequest).state).toBe("CONFIRMED");

    await app.close();
  });

  it("WV01-DEADLINE-IMAGE-PUSH: enrichDeadlineFromPurchaseItem includes signed imageUrl", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    const { enrichDeadlineFromPurchaseItem } = await import("../lib/return-jobs.js");

    const purchase = await app.deps.repos.createMerchantPurchase({
      userId,
      source: "EMAIL",
      merchant: "Amazon",
      purchasedAt: new Date(),
      currency: "INR",
      totalMinor: 45000,
      items: [
        {
          title: "Sneakers",
          priceMinor: 45000,
          category: "FOOTWEAR",
          imageKey: "items/sneakers.jpg",
        },
      ],
    });
    const item = purchase.items[0]!;
    const payload = await enrichDeadlineFromPurchaseItem(
      {
        returnId: "00000000-0000-4000-8000-0000000000r9",
        userId,
        windowDeadline: new Date(Date.now() + 10 * 86_400_000).toISOString(),
        merchant: "Amazon",
      },
      item,
      (key) => app.deps.storage.getSignedUrl(key),
      "INR",
    );
    expect(payload.imageUrl).toContain("sneakers");
    expect(payload.amountMinor).toBe(45000);
    expect(payload.currency).toBe("INR");

    const res = await app.inject({
      method: "POST",
      url: `/returns/${item.id}/initiate`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(200);

    await app.close();
  });
});

describe("U026 GST invoice request + U029 return label", () => {
  it("requests GST invoice packet and marks invoice_requested", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);

    const purchase = await app.deps.repos.createMerchantPurchase({
      userId,
      source: "EMAIL",
      merchant: "Myntra",
      orderRef: "MYN-42",
      purchasedAt: new Date(),
      currency: "INR",
      totalMinor: 199900,
      items: [{ title: "Kurta", priceMinor: 199900, category: "APPAREL" }],
    });
    await app.deps.repos.createReceipt({
      userId,
      imageKey: "receipts/gst.jpg",
      merchant: "Myntra",
      purchasedAt: new Date(),
      totalMinor: 199900,
      ocrJson: {},
      purchaseId: purchase.purchase.id,
    });

    const created = await app.inject({
      method: "POST",
      url: "/returns",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { purchaseId: purchase.purchase.id },
    });
    expect(created.statusCode).toBe(201);
    const ret = created.json() as { id: string };

    const req = await app.inject({
      method: "POST",
      url: `/returns/${ret.id}/request-invoice`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });
    expect(req.statusCode).toBe(200);
    const body = req.json() as {
      invoiceRequestedAt: string;
      packet: { requestUrl: string | null; subject: string };
      request: {
        invoiceRequestedAt: string | null;
        invoiceReceiptId: string | null;
        invoiceVaultHref: string | null;
      };
    };
    expect(body.invoiceRequestedAt).toBeTruthy();
    expect(body.packet.subject).toMatch(/GST invoice/i);
    expect(body.packet.requestUrl).toMatch(/^mailto:/);
    expect(body.request.invoiceRequestedAt).toBeTruthy();
    expect(body.request.invoiceReceiptId).toBeTruthy();
    expect(body.request.invoiceVaultHref).toContain("focus=gst");

    await app.close();
  });

  it("uploads return label and marks used", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    const purchase = await app.deps.repos.createMerchantPurchase({
      userId,
      source: "MANUAL",
      merchant: "Ajio",
      purchasedAt: new Date(),
      currency: "INR",
      totalMinor: 5000,
      items: [{ title: "Tee", priceMinor: 5000 }],
    });
    const created = await app.inject({
      method: "POST",
      url: "/returns",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { purchaseId: purchase.purchase.id },
    });
    const ret = created.json() as { id: string };

    const upload = await app.inject({
      method: "POST",
      url: `/returns/${ret.id}/label`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { imageKey: `returns/${userId}/${ret.id}/label.jpg` },
    });
    expect(upload.statusCode).toBe(200);
    const labeled = upload.json() as { labelImageKey: string | null; labelUsedAt: string | null };
    expect(labeled.labelImageKey).toContain("label.jpg");
    expect(labeled.labelUsedAt).toBeNull();

    const used = await app.inject({
      method: "POST",
      url: `/returns/${ret.id}/label/used`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });
    expect(used.statusCode).toBe(200);
    expect((used.json() as { labelUsedAt: string | null }).labelUsedAt).toBeTruthy();

    await app.close();
  });
});

describe("returns: guards, dedupe and idempotent refunds", () => {
  async function seed() {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    const bought = await app.deps.repos.createMerchantPurchase({
      userId,
      source: "EMAIL",
      merchant: "Myntra",
      purchasedAt: new Date(),
      currency: "INR",
      totalMinor: 20000,
      items: [{ title: "Sneakers", priceMinor: 20000, category: "FOOTWEAR" }],
    });
    const auth = { authorization: `Bearer ${accessToken}` };
    return { app, userId, auth, purchaseId: bought.purchase.id, itemId: bought.items[0]!.id };
  }

  it("POST /returns twice for the same line returns the open return (200), not a second one", async () => {
    const { app, userId, auth, itemId } = await seed();
    const first = await app.inject({ method: "POST", url: "/returns", headers: auth, payload: { purchaseItemId: itemId } });
    expect(first.statusCode).toBe(201);
    const [again, twin] = await Promise.all([
      app.inject({ method: "POST", url: "/returns", headers: auth, payload: { purchaseItemId: itemId } }),
      app.inject({ method: "POST", url: `/returns/${itemId}/initiate`, headers: auth, payload: {} }),
    ]);
    expect(again.statusCode).toBe(200);
    expect((again.json() as ReturnRequest).id).toBe(first.json().id);
    expect(twin.statusCode).toBe(200);
    expect((twin.json() as ReturnRequest).id).toBe(first.json().id);
    expect((await app.deps.repos.listReturnRequests(userId)).length).toBe(1);
    await app.close();
  });

  it("a write from a stale read cannot resurrect an EXPIRED return (409, row unchanged)", async () => {
    const { app, userId, auth, purchaseId } = await seed();
    const created = await app.inject({ method: "POST", url: "/returns", headers: auth, payload: { purchaseId } });
    const id = created.json().id as string;
    await app.inject({ method: "POST", url: `/returns/${id}/initiate`, headers: auth, payload: {} });
    const stale = await app.deps.repos.findReturnRequest(id, userId);
    // The deadline job (or GET expiry) wins the race after the route's read.
    await app.deps.repos.updateReturnRequest(id, { state: "EXPIRED" }, { actor: "system.expire" });
    const realFind = app.deps.repos.findReturnRequest.bind(app.deps.repos);
    app.deps.repos.findReturnRequest = async (rid, uid) => (rid === id ? stale : realFind(rid, uid));
    const pickup = await app.inject({
      method: "POST",
      url: `/returns/${id}/pickup`,
      headers: auth,
      payload: { pickupSlotAt: new Date(Date.now() + 86_400_000).toISOString() },
    });
    expect(pickup.statusCode).toBe(409);
    expect(pickup.json().message).toBe("Cannot transition EXPIRED -> PICKUP_SCHEDULED");
    app.deps.repos.findReturnRequest = realFind;
    expect((await app.deps.repos.findReturnRequest(id, userId))?.state).toBe("EXPIRED");
    await app.close();
  });

  it("another user's return is 404 on every write", async () => {
    const { app, auth, purchaseId } = await seed();
    const created = await app.inject({ method: "POST", url: "/returns", headers: auth, payload: { purchaseId } });
    const id = created.json().id as string;
    const other = await login(app, "919876500001");
    const otherAuth = { authorization: `Bearer ${other.accessToken}` };
    for (const [url, payload] of [
      [`/returns/${id}/chase/escalate`, {}],
      [`/returns/${id}/label`, { imageKey: "returns/x/label.jpg" }],
      [`/returns/${id}/window`, { windowDeadline: new Date().toISOString(), reason: "x" }],
      [`/returns/${id}/refund`, { destination: "UPI" }],
    ] as const) {
      const res = await app.inject({ method: "POST", url, headers: otherAuth, payload });
      expect(res.statusCode, url).toBe(404);
    }
    await app.close();
  });

  it("refund posts one ledger credit and one account, and a retry after a failed state write completes it", async () => {
    const { app, userId, auth, purchaseId } = await seed();
    const created = await app.inject({ method: "POST", url: "/returns", headers: auth, payload: { purchaseId } });
    const id = created.json().id as string;
    await app.inject({ method: "POST", url: `/returns/${id}/initiate`, headers: auth, payload: {} });
    await app.inject({ method: "POST", url: `/returns/${id}/confirm`, headers: auth, payload: {} });

    // The ledger commits, then the state write fails (crash / pool error).
    const realUpdate = app.deps.repos.updateReturnRequest.bind(app.deps.repos);
    app.deps.repos.updateReturnRequest = async (rid, patch, opts) => {
      if (patch.state === "REFUNDED") throw new Error("connection lost");
      return realUpdate(rid, patch, opts);
    };
    const failed = await app.inject({ method: "POST", url: `/returns/${id}/refund`, headers: auth, payload: { destination: "UPI" } });
    expect(failed.statusCode).toBe(500);
    app.deps.repos.updateReturnRequest = realUpdate;

    const retry = await app.inject({ method: "POST", url: `/returns/${id}/refund`, headers: auth, payload: { destination: "UPI" } });
    expect(retry.statusCode).toBe(200);
    expect(retry.json()).toMatchObject({ id, state: "REFUNDED", refundMinor: 20000 });
    const replay = await app.inject({ method: "POST", url: `/returns/${id}/refund`, headers: auth, payload: { destination: "UPI" } });
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toMatchObject({ id, state: "REFUNDED", refundMinor: 20000 });

    const accounts = await app.deps.repos.listMoneyAccounts(userId);
    expect(accounts.filter((a) => a.merchant === "Refund").length).toBe(1);
    const refunds = await app.deps.repos.listMoneyLedgerByRefs(userId, [id], "REFUND");
    expect(refunds.length).toBe(1);
    expect(refunds[0]!.delta).toBe(20000);
    await app.close();
  });

  it("concurrent refunds credit once", async () => {
    const { app, userId, auth, purchaseId } = await seed();
    const created = await app.inject({ method: "POST", url: "/returns", headers: auth, payload: { purchaseId } });
    const id = created.json().id as string;
    await app.inject({ method: "POST", url: `/returns/${id}/initiate`, headers: auth, payload: {} });
    await app.inject({ method: "POST", url: `/returns/${id}/confirm`, headers: auth, payload: {} });
    const results = await Promise.all(
      [0, 1, 2].map(() =>
        app.inject({ method: "POST", url: `/returns/${id}/refund`, headers: auth, payload: { destination: "UPI" } }),
      ),
    );
    expect(results.map((r) => r.statusCode)).toEqual([200, 200, 200]);
    expect((await app.deps.repos.listMoneyLedgerByRefs(userId, [id], "REFUND")).length).toBe(1);
    expect((await app.deps.repos.listMoneyAccounts(userId)).length).toBe(1);
    await app.close();
  });

  it("GET /returns expires overdue rows in one pass and records a system event", async () => {
    const { app, userId, auth } = await seed();
    const past = new Date(Date.now() - 86_400_000);
    const a = await app.deps.repos.createReturnRequest({ userId, purchaseId: null, purchaseItemId: null, windowDeadline: past });
    const list = await app.inject({ method: "GET", url: "/returns", headers: auth });
    expect(list.statusCode).toBe(200);
    expect((list.json() as ReturnsListResponse).returns.find((r) => r.id === a.id)?.state).toBe("EXPIRED");
    const events = await app.deps.repos.listReturnEvents(a.id);
    expect(events.filter((e) => e.toState === "EXPIRED").map((e) => e.actor)).toEqual(["system.expire"]);
    // A second GET writes nothing more.
    await app.inject({ method: "GET", url: "/returns", headers: auth });
    expect((await app.deps.repos.listReturnEvents(a.id)).length).toBe(events.length);
    await app.close();
  });
});
