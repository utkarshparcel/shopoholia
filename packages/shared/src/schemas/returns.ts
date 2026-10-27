import { z } from "zod";

export const ReturnStateSchema = z.enum([
  "REQUESTED",
  "INITIATED",
  "PICKUP_SCHEDULED",
  "CONFIRMED",
  "REFUNDED",
  "EXPIRED",
  "CANCELLED",
]);
export type ReturnState = z.infer<typeof ReturnStateSchema>;

/** N17 / U016 — size / fit outcome captured at return time (SIZE_* family included). */
export const SizeReturnReasonSchema = z.enum([
  "TOO_SMALL",
  "TOO_BIG",
  "SIZE_TOO_SMALL",
  "SIZE_TOO_BIG",
  "WRONG_ITEM",
  "QUALITY",
  "OTHER",
]);
export type SizeReturnReason = z.infer<typeof SizeReturnReasonSchema>;

export const ReturnRequestSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  purchaseId: z.string().uuid().nullable(),
  purchaseItemId: z.string().uuid().nullable(),
  windowDeadline: z.string().datetime(),
  /** Size-exchange deadline — may differ from return/refund window. */
  exchangeDeadline: z.string().datetime().nullable().optional(),
  state: ReturnStateSchema,
  refundMinor: z.number().int().nullable(),
  method: z.string().nullable(),
  tracking: z.string().nullable(),
  /** Scheduled logistics pickup (WV01-PICKUP-BOOK). */
  pickupSlotAt: z.string().datetime().nullable().optional(),
  /** Prefill merchant return portal URL on initiate. */
  merchantReturnUrl: z.string().url().nullable().optional(),
  /** N17 — size inconsistency reason when known. */
  reason: SizeReturnReasonSchema.nullable().optional(),
  orderedSize: z.string().nullable().optional(),
  preferredSize: z.string().nullable().optional(),
  /** U020 — chase snooze until (ISO); suppress overdue chase checklist. */
  chaseSnoozeUntil: z.string().datetime().nullable().optional(),
  /** U020 — escalate overdue refund chase for ops. */
  chaseEscalated: z.boolean().optional(),
  /** Enriched for concierge copy — optional so older clients stay compatible. */
  merchant: z.string().nullable().optional(),
  itemTitle: z.string().nullable().optional(),
  /** U017 — order ref from purchase graph for portal checklist. */
  orderRef: z.string().nullable().optional(),
  /** U026 — GST invoice requested at (ISO). */
  invoiceRequestedAt: z.string().datetime().nullable().optional(),
  /** U026 — vault receipt id when invoice later arrives. */
  invoiceReceiptId: z.string().uuid().nullable().optional(),
  /** U026 — deep link into vault GST when invoice linked. */
  invoiceVaultHref: z.string().nullable().optional(),
  /** U029 — return label object key. */
  labelImageKey: z.string().nullable().optional(),
  /** U029 — signed URL for offline-capable display. */
  labelImageUrl: z.string().nullable().optional(),
  /** U029 — when pickup agent used the label. */
  labelUsedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ReturnRequest = z.infer<typeof ReturnRequestSchema>;

/** U026 — request missing GST invoice. */
export const RequestGstInvoiceBodySchema = z.object({
  contactOverride: z.string().max(256).optional(),
});
export type RequestGstInvoiceBody = z.infer<typeof RequestGstInvoiceBodySchema>;

export const RequestGstInvoiceResponseSchema = z.object({
  request: ReturnRequestSchema,
  packet: z.object({
    subject: z.string(),
    emailBody: z.string(),
    requestUrl: z.string().nullable(),
    shareText: z.string(),
    contact: z.string(),
  }),
  invoiceRequestedAt: z.string().datetime(),
});
export type RequestGstInvoiceResponse = z.infer<typeof RequestGstInvoiceResponseSchema>;

/** U029 — attach return label image key (after client upload to R2). */
export const AttachReturnLabelBodySchema = z.object({
  imageKey: z.string().min(1).max(512),
});
export type AttachReturnLabelBody = z.infer<typeof AttachReturnLabelBodySchema>;

export const ReturnEventSchema = z.object({
  id: z.string().uuid(),
  returnRequestId: z.string().uuid(),
  fromState: z.string().nullable(),
  toState: z.string(),
  actor: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type ReturnEvent = z.infer<typeof ReturnEventSchema>;

export const CreateReturnBodySchema = z.object({
  purchaseId: z.string().uuid().optional(),
  purchaseItemId: z.string().uuid().optional(),
  method: z.string().optional(),
  reason: SizeReturnReasonSchema.optional(),
  orderedSize: z.string().max(32).optional(),
  preferredSize: z.string().max(32).optional(),
});
export type CreateReturnBody = z.infer<typeof CreateReturnBodySchema>;

export const InitiateReturnBodySchema = z.object({
  purchaseId: z.string().uuid().optional(),
  purchaseItemId: z.string().uuid().optional(),
  method: z.string().optional(),
  reason: SizeReturnReasonSchema.optional(),
  orderedSize: z.string().max(32).optional(),
  preferredSize: z.string().max(32).optional(),
});
export type InitiateReturnBody = z.infer<typeof InitiateReturnBodySchema>;

export const ConfirmReturnBodySchema = z.object({
  tracking: z.string().optional(),
});
export type ConfirmReturnBody = z.infer<typeof ConfirmReturnBodySchema>;

/** WV01-PICKUP-BOOK — book a logistics pickup slot after initiate. */
export const BookPickupBodySchema = z.object({
  pickupSlotAt: z.string().datetime(),
});
export type BookPickupBody = z.infer<typeof BookPickupBodySchema>;

/** U019 — reschedule while PICKUP_SCHEDULED (same state, new slot). */
export const ReschedulePickupBodySchema = z.object({
  pickupSlotAt: z.string().datetime(),
});
export type ReschedulePickupBody = z.infer<typeof ReschedulePickupBodySchema>;

/** U020 — snooze refund chase checklist. */
export const RefundChaseSnoozeBodySchema = z.object({
  days: z.number().int().min(1).max(14).optional(),
});
export type RefundChaseSnoozeBody = z.infer<typeof RefundChaseSnoozeBodySchema>;

/** U025 — user-correctable return window end date. */
export const CorrectReturnWindowBodySchema = z.object({
  windowDeadline: z.string().datetime(),
  reason: z.string().min(1).max(500),
});
export type CorrectReturnWindowBody = z.infer<typeof CorrectReturnWindowBodySchema>;
export const ReturnsListResponseSchema = z.object({
  returns: z.array(ReturnRequestSchema),
});
export type ReturnsListResponse = z.infer<typeof ReturnsListResponseSchema>;

export const ReturnDetailResponseSchema = z.object({
  request: ReturnRequestSchema,
  events: z.array(ReturnEventSchema),
});
export type ReturnDetailResponse = z.infer<typeof ReturnDetailResponseSchema>;

/** N16 — Refund ETA board step (INITIATED → CONFIRMED → REFUNDED). */
export const RefundEtaPipelineStepSchema = z.object({
  id: z.enum(["INITIATED", "CONFIRMED", "REFUNDED"]),
  label: z.string(),
  state: z.enum(["done", "current", "todo"]),
});
export type RefundEtaPipelineStep = z.infer<typeof RefundEtaPipelineStepSchema>;

export const RefundEtaBoardRowSchema = z.object({
  returnId: z.string().uuid(),
  merchant: z.string().nullable(),
  itemTitle: z.string().nullable(),
  tracking: z.string().nullable(),
  state: ReturnStateSchema,
  pipeline: z.array(RefundEtaPipelineStepSchema),
  etaAt: z.string().datetime().nullable(),
  daysLeft: z.number().int().nullable(),
  refundMinor: z.number().int().nullable(),
  ledgerCredited: z.boolean(),
  ledgerAmountMinor: z.number().int().nullable(),
  ledgerCreditedAt: z.string().datetime().nullable(),
});
export type RefundEtaBoardRow = z.infer<typeof RefundEtaBoardRowSchema>;

export const RefundEtaBoardResponseSchema = z.object({
  board: z.array(RefundEtaBoardRowSchema),
});
export type RefundEtaBoardResponse = z.infer<typeof RefundEtaBoardResponseSchema>;

/** N17 — per-brand size inconsistency map. */
export const SizeMapHistoryEntrySchema = z.object({
  returnId: z.string().uuid(),
  brand: z.string(),
  merchant: z.string().nullable(),
  itemTitle: z.string().nullable(),
  category: z.string().nullable(),
  orderedSize: z.string().nullable(),
  preferredSize: z.string().nullable(),
  reason: SizeReturnReasonSchema,
  returnedAt: z.string().datetime(),
});
export type SizeMapHistoryEntry = z.infer<typeof SizeMapHistoryEntrySchema>;

export const SizeMapBrandRowSchema = z.object({
  brand: z.string(),
  sampleCount: z.number().int().nonnegative(),
  outcomes: z.object({
    tooSmall: z.number().int().nonnegative(),
    tooBig: z.number().int().nonnegative(),
    keptOrOther: z.number().int().nonnegative(),
  }),
  suggestedDelta: z.union([z.literal(-1), z.literal(0), z.literal(1)]).nullable(),
  history: z.array(SizeMapHistoryEntrySchema),
});
export type SizeMapBrandRow = z.infer<typeof SizeMapBrandRowSchema>;

export const SizeMapResponseSchema = z.object({
  brands: z.array(SizeMapBrandRowSchema),
});
export type SizeMapResponse = z.infer<typeof SizeMapResponseSchema>;
