/**
 * W059 — Bulk wardrobe import progress (N/M, cancel, per-item errors).
 */

export type BulkImportPhase = "idle" | "running" | "cancelled" | "done";

export type BulkImportItemError = {
  index: number;
  message: string;
};

export type BulkImportProgressState = {
  phase: BulkImportPhase;
  total: number;
  completed: number;
  created: number;
  errors: BulkImportItemError[];
  cancelled: boolean;
};

export type BulkImportProgressEvent =
  | { type: "start"; total: number }
  | { type: "item_ok"; index: number }
  | { type: "item_fail"; index: number; message: string }
  | { type: "cancel" }
  | { type: "finish" }
  | { type: "reset" };

export const INITIAL_BULK_IMPORT_PROGRESS: BulkImportProgressState = {
  phase: "idle",
  total: 0,
  completed: 0,
  created: 0,
  errors: [],
  cancelled: false,
};

export function reduceBulkImportProgress(
  state: BulkImportProgressState,
  event: BulkImportProgressEvent,
): BulkImportProgressState {
  switch (event.type) {
    case "start":
      return {
        phase: "running",
        total: Math.max(0, event.total),
        completed: 0,
        created: 0,
        errors: [],
        cancelled: false,
      };
    case "item_ok":
      if (state.phase !== "running" || state.cancelled) return state;
      return {
        ...state,
        completed: state.completed + 1,
        created: state.created + 1,
      };
    case "item_fail":
      if (state.phase !== "running" || state.cancelled) return state;
      return {
        ...state,
        completed: state.completed + 1,
        errors: [...state.errors, { index: event.index, message: event.message }],
      };
    case "cancel":
      if (state.phase !== "running") return state;
      return { ...state, phase: "cancelled", cancelled: true };
    case "finish":
      return {
        ...state,
        phase: state.cancelled ? "cancelled" : "done",
      };
    case "reset":
      return INITIAL_BULK_IMPORT_PROGRESS;
    default:
      return state;
  }
}

/** Progress label e.g. "3/8". */
export function bulkImportProgressLabel(state: BulkImportProgressState): string {
  if (state.total <= 0) return "0/0";
  return `${Math.min(state.completed, state.total)}/${state.total}`;
}

export function bulkImportCanCancel(state: BulkImportProgressState): boolean {
  return state.phase === "running" && !state.cancelled;
}
