/**
 * S6-13 — Closet state the API used to keep in module-level maps (merchant aliases, parser-break
 * flags and dismissals, gift budget locks, keep snoozes, photo-dump triage, tailor pickup nudges,
 * disposition pickups, declutter challenges) must outlive the process. Each case writes through
 * one API instance and reads through a second one built from freshly loaded modules over the
 * same repositories, as after a deploy or on another instance.
 */
import { describe, expect, it, vi } from "vitest";
import { createMemoryRepositories } from "../lib/repositories/memory.js";
import type { Repositories } from "../lib/repositories/types.js";
import type { buildServer } from "../index.js";
import { login } from "../test-utils.js";

type App = Awaited<ReturnType<typeof buildServer>>;

/** A new API instance whose modules (and so any module-level state) are loaded afresh. */
async function freshApp(repos: Repositories): Promise<App> {
  vi.resetModules();
  const { buildServer } = await import("../index.js");
  return buildServer({ logger: false, deps: { repos } });
}

async function twoInstances(phone: string) {
  const repos = createMemoryRepositories();
  const first = await freshApp(repos);
  const a = await login(first, phone);
  const second = await freshApp(repos);
  const b = await login(second, phone);
  expect(b.userId).toBe(a.userId);
  return {
    repos,
    first,
    second,
    userId: a.userId,
    authA: { authorization: `Bearer ${a.accessToken}` },
    authB: { authorization: `Bearer ${b.accessToken}` },
  };
}

describe("Closet state survives an API restart (S6-13)", () => {
  it("merchant aliases", async () => {
    const { first, second, authA, authB } = await twoInstances("919800000401");
    const created = await first.inject({
      method: "POST",
      url: "/ingestion/merchant-aliases",
      headers: authA,
      payload: { alias: "LENSKART SOLUTIONS PVT", canonical: "Lenskart" },
    });
    expect(created.statusCode).toBe(200);
    const queue = await second.inject({ method: "GET", url: "/ingestion/unknown-merchants", headers: authB });
    expect(queue.statusCode).toBe(200);
    expect((queue.json() as { picker: string[] }).picker).toContain("Lenskart");
  });

  it("parser-break flags and a user's dismissal", async () => {
    const { repos, first, second, authA, authB } = await twoInstances("919800000402");
    const flagged = await first.inject({
      method: "POST",
      url: "/ingestion/parser-health/flag",
      headers: authA,
      payload: { merchant: "Myntra", broken: true, reason: "layout change" },
    });
    expect(flagged.statusCode).toBe(200);
    const seen = await second.inject({ method: "GET", url: "/ingestion/parser-health", headers: authB });
    expect(seen.json()).toMatchObject({ banner: { visible: true, merchants: ["Myntra"] }, flags: [{ merchant: "Myntra" }] });

    const dismissed = await second.inject({
      method: "POST",
      url: "/ingestion/parser-health/dismiss",
      headers: authB,
      payload: { merchant: "Myntra" },
    });
    expect(dismissed.json()).toMatchObject({ banner: { visible: false } });
    const third = await freshApp(repos);
    const again = await third.inject({ method: "GET", url: "/ingestion/parser-health", headers: authB });
    expect(again.json()).toMatchObject({ banner: { visible: false }, flags: [{ merchant: "Myntra" }] });
  });

  it("gift budget locks", async () => {
    const { repos, first, second, userId, authA, authB } = await twoInstances("919800000403");
    const recipient = await repos.createRecipient({ userId, name: "Mom", relationship: "FAMILY", region: "IN" });
    await repos.upsertRecipientProfile({
      recipientId: recipient.id,
      importantDates: [{ occasion: "BIRTHDAY", date: "2027-03-10T00:00:00.000Z", label: "Mom bday" }],
    });
    const lock = await first.inject({
      method: "POST",
      url: "/gifts/deadlines/lock",
      headers: authA,
      payload: {
        recipientId: recipient.id,
        occasion: "BIRTHDAY",
        date: "2027-03-10T00:00:00.000Z",
        budgetLockMinor: 300_000,
        currency: "INR",
        shortlistIds: ["a", "b"],
      },
    });
    expect(lock.statusCode).toBe(200);
    const board = await second.inject({ method: "GET", url: "/gifts/deadlines", headers: authB });
    expect((board.json() as { board: unknown[] }).board).toEqual([
      expect.objectContaining({ recipientId: recipient.id, budgetLockMinor: 300_000, currency: "INR", shortlistCount: 2 }),
    ]);
  });

  it("keep snooze from the dispose tree", async () => {
    const { first, second, authA, authB } = await twoInstances("919800000404");
    const item = await first.inject({ method: "POST", url: "/wardrobe", headers: authA, payload: { category: "kurta" } });
    const wardrobeItemId = (item.json() as { id: string }).id;
    const keep = await first.inject({
      method: "POST",
      url: "/disposition/decide",
      headers: authA,
      payload: { wardrobeItemId, stillWear: true },
    });
    expect(keep.statusCode).toBe(200);
    const until = (keep.json() as { snoozeUntil: string }).snoozeUntil;
    expect(until).toBeTruthy();
    const sell = await second.inject({
      method: "POST",
      url: "/disposition/decide",
      headers: authB,
      payload: { wardrobeItemId, stillWear: false, hasValue: false },
    });
    expect(sell.statusCode).toBe(200);
    expect((sell.json() as { snoozeUntil: string | null }).snoozeUntil).toBe(until);
  });

  it("photo-dump triage undo", async () => {
    const { first, second, authA, authB } = await twoInstances("919800000405");
    const item = await first.inject({
      method: "POST",
      url: "/wardrobe",
      headers: authA,
      payload: { category: "tee", tags: ["photo-dump"] },
    });
    const id = (item.json() as { id: string }).id;
    const triage = await first.inject({
      method: "POST",
      url: `/wardrobe/${id}/photo-dump/triage`,
      headers: authA,
      payload: { decision: "keep" },
    });
    expect(triage.statusCode).toBe(200);
    const undo = await second.inject({ method: "POST", url: `/wardrobe/${id}/photo-dump/triage/undo`, headers: authB });
    expect(undo.statusCode).toBe(200);
    // Undone once: the triage time is cleared, so a second undo has nothing to undo.
    const again = await second.inject({ method: "POST", url: `/wardrobe/${id}/photo-dump/triage/undo`, headers: authB });
    expect(again.statusCode).toBe(400);
  });

  it("a tailor pickup nudge goes out once per pickup day", async () => {
    const { first, second, authA, authB } = await twoInstances("919800000406");
    const templates = await first.inject({ method: "GET", url: "/fit/templates?region=IN", headers: authA });
    const templateId = (templates.json() as { templates: Array<{ id: string }> }).templates[0]!.id;
    const order = await first.inject({
      method: "POST",
      url: "/fit/orders",
      headers: authA,
      payload: { templateId, selections: {}, expectedPickupOn: "2026-11-20" },
    });
    expect(order.statusCode).toBe(201);
    const orderId = (order.json() as { id: string }).id;
    const nudge = (app: App, headers: Record<string, string>, payload: Record<string, string>) =>
      app.inject({ method: "POST", url: `/fit/orders/${orderId}/pickup-nudge`, headers, payload });

    expect((await nudge(first, authA, { asOf: "2026-11-19" })).json()).toMatchObject({ sent: true });
    const repeat = await nudge(second, authB, { asOf: "2026-11-19" });
    expect(repeat.json()).toMatchObject({ sent: false, order: { expectedPickupOn: "2026-11-20" } });
    // A new pickup day gets its own nudge.
    const moved = await nudge(second, authB, { expectedPickupOn: "2026-11-25", asOf: "2026-11-24" });
    expect(moved.json()).toMatchObject({ sent: true, order: { expectedPickupOn: "2026-11-25" } });
  });

  it("disposition pickup bookings and the declutter challenge", async () => {
    const { first, second, authA, authB } = await twoInstances("919800000407");
    const item = await first.inject({ method: "POST", url: "/wardrobe", headers: authA, payload: { category: "saree" } });
    const wardrobeItemId = (item.json() as { id: string }).id;
    const listing = await first.inject({
      method: "POST",
      url: "/disposition",
      headers: authA,
      payload: { wardrobeItemId, mode: "SELL", priceMinor: 50_000 },
    });
    const listingId = (listing.json() as { id: string }).id;
    const partners = await first.inject({ method: "GET", url: "/disposition/partners?mode=SELL", headers: authA });
    const partnerId = (partners.json() as { partners: Array<{ id: string }> }).partners[0]!.id;
    const book = await first.inject({
      method: "POST",
      url: `/disposition/${listingId}/pickup`,
      headers: authA,
      payload: { partnerId, pickupSlotAt: new Date(Date.now() + 2 * 86_400_000).toISOString() },
    });
    expect(book.statusCode).toBe(200);
    const challenge = await first.inject({
      method: "POST",
      url: "/disposition/challenge",
      headers: authA,
      payload: { target: 7 },
    });
    expect(challenge.statusCode).toBe(200);

    const got = await second.inject({ method: "GET", url: `/disposition/${listingId}/pickup`, headers: authB });
    expect(got.statusCode).toBe(200);
    expect(got.json()).toEqual(book.json());
    const list = await second.inject({ method: "GET", url: "/disposition", headers: authB });
    expect((list.json() as { declutterChallenge: unknown }).declutterChallenge).toMatchObject({ started: true, target: 7 });
  });
});
