import { describe, expect, it } from "vitest";
import { DEFAULT_CPW_THRESHOLD, DEFAULT_LAUNDRY_RULES } from "@worn/shared";
import {
  appendLentWasteNote,
  dismissMissingLayer,
  getKeepSnooze,
  getPhotoDumpTriageAt,
  listLentWasteNotes,
  setKeepSnooze,
  setPhotoDumpTriageAt,
  getCpwThreshold,
  getLaundryRules,
  listDismissedMissingLayers,
  setCpwThreshold,
  setLaundryRules,
} from "./closet-ops-prefs.js";
import { createMemoryRepositories } from "./repositories/memory.js";
import { buildTestServer, login } from "../test-utils.js";

describe("closet ops prefs live in users.prefs", () => {
  it("laundry rules and CPW threshold default, merge and persist", async () => {
    const repos = createMemoryRepositories();
    const { user } = await repos.createUser("+919800000101");
    expect(await getLaundryRules(repos, user.id)).toEqual(DEFAULT_LAUNDRY_RULES);
    expect(await getCpwThreshold(repos, user.id)).toEqual(DEFAULT_CPW_THRESHOLD);

    await setLaundryRules(repos, user.id, { dirtyAfterWears: 3 });
    const merged = await setLaundryRules(repos, user.id, { dirtyOnSweatTag: true });
    expect(merged).toEqual({ dirtyAfterWears: 3, dirtyOnSweatTag: true });
    expect((await repos.getUserPrefs(user.id))?.laundryRules).toEqual(merged);

    await setCpwThreshold(repos, user.id, { maxCpwMinor: 150_00 });
    expect((await repos.getUserPrefs(user.id))?.cpwThreshold).toEqual({ maxCpwMinor: 150_00 });
    // The other key is untouched by a sibling write.
    expect((await repos.getUserPrefs(user.id))?.laundryRules).toEqual(merged);
  });

  it("dismissals are idempotent, capped at 50 and bounded in length", async () => {
    const repos = createMemoryRepositories();
    const { user } = await repos.createUser("+919800000102");
    expect(await dismissMissingLayer(repos, user.id, "layer-rain")).toEqual(["layer-rain"]);
    expect(await dismissMissingLayer(repos, user.id, "layer-rain")).toEqual(["layer-rain"]);
    for (let i = 0; i < 60; i++) await dismissMissingLayer(repos, user.id, `gap-${i}`);
    const ids = await listDismissedMissingLayers(repos, user.id);
    expect(ids).toHaveLength(50);
    expect(ids.at(-1)).toBe("gap-59");
    expect(ids).not.toContain("layer-rain");
    await expect(dismissMissingLayer(repos, user.id, "x".repeat(65))).rejects.toThrow(RangeError);
  });

  it("a write for a missing user throws instead of returning unsaved prefs", async () => {
    const repos = createMemoryRepositories();
    await expect(setLaundryRules(repos, "00000000-0000-4000-8000-000000000000", { dirtyAfterWears: 2 })).rejects.toThrow(
      /user not found/,
    );
  });

  it("routes read back what they wrote, per user", async () => {
    const { app } = await buildTestServer();
    const a = await login(app, "+919800000103");
    const b = await login(app, "+919800000104");
    const put = await app.inject({
      method: "PUT",
      url: "/wardrobe/laundry-rules",
      headers: { authorization: `Bearer ${a.accessToken}` },
      payload: { dirtyAfterWears: 4 },
    });
    expect(put.statusCode).toBe(200);
    const getA = await app.inject({
      method: "GET",
      url: "/wardrobe/laundry-rules",
      headers: { authorization: `Bearer ${a.accessToken}` },
    });
    expect(getA.json()).toEqual({ dirtyAfterWears: 4, dirtyOnSweatTag: DEFAULT_LAUNDRY_RULES.dirtyOnSweatTag });
    const getB = await app.inject({
      method: "GET",
      url: "/wardrobe/laundry-rules",
      headers: { authorization: `Bearer ${b.accessToken}` },
    });
    expect(getB.json()).toEqual(DEFAULT_LAUNDRY_RULES);

    const tooLong = await app.inject({
      method: "POST",
      url: `/wardrobe/missing-layers/${"x".repeat(65)}/dismiss`,
      headers: { authorization: `Bearer ${a.accessToken}` },
    });
    expect(tooLong.statusCode).toBe(400);
  });
});

describe("closet ops state lives in the repositories, not the process", () => {
  it("keep snooze and photo-dump triage are on the user's item only", async () => {
    const repos = createMemoryRepositories();
    const { user } = await repos.createUser("+919800000105");
    const { user: other } = await repos.createUser("+919800000106");
    const item = await repos.createWardrobeItem({ userId: user.id, category: "top" });
    expect(await getKeepSnooze(repos, user.id, item.id)).toBeNull();
    expect(await setKeepSnooze(repos, user.id, item.id, "2026-12-01T00:00:00.000Z")).toBe(true);
    expect(await getKeepSnooze(repos, user.id, item.id)).toBe("2026-12-01T00:00:00.000Z");
    // Another user can neither read nor set it.
    expect(await getKeepSnooze(repos, other.id, item.id)).toBeNull();
    expect(await setKeepSnooze(repos, other.id, item.id, "2027-01-01T00:00:00.000Z")).toBe(false);

    const at = new Date("2026-11-12T09:00:00.000Z");
    await setPhotoDumpTriageAt(repos, user.id, item.id, at);
    expect(await getPhotoDumpTriageAt(repos, user.id, item.id)).toBe(at.toISOString());
    // Setting one mark leaves the other alone; null clears.
    expect(await getKeepSnooze(repos, user.id, item.id)).toBe("2026-12-01T00:00:00.000Z");
    await setPhotoDumpTriageAt(repos, user.id, item.id, null);
    expect(await getPhotoDumpTriageAt(repos, user.id, item.id)).toBeNull();
  });

  it("lent write-off notes are stored per user", async () => {
    const repos = createMemoryRepositories();
    const { user } = await repos.createUser("+919800000107");
    const { user: other } = await repos.createUser("+919800000108");
    const item = await repos.createWardrobeItem({ userId: user.id, category: "jacket" });
    await appendLentWasteNote(repos, user.id, item.id, "Lost while lent to Ria — jacket written off.");
    expect(await listLentWasteNotes(repos, user.id)).toEqual(["Lost while lent to Ria — jacket written off."]);
    expect(await listLentWasteNotes(repos, other.id)).toEqual([]);
    expect((await repos.listLentWasteNotes(user.id))[0]).toMatchObject({ wardrobeItemId: item.id });
  });
});
