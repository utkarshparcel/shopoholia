import { randomInt, randomUUID } from "node:crypto";
import { createDb, consentRecords } from "@worn/db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { subjectRefFor } from "../privacy-hmac.js";
import { createMemoryRepositories } from "./memory.js";
import { createPostgresRepositories } from "./postgres.js";
import type { Repositories } from "./types.js";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

// The same cases run on memory (always) and Postgres (with DATABASE_URL).
describe("memory privacy repositories", () => {
  const repos = createMemoryRepositories();
  privacyCases(() => repos);
});

describePostgres("Postgres privacy repositories", () => {
  const db = databaseUrl ? createDb(databaseUrl) : null!;
  const repos = databaseUrl ? createPostgresRepositories(db) : null!;
  privacyCases(() => repos);

  it("erasure keeps the consent history under the subject ref, without the user id", async () => {
    const { user } = await repos.createUser(`9${randomInt(10 ** 10, 10 ** 11)}`);
    await repos.grantConsent({ userId: user.id, scope: "EMAIL", source: "test", noticeVersion: "v2" });
    await repos.deleteAllUserData(user.id);
    const kept = await db.select().from(consentRecords).where(eq(consentRecords.subjectRef, subjectRefFor(user.id)));
    expect(kept.map((r) => [r.action, r.userId]).sort()).toEqual([
      ["GRANT", null],
      ["WITHDRAW", null],
    ]);
  });
});

function privacyCases(getRepos: () => Repositories) {
  async function newUser() {
    const { user } = await getRepos().createUser(`9${randomInt(10 ** 10, 10 ** 11)}`);
    return user;
  }

  it("granting twice (even concurrently) keeps one grant and one GRANT record", async () => {
    const repos = getRepos();
    const user = await newUser();
    const grants = await Promise.all(
      Array.from({ length: 5 }, () =>
        repos.grantConsent({ userId: user.id, scope: "EMAIL", source: "app", noticeVersion: "2026-10" }),
      ),
    );
    expect(new Set(grants.map((g) => g.id)).size).toBe(1);
    const records = await repos.listConsentRecords(user.id);
    expect(records.map((r) => [r.action, r.noticeVersion, r.grantId])).toEqual([["GRANT", "2026-10", grants[0]!.id]]);
    expect(records[0]!.subjectRef).toBe(subjectRefFor(user.id));
  });

  it("withdrawal appends a record and a new grant opens a new row", async () => {
    const repos = getRepos();
    const user = await newUser();
    const first = await repos.grantConsent({ userId: user.id, scope: "SMS", source: "app" });
    await repos.revokeConsent(user.id, "SMS");
    await repos.revokeConsent(user.id, "SMS"); // nothing open: no second WITHDRAW
    const second = await repos.grantConsent({ userId: user.id, scope: "SMS", source: "app" });
    expect(second.id).not.toBe(first.id);
    const records = await repos.listConsentRecords(user.id);
    expect(records.map((r) => [r.action, r.grantId])).toEqual([
      ["GRANT", second.id],
      ["WITHDRAW", first.id],
      ["GRANT", first.id],
    ]);
    expect((await repos.listActiveConsents(user.id)).map((g) => g.id)).toEqual([second.id]);
  });

  it("opens one privacy request per subject and kind until it finishes", async () => {
    const repos = getRepos();
    const user = await newUser();
    const input = { userId: user.id, subjectRef: subjectRefFor(user.id), kind: "EXPORT" as const };
    const opened = await Promise.all([repos.createPrivacyRequest(input), repos.createPrivacyRequest(input)]);
    expect(opened.filter((o) => o.created)).toHaveLength(1);
    expect(opened[0]!.request.id).toBe(opened[1]!.request.id);
    await repos.updatePrivacyRequest(opened[0]!.request.id, { status: "DONE", completedAt: new Date() });
    const next = await repos.createPrivacyRequest(input);
    expect(next.created).toBe(true);
    expect(next.request.id).not.toBe(opened[0]!.request.id);
  });

  it("export covers the user's rows and only theirs; erasure removes them", async () => {
    const repos = getRepos();
    const user = await newUser();
    const other = await newUser();
    await repos.grantConsent({ userId: user.id, scope: "FINANCIAL", source: "app" });
    const mine = await repos.createIngestionDocument({ userId: user.id, kind: "RECEIPT", rawKey: `users/${user.id}/r.jpg`, parsedJson: {} });
    const theirs = await repos.createIngestionDocument({ userId: other.id, kind: "RECEIPT", rawKey: "", parsedJson: {} });
    const item = await repos.createWardrobeItem({ userId: user.id, category: "top", imageKeys: [`users/${user.id}/w.jpg`] });

    const exported = await repos.exportUserTables(user.id);
    expect(exported.truncated).toEqual([]);
    expect(exported.tables.users).toHaveLength(1);
    expect(exported.tables.consent_records).toHaveLength(1);
    expect(exported.tables.wardrobe_items!.map((r) => r.id)).toEqual([item.id]);
    const docIds = exported.tables.ingestion_documents!.map((r) => r.id);
    expect(docIds).toContain(mine.id);
    expect(docIds).not.toContain(theirs.id);
    expect((await repos.listUserStorageKeys(user.id)).sort()).toEqual(
      [`users/${user.id}/r.jpg`, `users/${user.id}/w.jpg`].sort(),
    );

    await repos.deleteAllUserData(user.id);
    const after = await repos.exportUserTables(user.id);
    expect(Object.entries(after.tables).filter(([, rows]) => rows.length > 0)).toEqual([]);
    expect(await repos.listConsentRecords(user.id)).toEqual([]);
    expect((await repos.listIngestionDocumentsByUser(other.id)).map((d) => d.id)).toEqual([theirs.id]);
  });

  it("lists a user's documents by owner column, newest first, bounded and filtered", async () => {
    const repos = getRepos();
    const user = await newUser();
    const other = await newUser();
    const a = await repos.createIngestionDocument({ userId: user.id, kind: "EMAIL", rawKey: "", parsedJson: {} });
    const b = await repos.createIngestionDocument({ userId: user.id, kind: "SMS", rawKey: "", parsedJson: {} });
    const c = await repos.createIngestionDocument({ userId: user.id, kind: "EMAIL", rawKey: "", parsedJson: {} });
    await repos.createIngestionDocument({ userId: other.id, kind: "EMAIL", rawKey: "", parsedJson: {} });
    const all = await repos.listIngestionDocumentsByUser(user.id);
    expect(new Set(all.map((d) => d.id))).toEqual(new Set([a.id, b.id, c.id]));
    expect(all.every((d) => d.userId === user.id)).toBe(true);
    expect(await repos.listIngestionDocumentsByUser(user.id, { limit: 2 })).toHaveLength(2);
    expect(new Set((await repos.listIngestionDocumentsByUser(user.id, { kind: "EMAIL" })).map((d) => d.id))).toEqual(
      new Set([a.id, c.id]),
    );
  });

  it("concurrent vault spends never pass the cap", async () => {
    const repos = getRepos();
    const owner = await newUser();
    const member = await newUser();
    const household = await repos.createHousehold({ name: "Home", ownerId: owner.id, inviteCode: randomUUID().slice(0, 8) });
    await repos.upsertHouseholdVaultSettings({
      householdId: household.id,
      userId: member.id,
      vaultAccess: "SPEND",
      spendCapMinor: 3000,
    });
    const results = await Promise.all(
      Array.from({ length: 6 }, () => repos.tryReserveHouseholdVaultSpend(household.id, member.id, 1000)),
    );
    expect(results.filter(Boolean)).toHaveLength(3);
    expect((await repos.getHouseholdVaultSettings(household.id, member.id)).spentMinor).toBe(3000);
    await repos.releaseHouseholdVaultSpend(household.id, member.id, 1000);
    expect((await repos.getHouseholdVaultSettings(household.id, member.id)).spentMinor).toBe(2000);
    // VIEW access reserves nothing.
    await repos.upsertHouseholdVaultSettings({ householdId: household.id, userId: member.id, vaultAccess: "VIEW" });
    expect(await repos.tryReserveHouseholdVaultSpend(household.id, member.id, 1)).toBeNull();
  });

  it("wear challenges, interview kits and polls are per owner and idempotent", async () => {
    const repos = getRepos();
    const user = await newUser();
    const other = await newUser();
    const item = await repos.createWardrobeItem({ userId: user.id, category: "top" });
    expect(await repos.startWearChallenge(user.id, item.id)).toEqual({ created: true });
    expect(await repos.startWearChallenge(user.id, item.id)).toEqual({ created: false });
    expect(await repos.listWearChallengeItemIds(user.id)).toEqual([item.id]);

    const kit = await repos.createInterviewKit({
      id: randomUUID(),
      userId: user.id,
      name: "Interview",
      kind: "interview",
      itemIds: [item.id],
      eventAt: new Date("2026-11-02T04:30:00.000Z"),
      occasion: null,
      remindAt: null,
      reminderScheduled: false,
    });
    expect(await repos.findInterviewKit(kit.id, other.id)).toBeNull();
    expect(await repos.updateInterviewKit(kit.id, other.id, { reminderScheduled: true })).toBeNull();
    expect(await repos.deleteInterviewKit(kit.id, other.id)).toBe(false);
    expect((await repos.updateInterviewKit(kit.id, user.id, { reminderScheduled: true }))?.reminderScheduled).toBe(true);
    expect((await repos.listInterviewKits(user.id, 10)).map((k) => k.id)).toEqual([kit.id]);

    const tokenHash = randomUUID();
    const poll = await repos.createSocialPoll({
      id: randomUUID(),
      userId: user.id,
      kind: "outfit",
      tokenHash,
      itemLabel: null,
      returnRequestId: null,
      options: [
        { id: "a", label: "A", itemIds: [item.id] },
        { id: "b", label: "B", itemIds: [] },
      ],
      plannedFor: "2026-11-02",
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    expect((await repos.findSocialPollByTokenHash(tokenHash))?.id).toBe(poll.id);
    expect(await repos.castSocialPollVote(poll.id, "voter-1", "a")).toEqual({ inserted: true, choice: "a" });
    expect(await repos.castSocialPollVote(poll.id, "voter-1", "b")).toEqual({ inserted: false, choice: "a" });
    expect(await repos.castSocialPollVote(poll.id, "voter-2", "b")).toEqual({ inserted: true, choice: "b" });
    expect(await repos.countSocialPollVotes(poll.id)).toEqual({ a: 1, b: 1 });
    expect(await repos.markSocialPollWinnerApplied(poll.id)).toBe(true);
    expect(await repos.markSocialPollWinnerApplied(poll.id)).toBe(false);
  });
}
