import { and, eq, inArray, sql } from "drizzle-orm";
import {
  evaluateNotificationGateFromFlags,
  localDateKey,
  resolveTimeZone,
  runClosetPushDelivery,
  type ProcessPushResult,
  type sendExpoPush,
} from "@worn/shared";
import { outfits, pushEvents, recordPushEventIfNew, users, wardrobeItems, type Db } from "@worn/db";
import type { OutfitPayload } from "./queues.js";

export const OUTFIT_EVENT = "OUTFIT_READY";

/** Enough to pick from without loading a huge closet into the worker. */
const MAX_CANDIDATE_ITEMS = 500;

export type ClosetPushHandlerOpts = {
  now?: Date;
  sendExpo?: typeof sendExpoPush;
};

/** push_events writes for the push flow: one row per dedupe key, safe to run twice. */
export function pushRow(db: Db, userId: string, eventType: string, dedupeKey: string) {
  return {
    insertQueued: async ({ title, body, payload }: { title: string; body: string; payload: Record<string, unknown> }) => {
      const event = await recordPushEventIfNew(db, {
        userId,
        orderId: null,
        eventType,
        dedupeKey,
        title,
        body,
        payload,
        status: "QUEUED",
      });
      return { id: event.id, status: event.status };
    },
    markStatus: async (id: string, status: "SENT" | "FAILED", expoTicketId?: string | null) => {
      await db
        .update(pushEvents)
        .set({ status, expoTicketId: expoTicketId ?? null })
        .where(eq(pushEvents.id, id));
    },
  };
}

/**
 * Stub outfit generator — picks up to 3 items biased by styleProfile, as the outfit for the
 * user's local day. Quiet hours delay the whole job (so the morning push lands after the
 * window). Category opt-out still generates the outfit for /today but skips the push.
 *
 * Safe to run twice: there is one outfit per user and local day (a unique index), so a rerun,
 * or a day the user already planned in the app, reuses that outfit and its push row.
 */
export async function processOutfit(
  payload: OutfitPayload,
  db: Db,
  opts: ClosetPushHandlerOpts = {},
): Promise<{ outfitId: string | null; push?: ProcessPushResult }> {
  const now = opts.now ?? new Date();

  const [user] = await db
    .select({
      prefs: users.prefs,
      timeZone: users.timeZone,
      pushToken: users.pushToken,
      styleProfile: users.styleProfile,
    })
    .from(users)
    .where(eq(users.id, payload.userId))
    .limit(1);
  if (!user) return { outfitId: null };
  const timeZone = resolveTimeZone(user.timeZone ?? payload.timeZone);
  const gate = evaluateNotificationGateFromFlags(user.prefs, OUTFIT_EVENT, now, { timeZone });

  // Delay before side-effects so BullMQ can re-run after quiet hours without
  // duplicating outfits.
  if (gate.action === "delay") {
    return { outfitId: null, push: { status: "delayed", delayMs: gate.delayMs } };
  }

  const plannedFor = localDateKey(now, timeZone);
  const dayOutfit = async () => {
    const [row] = await db
      .select({ id: outfits.id, itemIds: outfits.itemIds })
      .from(outfits)
      .where(and(eq(outfits.userId, payload.userId), eq(outfits.plannedFor, plannedFor)))
      .limit(1);
    if (!row) return null;
    const pieces = row.itemIds.length
      ? await db
          .select({ category: wardrobeItems.category })
          .from(wardrobeItems)
          .where(and(eq(wardrobeItems.userId, payload.userId), inArray(wardrobeItems.id, row.itemIds)))
          .limit(row.itemIds.length)
      : [];
    return { id: row.id, categories: pieces.map((p) => p.category) };
  };
  let outfitId: string;
  let categories: string[];
  const planned = await dayOutfit();
  if (planned) {
    outfitId = planned.id;
    categories = planned.categories;
  } else {
    const styleProfile = (user.styleProfile as { tags?: string[] } | null) ?? null;
    const items = await db
      .select({ id: wardrobeItems.id, category: wardrobeItems.category, colors: wardrobeItems.colors })
      .from(wardrobeItems)
      .where(eq(wardrobeItems.userId, payload.userId))
      .limit(MAX_CANDIDATE_ITEMS);
    if (items.length === 0) return { outfitId: null };

    let candidates = items;
    if (styleProfile?.tags?.length) {
      const preferred = items.filter((it) =>
        styleProfile.tags!.some(
          (t) =>
            it.category.toLowerCase().includes(t.toLowerCase()) ||
            (it.colors ?? []).some((c: string) => c.toLowerCase() === t.toLowerCase()),
        ),
      );
      if (preferred.length >= 2) candidates = preferred;
    }
    const selected = candidates.slice(0, Math.min(3, candidates.length));
    const [created] = await db
      .insert(outfits)
      .values({
        userId: payload.userId,
        itemIds: selected.map((s) => s.id),
        occasion: "CASUAL",
        // No weather source in the worker: say nothing rather than invent a forecast.
        weatherCtx: null,
        plannedFor,
        generatedAt: now,
        styleProfileSnapshot: styleProfile as Record<string, unknown> | null,
      })
      .onConflictDoNothing({
        target: [outfits.userId, outfits.plannedFor],
        where: sql`${outfits.plannedFor} IS NOT NULL`,
      })
      .returning({ id: outfits.id });
    if (created) {
      outfitId = created.id;
      categories = selected.map((s) => s.category);
    } else {
      // Another run planned the day between the read and the insert.
      const winner = await dayOutfit();
      if (!winner) throw new Error("outfit for the day conflicted but could not be read back");
      outfitId = winner.id;
      categories = winner.categories;
    }
  }

  if (gate.action === "skip") {
    return { outfitId, push: { status: "skipped" } };
  }

  const push = await runClosetPushDelivery({
    eventType: OUTFIT_EVENT,
    prefs: user.prefs,
    timeZone,
    pushToken: user.pushToken,
    title: "Your outfit for today is ready",
    body: categories.length
      ? `We picked ${categories.join(", ")} for today.`
      : "Open Worn to see what to wear today.",
    deepLinkExtra: { outfitId },
    payloadExtra: { outfitId },
    now,
    sendExpo: opts.sendExpo,
    ...pushRow(db, payload.userId, OUTFIT_EVENT, `outfit:${outfitId}`),
  });

  return { outfitId, push };
}
