import { afterEach, describe, expect, it, vi } from "vitest";
import {
  aggregateBrandSizeMap,
  buildRtoChecklist,
  buildRtoRecoveryBoard,
  sizeDeltaForEntry,
  sumRepairSpend,
  validateCreateRepairLog,
} from "@worn/shared";
import { buildTestServer, login } from "../test-utils.js";

describe("N15 RTO recovery checklist", () => {
  it("advances CONTACT → OPEN_REFUND → TRACK_REFUND from FAILED", () => {
    const fresh = buildRtoChecklist({
      deliveryStatus: "FAILED",
      hasReturn: false,
    });
    expect(fresh.find((s) => s.id === "CONTACT_MERCHANT")!.state).toBe("current");
    expect(fresh.find((s) => s.id === "OPEN_REFUND")!.state).toBe("todo");

    const opened = buildRtoChecklist({
      deliveryStatus: "FAILED",
      hasReturn: true,
      returnState: "INITIATED",
    });
    expect(opened.find((s) => s.id === "CONTACT_MERCHANT")!.state).toBe("done");
    expect(opened.find((s) => s.id === "OPEN_REFUND")!.state).toBe("done");
    expect(opened.find((s) => s.id === "TRACK_REFUND")!.state).toBe("current");

    const refunded = buildRtoChecklist({
      deliveryStatus: "FAILED",
      hasReturn: true,
      returnState: "REFUNDED",
      ledgerCredited: true,
    });
    expect(refunded.find((s) => s.id === "TRACK_REFUND")!.state).toBe("done");
    expect(refunded.find((s) => s.id === "CANCEL_OR_RESHIP")!.state).toBe("done");
  });

  it("builds board for FAILED packages with refund track", () => {
    const board = buildRtoRecoveryBoard(
      [
        {
          purchaseId: "11111111-1111-4111-8111-111111111111",
          merchant: "Myntra",
          orderRef: "ORD-1",
          totalMinor: 199900,
          currency: "INR",
          deliveryStatus: "FAILED",
          trackingCode: "AWB1",
          updatedAt: "2026-08-20T10:00:00.000Z",
        },
      ],
      {
        "11111111-1111-4111-8111-111111111111": {
          id: "22222222-2222-4222-8222-222222222222",
          state: "INITIATED",
          refundMinor: 199900,
          updatedAt: "2026-08-21T10:00:00.000Z",
        },
      },
    );
    expect(board).toHaveLength(1);
    expect(board[0]!.checklist.some((c) => c.id === "OPEN_REFUND" && c.state === "done")).toBe(
      true,
    );
    expect(board[0]!.refundTrack?.state).toBe("INITIATED");
    expect(board[0]!.returnId).toBe("22222222-2222-4222-8222-222222222222");
  });
});

describe("N15 RTO recovery API", () => {
  it("lists FAILED packages and starts refund claim", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);

    const created = await app.deps.repos.createMerchantPurchase({
      userId,
      source: "EMAIL",
      merchant: "Ajio",
      purchasedAt: new Date(),
      currency: "INR",
      totalMinor: 249900,
      deliveryStatus: "FAILED",
      trackingCode: "RTO-99",
      items: [{ title: "Kurti", priceMinor: 249900, brand: "Global Desi" }],
    });

    const board = await app.inject({
      method: "GET",
      url: "/packages/rto-recovery",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(board.statusCode).toBe(200);
    const body = board.json() as {
      board: Array<{ purchaseId: string; checklist: Array<{ id: string; state: string }> }>;
    };
    expect(body.board.some((r) => r.purchaseId === created.purchase.id)).toBe(true);
    const row = body.board.find((r) => r.purchaseId === created.purchase.id)!;
    expect(row.checklist.find((c) => c.id === "OPEN_REFUND")!.state).toBe("todo");

    const start = await app.inject({
      method: "POST",
      url: `/packages/${created.purchase.id}/rto/start-refund`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { method: "RTO_REFUND" },
    });
    expect(start.statusCode).toBe(200);
    const started = start.json() as {
      returnId: string | null;
      checklist: Array<{ id: string; state: string }>;
      refundTrack: { state: string } | null;
    };
    expect(started.returnId).toBeTruthy();
    expect(started.checklist.find((c) => c.id === "OPEN_REFUND")!.state).toBe("done");
    expect(started.refundTrack?.state).toBe("INITIATED");
  });
});

describe("N17 size map aggregate", () => {
  it("groups too-small / too-big per brand with suggested delta", () => {
    const brands = aggregateBrandSizeMap([
      {
        returnId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        brand: "H&M",
        merchant: "H&M",
        reason: "TOO_SMALL",
        orderedSize: "M",
        preferredSize: "L",
        returnedAt: "2026-08-01T00:00:00.000Z",
      },
      {
        returnId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        brand: "H&M",
        reason: "TOO_SMALL",
        orderedSize: "M",
        preferredSize: "L",
        returnedAt: "2026-08-02T00:00:00.000Z",
      },
      {
        returnId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        brand: "Zara",
        reason: "TOO_BIG",
        orderedSize: "L",
        preferredSize: "M",
        returnedAt: "2026-08-03T00:00:00.000Z",
      },
    ]);
    expect(brands).toHaveLength(2);
    const hm = brands.find((b) => b.brand === "H&M")!;
    expect(hm.sampleCount).toBe(2);
    expect(hm.outcomes.tooSmall).toBe(2);
    expect(hm.suggestedDelta).toBe(1);
    expect(sizeDeltaForEntry({ reason: "TOO_BIG" })).toBe(-1);
  });
});

describe("N17 size map API", () => {
  it("aggregates brand size history from returns", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);

    const created = await app.deps.repos.createMerchantPurchase({
      userId,
      source: "EMAIL",
      merchant: "Myntra",
      purchasedAt: new Date(),
      currency: "INR",
      totalMinor: 99900,
      deliveryStatus: "DELIVERED",
      items: [{ title: "Jeans", priceMinor: 99900, brand: "Levis", category: "APPAREL" }],
    });
    const itemId = created.items[0]!.id;

    const ret = await app.inject({
      method: "POST",
      url: "/returns",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        purchaseItemId: itemId,
        reason: "TOO_SMALL",
        orderedSize: "30",
        preferredSize: "32",
      },
    });
    expect(ret.statusCode).toBe(201);

    const map = await app.inject({
      method: "GET",
      url: "/returns/size-map",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(map.statusCode).toBe(200);
    const body = map.json() as {
      brands: Array<{ brand: string; sampleCount: number; suggestedDelta: number | null }>;
    };
    expect(body.brands.some((b) => b.brand === "Levis" && b.sampleCount === 1)).toBe(true);
    expect(body.brands.find((b) => b.brand === "Levis")!.suggestedDelta).toBe(1);
  });
});

describe("N21 repair log", () => {
  it("validates create and sums spend for accountant", () => {
    const ok = validateCreateRepairLog({
      costMinor: 50000,
      repairedOn: "2026-08-15",
      kind: "HEM",
    });
    expect(ok.ok).toBe(true);
    const spend = sumRepairSpend(
      [
        { costMinor: 50000, repairedOn: "2026-08-15" },
        { costMinor: 20000, repairedOn: "2026-07-01" },
      ],
      { now: new Date("2026-08-20T12:00:00.000Z") },
    );
    expect(spend.totalMinor).toBe(70000);
    expect(spend.monthlyMinor).toBe(50000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates repair log and rolls into accountant summary/ledger", async () => {
    // repairedOn below must fall in the current month for the monthly roll-up.
    vi.useFakeTimers({ now: new Date("2026-08-27T12:00:00.000Z"), toFake: ["Date"] });
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);

    // FINANCIAL consent for accountant
    await app.inject({
      method: "POST",
      url: "/vault/consent",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { userId, scope: "FINANCIAL", source: "onboarding" },
    });

    const item = await app.deps.repos.createWardrobeItem({
      userId,
      source: "MANUAL",
      category: "APPAREL",
      colors: ["navy"],
      brand: "Allen Solly",
      costMinor: 200000,
    });

    const create = await app.inject({
      method: "POST",
      url: `/wardrobe/${item.id}/repairs`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        costMinor: 35000,
        repairedOn: "2026-08-26",
        kind: "ALTERATION",
        note: "hem trousers",
      },
    });
    expect(create.statusCode).toBe(201);
    const repair = create.json() as { id: string; costMinor: number; kind: string };
    expect(repair.costMinor).toBe(35000);
    expect(repair.kind).toBe("ALTERATION");

    const list = await app.inject({
      method: "GET",
      url: `/wardrobe/${item.id}/repairs`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(list.statusCode).toBe(200);
    expect((list.json() as { repairs: unknown[] }).repairs).toHaveLength(1);

    const summary = await app.inject({
      method: "GET",
      url: "/accountant/summary",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(summary.statusCode).toBe(200);
    const s = summary.json() as {
      repairSpendMinor: number;
      monthlyRepairSpendMinor: number;
    };
    expect(s.repairSpendMinor).toBe(35000);
    expect(s.monthlyRepairSpendMinor).toBe(35000);

    const ledger = await app.inject({
      method: "GET",
      url: "/accountant/ledger",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(ledger.statusCode).toBe(200);
    const entries = (ledger.json() as { entries: Array<{ kind: string; amountMinor: number }> })
      .entries;
    expect(entries.some((e) => e.kind === "REPAIR" && e.amountMinor === -35000)).toBe(true);
  });
});
