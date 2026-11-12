import { describe, expect, it } from "vitest";
import {
  buildGiftDeadlineBoard,
  daysUntil,
  computeGiftDeadlineReminderDelayMs,
  GIFT_DEADLINE_LEAD_DAYS,
  giftDeadlineReminderJobId,
  listGiftBudgetLocks,
  lockShortlistOfThree,
  setGiftBudgetLock,
} from "./gift-deadline.js";
import { createMemoryRepositories } from "./repositories/memory.js";

describe("U049 gift-deadline", () => {
  it("builds deadline board with shortlist 3 + budget lock + T-7/T-2", async () => {
    const repos = createMemoryRepositories();
    const { user } = await repos.createUser("+919800000331");
    const mom = await repos.createRecipient({ userId: user.id, name: "Mom", relationship: "FAMILY", region: "IN" });
    expect([...GIFT_DEADLINE_LEAD_DAYS]).toEqual([7, 2]);
    const short = lockShortlistOfThree(["a", "b", "c", "d"], 500000);
    expect(short.shortlistIds).toEqual(["a", "b", "c"]);

    await setGiftBudgetLock(repos, user.id, {
      recipientId: mom.id,
      occasion: "BIRTHDAY",
      date: "2026-09-10T00:00:00.000Z",
      budgetLockMinor: 500000,
      shortlistIds: short.shortlistIds,
    });

    const board = buildGiftDeadlineBoard(
      [
        {
          recipientId: mom.id,
          recipientName: "Mom",
          occasion: "BIRTHDAY",
          label: "Mom bday",
          date: "2026-09-10T00:00:00.000Z",
        },
      ],
      await listGiftBudgetLocks(repos, user.id),
      new Date("2026-08-27T00:00:00.000Z"),
    );
    expect(board[0]?.budgetLockMinor).toBe(500000);
    expect(board[0]?.currency).toBe("INR");
    expect(board[0]?.shortlistCount).toBe(3);
    expect(board[0]?.reminderLeads).toEqual([7, 2]);

    const delay7 = computeGiftDeadlineReminderDelayMs(
      "2026-09-10T00:00:00.000Z",
      7,
      new Date("2026-08-27T00:00:00.000Z"),
    );
    expect(delay7).toBeGreaterThan(0);
    expect(giftDeadlineReminderJobId("r1", "BIRTHDAY", "2026-09-10T00:00:00.000Z", 7)).toContain(
      "T-7",
    );
  });

  it("one lock per recipient, occasion and day: a repeat replaces it", async () => {
    const repos = createMemoryRepositories();
    const { user } = await repos.createUser("+919800000332");
    const dad = await repos.createRecipient({ userId: user.id, name: "Dad", relationship: "FAMILY", region: "IN" });
    const input = { recipientId: dad.id, occasion: "BIRTHDAY", date: "2026-12-01T00:00:00.000Z" };
    await setGiftBudgetLock(repos, user.id, { ...input, budgetLockMinor: 100_000, currency: "USD", shortlistIds: ["x"] });
    const second = await setGiftBudgetLock(repos, user.id, { ...input, budgetLockMinor: 250_000, currency: "USD" });
    expect(second).toMatchObject({ budgetLockMinor: 250_000, currency: "USD", shortlistIds: [] });
    expect(await repos.listGiftBudgetLocks(user.id)).toHaveLength(1);
    // Another day of the same occasion is its own lock.
    await setGiftBudgetLock(repos, user.id, { ...input, date: "2027-12-01T00:00:00.000Z", budgetLockMinor: 1 });
    expect(await repos.listGiftBudgetLocks(user.id)).toHaveLength(2);
  });

  it("refuses a lock on someone else's recipient", async () => {
    const repos = createMemoryRepositories();
    const { user } = await repos.createUser("+919800000333");
    const { user: other } = await repos.createUser("+919800000334");
    const theirs = await repos.createRecipient({ userId: other.id, name: "Sis", relationship: "FAMILY", region: "IN" });
    const lock = await setGiftBudgetLock(repos, user.id, {
      recipientId: theirs.id,
      occasion: "BIRTHDAY",
      date: "2026-12-01T00:00:00.000Z",
      budgetLockMinor: 1,
    });
    expect(lock).toBeNull();
    expect(await repos.listGiftBudgetLocks(user.id)).toEqual([]);
    expect(await repos.listGiftBudgetLocks(other.id)).toEqual([]);
  });

  it("counts days from the user's own date, not the UTC date", () => {
    const row = [{ recipientId: "r1", recipientName: "Mom", occasion: "BIRTHDAY", date: "2026-09-10T00:00:00.000Z" }];
    // 00:30 IST on Sep 9 is still Sep 8 in UTC: one day to go in India, two by the UTC date.
    const lateNight = new Date("2026-09-08T19:00:00.000Z");
    expect(buildGiftDeadlineBoard(row, [], lateNight, "Asia/Kolkata")[0]?.daysUntil).toBe(1);
    expect(buildGiftDeadlineBoard(row, [], lateNight, "UTC")[0]?.daysUntil).toBe(2);
    // New York is behind UTC: 21:00 on Sep 8 there is already Sep 9 in UTC.
    const evening = new Date("2026-09-09T01:00:00.000Z");
    expect(daysUntil(row[0]!.date, "America/New_York", evening)).toBe(2);
    expect(daysUntil(row[0]!.date, "Not/AZone", evening)).toBe(1);
  });
});
