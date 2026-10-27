import { beforeEach, describe, expect, it } from "vitest";
import {
  buildGiftDeadlineBoard,
  clearGiftBudgetLocks,
  computeGiftDeadlineReminderDelayMs,
  GIFT_DEADLINE_LEAD_DAYS,
  giftDeadlineReminderJobId,
  lockShortlistOfThree,
  setGiftBudgetLock,
} from "./gift-deadline.js";

describe("U049 gift-deadline", () => {
  beforeEach(() => clearGiftBudgetLocks());

  it("builds deadline board with shortlist 3 + budget lock + T-7/T-2", () => {
    expect([...GIFT_DEADLINE_LEAD_DAYS]).toEqual([7, 2]);
    const short = lockShortlistOfThree(["a", "b", "c", "d"], 500000);
    expect(short.shortlistIds).toEqual(["a", "b", "c"]);

    setGiftBudgetLock({
      recipientId: "r1",
      occasion: "BIRTHDAY",
      date: "2026-09-10T00:00:00.000Z",
      budgetLockMinor: 500000,
      shortlistIds: short.shortlistIds,
    });

    const board = buildGiftDeadlineBoard(
      [
        {
          recipientId: "r1",
          recipientName: "Mom",
          occasion: "BIRTHDAY",
          label: "Mom bday",
          date: "2026-09-10T00:00:00.000Z",
        },
      ],
      new Date("2026-08-27T00:00:00.000Z"),
    );
    expect(board[0]?.budgetLockMinor).toBe(500000);
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
});
