/**
 * N12 — Scan brand watches against affiliate listings; enqueue price-drop notify.
 */
import {
  listingMatchesBrand,
  priceDropThresholdMet,
  type sendExpoPush,
} from "@worn/shared";
import { parseRealPriceToMinor } from "./prebuy-fit.js";
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
    if (!listingMatchesBrand(watch.brand, listing)) continue;
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
  const redisUrl = process.env.PRICE_DROP_REDIS_URL ?? process.env.REDIS_URL;
  if (!redisUrl) return "skipped";
  try {
    const { Queue } = await import("bullmq");
    const queue = new Queue(PRICE_DROP_QUEUE, { connection: redisUrl });
    await queue.add(PRICE_DROP_JOB, payload, {
      delay: 100,
      jobId: priceDropJobId(payload.watchId, payload.listingId),
    });
    await queue.close();
    return "published";
  } catch (err) {
    console.warn("[price-drop] enqueue failed", String(err));
    return "skipped";
  }
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
  repos: Pick<Repositories, "recordPushEvent" | "findUserById" | "updatePushEventStatus">,
  opts: { now?: Date; sendExpo?: typeof sendExpoPush } = {},
) {
  const { runClosetPushDelivery } = await import("@worn/shared");
  const user = (await repos.findUserById(payload.userId)) ?? {
    consentFlags: {},
    pushToken: null,
  };
  const dropMinor = Math.max(0, payload.watchedPriceMinor - payload.currentPriceMinor);
  return runClosetPushDelivery({
    eventType: PRICE_DROP_EVENT,
    consentFlags: user.consentFlags,
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
      return { id: event.id };
    },
    markStatus: async (id, status, expoTicketId) => {
      await repos.updatePushEventStatus?.(id, status, expoTicketId);
    },
  });
}

/** Scan active watches × catalog; update lastSeen; enqueue notifies for hits. */
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
  const { items: listings } = await repos.listListings({ limit: 200 });
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
  return { hits, scannedListings: listings.length };
}
