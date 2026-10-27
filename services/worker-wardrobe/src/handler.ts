/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  evaluateNotificationGateFromFlags,
  runClosetPushDelivery,
  type ProcessPushResult,
  type sendExpoPush,
} from "@worn/shared";
import { pushEvents, type Db } from "@worn/db";
import type { OutfitPayload } from "./queues.js";

export const OUTFIT_EVENT = "OUTFIT_READY";

export type ClosetPushHandlerOpts = {
  now?: Date;
  sendExpo?: typeof sendExpoPush;
};

/**
 * Stub outfit generator — picks up to 3 items biased by styleProfile.
 * Quiet hours delay the whole job (so the morning push lands after the
 * window). Category opt-out still generates the outfit for /today but skips
 * the push.
 */
export async function processOutfit(
  payload: OutfitPayload,
  db: Db,
  opts: ClosetPushHandlerOpts = {},
): Promise<{ outfitId: string | null; push?: ProcessPushResult }> {
  const { wardrobeItems, outfits, users } = await import("@worn/db");
  const now = opts.now ?? new Date();

  const [user] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
  const consentFlags = (user?.consentFlags as Record<string, unknown> | undefined) ?? {};
  const gate = evaluateNotificationGateFromFlags(consentFlags, OUTFIT_EVENT, now);

  // Delay before side-effects so BullMQ can re-run after quiet hours without
  // duplicating outfits.
  if (gate.action === "delay") {
    return { outfitId: null, push: { status: "delayed", delayMs: gate.delayMs } };
  }

  const styleProfile =
    (user?.styleProfile as unknown as { tags: string[] } | null) ?? null;

  const items = await db
    .select()
    .from(wardrobeItems)
    .where(eq(wardrobeItems.userId, payload.userId));
  if (items.length === 0) return { outfitId: null };

  let candidates = items;
  if (styleProfile?.tags?.length) {
    const preferred = items.filter((it) =>
      styleProfile.tags.some(
        (t) =>
          it.category.toLowerCase().includes(t.toLowerCase()) ||
          (it.colors ?? []).some((c: string) => c.toLowerCase() === t.toLowerCase()),
      ),
    );
    if (preferred.length >= 2) candidates = preferred;
  }
  const selected = candidates.slice(0, Math.min(3, candidates.length));
  const [outfit] = await db
    .insert(outfits)
    .values({
      id: randomUUID(),
      userId: payload.userId,
      itemIds: selected.map((s) => s.id),
      occasion: "CASUAL",
      weatherCtx: { tempC: 26, condition: "sunny", source: "worker-mock" },
      generatedAt: new Date(),
      styleProfileSnapshot: styleProfile as any,
    })
    .returning();

  if (gate.action === "skip") {
    return { outfitId: outfit!.id, push: { status: "skipped" } };
  }

  const push = await runClosetPushDelivery({
    eventType: OUTFIT_EVENT,
    consentFlags,
    pushToken: user?.pushToken ?? null,
    title: "Your outfit for today is ready",
    body: `We picked ${selected.map((s) => s.category).join(", ")} for today's weather.`,
    deepLinkExtra: { outfitId: outfit!.id },
    payloadExtra: { outfitId: outfit!.id },
    now,
    sendExpo: opts.sendExpo,
    insertQueued: async ({ title, body, payload: p }) => {
      const id = randomUUID();
      await db.insert(pushEvents).values({
        id,
        userId: payload.userId,
        orderId: null,
        eventType: OUTFIT_EVENT,
        dedupeKey: `outfit:${outfit!.id}`,
        title,
        body,
        payload: p,
        status: "QUEUED",
      });
      return { id };
    },
    markStatus: async (id, status, expoTicketId) => {
      await db
        .update(pushEvents)
        .set({ status, expoTicketId: expoTicketId ?? null })
        .where(eq(pushEvents.id, id));
    },
  });

  return { outfitId: outfit!.id, push };
}
