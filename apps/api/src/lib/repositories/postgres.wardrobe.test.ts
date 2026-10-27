import { randomInt, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildServer } from "../../index.js";
import { login } from "../../test-utils.js";
import { createMockStorage, type StorageClient } from "../storage/r2.js";
import { createMemoryRepositories } from "./memory.js";
import { createPostgresRepositoriesFromUrl } from "./postgres.js";
import type { Repositories } from "./types.js";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

// The same cases run on memory (always) and Postgres (with DATABASE_URL).
describe("memory wardrobe repositories", () => {
  const repos = createMemoryRepositories();
  wardrobeCases(() => repos, false);
});

describePostgres("Postgres wardrobe repositories", () => {
  const repos = databaseUrl ? createPostgresRepositoriesFromUrl(databaseUrl) : null!;
  wardrobeCases(() => repos, true);
});

function wardrobeCases(getRepos: () => Repositories, postgres: boolean) {
  async function newUser() {
    const { user } = await getRepos().createUser(`9${randomInt(10 ** 10, 10 ** 11)}`);
    return user.id;
  }
  const item = (userId: string, extra: Record<string, unknown> = {}) =>
    getRepos().createWardrobeItem({ userId, category: "tee", imageKeys: ["wardrobe/x.jpg"], ...extra });

  it("claims a try-on once; only a PROCESSING row can be finished; FAILED waits for retryAfter", async () => {
    const repos = getRepos();
    const userId = await newUser();
    const { id } = await item(userId);
    const staleBefore = new Date(Date.now() - 60_000);
    const claims = await Promise.all(
      [1, 2, 3].map(() => repos.claimWardrobeTryon({ userId, wardrobeItemId: id, provider: "mock", staleBefore })),
    );
    expect(claims.filter((c) => c.claimed)).toHaveLength(1);
    expect(claims.every((c) => c.preview.status === "PROCESSING")).toBe(true);

    const retryAfter = new Date(Date.now() + 60_000);
    const failed = await repos.finishWardrobeTryon(userId, id, { status: "FAILED", error: "down", retryAfter });
    expect(failed?.status).toBe("FAILED");
    // Already finished: a late duplicate render can't overwrite it.
    expect(
      await repos.finishWardrobeTryon(userId, id, { status: "READY", imageKey: "k", provider: "mock", costMicros: 1 }),
    ).toBeNull();
    expect((await repos.claimWardrobeTryon({ userId, wardrobeItemId: id, provider: "mock", staleBefore })).claimed).toBe(
      false,
    );
    // A FAILED row whose retryAfter has passed may be claimed again; a READY one never.
    const second = await item(userId);
    const claim = () =>
      repos.claimWardrobeTryon({ userId, wardrobeItemId: second.id, provider: "mock", staleBefore });
    expect((await claim()).claimed).toBe(true);
    await repos.finishWardrobeTryon(userId, second.id, {
      status: "FAILED",
      error: "down",
      retryAfter: new Date(Date.now() - 1_000),
    });
    expect((await claim()).claimed).toBe(true);
    const ready = await repos.finishWardrobeTryon(userId, second.id, {
      status: "READY",
      imageKey: `u/${userId}/tryon/${second.id}.jpg`,
      provider: "mock",
      costMicros: 5,
    });
    expect(ready).toMatchObject({ status: "READY", error: null, retryAfter: null });
    expect((await claim()).claimed).toBe(false);
    // A PROCESSING claim older than staleBefore counts as lost.
    const third = await item(userId);
    await repos.claimWardrobeTryon({ userId, wardrobeItemId: third.id, provider: "mock", staleBefore });
    const stale = await repos.claimWardrobeTryon({
      userId,
      wardrobeItemId: third.id,
      provider: "mock",
      staleBefore: new Date(Date.now() + 60_000),
    });
    expect(stale.claimed).toBe(true);
  });

  it("claims a fit preview once per (user, template, selections)", async () => {
    const repos = getRepos();
    const userId = await newUser();
    await repos.seedCustomizationTemplates();
    const [template] = await repos.listCustomizationTemplates();
    const input = {
      userId,
      templateId: template!.id,
      selectionsKey: `sel-${randomUUID()}`,
      garmentKey: "fit/preview/t.jpg",
      provider: "mock",
      staleBefore: new Date(Date.now() - 60_000),
    };
    const claims = await Promise.all([1, 2, 3].map(() => repos.claimFitPreview(input)));
    expect(claims.filter((c) => c.claimed)).toHaveLength(1);
    expect(new Set(claims.map((c) => c.preview.id)).size).toBe(1);
    const id = claims[0]!.preview.id;
    const other = await newUser();
    expect(await repos.findFitPreview(id, other)).toBeNull();
    expect(await repos.finishFitPreview(id, other, { status: "READY", imageKey: "k", provider: "m", costMicros: 0 })).toBeNull();
    const done = await repos.finishFitPreview(id, userId, { status: "READY", imageKey: "k", provider: "m", costMicros: 0 });
    expect(done?.status).toBe("READY");
  });

  it("logs a wear once per idempotencyKey, also when the retries race", async () => {
    const repos = getRepos();
    const userId = await newUser();
    const { id } = await item(userId);
    const key = randomUUID();
    const results = await Promise.all(
      [1, 2, 3].map(() => repos.createWearLog({ userId, wardrobeItemId: id, idempotencyKey: key })),
    );
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(new Set(results.map((r) => r.log.id)).size).toBe(1);
    expect((await repos.findItemMetric(userId, id))?.wearCount).toBe(1);
    // Without a key every call is a wear.
    await repos.createWearLog({ userId, wardrobeItemId: id });
    expect((await repos.findItemMetric(userId, id))?.wearCount).toBe(2);
  });

  it("imports a purchase item once, also when two imports race", async () => {
    const repos = getRepos();
    const userId = await newUser();
    const { items } = await repos.createMerchantPurchase({
      userId,
      source: "EMAIL",
      merchant: "Myntra",
      currency: "INR",
      totalMinor: 99900,
      purchasedAt: new Date(),
      items: [{ title: "Tee", category: "tee", priceMinor: 99900, qty: 1 }],
    });
    const input = { userId, category: "tee", imageKeys: [], purchaseItemId: items[0]!.id };
    const [a, b] = await Promise.all([repos.createWardrobeItems([input]), repos.createWardrobeItems([input])]);
    expect([a[0]!.created, b[0]!.created].filter(Boolean)).toHaveLength(1);
    expect(a[0]!.item.id).toBe(b[0]!.item.id);
    const single = await repos.createWardrobeItem(input);
    expect(single.id).toBe(a[0]!.item.id);
    expect((await repos.listWardrobeItems(userId)).length).toBe(1);
  });

  // Memory has no foreign keys, so only Postgres can show the rollback.
  (postgres ? it : it.skip)("bulk-creates all rows or none", async () => {
    const repos = getRepos();
    const userId = await newUser();
    await expect(
      repos.createWardrobeItems([
        { userId, category: "tee", imageKeys: [] },
        { userId, category: "jeans", imageKeys: [], profileId: randomUUID() },
      ]),
    ).rejects.toThrow();
    expect(await repos.listWardrobeItems(userId)).toHaveLength(0);
  });

  it("updates many items all or nothing", async () => {
    const repos = getRepos();
    const userId = await newUser();
    const other = await newUser();
    const a = await item(userId);
    const b = await item(userId);
    const foreign = await item(other);
    expect(await repos.updateWardrobeItems(userId, [a.id, foreign.id], { laundryStatus: "DIRTY" })).toBeNull();
    expect((await repos.findWardrobeItem(a.id, userId))?.laundryStatus).toBe("CLEAN");
    const updated = await repos.updateWardrobeItems(userId, [a.id, b.id], { laundryStatus: "DIRTY" });
    expect(updated?.map((i) => i.laundryStatus)).toEqual(["DIRTY", "DIRTY"]);
  });

  it("creates one SELF profile per owner under concurrency", async () => {
    const repos = getRepos();
    const userId = await newUser();
    const made = await Promise.all([1, 2, 3, 4].map(() => repos.ensureSelfClosetProfile(userId, "Me")));
    expect(new Set(made.map((p) => p.id)).size).toBe(1);
    const selves = (await repos.listClosetProfiles(userId)).filter((p) => p.kind === "SELF");
    expect(selves).toHaveLength(1);
  });

  it("pages a profile's outfits: only outfits made entirely of its live items", async () => {
    const repos = getRepos();
    const userId = await newUser();
    const profile = await repos.createClosetProfile({ ownerUserId: userId, householdId: null, name: "P", kind: "PARTNER" });
    const mine = await item(userId, { profileId: profile.id });
    const mine2 = await item(userId, { profileId: profile.id });
    const unscoped = await item(userId);
    const all = await repos.createOutfit({ userId, itemIds: [mine.id, mine2.id] });
    await repos.createOutfit({ userId, itemIds: [mine.id, unscoped.id] });
    await repos.createOutfit({ userId, itemIds: [] });
    const page = await repos.listOutfitsPage(userId, { limit: 10, after: null, profileId: profile.id });
    expect(page.items.map((o) => o.id)).toEqual([all.id]);
    await repos.discardWardrobeItem(mine2.id, userId);
    expect((await repos.listOutfitsPage(userId, { limit: 10, after: null, profileId: profile.id })).items).toHaveLength(0);
  });

  it("discard hides an item, restore brings it back, purge deletes only an old discard", async () => {
    const repos = getRepos();
    const userId = await newUser();
    const other = await newUser();
    const a = await item(userId);
    const b = await item(userId);
    expect(await repos.discardWardrobeItem(a.id, other)).toBeNull();
    const discarded = await repos.discardWardrobeItem(a.id, userId);
    expect(discarded?.discardedAt).toBeInstanceOf(Date);
    expect((await repos.listWardrobeItems(userId)).map((i) => i.id)).toEqual([b.id]);
    expect(await repos.findWardrobeItem(a.id, userId)).toBeNull();
    expect(await repos.findWardrobeItemById(a.id)).toBeNull();
    expect(await repos.updateWardrobeItem(a.id, userId, { tags: ["x"] })).toBeNull();

    const before = new Date(Date.now() - 60_000);
    // Purge only removes a discard made at or before `discardedBefore`.
    expect(await repos.purgeDiscardedWardrobeItem(a.id, userId, before)).toBe(false);
    expect(await repos.restoreWardrobeItem(a.id, other, before)).toBeNull();
    expect((await repos.restoreWardrobeItem(a.id, userId, before))?.discardedAt).toBeNull();
    expect(await repos.purgeDiscardedWardrobeItem(a.id, userId, new Date(Date.now() + 60_000))).toBe(false);

    await repos.discardWardrobeItem(b.id, userId);
    expect(await repos.restoreWardrobeItem(b.id, userId, new Date(Date.now() + 60_000))).toBeNull();
    expect(await repos.purgeDiscardedWardrobeItem(b.id, userId, new Date(Date.now() + 60_000))).toBe(true);
    expect((await repos.listWardrobeItems(userId)).map((i) => i.id)).toEqual([a.id]);
  });

  it("rejects a client storage key outside the caller's prefix with 404, before any storage call", async () => {
    const mock = createMockStorage();
    let storageCalls = 0;
    const storage: StorageClient = {
      put: (o) => (storageCalls++, mock.put(o)),
      getSignedUrl: (k, s) => (storageCalls++, mock.getSignedUrl(k, s)),
      delete: (k) => (storageCalls++, mock.delete(k)),
      deleteMany: (ks) => (storageCalls++, mock.deleteMany(ks)),
    };
    const repos = getRepos();
    const app = await buildServer({ logger: false, deps: { repos, storage } });
    try {
      const a = await login(app, `9${randomInt(10 ** 10, 10 ** 11)}`);
      const b = await login(app, `9${randomInt(10 ** 10, 10 ** 11)}`);
      const headers = { authorization: `Bearer ${a.accessToken}` };
      const ownKey = `u/${a.userId}/wardrobe/own.jpg`;
      const legacyKey = `wardrobe/${a.userId}/old.jpg`;
      const own = await app.inject({ method: "POST", url: "/wardrobe", headers, payload: { category: "tee", imageKeys: [ownKey] } });
      expect(own.statusCode).toBe(201);
      const ownId = (own.json() as { id: string }).id;
      const legacy = await app.inject({ method: "POST", url: "/wardrobe", headers, payload: { category: "tee", imageKeys: [legacyKey] } });
      expect(legacy.statusCode).toBe(201);

      const bKey = `u/${b.userId}/wardrobe/x.jpg`;
      const foreign: Array<["POST" | "PATCH", string, Record<string, unknown>]> = [
        ["POST", "/wardrobe", { category: "tee", imageKeys: [bKey] }],
        ["POST", "/wardrobe", { category: "tee", imageKeys: [ownKey], garmentImageKey: bKey }],
        ["POST", "/wardrobe", { category: "tee", imageKeys: [`wardrobe/${b.userId}/x.jpg`] }],
        ["POST", "/wardrobe", { category: "tee", imageKeys: [`u/${a.userId}/../x.jpg`] }],
        ["POST", "/wardrobe", { category: "tee", imageKeys: ["x.jpg"] }],
        ["PATCH", `/wardrobe/${ownId}`, { imageKeys: [bKey] }],
        ["PATCH", "/wardrobe/items", { ids: [ownId], patch: { garmentImageKey: bKey } }],
        ["POST", "/wardrobe/bulk", { items: [{ category: "tee", imageKeys: [ownKey] }, { category: "tee", imageKeys: [bKey] }] }],
        ["POST", "/wardrobe/photo-dump", { photos: [{ imageKey: ownKey }, { imageKey: bKey }] }],
        ["POST", "/wardrobe/autotag", { images: [{ imageKey: bKey }] }],
        ["POST", "/fit/orders", { templateId: randomUUID(), fabricPhotoKeys: [`u/${b.userId}/fit-fabric/f.jpg`] }],
        ["POST", `/fit/orders/${randomUUID()}/fabric`, { fabricPhotoKeys: [`fit/fabric/${b.userId}/f.jpg`] }],
      ];
      storageCalls = 0;
      for (const [method, url, payload] of foreign) {
        const res = await app.inject({ method, url, headers, payload });
        expect(res.statusCode, `${method} ${url} ${JSON.stringify(payload)}`).toBe(404);
        expect((res.json() as { message: string }).message).toMatch(/^(Image|Fabric photo) not found$/);
      }
      expect(storageCalls).toBe(0);
      // Nothing was written: A still has just the two items, with their first keys.
      const items = await repos.listWardrobeItems(a.userId);
      expect(items.map((i) => i.imageKeys).sort()).toEqual([[legacyKey], [ownKey]].sort());
      expect(items.every((i) => i.garmentImageKey == null)).toBe(true);
    } finally {
      await app.close();
    }
  });
}
