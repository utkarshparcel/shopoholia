import { randomInt, randomUUID } from "node:crypto";
import { createDb } from "@worn/db";
import { describe, expect, it } from "vitest";
import { createMemoryRepositories } from "./memory.js";
import { createPostgresRepositories } from "./postgres.js";
import type { Repositories } from "./types.js";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

/**
 * S6-13: Closet state that lived in module-level maps is stored through the repositories. The
 * same cases run on memory (always) and Postgres (with DATABASE_URL); on Postgres every read goes
 * through a second, separate connection, as another API instance or a restarted one would.
 */
describe("memory Closet state repositories", () => {
  const repos = createMemoryRepositories();
  closetStateCases(() => ({ writer: repos, reader: repos }));
});

describePostgres("Postgres Closet state repositories", () => {
  const writer = databaseUrl ? createPostgresRepositories(createDb(databaseUrl)) : null!;
  const reader = databaseUrl ? createPostgresRepositories(createDb(databaseUrl)) : null!;
  closetStateCases(() => ({ writer, reader }));
});

function closetStateCases(get: () => { writer: Repositories; reader: Repositories }) {
  async function newUser() {
    const { user } = await get().writer.createUser(`9${randomInt(10 ** 10, 10 ** 11)}`);
    return user;
  }

  it("merchant aliases: one per user and alias, per user", async () => {
    const { writer, reader } = get();
    const user = await newUser();
    const other = await newUser();
    await writer.upsertMerchantAlias(user.id, "AMZN MKTP", "Amazon");
    await writer.upsertMerchantAlias(user.id, "AMZN MKTP", "Amazon India");
    await writer.upsertMerchantAlias(user.id, "AJIO RELIANCE", "Ajio");
    expect((await reader.listMerchantAliases(user.id)).map((a) => [a.alias, a.canonical])).toEqual([
      ["AJIO RELIANCE", "Ajio"],
      ["AMZN MKTP", "Amazon India"],
    ]);
    expect(await reader.listMerchantAliases(other.id)).toEqual([]);
  });

  it("parser-break flags are shared, replaced per merchant and cleared", async () => {
    const { writer, reader } = get();
    const key = `M${randomUUID().slice(0, 8).toUpperCase()}`;
    const setAt = new Date("2026-11-01T10:00:00.000Z");
    await writer.setParserBreakFlag({ merchantKey: key, merchant: key, reason: "5xx", region: null, setAt });
    const later = new Date("2026-11-02T10:00:00.000Z");
    await writer.setParserBreakFlag({ merchantKey: key, merchant: key, reason: "layout", region: "IN", setAt: later });
    const mine = (await reader.listParserBreakFlags()).filter((f) => f.merchantKey === key);
    expect(mine).toEqual([{ merchantKey: key, merchant: key, reason: "layout", region: "IN", setAt: later }]);
    await writer.clearParserBreakFlag(key);
    await writer.clearParserBreakFlag(key);
    expect((await reader.listParserBreakFlags()).some((f) => f.merchantKey === key)).toBe(false);
  });

  it("gift budget locks: one per recipient, occasion and day; only on the user's recipient", async () => {
    const { writer, reader } = get();
    const user = await newUser();
    const other = await newUser();
    const recipient = await writer.createRecipient({ userId: user.id, name: "Mom", relationship: "FAMILY", region: "IN" });
    const base = {
      userId: user.id,
      recipientId: recipient.id,
      occasion: "BIRTHDAY",
      occasionDay: "2027-03-10",
      occasionDate: new Date("2027-03-10T00:00:00.000Z"),
      currency: "INR",
      lockedAt: new Date("2026-11-12T00:00:00.000Z"),
    };
    const first = await writer.upsertGiftBudgetLock({ ...base, budgetLockMinor: 100, shortlistIds: ["a"] });
    const second = await writer.upsertGiftBudgetLock({ ...base, budgetLockMinor: 200, shortlistIds: ["b", "c"] });
    expect(second?.id).toBe(first?.id);
    expect(await reader.listGiftBudgetLocks(user.id)).toEqual([
      { ...base, id: first!.id, budgetLockMinor: 200, shortlistIds: ["b", "c"] },
    ]);
    expect(await writer.upsertGiftBudgetLock({ ...base, userId: other.id, budgetLockMinor: 1, shortlistIds: [] })).toBeNull();
    expect(await reader.listGiftBudgetLocks(other.id)).toEqual([]);
  });

  it("parser training fixtures keep structured fields and their export status", async () => {
    const { writer, reader } = get();
    const user = await newUser();
    const doc = await writer.createIngestionDocument({ userId: user.id, kind: "EMAIL", rawKey: "", parsedJson: {} });
    const fixture = {
      id: randomUUID(),
      userId: user.id,
      documentId: doc.id,
      kind: "EMAIL",
      merchantHint: "Myntra",
      fields: ["merchant", "totalMinor"],
      before: { merchant: null, totalMinor: 100, currency: null },
      after: { merchant: "Myntra", totalMinor: 19900, currency: "INR" },
      exportStatus: "QUEUED" as const,
      createdAt: new Date(Date.now() + 60_000),
    };
    await writer.insertParserTrainingFixture(fixture);
    expect((await reader.listParserTrainingFixtures({ limit: 1 }))[0]).toEqual(fixture);
    expect((await reader.listParserTrainingFixtures({ exportStatus: "QUEUED", limit: 1000 })).map((f) => f.id)).toContain(
      fixture.id,
    );
    expect((await reader.listParserTrainingFixtures({ exportStatus: "SKIPPED", limit: 1000 })).map((f) => f.id)).not.toContain(
      fixture.id,
    );
  });

  it("lent write-off notes, reconcile marks, item marks, pickups and bookings are the owner's only", async () => {
    const { writer, reader } = get();
    const user = await newUser();
    const other = await newUser();
    const item = await writer.createWardrobeItem({ userId: user.id, category: "jacket" });

    await writer.appendLentWasteNote({ userId: user.id, wardrobeItemId: item.id, note: "Lost while lent to Ria" });
    expect((await reader.listLentWasteNotes(user.id)).map((n) => [n.wardrobeItemId, n.note])).toEqual([
      [item.id, "Lost while lent to Ria"],
    ]);
    expect(await reader.listLentWasteNotes(other.id)).toEqual([]);

    const account = await writer.createMoneyAccount({
      userId: user.id,
      kind: "GIFT_CARD",
      merchant: "Myntra",
      currency: "INR",
      balanceCacheMinor: 0,
      expiresAt: null,
      status: "ACTIVE",
    });
    const at = new Date("2026-11-12T08:00:00.000Z");
    expect(await writer.markMoneyAccountReconcileInvestigated(account.id, other.id, at)).toBeNull();
    expect(await reader.listReconcileInvestigatedAccounts(user.id)).toEqual([]);
    expect(await writer.markMoneyAccountReconcileInvestigated(account.id, user.id, at)).toEqual(at);
    expect(await reader.listReconcileInvestigatedAccounts(user.id)).toEqual([{ accountId: account.id, investigatedAt: at }]);

    const until = new Date("2027-01-01T00:00:00.000Z");
    expect(await writer.setWardrobeItemMarks(item.id, other.id, { keepSnoozedUntil: until })).toBe(false);
    expect(await writer.setWardrobeItemMarks(item.id, user.id, { keepSnoozedUntil: until })).toBe(true);
    expect(await writer.setWardrobeItemMarks(item.id, user.id, { photoDumpTriagedAt: at })).toBe(true);
    expect(await reader.getWardrobeItemMarks(item.id, user.id)).toEqual({ keepSnoozedUntil: until, photoDumpTriagedAt: at });
    expect(await reader.getWardrobeItemMarks(item.id, other.id)).toBeNull();
    await writer.setWardrobeItemMarks(item.id, user.id, { photoDumpTriagedAt: null });
    expect(await reader.getWardrobeItemMarks(item.id, user.id)).toEqual({ keepSnoozedUntil: until, photoDumpTriagedAt: null });

    await writer.seedCustomizationTemplates();
    const template = (await writer.listCustomizationTemplates("IN"))[0]!;
    const order = await writer.createTailoringOrder({
      userId: user.id,
      templateId: template.id,
      selections: {},
      expectedPickupOn: "2026-11-20",
    });
    expect((await reader.findTailoringOrder(order.id, user.id))?.expectedPickupOn).toBe("2026-11-20");
    expect(await writer.updateTailoringOrderPickup(order.id, other.id, { pickupNudgeSentAt: at })).toBeNull();
    await writer.updateTailoringOrderPickup(order.id, user.id, { pickupNudgeSentAt: at });
    // Same day again: the nudge stays sent. A new day clears it.
    await writer.updateTailoringOrderPickup(order.id, user.id, { expectedPickupOn: "2026-11-20" });
    expect((await reader.findTailoringOrder(order.id, user.id))?.pickupNudgeSentAt).toEqual(at);
    await writer.updateTailoringOrderPickup(order.id, user.id, { expectedPickupOn: "2026-11-25" });
    expect(await reader.findTailoringOrder(order.id, user.id)).toMatchObject({
      expectedPickupOn: "2026-11-25",
      pickupNudgeSentAt: null,
    });

    const first = await writer.createMeasurementProfile({ userId: user.id, points: { waist: 30 } });
    const next = await writer.createMeasurementProfile({
      userId: user.id,
      points: { waist: 32 },
      changeNote: "waist +2",
      previousId: first.id,
    });
    expect(await reader.findMeasurementProfile(next.id, user.id)).toMatchObject({ changeNote: "waist +2", previousId: first.id });

    const { listing } = await writer.openDispositionListing({ userId: user.id, wardrobeItemId: item.id, mode: "DONATE", priceMinor: null });
    const booking = {
      dispositionId: listing.id,
      partnerId: "p1",
      partnerName: "Partner",
      pickupSlotAt: "2026-11-20T05:00:00.000Z",
      bookedAt: "2026-11-12T05:00:00.000Z",
      stub: true as const,
      etaHours: 24,
    };
    expect(await writer.setDispositionPickupBooking(listing.id, other.id, booking)).toBe(false);
    expect(await reader.getDispositionPickupBooking(listing.id, user.id)).toBeNull();
    expect(await writer.setDispositionPickupBooking(listing.id, user.id, booking)).toBe(true);
    expect(await reader.getDispositionPickupBooking(listing.id, user.id)).toEqual(booking);
    expect(await reader.getDispositionPickupBooking(listing.id, other.id)).toBeNull();
  });

  it("household vault caps count one currency (S1-28)", async () => {
    const { writer, reader } = get();
    const owner = await newUser();
    const member = await newUser();
    const household = await writer.createHousehold({ name: "Home", ownerId: owner.id, inviteCode: randomUUID().slice(0, 8) });
    const ids = [household.id, member.id] as const;
    // A cap from before caps had a currency takes the first spend's.
    await writer.upsertHouseholdVaultSettings({ householdId: household.id, userId: member.id, vaultAccess: "SPEND", spendCapMinor: 5_000 });
    expect((await reader.getHouseholdVaultSettings(...ids)).spendCapCurrency).toBeNull();
    expect(await writer.tryReserveHouseholdVaultSpend(...ids, 1_000, "INR")).toMatchObject({ spentMinor: 1_000, spendCapCurrency: "INR" });
    expect(await writer.tryReserveHouseholdVaultSpend(...ids, 1_000, "USD")).toBeNull();
    expect(await reader.getHouseholdVaultSettings(...ids)).toMatchObject({ spentMinor: 1_000, spendCapCurrency: "INR" });

    // Same currency again keeps the total; another currency starts it again.
    await writer.upsertHouseholdVaultSettings({ householdId: household.id, userId: member.id, spendCapMinor: 6_000, spendCapCurrency: "INR" });
    expect((await reader.getHouseholdVaultSettings(...ids)).spentMinor).toBe(1_000);
    await writer.upsertHouseholdVaultSettings({ householdId: household.id, userId: member.id, spendCapMinor: 6_000, spendCapCurrency: "USD" });
    expect(await reader.getHouseholdVaultSettings(...ids)).toMatchObject({ spendCapCurrency: "USD", spentMinor: 0 });
    expect(await writer.tryReserveHouseholdVaultSpend(...ids, 6_000, "USD")).toMatchObject({ spentMinor: 6_000 });

    // Without a cap any currency spends, and no currency is stored.
    await writer.upsertHouseholdVaultSettings({ householdId: household.id, userId: member.id, spendCapMinor: null, spendCapCurrency: null });
    expect(await writer.tryReserveHouseholdVaultSpend(...ids, 1, "GBP")).toMatchObject({ spendCapCurrency: null });
  });

  it("export carries the new Closet state, and erasure removes it", async () => {
    const { writer, reader } = get();
    const user = await newUser();
    const item = await writer.createWardrobeItem({ userId: user.id, category: "tee" });
    const recipient = await writer.createRecipient({ userId: user.id, name: "Dad", relationship: "FAMILY", region: "IN" });
    const doc = await writer.createIngestionDocument({ userId: user.id, kind: "SMS", rawKey: "", parsedJson: {} });
    const account = await writer.createMoneyAccount({
      userId: user.id,
      kind: "STORE_CREDIT",
      merchant: "Ajio",
      currency: "INR",
      balanceCacheMinor: 0,
      expiresAt: null,
      status: "ACTIVE",
    });
    const at = new Date("2026-11-12T08:00:00.000Z");
    await writer.upsertMerchantAlias(user.id, "AJIO RELIANCE", "Ajio");
    await writer.upsertGiftBudgetLock({
      userId: user.id,
      recipientId: recipient.id,
      occasion: "DIWALI",
      occasionDay: "2027-10-29",
      occasionDate: new Date("2027-10-29T00:00:00.000Z"),
      budgetLockMinor: 500_000,
      currency: "INR",
      shortlistIds: [],
      lockedAt: at,
    });
    await writer.insertParserTrainingFixture({
      id: randomUUID(),
      userId: user.id,
      documentId: doc.id,
      kind: "SMS",
      merchantHint: null,
      fields: ["merchant"],
      before: { merchant: null, totalMinor: null, currency: null },
      after: { merchant: "Ajio", totalMinor: null, currency: null },
      exportStatus: "QUEUED",
      createdAt: at,
    });
    await writer.appendLentWasteNote({ userId: user.id, wardrobeItemId: item.id, note: "Lost while lent" });
    await writer.markMoneyAccountReconcileInvestigated(account.id, user.id, at);
    await writer.setWardrobeItemMarks(item.id, user.id, { keepSnoozedUntil: at });

    const exported = await reader.exportUserTables(user.id);
    expect(exported.tables.merchant_aliases).toHaveLength(1);
    expect(exported.tables.gift_budget_locks).toHaveLength(1);
    expect(exported.tables.parser_training_fixtures).toHaveLength(1);
    expect(exported.tables.lent_waste_notes).toHaveLength(1);
    expect(exported.tables.money_accounts![0]).toMatchObject({ reconcileInvestigatedAt: at });
    expect(exported.tables.wardrobe_items![0]).toMatchObject({ keepSnoozedUntil: at });

    await writer.deleteAllUserData(user.id);
    const after = await reader.exportUserTables(user.id);
    expect(Object.entries(after.tables).filter(([, rows]) => rows.length > 0)).toEqual([]);
    expect(await reader.listMerchantAliases(user.id)).toEqual([]);
    expect(await reader.listGiftBudgetLocks(user.id)).toEqual([]);
    expect(await reader.listLentWasteNotes(user.id)).toEqual([]);
    expect((await reader.listParserTrainingFixtures({ limit: 1000 })).some((f) => f.userId === user.id)).toBe(false);
  });
}
