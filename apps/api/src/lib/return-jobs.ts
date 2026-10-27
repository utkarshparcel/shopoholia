import {
  MERCHANT_RETURN_WINDOW_DAYS as SHARED_RETURN_DAYS,
  MERCHANT_EXCHANGE_WINDOW_DAYS,
  computeReturnWindowDeadline,
  computeExchangeWindowDeadline,
  merchantWindowsDiffer,
} from "@worn/shared";

export const RETURN_DEADLINE_QUEUE = "return-deadline";
export const RETURN_DEADLINE_JOB = "return-deadline-reminder";

/** Fire reminder this many ms before windowDeadline (QA:M6 / delight: 3-day nudge). */
export const RETURN_LEAD_MS = 3 * 86_400_000;

/** Storage key for brand placeholder when item has no image (W042). */
export const RETURN_DEADLINE_PLACEHOLDER_IMAGE_KEY = "brand/worn-return-deadline.png";

/** Public brand asset fallback when signing placeholder fails. */
export const RETURN_DEADLINE_PLACEHOLDER_IMAGE_URL_DEFAULT =
  "https://worn.app/brand/return-deadline.png";

export type ReturnDeadlinePayload = {
  returnId: string;
  userId: string;
  windowDeadline: string;
  merchant: string;
  /** Optional item image for rich push (NOTIF-RICH / WV01-DEADLINE-IMAGE-PUSH). */
  imageUrl?: string;
  amountMinor?: number;
  currency?: string;
};

/**
 * Attach rich push fields when the purchase item has an image / price
 * (WV01-DEADLINE-IMAGE-PUSH).
 */
export function withReturnDeadlineRichFields(
  payload: ReturnDeadlinePayload,
  opts: {
    imageUrl?: string | null;
    amountMinor?: number | null;
    currency?: string | null;
  } = {},
): ReturnDeadlinePayload {
  const next: ReturnDeadlinePayload = { ...payload };
  const imageUrl = opts.imageUrl?.trim();
  if (imageUrl) next.imageUrl = imageUrl;
  if (opts.amountMinor != null && opts.amountMinor > 0) {
    next.amountMinor = opts.amountMinor;
    if (opts.currency?.trim()) next.currency = opts.currency.trim();
  }
  return next;
}

/**
 * Brand placeholder URL when purchase item has no imageKey (W042).
 * Prefers RETURN_DEADLINE_PLACEHOLDER_IMAGE_URL env, else signs brand key, else static.
 */
export async function resolveDeadlinePlaceholderImageUrl(
  getSignedUrl?: (key: string) => Promise<string>,
): Promise<string> {
  const fromEnv = process.env.RETURN_DEADLINE_PLACEHOLDER_IMAGE_URL?.trim();
  if (fromEnv) return fromEnv;
  if (getSignedUrl) {
    try {
      const signed = await getSignedUrl(RETURN_DEADLINE_PLACEHOLDER_IMAGE_KEY);
      if (signed?.trim()) return signed.trim();
    } catch {
      // fall through to static brand asset
    }
  }
  return RETURN_DEADLINE_PLACEHOLDER_IMAGE_URL_DEFAULT;
}

/** Resolve signed image URL + amount from a purchase item for deadline push. */
export async function enrichDeadlineFromPurchaseItem(
  payload: ReturnDeadlinePayload,
  item: { imageKey: string | null; priceMinor: number } | null | undefined,
  getSignedUrl: (key: string) => Promise<string>,
  currency?: string | null,
): Promise<ReturnDeadlinePayload> {
  let imageUrl: string | null = null;
  if (item?.imageKey) {
    try {
      imageUrl = await getSignedUrl(item.imageKey);
    } catch {
      imageUrl = null;
    }
  }
  // W042 — always attach an image so rich push still SENT with brand asset.
  if (!imageUrl?.trim()) {
    imageUrl = await resolveDeadlinePlaceholderImageUrl(getSignedUrl);
  }
  return withReturnDeadlineRichFields(payload, {
    imageUrl,
    amountMinor: item?.priceMinor ?? null,
    currency,
  });
}

/** Kept for existing imports — same map as @worn/shared. */
export const MERCHANT_RETURN_WINDOW_DAYS = SHARED_RETURN_DAYS;
export { MERCHANT_EXCHANGE_WINDOW_DAYS, merchantWindowsDiffer };

export function computeWindowDeadline(purchasedAt: Date, merchant: string): Date {
  return computeReturnWindowDeadline(purchasedAt, merchant);
}

export function computeExchangeDeadline(purchasedAt: Date, merchant: string): Date {
  return computeExchangeWindowDeadline(purchasedAt, merchant);
}

/**
 * Delay until the return-deadline reminder should fire.
 * Returns null when the window is already closed.
 * Inside the lead window (but still open), returns 100ms so the job runs ASAP.
 */
export function computeReturnReminderDelayMs(
  windowDeadline: Date | string,
  leadMs: number = RETURN_LEAD_MS,
  nowMs: number = Date.now(),
): number | null {
  const deadline = new Date(windowDeadline).getTime();
  const delayMs = deadline - nowMs;
  if (delayMs <= 0) return null;
  const reminderDelay = delayMs - leadMs;
  return reminderDelay <= 0 ? 100 : reminderDelay;
}

export async function scheduleReturnDeadlineReminder(payload: ReturnDeadlinePayload): Promise<"published" | "skipped"> {
  const redisUrl = process.env.RETURN_REDIS_URL ?? process.env.REDIS_URL;
  if (!redisUrl) return "skipped";
  const reminderDelay = computeReturnReminderDelayMs(payload.windowDeadline);
  if (reminderDelay === null) return "skipped";
  try {
    const { Queue } = await import("bullmq");
    const queue = new Queue(RETURN_DEADLINE_QUEUE, { connection: redisUrl });
    await queue.add(RETURN_DEADLINE_JOB, payload, {
      delay: reminderDelay,
      jobId: `return:${payload.returnId}`,
    });
    await queue.close();
    return "published";
  } catch (err) {
    console.warn("[audit] return-deadline.enqueue.failed", { returnId: payload.returnId, error: String(err) });
    return "skipped";
  }
}

/**
 * Refund reconciliation: when refund lands, write to money_ledger as REFUND.
 * Account selection (never blind list[0]):
 *  1. Prefer an ACTIVE CASH account
 *  2. Else ACTIVE STORE_CREDIT matching merchant (case-insensitive)
 *  3. Else create a dedicated CASH "Refund" account
 */
export type RefundAccountCandidate = {
  id: string;
  kind: string;
  merchant: string;
  status?: string;
};

export function selectRefundAccount(
  accounts: RefundAccountCandidate[],
  merchant?: string | null,
  /** U012 — user-declared tender destination. */
  destination?: "ORIGINAL_CARD" | "STORE_CREDIT" | "UPI" | null,
): RefundAccountCandidate | null {
  const active = accounts.filter((a) => !a.status || a.status === "ACTIVE");
  const preferStore = destination === "STORE_CREDIT";
  if (preferStore && merchant) {
    const needle = merchant.toLowerCase().trim();
    const store = active.find(
      (a) =>
        a.kind === "STORE_CREDIT" &&
        a.merchant.toLowerCase().trim() === needle,
    );
    if (store) return store;
  }
  if (preferStore) {
    const anyStore = active.find((a) => a.kind === "STORE_CREDIT");
    if (anyStore) return anyStore;
  }
  const cash = active.find((a) => a.kind === "CASH");
  if (cash) return cash;
  if (!preferStore && merchant) {
    const needle = merchant.toLowerCase().trim();
    const store = active.find(
      (a) =>
        a.kind === "STORE_CREDIT" &&
        a.merchant.toLowerCase().trim() === needle,
    );
    if (store) return store;
  }
  return null;
}

export async function reconcileRefund(
  repos: {
    postMoneyLedger: (input: {
      accountId: string;
      userId: string;
      delta: number;
      type: "REFUND";
      refType?: string;
      refId?: string;
    }) => Promise<{ balanceAfter: number }>;
    listMoneyAccounts: (userId: string) => Promise<RefundAccountCandidate[]>;
    createMoneyAccount?: (input: {
      userId: string;
      kind: "CASH" | "STORE_CREDIT";
      merchant: string;
      currency: string;
      balanceCacheMinor: number;
      expiresAt: null;
      status: "ACTIVE";
    }) => Promise<{ id: string }>;
  },
  userId: string,
  returnId: string,
  refundMinor: number,
  merchant?: string | null,
  destination?: "ORIGINAL_CARD" | "STORE_CREDIT" | "UPI" | null,
): Promise<void> {
  if (refundMinor <= 0) return;

  const dest = destination ?? "ORIGINAL_CARD";
  const accounts = await repos.listMoneyAccounts(userId);
  let accountId = selectRefundAccount(accounts, merchant, dest)?.id ?? null;

  if (!accountId && repos.createMoneyAccount) {
    const kind = dest === "STORE_CREDIT" ? "STORE_CREDIT" : "CASH";
    const created = await repos.createMoneyAccount({
      userId,
      kind,
      merchant: dest === "STORE_CREDIT" ? (merchant?.trim() || "Store credit") : "Refund",
      currency: "INR",
      balanceCacheMinor: 0,
      expiresAt: null,
      status: "ACTIVE",
    });
    accountId = created.id;
  }
  if (!accountId) return;
  await repos.postMoneyLedger({
    accountId,
    userId,
    delta: refundMinor,
    type: "REFUND",
    refType: `return.refund:${dest}`,
    refId: returnId,
  });
}
