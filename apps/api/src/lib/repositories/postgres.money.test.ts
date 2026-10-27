import { randomInt, randomUUID } from "node:crypto";
import { cashbackClaims, createDb, recipientProfiles } from "@worn/db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createMemoryRepositories } from "./memory.js";
import { createPostgresRepositoriesFromUrl } from "./postgres.js";
import type { CreateMerchantPurchaseInput, Repositories } from "./types.js";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

// Retries, double taps and races on the money writes. The same cases run on memory (always) and
// Postgres (with DATABASE_URL); the Postgres block adds the cases only the database enforces.
describe("memory money writes", () => {
  const repos = createMemoryRepositories();
  moneyWriteCases(() => repos);
});

describePostgres("Postgres money writes", () => {
  const repos = databaseUrl ? createPostgresRepositoriesFromUrl(databaseUrl) : null!;
  const db = databaseUrl ? createDb(databaseUrl) : null!;
  moneyWriteCases(() => repos);

  it("an EXPIRED cashback claim stays EXPIRED when claimed", async () => {
    const user = await newUser(repos);
    const claim = await repos.createCashbackClaim({ userId: user.id, source: "CRED", amountMinor: 500 });
    await db.update(cashbackClaims).set({ status: "EXPIRED" }).where(eq(cashbackClaims.id, claim.id));
    const after = await repos.claimCashbackClaim(claim.id, user.id);
    expect(after?.status).toBe("EXPIRED");
    expect(after?.claimedAt).toBeNull();
  });

  it("concurrent profile upserts leave one profile row", async () => {
    const user = await newUser(repos);
    const recipient = await repos.createRecipient({ userId: user.id, name: "Asha" });
    await Promise.all(
      ["S", "M", "L", "XL"].map((size) => repos.upsertRecipientProfile({ recipientId: recipient.id, sizes: { top: size } })),
    );
    const rows = await db.select().from(recipientProfiles).where(eq(recipientProfiles.recipientId, recipient.id));
    expect(rows).toHaveLength(1);
  });

  it("receipts and warranties need a real user", async () => {
    const ghost = randomUUID();
    await expect(
      repos.createReceipt({ userId: ghost, imageKey: "r/x.jpg", merchant: "Zara", purchasedAt: new Date(), totalMinor: 100, ocrJson: {} }),
    ).rejects.toSatisfy(isFkViolation);
    await expect(
      repos.createWarranty({ userId: ghost, itemTitle: "Watch", provider: "Titan", coverageUntil: new Date() }),
    ).rejects.toSatisfy(isFkViolation);
  });
});

function isFkViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return (e.code ?? e.cause?.code) === "23503";
}

async function newUser(repos: Repositories) {
  const { user } = await repos.createUser(`9${randomInt(10 ** 10, 10 ** 11)}`);
  return user;
}

function purchaseInput(userId: string, patch: Partial<CreateMerchantPurchaseInput> = {}): CreateMerchantPurchaseInput {
  return {
    userId,
    source: "EMAIL",
    merchant: "Myntra",
    purchasedAt: new Date("2026-10-20T10:00:00Z"),
    currency: "INR",
    totalMinor: 3000,
    items: [
      { title: "Kurta", category: "APPAREL", priceMinor: 2000 },
      { title: "Dupatta", category: "APPAREL", priceMinor: 1000 },
    ],
    ...patch,
  };
}

function moneyWriteCases(getRepos: () => Repositories) {
  const windowDeadline = new Date("2026-11-30T00:00:00Z");

  it("#38: concurrent tracks of one order make one purchase", async () => {
    const repos = getRepos();
    const user = await newUser(repos);
    const orderRef = `ORD-${randomUUID()}`;
    const results = await Promise.all(
      [1, 2, 3, 4].map(() => repos.createMerchantPurchase(purchaseInput(user.id, { orderRef }))),
    );
    expect(results.filter((r) => r.created !== false)).toHaveLength(1);
    expect(new Set(results.map((r) => r.purchase.id)).size).toBe(1);
    const purchases = (await repos.listMerchantPurchasesByUser(user.id)).filter((p) => p.orderRef === orderRef);
    expect(purchases).toHaveLength(1);
    expect(await repos.listMerchantPurchaseItems(purchases[0]!.id)).toHaveLength(2);
    // Another user may use the same order ref.
    const other = await newUser(repos);
    expect((await repos.createMerchantPurchase(purchaseInput(other.id, { orderRef }))).created).not.toBe(false);
  });

  it("receipt confirm: a double tap makes one purchase and one set of warranties", async () => {
    const repos = getRepos();
    const user = await newUser(repos);
    const receipt = await repos.createReceipt({
      userId: user.id, imageKey: "r/1.jpg", merchant: "Zara", purchasedAt: new Date(), totalMinor: 3000, ocrJson: {},
    });
    const confirm = () =>
      repos.confirmReceiptPurchase({
        receiptId: receipt.id,
        userId: user.id,
        purchase: purchaseInput(user.id, { source: "RECEIPT", merchant: "Zara" }),
        warranties: [{ userId: user.id, receiptId: receipt.id, itemTitle: "Watch", provider: "Titan", coverageUntil: new Date("2027-10-01") }],
      });
    const results = await Promise.all([confirm(), confirm(), confirm()]);
    expect(results.filter((r) => r?.created)).toHaveLength(1);
    expect(new Set(results.map((r) => r?.purchase.id)).size).toBe(1);
    expect(await repos.listMerchantPurchasesByUser(user.id)).toHaveLength(1);
    expect(await repos.listWarranties(user.id)).toHaveLength(1);
    expect((await repos.getReceipt(receipt.id, user.id))?.purchaseId).toBe(results[0]?.purchase.id);
    // Not the owner: null, nothing written.
    const other = await newUser(repos);
    expect(
      await repos.confirmReceiptPurchase({ receiptId: receipt.id, userId: other.id, purchase: purchaseInput(other.id), warranties: [] }),
    ).toBeNull();
    expect(await repos.listMerchantPurchasesByUser(other.id)).toHaveLength(0);
  });

  it("#61: one open return per line; a closed one frees the line; line-less returns are per user", async () => {
    const repos = getRepos();
    const user = await newUser(repos);
    const { purchase, items } = await repos.createMerchantPurchase(purchaseInput(user.id));
    const line = { userId: user.id, purchaseId: purchase.id, purchaseItemId: items[0]!.id, windowDeadline };
    const opened = await Promise.all([1, 2, 3, 4, 5].map(() => repos.openReturnRequest(line)));
    expect(opened.filter((o) => o.created)).toHaveLength(1);
    expect(new Set(opened.map((o) => o.request.id)).size).toBe(1);
    const first = opened[0]!.request;
    expect((await repos.listReturnEvents(first.id)).map((e) => e.toState)).toEqual(["REQUESTED"]);

    // The other line and the whole purchase are separate lines.
    expect((await repos.openReturnRequest({ ...line, purchaseItemId: items[1]!.id })).created).toBe(true);
    expect((await repos.openReturnRequest({ ...line, purchaseItemId: null })).created).toBe(true);

    await repos.updateReturnRequest(first.id, { state: "CANCELLED" }, { userId: user.id, actor: "user" });
    const reopened = await repos.openReturnRequest({ ...line, state: "INITIATED" });
    expect(reopened.created).toBe(true);
    expect(reopened.request.id).not.toBe(first.id);
    expect((await repos.listReturnEvents(reopened.request.id)).map((e) => e.toState)).toEqual(["REQUESTED", "INITIATED"]);

    const other = await newUser(repos);
    const bare = { purchaseId: null, purchaseItemId: null, windowDeadline };
    expect((await repos.openReturnRequest({ ...bare, userId: user.id })).created).toBe(true);
    expect((await repos.openReturnRequest({ ...bare, userId: other.id })).created).toBe(true);
    expect((await repos.openReturnRequest({ ...bare, userId: other.id })).created).toBe(false);
  });

  it("merge: both directions at once leave one merge; an open return on the same line rolls it back", async () => {
    const repos = getRepos();
    const user = await newUser(repos);
    const a = (await repos.createMerchantPurchase(purchaseInput(user.id))).purchase;
    const b = (await repos.createMerchantPurchase(purchaseInput(user.id, { totalMinor: 1000, items: [{ title: "Belt", priceMinor: 1000 }] }))).purchase;
    const settled = await Promise.allSettled([
      repos.mergeMerchantPurchases(user.id, a.id, b.id),
      repos.mergeMerchantPurchases(user.id, b.id, a.id),
    ]);
    expect(settled.filter((s) => s.status === "fulfilled")).toHaveLength(1);
    const rejected = settled.find((s) => s.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: "CONFLICT" });
    const merged = (settled.find((s) => s.status === "fulfilled") as PromiseFulfilledResult<{ purchase: { id: string; totalMinor: number }; items: unknown[] }>).value;
    expect(merged.items).toHaveLength(3);
    expect(merged.purchase.totalMinor).toBe(4000);

    // Whole-purchase returns open on both: the merge would leave two open returns on one line.
    const c = (await repos.createMerchantPurchase(purchaseInput(user.id))).purchase;
    const d = (await repos.createMerchantPurchase(purchaseInput(user.id))).purchase;
    await repos.openReturnRequest({ userId: user.id, purchaseId: c.id, windowDeadline });
    await repos.openReturnRequest({ userId: user.id, purchaseId: d.id, windowDeadline });
    await expect(repos.mergeMerchantPurchases(user.id, c.id, d.id)).rejects.toMatchObject({ code: "23505" });
    expect(await repos.listMerchantPurchaseItems(d.id)).toHaveLength(2);
    expect((await repos.findMerchantPurchaseById(d.id))?.status).not.toBe("DUPLICATE");
    expect((await repos.findMerchantPurchaseById(c.id))?.totalMinor).toBe(3000);
  });

  it("split moves the lines and sets both totals; another user's purchase is NOT_FOUND", async () => {
    const repos = getRepos();
    const user = await newUser(repos);
    const { purchase, items } = await repos.createMerchantPurchase(purchaseInput(user.id));
    const { original, split } = await repos.splitMerchantPurchase(user.id, { purchaseId: purchase.id, itemIds: [items[0]!.id] });
    expect(original.purchase.totalMinor + split.purchase.totalMinor).toBe(3000);
    expect(split.items.map((i) => i.id)).toEqual([items[0]!.id]);
    expect(await repos.listMerchantPurchaseItems(purchase.id)).toHaveLength(1);
    const other = await newUser(repos);
    await expect(
      repos.splitMerchantPurchase(other.id, { purchaseId: purchase.id, itemIds: [items[1]!.id] }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("#12: concurrent listings of one item leave one ACTIVE listing", async () => {
    const repos = getRepos();
    const user = await newUser(repos);
    const item = await repos.createWardrobeItem({ userId: user.id, category: "APPAREL" });
    const opened = await Promise.all(
      [1, 2, 3, 4].map(() => repos.openDispositionListing({ userId: user.id, wardrobeItemId: item.id, mode: "SELL", priceMinor: 900 })),
    );
    expect(opened.filter((o) => o.created)).toHaveLength(1);
    expect(new Set(opened.map((o) => o.listing.id)).size).toBe(1);
    const active = (await repos.listDispositionListings(user.id)).filter((l) => l.status === "ACTIVE");
    expect(active).toHaveLength(1);
    // Once it is no longer ACTIVE the item can be listed again.
    await repos.updateDispositionListing(active[0]!.id, { status: "CANCELLED" }, { fromStatuses: ["ACTIVE"] });
    expect((await repos.openDispositionListing({ userId: user.id, wardrobeItemId: item.id, mode: "DONATE" })).created).toBe(true);
  });

  it("swap: two borrowers at once, one wins", async () => {
    const repos = getRepos();
    const owner = await newUser(repos);
    const [b1, b2] = [await newUser(repos), await newUser(repos)];
    const circle = await repos.createSwapCircle({ name: "Flat 4B", ownerId: owner.id, inviteCode: randomUUID().slice(0, 8) });
    const item = await repos.createWardrobeItem({ userId: owner.id, category: "APPAREL" });
    const listing = await repos.createSwapListing({ circleId: circle.id, ownerUserId: owner.id, wardrobeItemId: item.id });
    const results = await Promise.all(
      [b1, b2].map((b) =>
        repos.updateSwapListing(listing.id, { status: "BORROWED", borrowerUserId: b!.id }, { fromStatuses: ["LISTED"] }),
      ),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    const after = await repos.findSwapListing(listing.id, circle.id);
    expect(after?.status).toBe("BORROWED");
    expect(after?.borrowerUserId).toBe(results.find(Boolean)!.borrowerUserId);
  });

  it("concurrent joins add one member row (household and swap circle)", async () => {
    const repos = getRepos();
    const owner = await newUser(repos);
    const joiner = await newUser(repos);
    const household = await repos.createHousehold({ name: "Home", ownerId: owner.id, inviteCode: randomUUID().slice(0, 8) });
    const members = await Promise.all(
      [1, 2, 3, 4].map(() => repos.addHouseholdMember({ householdId: household.id, userId: joiner.id, role: "MEMBER" })),
    );
    expect(new Set(members.map((m) => m.userId))).toEqual(new Set([joiner.id]));
    expect((await repos.listHouseholdMembers(household.id)).filter((m) => m.userId === joiner.id)).toHaveLength(1);

    const circle = await repos.createSwapCircle({ name: "Flat 4B", ownerId: owner.id, inviteCode: randomUUID().slice(0, 8) });
    await Promise.all(
      [1, 2, 3, 4].map(() => repos.addSwapCircleMember({ circleId: circle.id, userId: joiner.id, role: "MEMBER" })),
    );
    expect((await repos.listSwapCircleMembers(circle.id)).filter((m) => m.userId === joiner.id)).toHaveLength(1);
  });

  it("#54: concurrent spend rollups for one key keep one row", async () => {
    const repos = getRepos();
    const user = await newUser(repos);
    await Promise.all(
      [100, 200, 300, 400, 500].map((totalMinor) =>
        repos.upsertSpendRollup({ userId: user.id, period: "2026-10", category: "APPAREL", totalMinor }),
      ),
    );
    const rows = await repos.getSpendRollups(user.id);
    expect(rows).toHaveLength(1);
    expect([100, 200, 300, 400, 500]).toContain(rows[0]!.totalMinor);
  });

  it("EMI pay: a race applies once, a retry with the same key is a REPLAY", async () => {
    const repos = getRepos();
    const user = await newUser(repos);
    const plan = await repos.createEmiPlan({
      userId: user.id, provider: "Bajaj", principalMinor: 3000, remainingMinor: 3000, installmentMinor: 1000, nextDueOn: "2026-11-01",
    });
    const from = { remainingMinor: 3000, nextDueOn: "2026-11-01", status: "ACTIVE" as const };
    const to = { remainingMinor: 2000, nextDueOn: "2026-12-01", status: "ACTIVE" as const };
    const results = await Promise.all([
      repos.payEmiPlan(plan.id, user.id, { from, to, paymentKey: "pay-a" }),
      repos.payEmiPlan(plan.id, user.id, { from, to, paymentKey: "pay-b" }),
    ]);
    expect(results.map((r) => r?.outcome).sort()).toEqual(["APPLIED", "CONFLICT"]);
    const winner = results.find((r) => r?.outcome === "APPLIED") === results[0] ? "pay-a" : "pay-b";
    const replay = await repos.payEmiPlan(plan.id, user.id, { from, to, paymentKey: winner });
    expect(replay?.outcome).toBe("REPLAY");
    expect(replay?.plan.remainingMinor).toBe(2000);
    expect(await repos.payEmiPlan(plan.id, (await newUser(repos)).id, { from, to, paymentKey: "pay-c" })).toBeNull();
  });

  it("cashback: concurrent claims all see one CLAIMED claim", async () => {
    const repos = getRepos();
    const user = await newUser(repos);
    const claim = await repos.createCashbackClaim({ userId: user.id, source: "CRED", amountMinor: 500 });
    const results = await Promise.all([1, 2, 3].map(() => repos.claimCashbackClaim(claim.id, user.id)));
    expect(new Set(results.map((r) => r?.status))).toEqual(new Set(["CLAIMED"]));
    expect(new Set(results.map((r) => r?.claimedAt?.getTime())).size).toBe(1);
    expect(await repos.claimCashbackClaim(claim.id, (await newUser(repos)).id)).toBeNull();
  });

  it("tailoring: a DELIVERED or CANCELLED order does not move again", async () => {
    const repos = getRepos();
    const user = await newUser(repos);
    await repos.seedCustomizationTemplates();
    const [template] = await repos.listCustomizationTemplates();
    const order = await repos.createTailoringOrder({ userId: user.id, templateId: template!.id, selections: {} });
    expect((await repos.updateTailoringOrderState(order.id, "DELIVERED"))?.state).toBe("DELIVERED");
    expect(await repos.updateTailoringOrderState(order.id, "IN_STITCHING")).toBeNull();
    expect((await repos.updateTailoringOrderState(order.id, "DELIVERED"))?.state).toBe("DELIVERED");
    expect((await repos.findTailoringOrder(order.id, user.id))?.state).toBe("DELIVERED");
  });

  it("group gift: a retried key adds once; sums come back per gift", async () => {
    const repos = getRepos();
    const user = await newUser(repos);
    const recipient = await repos.createRecipient({ userId: user.id, name: "Asha" });
    const gift = await repos.createGiftOrder({ userId: user.id, recipientId: recipient.id, groupTargetMinor: 5000, groupCurrency: "INR" });
    const empty = await repos.createGiftOrder({ userId: user.id, recipientId: recipient.id, groupTargetMinor: 2000, groupCurrency: "INR" });
    const key = randomUUID();
    const tap = () => repos.createGroupGiftContribution({ giftOrderId: gift.id, contributorUserId: user.id, amountMinor: 1500, idempotencyKey: key });
    const taps = await Promise.all([tap(), tap(), tap(), tap()]);
    expect(taps.filter((t) => t.created)).toHaveLength(1);
    expect(new Set(taps.map((t) => t.contribution.id)).size).toBe(1);
    // A new key, and contributions without a key, each add.
    await repos.createGroupGiftContribution({ giftOrderId: gift.id, amountMinor: 500, idempotencyKey: randomUUID() });
    await repos.createGroupGiftContribution({ giftOrderId: gift.id, amountMinor: 250 });
    await repos.createGroupGiftContribution({ giftOrderId: gift.id, amountMinor: 250 });
    // The same key on another gift is a different contribution.
    expect((await repos.createGroupGiftContribution({ giftOrderId: empty.id, amountMinor: 100, idempotencyKey: key })).created).toBe(true);
    const sums = await repos.sumGroupGiftContributionsByOrders([gift.id, empty.id, randomUUID()]);
    expect(sums.get(gift.id)).toBe(2500);
    expect(sums.get(empty.id)).toBe(100);
    expect(sums.size).toBe(3);
    expect(await repos.sumGroupGiftContributions(gift.id)).toBe(2500);
    expect(await repos.sumGroupGiftContributionsByOrders([])).toEqual(new Map());
  });
}
