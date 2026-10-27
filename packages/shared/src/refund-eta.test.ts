import { describe, expect, it } from "vitest";
import {
  buildRefundEtaBoard,
  buildRefundEtaBoardRow,
  guessRefundEtaAt,
  isOnRefundEtaBoard,
  isOpenRefundEta,
  refundEtaDaysForState,
  refundEtaPipeline,
} from "./refund-eta.js";

describe("refund-eta", () => {
  it("guesses days by pipeline state", () => {
    expect(refundEtaDaysForState("INITIATED")).toBe(10);
    expect(refundEtaDaysForState("CONFIRMED")).toBe(5);
    expect(refundEtaDaysForState("REFUNDED")).toBeNull();
    expect(isOpenRefundEta("INITIATED")).toBe(true);
    expect(isOpenRefundEta("REFUNDED")).toBe(false);
    expect(isOnRefundEtaBoard("REFUNDED")).toBe(true);
  });

  it("builds INITIATED→CONFIRMED→REFUNDED pipeline", () => {
    const steps = refundEtaPipeline("CONFIRMED");
    expect(steps.map((s) => s.id)).toEqual(["INITIATED", "CONFIRMED", "REFUNDED"]);
    expect(steps.map((s) => s.state)).toEqual(["done", "current", "todo"]);
  });

  it("treats unknown / pickup states in pipeline", () => {
    expect(refundEtaPipeline("PICKUP_SCHEDULED").map((s) => s.state)).toEqual([
      "current",
      "todo",
      "todo",
    ]);
    expect(refundEtaPipeline("NOPE").every((s) => s.state === "todo")).toBe(true);
  });

  it("guesses ETA from last update", () => {
    const from = new Date("2026-08-01T12:00:00.000Z");
    const now = new Date("2026-08-02T12:00:00.000Z");
    const eta = guessRefundEtaAt("CONFIRMED", from, now);
    expect(eta?.toISOString()).toBe("2026-08-06T12:00:00.000Z");
  });

  it("uses now as base when last update is stale", () => {
    const from = new Date("2026-06-01T12:00:00.000Z");
    const now = new Date("2026-08-26T12:00:00.000Z");
    const eta = guessRefundEtaAt("INITIATED", from, now);
    expect(eta?.toISOString()).toBe("2026-09-05T12:00:00.000Z");
    expect(guessRefundEtaAt("REFUNDED", from, now)).toBeNull();
  });

  it("board query rows include ETA until ledger credit", () => {
    const now = new Date("2026-08-10T00:00:00.000Z");
    const open = buildRefundEtaBoard(
      [
        {
          id: "11111111-1111-4111-8111-111111111111",
          state: "INITIATED",
          refundMinor: null,
          merchant: "Myntra",
          itemTitle: "Jacket",
          updatedAt: "2026-08-09T00:00:00.000Z",
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          state: "REFUNDED",
          refundMinor: 5000,
          merchant: "Amazon",
          updatedAt: "2026-08-08T00:00:00.000Z",
        },
      ],
      {
        "22222222-2222-4222-8222-222222222222": {
          amountMinor: 5000,
          creditedAt: "2026-08-08T12:00:00.000Z",
        },
      },
      { now },
    );
    expect(open).toHaveLength(1);
    expect(open[0]!.state).toBe("INITIATED");
    expect(open[0]!.etaAt).toBeTruthy();
    expect(open[0]!.ledgerCredited).toBe(false);
    expect(open[0]!.pipeline.map((p) => p.state)).toEqual(["current", "todo", "todo"]);

    const all = buildRefundEtaBoard(
      [
        {
          id: "22222222-2222-4222-8222-222222222222",
          state: "REFUNDED",
          refundMinor: 5000,
          merchant: "Amazon",
          updatedAt: "2026-08-08T00:00:00.000Z",
        },
      ],
      {
        "22222222-2222-4222-8222-222222222222": {
          amountMinor: 5000,
          creditedAt: "2026-08-08T12:00:00.000Z",
        },
      },
      { all: true, now },
    );
    expect(all).toHaveLength(1);
    expect(all[0]!.ledgerCredited).toBe(true);
    expect(all[0]!.ledgerAmountMinor).toBe(5000);
    expect(all[0]!.etaAt).toBeNull();
    expect(all[0]!.pipeline.at(-1)?.state).toBe("current");
  });

  it("marks ledgerCredited only when ledger hint present", () => {
    const row = buildRefundEtaBoardRow(
      {
        id: "33333333-3333-4333-8333-333333333333",
        state: "REFUNDED",
        refundMinor: 100,
        updatedAt: "2026-08-08T00:00:00.000Z",
      },
      null,
    );
    expect(row.ledgerCredited).toBe(false);
  });

  it("accepts Map ledger hints and sorts open before refunded", () => {
    const now = new Date("2026-08-10T00:00:00.000Z");
    const board = buildRefundEtaBoard(
      [
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          state: "REFUNDED",
          refundMinor: 100,
          updatedAt: "2026-08-01T00:00:00.000Z",
        },
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          state: "CONFIRMED",
          refundMinor: null,
          updatedAt: "2026-08-09T00:00:00.000Z",
        },
      ],
      new Map([
        [
          "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          { amountMinor: 100, creditedAt: "2026-08-02T00:00:00.000Z" },
        ],
      ]),
      { all: true, now },
    );
    expect(board[0]!.state).toBe("CONFIRMED");
    expect(board[1]!.ledgerCredited).toBe(true);
  });
});
