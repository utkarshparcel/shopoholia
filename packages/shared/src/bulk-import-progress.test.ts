import { describe, expect, it } from "vitest";
import {
  INITIAL_BULK_IMPORT_PROGRESS,
  bulkImportCanCancel,
  bulkImportProgressLabel,
  reduceBulkImportProgress,
} from "./bulk-import-progress.js";

describe("bulk-import-progress (W059)", () => {
  it("reduces start → item_ok/fail → finish and labels progress", () => {
    let state = reduceBulkImportProgress(INITIAL_BULK_IMPORT_PROGRESS, {
      type: "start",
      total: 3,
    });
    expect(state.phase).toBe("running");
    expect(bulkImportProgressLabel(state)).toBe("0/3");
    expect(bulkImportCanCancel(state)).toBe(true);

    state = reduceBulkImportProgress(state, { type: "item_ok", index: 0 });
    state = reduceBulkImportProgress(state, {
      type: "item_fail",
      index: 1,
      message: "bad photo",
    });
    expect(state.completed).toBe(2);
    expect(state.created).toBe(1);
    expect(state.errors).toEqual([{ index: 1, message: "bad photo" }]);
    expect(bulkImportProgressLabel(state)).toBe("2/3");

    state = reduceBulkImportProgress(state, { type: "finish" });
    expect(state.phase).toBe("done");
    expect(bulkImportCanCancel(state)).toBe(false);
  });

  it("ignores item events when not running / cancelled; cancel + reset", () => {
    expect(
      reduceBulkImportProgress(INITIAL_BULK_IMPORT_PROGRESS, {
        type: "item_ok",
        index: 0,
      }),
    ).toEqual(INITIAL_BULK_IMPORT_PROGRESS);
    expect(
      reduceBulkImportProgress(INITIAL_BULK_IMPORT_PROGRESS, {
        type: "item_fail",
        index: 0,
        message: "x",
      }),
    ).toEqual(INITIAL_BULK_IMPORT_PROGRESS);
    expect(
      reduceBulkImportProgress(INITIAL_BULK_IMPORT_PROGRESS, { type: "cancel" }),
    ).toEqual(INITIAL_BULK_IMPORT_PROGRESS);

    let state = reduceBulkImportProgress(INITIAL_BULK_IMPORT_PROGRESS, {
      type: "start",
      total: -2,
    });
    expect(state.total).toBe(0);
    expect(bulkImportProgressLabel(state)).toBe("0/0");

    state = reduceBulkImportProgress(
      { ...state, total: 2, phase: "running" },
      { type: "cancel" },
    );
    expect(state.phase).toBe("cancelled");
    expect(state.cancelled).toBe(true);
    expect(bulkImportCanCancel(state)).toBe(false);

    // cancelled running ignores further item events
    const frozen = reduceBulkImportProgress(state, { type: "item_ok", index: 0 });
    expect(frozen).toEqual(state);
    expect(
      reduceBulkImportProgress(state, {
        type: "item_fail",
        index: 0,
        message: "x",
      }),
    ).toEqual(state);

    state = reduceBulkImportProgress(state, { type: "finish" });
    expect(state.phase).toBe("cancelled");

    state = reduceBulkImportProgress(state, { type: "reset" });
    expect(state).toEqual(INITIAL_BULK_IMPORT_PROGRESS);

    // default arm for unknown event shapes (defensive)
    expect(
      reduceBulkImportProgress(INITIAL_BULK_IMPORT_PROGRESS, {
        type: "nope",
      } as never),
    ).toEqual(INITIAL_BULK_IMPORT_PROGRESS);
  });
});
