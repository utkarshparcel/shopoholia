import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queueMocks = vi.hoisted(() => ({
  add: vi.fn(async () => ({})),
}));

vi.mock("bullmq", () => ({
  Queue: class MockQueue {
    add(...args: unknown[]) {
      return queueMocks.add(...args);
    }
    on() {
      return this;
    }
    close() {
      return Promise.resolve();
    }
  },
}));

import {
  PRICE_DROP_JOB,
  PRICE_DROP_SCAN_MAX_LISTINGS,
  PRICE_DROP_SCAN_PAGE,
  evaluateWatchAgainstListings,
  priceDropJobId,
  processPriceDropNotify,
  scanBrandPriceDrops,
} from "./price-drop.js";
import { jobIdFrom } from "./queues/enqueue.js";
import type { BrandPriceWatchRecord, ListingRecord } from "./repositories/types.js";

const watch: BrandPriceWatchRecord = {
  id: "w1",
  userId: "u1",
  brand: "Levi's",
  watchedPriceMinor: 300_000,
  thresholdPct: 10,
  lastSeenPriceMinor: null,
  active: true,
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  updatedAt: new Date("2026-08-01T00:00:00.000Z"),
};

function listing(i: number, overrides: Partial<ListingRecord> = {}): ListingRecord {
  return {
    id: `l${i}`,
    title: `Plain tee ${i}`,
    tags: [],
    realPrice: "₹2,999",
    status: "ACTIVE",
    ...overrides,
  } as ListingRecord;
}

/** A catalog of `total` listings served in pages, like the repo's cursor feed. */
function catalogRepos(total: number, matches: Map<number, Partial<ListingRecord>>) {
  const listListings = vi.fn(async ({ limit, cursor }: { limit: number; cursor?: string }) => {
    const start = cursor ? Number(cursor) : 0;
    const end = Math.min(total, start + limit);
    const items: ListingRecord[] = [];
    for (let i = start; i < end; i++) items.push(listing(i, matches.get(i)));
    return { items, nextCursor: end < total ? String(end) : null };
  });
  return {
    listBrandPriceWatches: vi.fn(async () => [watch]),
    listListings,
    updateBrandPriceWatch: vi.fn(async () => null),
  };
}

describe("evaluateWatchAgainstListings", () => {
  it("a blank tag does not match every brand", () => {
    expect(
      evaluateWatchAgainstListings(watch, [listing(1, { tags: ["", " "], realPrice: "₹100" })]),
    ).toEqual([]);
  });

  it("matches on the title and checks the threshold", () => {
    const hits = evaluateWatchAgainstListings(watch, [
      listing(1, { title: "Levi's 511 jeans", realPrice: "₹2,500" }),
      listing(2, { title: "Levi's 501 jeans", realPrice: "₹2,950" }),
    ]);
    expect(hits.map((h) => h.listingId)).toEqual(["l1"]);
    expect(hits[0]).toMatchObject({ currentPriceMinor: 250_000, dropPct: 16.7 });
  });
});

describe("scanBrandPriceDrops", () => {
  const originalRedis = process.env.REDIS_URL;

  beforeEach(() => {
    process.env.REDIS_URL = "redis://127.0.0.1:63807";
    queueMocks.add.mockClear();
  });

  afterEach(() => {
    if (originalRedis) process.env.REDIS_URL = originalRedis;
    else delete process.env.REDIS_URL;
  });

  it("finds a drop past the first page (API 27: not only the newest 200)", async () => {
    const deep = PRICE_DROP_SCAN_PAGE * 3 + 7;
    const repos = catalogRepos(PRICE_DROP_SCAN_PAGE * 4, new Map([
      [deep, { title: "Levi's 511 jeans", realPrice: "₹2,500" }],
    ]));
    const result = await scanBrandPriceDrops(repos, "u1");
    expect(result.scannedListings).toBe(PRICE_DROP_SCAN_PAGE * 4);
    expect(repos.listListings).toHaveBeenCalledTimes(4);
    expect(result.hits.map((h) => h.listingId)).toEqual([`l${deep}`]);
    expect(result.hits[0]?.notified).toBe(true);
    expect(queueMocks.add).toHaveBeenCalledWith(
      PRICE_DROP_JOB,
      expect.objectContaining({ watchId: "w1", listingId: `l${deep}` }),
      expect.objectContaining({ jobId: jobIdFrom(priceDropJobId("w1", `l${deep}`)) }),
    );
    expect(repos.updateBrandPriceWatch).toHaveBeenCalledWith("w1", "u1", {
      lastSeenPriceMinor: 250_000,
    });
  });

  it("stops at the listing cap and says so", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const repos = catalogRepos(PRICE_DROP_SCAN_MAX_LISTINGS + PRICE_DROP_SCAN_PAGE * 2, new Map());
    const result = await scanBrandPriceDrops(repos, "u1");
    expect(result.scannedListings).toBe(PRICE_DROP_SCAN_MAX_LISTINGS);
    expect(warn).toHaveBeenCalledWith(
      "[price-drop] scan stopped at the listing cap",
      expect.objectContaining({ scannedListings: PRICE_DROP_SCAN_MAX_LISTINGS }),
    );
    warn.mockRestore();
  });

  it("reads nothing when the user has no active watch", async () => {
    const repos = catalogRepos(10, new Map());
    repos.listBrandPriceWatches.mockResolvedValue([{ ...watch, active: false }]);
    expect(await scanBrandPriceDrops(repos, "u1")).toEqual({ hits: [], scannedListings: 0 });
    expect(repos.listListings).not.toHaveBeenCalled();
  });

  it("scanning twice enqueues the same jobId (one job)", async () => {
    const repos = catalogRepos(5, new Map([[2, { title: "Levi's 511", realPrice: "₹2,000" }]]));
    await scanBrandPriceDrops(repos, "u1");
    await scanBrandPriceDrops(repos, "u1");
    const ids = new Set(queueMocks.add.mock.calls.map((c) => (c[2] as { jobId: string }).jobId));
    expect(ids.size).toBe(1);
  });
});

describe("processPriceDropNotify", () => {
  const payload = {
    userId: "u1",
    watchId: "w1",
    brand: "Levi's",
    listingId: "l9",
    listingTitle: "Levi's 511",
    watchedPriceMinor: 300_000,
    currentPriceMinor: 250_000,
  };
  // 17:30 IST: outside the default quiet hours.
  const now = new Date("2026-08-26T12:00:00.000Z");

  function repos(active: boolean | null) {
    const rows = new Map<string, { id: string; status: "QUEUED" | "SENT" | "FAILED" }>();
    return {
      findBrandPriceWatch: vi.fn(async () => (active === null ? null : { ...watch, active })),
      findUserById: vi.fn(async () => ({
        id: "u1",
        prefs: {},
        timeZone: "Asia/Kolkata",
        pushToken: "ExponentPushToken[abc]",
      })),
      recordPushEvent: vi.fn(async (input: { dedupeKey: string }) => {
        const existing = rows.get(input.dedupeKey);
        if (existing) return existing;
        const row = { id: `pe-${rows.size + 1}`, status: "QUEUED" as const };
        rows.set(input.dedupeKey, row);
        return row;
      }),
      updatePushEventStatus: vi.fn(async (id: string, status: "SENT" | "FAILED") => {
        for (const row of rows.values()) if (row.id === id) row.status = status;
      }),
    };
  }

  it("sends once when run twice", async () => {
    const r = repos(true);
    const sendExpo = vi.fn(async () => ({ ok: true as const, ticketId: "t1" }));
    const first = await processPriceDropNotify(payload, r as never, { now, sendExpo });
    const second = await processPriceDropNotify(payload, r as never, { now, sendExpo });
    expect(first.status).toBe("sent");
    expect(second.status).toBe("skipped");
    expect(sendExpo).toHaveBeenCalledTimes(1);
  });

  it("skips when the watch was paused or deleted after the scan", async () => {
    const sendExpo = vi.fn();
    expect((await processPriceDropNotify(payload, repos(false) as never, { now, sendExpo })).status).toBe(
      "skipped",
    );
    expect((await processPriceDropNotify(payload, repos(null) as never, { now, sendExpo })).status).toBe(
      "skipped",
    );
    expect(sendExpo).not.toHaveBeenCalled();
  });
});
