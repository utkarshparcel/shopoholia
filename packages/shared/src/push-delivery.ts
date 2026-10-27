import type {
  FrequencyCaps,
  NotificationCategories,
  NotificationPreferences,
} from "./schemas/notifications.js";
import {
  FREQUENCY_CAP_WINDOW_MS,
  parseNotificationPreferences,
} from "./schemas/notifications.js";
import { isInLocalQuietHours, isValidTimeZone, nextLocalSendAt } from "./local-time.js";

/** Expo Push API endpoint (override in tests). */
export const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
/** Upper bound on one Expo send. */
export const EXPO_PUSH_TIMEOUT_MS = 10_000;

export type NotificationCategory = keyof NotificationCategories;

export type NotificationGate =
  | { action: "send" }
  | { action: "skip"; reason: "category_opt_out" | "frequency_cap" }
  | { action: "delay"; delayMs: number };

export type ClosetPushScreen =
  | "returns"
  | "vault"
  | "today"
  | "wardrobe"
  | "disposition"
  | "recipients"
  | "fit"
  | "consent"
  | "order"
  | "reveal"
  | "accountant"
  | "checkout";

export type ClosetPushDeepLink = {
  deepLink: string;
  screen: ClosetPushScreen;
  orderId?: string;
  returnId?: string;
  accountId?: string;
  warrantyId?: string;
  outfitId?: string;
  recipientId?: string;
  category?: string;
  periodLabel?: string;
  monthLabel?: string;
  purchaseId?: string;
};

export type ProcessPushResult =
  | { status: "sent" | "queued" | "skipped" | "failed" }
  | { status: "delayed"; delayMs: number };

/** Optional rich fields for Expo (image + amount) — NOTIF-RICH. */
export type ClosetRichPush = {
  imageUrl?: string;
  amountMinor?: number;
  currency?: string;
};

export type AndroidNotificationChannel = {
  id: string;
  name: string;
  description: string;
  /** Maps to Expo/Android importance: max | high | default | low | min */
  importance: "max" | "high" | "default" | "low" | "min";
};

export type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  /** Android notification channel (must exist on device). */
  channelId?: string;
  /** Expo rich content — image URL for BigPicture / attachment. */
  richContent?: { image?: string };
  mutableContent?: boolean;
};

export type ExpoPushResult =
  | { ok: true; ticketId: string }
  | { ok: false; error: string };

export { FREQUENCY_CAP_WINDOW_MS };

/**
 * Quiet hours (HH:mm) on the wall clock of `timeZone` (C1: pass `resolveTimeZone(user.timeZone)`).
 * Overnight windows (e.g. 22:00–07:00) wrap midnight. End is exclusive: at quietHoursEnd the
 * window is open again. `timeZone` defaults to UTC only for callers that predate C1.
 */
export function isInQuietHours(
  now: Date,
  quietHoursStart: string,
  quietHoursEnd: string,
  timeZone: string = "UTC",
): boolean {
  return isInLocalQuietHours(now, quietHoursStart, quietHoursEnd, timeZone);
}

/** Milliseconds until quietHoursEnd in `timeZone`. 0 when not currently in quiet hours. */
export function msUntilQuietHoursEnd(
  now: Date,
  quietHoursStart: string,
  quietHoursEnd: string,
  timeZone: string = "UTC",
): number {
  return nextLocalSendAt(now, quietHoursStart, quietHoursEnd, timeZone).getTime() - now.getTime();
}

/**
 * Next moment a Closet push may send (W025).
 * Outside quiet hours → `now`; inside → the instant quiet hours end in `timeZone`.
 */
export function nextEligibleSendAt(
  now: Date,
  quietHoursStart: string,
  quietHoursEnd: string,
  timeZone: string = "UTC",
): Date {
  return nextLocalSendAt(now, quietHoursStart, quietHoursEnd, timeZone);
}

/**
 * Human preview: “Next send at 07:00”. Quiet hours are evaluated and shown in `opts.timeZone`
 * (default UTC).
 */
export function formatQuietHoursNextSendPreview(
  now: Date,
  quietHoursStart: string,
  quietHoursEnd: string,
  opts?: { timeZone?: string; locale?: string },
): string {
  const requestedZone = opts?.timeZone;
  const timeZone = isValidTimeZone(requestedZone) ? requestedZone : "UTC";
  const next = nextEligibleSendAt(now, quietHoursStart, quietHoursEnd, timeZone);
  const locale = opts?.locale ?? "en-IN";
  let timeLabel: string;
  try {
    timeLabel = new Intl.DateTimeFormat(locale, {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(next);
  } catch {
    timeLabel = next.toISOString().slice(11, 16);
  }
  if (!isInQuietHours(now, quietHoursStart, quietHoursEnd, timeZone)) {
    return `Next send at ${timeLabel} (quiet hours open)`;
  }
  return `Next send at ${timeLabel}`;
}

export function notificationCategoryForEvent(
  eventType: string,
): NotificationCategory | null {
  switch (eventType) {
    case "RETURN_DEADLINE":
      return "returns";
    case "WARRANTY_EXPIRY":
      return "warranty";
    case "CREDIT_EXPIRY":
    case "CREDIT_BALANCE_RECHECK":
    case "FOUND_MONEY_WAITING":
      return "credits";
    case "OUTFIT_READY":
    case "WEAR_CHALLENGE":
    case "DECLUTTER_CHALLENGE":
    case "CPW_GOAL":
    case "REWEAR_STREAK":
    case "DRY_CLEAN_PICKUP":
    case "LENT_OVERDUE":
    case "CAL_EVENT_OUTFIT":
    case "INTERVIEW_KIT_REMINDER":
      return "outfits";
    case "WEEKLY_DIGEST":
      return "digest";
    case "MONTHLY_DIGEST":
      return "digest";
    case "SPEND_ENVELOPE":
      return "digest";
    default:
      return null;
  }
}

/** Android channel definitions — one per notification category (NOTIF-RICH). */
export const ANDROID_NOTIFICATION_CHANNELS: Record<
  NotificationCategory,
  AndroidNotificationChannel
> = {
  returns: {
    id: "worn-returns",
    name: "Returns",
    description: "Return window deadline reminders",
    importance: "high",
  },
  warranty: {
    id: "worn-warranty",
    name: "Warranties",
    description: "Warranty expiry reminders",
    importance: "default",
  },
  credits: {
    id: "worn-credits",
    name: "Found money",
    description: "Gift card and store credit reminders",
    importance: "high",
  },
  outfits: {
    id: "worn-outfits",
    name: "Outfits",
    description: "Daily outfit and wear challenges",
    importance: "default",
  },
  digest: {
    id: "worn-digest",
    name: "Closet digest",
    description: "Weekly and monthly closet P&L digests",
    importance: "low",
  },
};

export function androidChannelForCategory(
  category: NotificationCategory,
): AndroidNotificationChannel {
  return ANDROID_NOTIFICATION_CHANNELS[category];
}

export function androidChannelIdForEvent(eventType: string): string | undefined {
  const cat = notificationCategoryForEvent(eventType);
  return cat ? ANDROID_NOTIFICATION_CHANNELS[cat].id : undefined;
}

/**
 * Build Expo rich fields + data extras for Closet pushes.
 * Return pushes may include imageUrl; amount surfaces on credits/digest.
 */
export function buildClosetRichPushPayload(input: {
  eventType: string;
  rich?: ClosetRichPush;
}): {
  channelId?: string;
  richContent?: { image?: string };
  mutableContent?: boolean;
  dataExtras: Record<string, unknown>;
} {
  const category = notificationCategoryForEvent(input.eventType);
  const channelId = category
    ? ANDROID_NOTIFICATION_CHANNELS[category].id
    : undefined;
  const imageUrl = input.rich?.imageUrl?.trim() || undefined;
  const dataExtras: Record<string, unknown> = {};
  if (channelId) dataExtras.androidChannelId = channelId;
  if (imageUrl) dataExtras.imageUrl = imageUrl;
  if (input.rich?.amountMinor != null) {
    dataExtras.amountMinor = input.rich.amountMinor;
  }
  if (input.rich?.currency) dataExtras.currency = input.rich.currency;

  return {
    channelId,
    richContent: imageUrl ? { image: imageUrl } : undefined,
    mutableContent: Boolean(imageUrl),
    dataExtras,
  };
}

export function isFrequencyCapped(
  recentCountInWindow: number,
  cap: number,
): boolean {
  return recentCountInWindow >= cap;
}

export function frequencyCapForCategory(
  caps: FrequencyCaps,
  category: NotificationCategory | null,
): number | null {
  if (!category) return null;
  return caps[category];
}

/**
 * Opt-out → skip, frequency cap → skip, quiet hours (local to `opts.timeZone`) → delay.
 */
export function evaluateNotificationGate(
  prefs: NotificationPreferences,
  category: NotificationCategory | null,
  now: Date,
  opts: { recentCategoryCount?: number; timeZone: string },
): NotificationGate {
  if (category && prefs.categories[category] === false) {
    return { action: "skip", reason: "category_opt_out" };
  }
  if (category && opts.recentCategoryCount != null) {
    const cap = prefs.frequencyCaps[category];
    if (isFrequencyCapped(opts.recentCategoryCount, cap)) {
      return { action: "skip", reason: "frequency_cap" };
    }
  }
  const delayMs = msUntilQuietHoursEnd(
    now,
    prefs.quietHoursStart,
    prefs.quietHoursEnd,
    opts.timeZone,
  );
  if (delayMs > 0) {
    return { action: "delay", delayMs: Math.max(delayMs, 100) };
  }
  return { action: "send" };
}

/**
 * Gate from a settings bag: pass `user.prefs` (C2) and `resolveTimeZone(user.timeZone)` (C1).
 */
export function evaluateNotificationGateFromFlags(
  prefsBag: Record<string, unknown> | null | undefined,
  eventType: string,
  now: Date,
  opts: { recentCategoryCount?: number; timeZone: string },
): NotificationGate {
  const prefs = parseNotificationPreferences(prefsBag);
  return evaluateNotificationGate(
    prefs,
    notificationCategoryForEvent(eventType),
    now,
    opts,
  );
}

export function closetDeepLinkForEvent(
  eventType: string,
  extra: Record<string, string | undefined> = {},
): ClosetPushDeepLink {
  switch (eventType) {
    case "RETURN_DEADLINE":
      return {
        deepLink: "worn://returns",
        screen: "returns",
        returnId: extra.returnId,
      };
    case "CREDIT_EXPIRY":
      return {
        deepLink: "worn://vault?focus=expiry",
        screen: "vault",
        accountId: extra.accountId,
      };
    case "CREDIT_BALANCE_RECHECK":
    case "FOUND_MONEY_WAITING":
      return {
        deepLink: "worn://vault?focus=found-money",
        screen: "vault",
        accountId: extra.accountId,
      };
    case "WARRANTY_EXPIRY":
      return {
        deepLink: "worn://vault?focus=warranty",
        screen: "vault",
        warrantyId: extra.warrantyId,
      };
    case "OUTFIT_READY":
      return {
        deepLink: "worn://today?focus=outfit",
        screen: "today",
        outfitId: extra.outfitId,
      };
    case "WEAR_CHALLENGE":
    case "DRY_CLEAN_PICKUP":
    case "LENT_OVERDUE":
      return {
        deepLink: extra.wardrobeItemId
          ? `worn://wardrobe?item=${extra.wardrobeItemId}`
          : "worn://wardrobe",
        screen: "wardrobe",
      };
    case "REWEAR_STREAK":
    case "CAL_EVENT_OUTFIT":
    case "INTERVIEW_KIT_REMINDER":
      return {
        deepLink: "worn://today",
        screen: "today",
      };
    case "CPW_GOAL":
      return {
        deepLink: extra.wardrobeItemId
          ? `worn://wardrobe?item=${extra.wardrobeItemId}`
          : "worn://accountant",
        screen: extra.wardrobeItemId ? "wardrobe" : "accountant",
      };
    case "DECLUTTER_CHALLENGE":
      return {
        deepLink: "worn://disposition",
        screen: "disposition",
      };
    case "SPEND_ENVELOPE":
      return {
        deepLink: extra.category
          ? `worn://accountant?category=${encodeURIComponent(extra.category)}${
              extra.periodLabel ? `&period=${encodeURIComponent(extra.periodLabel)}` : ""
            }`
          : "worn://accountant",
        screen: "accountant",
        category: extra.category,
        periodLabel: extra.periodLabel,
      };
    case "WEEKLY_DIGEST":
      return {
        // W026 — digests that surface “you still have ₹/$X” land on vault.
        deepLink: "worn://vault?focus=found-money",
        screen: "vault",
      };
    case "EMI_DUE":
      return {
        deepLink: extra.planId
          ? `worn://accountant?focus=emi&plan=${encodeURIComponent(extra.planId)}`
          : "worn://accountant?focus=emi",
        screen: "accountant",
      };
    case "CASHBACK_CLAIM_DEADLINE":
      return {
        deepLink: extra.claimId
          ? `worn://vault?tab=claims&claim=${encodeURIComponent(extra.claimId)}`
          : "worn://vault?tab=claims",
        screen: "vault",
      };
    case "PRICE_DROP":
      return {
        deepLink: extra.listingId
          ? `worn://vault?focus=price-drop&listing=${encodeURIComponent(extra.listingId)}`
          : "worn://vault?focus=price-drop",
        screen: "vault",
      };
    case "MONTHLY_DIGEST":
      return {
        deepLink: extra.monthLabel
          ? `worn://accountant?month=${encodeURIComponent(String(extra.monthLabel))}`
          : "worn://accountant",
        screen: "accountant",
        monthLabel: extra.monthLabel,
      };
    case "gift_occasion":
      return {
        deepLink: extra.recipientId
          ? `worn://recipients?focus=${extra.recipientId}`
          : "worn://recipients",
        screen: "recipients",
        recipientId: extra.recipientId,
      };
    case "tailoring_update":
      return {
        deepLink: extra.orderId ? `worn://fit?order=${extra.orderId}` : "worn://fit",
        screen: "fit",
        orderId: extra.orderId,
      };
    case "cooling_off_released":
      return {
        deepLink: "worn://checkout",
        screen: "checkout",
      };
    case "PACKAGE_ASSIGNED":
      return {
        deepLink: extra.purchaseId
          ? `worn://vault?focus=packages&id=${extra.purchaseId}`
          : "worn://vault?focus=packages",
        screen: "vault",
        purchaseId: extra.purchaseId,
      };
    default:
      return {
        deepLink: "worn://consent",
        screen: "consent",
      };
  }
}

/**
 * Send via Expo Push API. When `to` is missing the caller should leave the
 * event QUEUED (same behaviour as the Play stub without a device token).
 */
export async function sendExpoPush(
  message: ExpoPushMessage,
  opts: {
    fetchImpl?: typeof fetch;
    endpoint?: string;
    timeoutMs?: number;
  } = {},
): Promise<ExpoPushResult> {
  if (!message.to) {
    return { ok: false, error: "missing_push_token" };
  }

  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    // No fetch (tests / constrained runtimes) — deterministic stub ticket.
    return { ok: true, ticketId: `stub:${message.to}:${Date.now()}` };
  }

  try {
    const body: Record<string, unknown> = {
      to: message.to,
      title: message.title,
      body: message.body,
      data: message.data ?? {},
      sound: message.sound ?? "default",
    };
    if (message.channelId) body.channelId = message.channelId;
    if (message.richContent?.image) {
      body.richContent = { image: message.richContent.image };
    }
    if (message.mutableContent) body.mutableContent = true;

    const res = await fetchImpl(opts.endpoint ?? EXPO_PUSH_ENDPOINT, {
      // Bounded: a hung Expo call must not hold a worker slot (or its job lock) forever.
      ...(typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
        ? { signal: AbortSignal.timeout(opts.timeoutMs ?? EXPO_PUSH_TIMEOUT_MS) }
        : {}),
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify([body]),
    });

    if (!res.ok) {
      return { ok: false, error: `http_${res.status}` };
    }

    const json = (await res.json()) as {
      data?: Array<{ status?: string; id?: string; message?: string }>;
    };
    const ticket = json.data?.[0];
    if (ticket?.status === "ok" && ticket.id) {
      return { ok: true, ticketId: ticket.id };
    }
    if (ticket?.id) {
      return { ok: true, ticketId: ticket.id };
    }
    return {
      ok: false,
      error: ticket?.message ?? "expo_ticket_failed",
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * After a push_events row is QUEUED, attempt Expo delivery and report the
 * status the caller should persist. No token → leave QUEUED (Play parity).
 */
export async function deliverQueuedPush(input: {
  pushToken: string | null | undefined;
  title: string;
  body: string;
  data: Record<string, unknown>;
  channelId?: string;
  richContent?: { image?: string };
  mutableContent?: boolean;
  sendExpo?: typeof sendExpoPush;
}): Promise<{ status: "SENT" | "QUEUED" | "FAILED"; expoTicketId?: string }> {
  if (!input.pushToken) {
    return { status: "QUEUED" };
  }

  const send = input.sendExpo ?? sendExpoPush;
  const result = await send({
    to: input.pushToken,
    title: input.title,
    body: input.body,
    data: input.data,
    channelId: input.channelId,
    richContent: input.richContent,
    mutableContent: input.mutableContent,
  });

  if (result.ok) {
    return { status: "SENT", expoTicketId: result.ticketId };
  }
  return { status: "FAILED" };
}
