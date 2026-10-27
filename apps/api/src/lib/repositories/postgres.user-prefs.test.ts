import { randomInt, randomUUID } from "node:crypto";
import { DEFAULT_NOTIFICATION_PREFERENCES, type UserPrefsPatch } from "@worn/shared";
import { describe, expect, it } from "vitest";
import { createMemoryRepositories } from "./memory.js";
import { createPostgresRepositoriesFromUrl } from "./postgres.js";
import type { Repositories } from "./types.js";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

const hold = {
  heldAt: "2026-10-26T08:00:00.000Z",
  releaseAt: "2026-10-27T08:00:00.000Z",
  category: "APPAREL",
  projectedMinor: 1250000,
  limitMinor: 1000000,
  cartFingerprint: "cart-1",
};

// The same cases run on memory (always) and Postgres (with DATABASE_URL).
describe("memory user prefs and time zone", () => {
  const repos = createMemoryRepositories();
  userPrefsAndTimeZoneCases(() => repos);
});

describePostgres("Postgres user prefs and time zone", () => {
  const repos = databaseUrl ? createPostgresRepositoriesFromUrl(databaseUrl) : null!;
  userPrefsAndTimeZoneCases(() => repos);
});

function userPrefsAndTimeZoneCases(getRepos: () => Repositories) {
  async function newUser() {
    const { user } = await getRepos().createUser(`9${randomInt(10 ** 10, 10 ** 11)}`);
    return user;
  }

  it("starts with empty prefs and Asia/Kolkata", async () => {
    const user = await newUser();
    expect(user.prefs).toEqual({});
    expect(user.timeZone).toBe("Asia/Kolkata");
    expect(await getRepos().getUserPrefs(user.id)).toEqual({});
  });

  it("returns null for a missing user", async () => {
    const id = randomUUID();
    expect(await getRepos().getUserPrefs(id)).toBeNull();
    expect(await getRepos().patchUserPrefs(id, { emailConnected: true })).toBeNull();
    expect(await getRepos().setUserTimeZone(id, "UTC")).toBeNull();
  });

  it("sets, replaces and deletes keys, leaving others alone", async () => {
    const repos = getRepos();
    const user = await newUser();
    expect(
      await repos.patchUserPrefs(user.id, { capsuleItemIds: ["a", "b"], coolingOff: hold }),
    ).toEqual({ capsuleItemIds: ["a", "b"], coolingOff: hold });
    expect(
      await repos.patchUserPrefs(user.id, { capsuleItemIds: ["c"], coolingOff: null, emailConnected: undefined }),
    ).toEqual({ capsuleItemIds: ["c"] });
    // Deleting an absent key and an empty patch are no-ops.
    expect(await repos.patchUserPrefs(user.id, { laundryRules: null })).toEqual({ capsuleItemIds: ["c"] });
    expect(await repos.patchUserPrefs(user.id, {})).toEqual({ capsuleItemIds: ["c"] });
    expect(await repos.getUserPrefs(user.id)).toEqual({ capsuleItemIds: ["c"] });
    expect((await repos.findUserById(user.id))?.prefs).toEqual({ capsuleItemIds: ["c"] });
  });

  it("keeps every key when patches to different keys run concurrently", async () => {
    const repos = getRepos();
    const user = await newUser();
    const patches: UserPrefsPatch[] = [
      { notifications: DEFAULT_NOTIFICATION_PREFERENCES },
      { coolingOff: hold },
      { capsuleItemIds: ["a"] },
      { emailConnected: true },
      { laundryRules: { dirtyAfterWears: 3, dirtyOnSweatTag: true } },
      { cpwThreshold: { maxCpwMinor: 5000 } },
    ];
    for (let round = 0; round < 5; round++) {
      await repos.patchUserPrefs(user.id, {
        notifications: null, coolingOff: null, capsuleItemIds: null,
        emailConnected: null, laundryRules: null, cpwThreshold: null,
      });
      await Promise.all(patches.map((p) => repos.patchUserPrefs(user.id, p)));
      expect(await repos.getUserPrefs(user.id)).toEqual(Object.assign({}, ...patches));
    }
  });

  it("is not written by updateUser, and doesn't touch consent flags", async () => {
    const repos = getRepos();
    const user = await newUser();
    await repos.updateUser(user.id, { consentFlags: { EMAIL: true } });
    await repos.patchUserPrefs(user.id, { emailConnected: true });
    const after = await repos.updateUser(user.id, {
      displayName: "Asha",
      prefs: { emailConnected: false },
    });
    expect(after.prefs).toEqual({ emailConnected: true });
    expect(after.consentFlags).toEqual({ EMAIL: true });
    expect(await repos.getUserPrefs(user.id)).toEqual({ emailConnected: true });
  });

  it("sets the time zone alone or through updateUser, and other updates keep it", async () => {
    const repos = getRepos();
    const user = await newUser();
    expect(await repos.setUserTimeZone(user.id, "America/New_York")).toBe("America/New_York");
    expect(await repos.setUserTimeZone(user.id, "America/New_York")).toBe("America/New_York");
    expect((await repos.updateUser(user.id, { displayName: "Asha" })).timeZone).toBe("America/New_York");
    expect((await repos.updateUser(user.id, { timeZone: "Europe/London" })).timeZone).toBe("Europe/London");
    expect((await repos.findUserById(user.id))?.timeZone).toBe("Europe/London");
  });
}
