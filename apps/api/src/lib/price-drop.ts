/**
 * N12 — Scan brand watches against affiliate listings; enqueue price-drop notify.
 */
import {
  listingMatchesBrand,
  priceDropThresholdMet,
  type sendExpoPush,
} from "@worn/shared";
import { parseRealPriceToMinor } from "./prebuy-fit.js";
import { enqueueJob, jobIdFrom } from "./queues/enqueue.js";
import type {
  BrandPriceWatchRecord,
  ListingRecord,
  Repositories,
} from "./repositories/types.js";

export const PRICE_DROP_QUEUE = "price-drop";
export const PRICE_DROP_JOB = "price-drop-notify";
export const PRICE_DROP_EVENT = "PRICE_DROP";

export type PriceDropHit = {
  watchId: string;
  brand: string;
  listingId: string;
  listingTitle: string;
  watchedPriceMinor: number;
  currentPriceMinor: number;
  dropPct: number;
  thresholdPct: number;
  notified: boolean;
};

export function priceDropJobId(watchId: string, listingId: string): string {
  return `price-drop:${watchId}:${listingId}`;
}

export function evaluateWatchAgainstListings(
  watch: BrandPriceWatchRecord,
  listings: Array<Pick<ListingRecord, "id" | "title" | "tags" | "realPrice" | "status">>,
): PriceDropHit[] {
  if (!watch.active) return [];
  const hits: PriceDropHit[] = [];
  for (const listing of listings) {
    if (listing.status && listing.status !== "ACTIVE") continue;
    // A blank tag would "contain" every brand: match on title and real tags only.
    const tags = (listing.tags ?? []).filter((tag) => tag.trim().length > 0);
    if (!listingMatchesBrand(watch.brand, { title: listing.title, tags })) continue;
    const current = parseRealPriceToMinor(listing.realPrice);
    if (current == null) continue;
    if (!priceDropThresholdMet(watch.watchedPriceMinor, current, watch.thresholdPct)) {
      continue;
    }
    const dropPct =
      watch.watchedPriceMinor > 0
        ? ((watch.watchedPriceMinor - current) / watch.watchedPriceMinor) * 100
        : 0;
    hits.push({
      watchId: watch.id,
      brand: watch.brand,
      listingId: listing.id,
      listingTitle: listing.title,
      watchedPriceMinor: watch.watchedPriceMinor,
      currentPriceMinor: current,
      dropPct: Math.round(dropPct * 10) / 10,
      thresholdPct: watch.thresholdPct,
      notified: false,
    });
  }
  return hits;
}

export async function schedulePriceDropNotify(payload: {
  userId: string;
  watchId: string;
  brand: string;
  listingId: string;
  listingTitle: string;
  watchedPriceMinor: number;
  currentPriceMinor: number;
}): Promise<"published" | "skipped"> {
  // Throws QueueUnavailableError when Redis can't take it; "skipped" only without Redis off-prod.
  const result = await enqueueJob(PRICE_DROP_QUEUE, PRICE_DROP_JOB, payload, {
    jobId: jobIdFrom(priceDropJobId(payload.watchId, payload.listingId)),
  });
  return result.status === "queued" ? "published" : "skipped";
}

export async function processPriceDropNotify(
  payload: {
    userId: string;
    watchId: string;
    brand: string;
    listingId: string;
    listingTitle: string;
    watchedPriceMinor: number;
    currentPriceMinor: number;
  },
  repos: Pick<
    Repositories,
    "recordPushEvent" | "findUserById" | "updatePushEventStatus" | "findBrandPriceWatch"
  >,
  opts: { now?: Date; sendExpo?: typeof sendExpoPush } = {},
) {
  const { runClosetPushDelivery } = await import("@worn/shared");
  // Watch deleted or paused since the scan: no push.
  const watch = await repos.findBrandPriceWatch(payload.watchId, payload.userId);
  if (!watch?.active) return { status: "skipped" as const };
  const user = await repos.findUserById(payload.userId);
  if (!user) return { status: "skipped" as const };
  const dropMinor = Math.max(0, payload.watchedPriceMinor - payload.currentPriceMinor);
  return runClosetPushDelivery({
    eventType: PRICE_DROP_EVENT,
    prefs: user.prefs,
    timeZone: user.timeZone,
    pushToken: user.pushToken,
    title: `Price drop: ${payload.brand}`,
    body: `${payload.listingTitle} is down ₹${(dropMinor / 100).toFixed(0)}`,
    deepLinkExtra: { watchId: payload.watchId, listingId: payload.listingId },
    payloadExtra: {
      watchId: payload.watchId,
      listingId: payload.listingId,
      brand: payload.brand,
      watchedPriceMinor: payload.watchedPriceMinor,
      currentPriceMinor: payload.currentPriceMinor,
    },
    now: opts.now,
    sendExpo: opts.sendExpo,
    insertQueued: async ({ title, body, payload: p }) => {
      const event = await repos.recordPushEvent({
        userId: payload.userId,
        orderId: null,
        eventType: PRICE_DROP_EVENT,
        dedupeKey: priceDropJobId(payload.watchId, payload.listingId),
        title,
        body,
        payload: p,
        status: "QUEUED",
      });
      return { id: event.id, status: event.status };
    },
    markStatus: async (id, status, expoTicketId) => {
      await repos.updatePushEventStatus?.(id, status, expoTicketId);
    },
  });
}

/** Catalog page size for a scan. */
export const PRICE_DROP_SCAN_PAGE = 200;
/** Most listings one scan reads (bounds time and memory; logged when hit). */
export const PRICE_DROP_SCAN_MAX_LISTINGS = 10_000;

/**
 * Scan active watches × the whole active catalog (paged, up to PRICE_DROP_SCAN_MAX_LISTINGS);
 * update lastSeen; enqueue notifies for hits. Only matching listings are kept between pages.
 */
export async function scanBrandPriceDrops(
  repos: Pick<
    Repositories,
    | "listBrandPriceWatches"
    | "listListings"
    | "updateBrandPriceWatch"
  >,
  userId: string,
): Promise<{ hits: PriceDropHit[]; scannedListings: number }> {
  const watches = (await repos.listBrandPriceWatches(userId)).filter((w) => w.active);
  if (watches.length === 0) return { hits: [], scannedListings: 0 };
  const listings: Array<Pick<ListingRecord, "id" | "title" | "tags" | "realPrice" | "status">> = [];
  let scannedListings = 0;
  let cursor: string | undefined;
  do {
    const page = await repos.listListings({ limit: PRICE_DROP_SCAN_PAGE, cursor });
    scannedListings += page.items.length;
    for (const listing of page.items) {
      if (watches.some((watch) => evaluateWatchAgainstListings(watch, [listing]).length > 0)) {
        listings.push(listing);
      }
    }
    cursor = page.nextCursor ?? undefined;
  } while (cursor && scannedListings < PRICE_DROP_SCAN_MAX_LISTINGS);
  if (cursor) {
    console.warn("[price-drop] scan stopped at the listing cap", {
      userId,
      scannedListings,
    });
  }
  const hits: PriceDropHit[] = [];
  for (const watch of watches) {
    const watchHits = evaluateWatchAgainstListings(watch, listings);
    for (const hit of watchHits) {
      const published = await schedulePriceDropNotify({
        userId,
        watchId: hit.watchId,
        brand: hit.brand,
        listingId: hit.listingId,
        listingTitle: hit.listingTitle,
        watchedPriceMinor: hit.watchedPriceMinor,
        currentPriceMinor: hit.currentPriceMinor,
      });
      hits.push({ ...hit, notified: published === "published" });
      await repos.updateBrandPriceWatch(watch.id, userId, {
        lastSeenPriceMinor: hit.currentPriceMinor,
      });
    }
  }
  return { hits, scannedListings };
}
