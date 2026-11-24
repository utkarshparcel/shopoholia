import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createMemoryRepositories } from "./memory.js";
import { createPostgresRepositoriesFromUrl } from "./postgres.js";
import type { Repositories } from "./types.js";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

// The same cases run on memory (always) and Postgres (with DATABASE_URL).
describe("memory Sign in with Apple users", () => {
  const repos = createMemoryRepositories();
  appleUserCases(() => repos);
});

describePostgres("Postgres Sign in with Apple users", () => {
  const repos = databaseUrl ? createPostgresRepositoriesFromUrl(databaseUrl) : null!;
  appleUserCases(() => repos);
});

function appleUserCases(getRepos: () => Repositories) {
  const unique = () => randomUUID().slice(0, 8);

  it("creates a user once per Apple id, with a referral code", async () => {
    const repos = getRepos();
    const appleSub = `001.${unique()}`;
    const email = `${unique()}@privaterelay.appleid.com`;
    const first = await repos.findOrCreateAppleUser({ appleSub, email, displayName: "Asha" });
    expect(first.isNew).toBe(true);
    expect(first.user).toMatchObject({ appleSub, email, googleSub: null, phone: null, displayName: "Asha" });
    expect(first.user.referralCode).toBeTruthy();

    const again = await repos.findOrCreateAppleUser({ appleSub, email, displayName: null });
    expect(again).toMatchObject({ isNew: false, user: { id: first.user.id, displayName: "Asha" } });
    expect((await repos.findUserByAppleSub(appleSub))?.id).toBe(first.user.id);
  });

  it("creates users without an email", async () => {
    const repos = getRepos();
    const a = await repos.findOrCreateAppleUser({ appleSub: `001.${unique()}`, email: null });
    const b = await repos.findOrCreateAppleUser({ appleSub: `001.${unique()}`, email: null });
    expect(a.isNew && b.isNew).toBe(true);
    expect(a.user.email).toBeNull();
    expect(a.user.id).not.toBe(b.user.id);
  });

  it("links the Apple id to the account that already has the email", async () => {
    const repos = getRepos();
    const email = `${unique()}@worncloset.app`;
    const google = await repos.findOrCreateGoogleUser({ googleSub: `g-${unique()}`, email, displayName: "G" });
    const appleSub = `001.${unique()}`;
    const linked = await repos.findOrCreateAppleUser({ appleSub, email: email.toUpperCase(), displayName: "A" });
    expect(linked.isNew).toBe(false);
    expect(linked.user).toMatchObject({ id: google.user.id, appleSub, googleSub: google.user.googleSub, displayName: "G" });
    expect((await repos.findUserByAppleSub(appleSub))?.id).toBe(google.user.id);
  });

  it("stores the encrypted Apple refresh token off the user record, replaces it, and erases it with the user", async () => {
    const repos = getRepos();
    const { user } = await repos.findOrCreateAppleUser({ appleSub: `001.${unique()}`, email: null });
    expect(await repos.getAppleRefreshToken(user.id)).toBeNull();

    await repos.setAppleRefreshToken(user.id, "v2:blob-1");
    await repos.setAppleRefreshToken(user.id, "v2:blob-2");
    expect(await repos.getAppleRefreshToken(user.id)).toBe("v2:blob-2");
    expect(JSON.stringify(await repos.findUserById(user.id))).not.toContain("blob-2");
    // The user's data export leaves it out.
    expect(JSON.stringify(await repos.exportUserTables(user.id))).not.toContain("blob-2");

    await repos.setAppleRefreshToken(user.id, null);
    expect(await repos.getAppleRefreshToken(user.id)).toBeNull();
    await repos.setAppleRefreshToken(user.id, "v2:blob-3");
    await repos.deleteAllUserData(user.id);
    expect(await repos.getAppleRefreshToken(user.id)).toBeNull();
    // An unknown user is a no-op.
    await repos.setAppleRefreshToken(user.id, "v2:blob-4");
    expect(await repos.getAppleRefreshToken(user.id)).toBeNull();
  });
}
