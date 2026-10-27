import { PermissionsAndroid, Platform } from 'react-native';

import type { SmsInboxAdapter, SmsMessage, SmsPermissionStatus } from '@/src/lib/sms';
import { setSmsInboxAdapter } from '@/src/lib/sms';
import {
  resolveSmsNativeBridge,
  type SmsInboxNativeBridge,
  type SmsInboxNativeRow,
} from '@/src/lib/smsNativeBridge';
import { getAndroidSmsPermCopy } from '@/src/lib/smsPermCopy';

/** Heuristic — keep order / shipping / gift-card texts; drop OTP noise when possible. */
export const ORDER_SMS_BODY_REGEX =
  '(?i)(order|shipped|delivered|refund|gift\\s*card|store\\s*credit|return|dispatched|tracking|invoice|purchase|otp.*(myntra|amazon|flipkart)|(?:myntra|amazon|flipkart|ajio|nykaa|meesho))';

const ORDER_KEYWORDS =
  /\b(order|shipped|delivered|refund|gift\s*card|store\s*credit|return|dispatched|tracking|invoice|purchase|myntra|amazon|flipkart|ajio|nykaa|meesho)\b/i;

export function looksLikeOrderSms(body: string, from?: string): boolean {
  if (ORDER_KEYWORDS.test(body)) return true;
  if (from && /(amazon|flipkart|myntra|ajio|nykaa|meesho|shopoholia)/i.test(from)) {
    return true;
  }
  return false;
}

function toReceivedAt(date: SmsInboxNativeRow['date']): string | undefined {
  if (date == null) return undefined;
  if (typeof date === 'number') return new Date(date).toISOString();
  const asNum = Number(date);
  if (Number.isFinite(asNum) && asNum > 1e11) return new Date(asNum).toISOString();
  const parsed = Date.parse(String(date));
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  return undefined;
}

export function mapNativeRowsToMessages(
  rows: SmsInboxNativeRow[],
  opts?: { filterOrders?: boolean },
): SmsMessage[] {
  const filterOrders = opts?.filterOrders !== false;
  const out: SmsMessage[] = [];
  for (const row of rows) {
    const from = String(row.address ?? '').trim();
    const body = String(row.body ?? '').trim();
    if (!from || !body) continue;
    if (filterOrders && !looksLikeOrderSms(body, from)) continue;
    out.push({
      from,
      body,
      receivedAt: toReceivedAt(row.date),
    });
  }
  return out;
}

async function androidRequestPermission(): Promise<SmsPermissionStatus> {
  try {
    const copy = getAndroidSmsPermCopy();
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.READ_SMS,
      {
        title: copy.title,
        message: copy.message,
        buttonPositive: copy.buttonPositive,
        buttonNegative: copy.buttonNegative,
      },
    );
    if (result === PermissionsAndroid.RESULTS.GRANTED) return 'granted';
    if (
      result === 'never_ask_again' ||
      result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
    ) {
      return 'denied';
    }
    return 'denied';
  } catch {
    return 'undetermined';
  }
}

/**
 * Real Android inbox adapter: PermissionsAndroid + native ContentResolver bridge.
 * Pass an explicit bridge in tests; production resolves via NativeModules.
 */
export function createAndroidSmsInboxAdapter(
  bridge?: SmsInboxNativeBridge | null,
  opts?: { maxCount?: number; filterOrders?: boolean },
): SmsInboxAdapter {
  const maxCount = opts?.maxCount ?? 100;
  const filterOrders = opts?.filterOrders !== false;

  return {
    async requestPermission() {
      return androidRequestPermission();
    },
    async readInbox() {
      const resolved = bridge === undefined ? resolveSmsNativeBridge() : bridge;
      if (!resolved) return [];
      try {
        const rows = await resolved.listInbox({
          maxCount,
          // Native filters are best-effort; we still filter in JS.
          bodyRegex: filterOrders ? ORDER_SMS_BODY_REGEX : undefined,
        });
        return mapNativeRowsToMessages(rows, { filterOrders });
      } catch {
        return [];
      }
    },
  };
}

/**
 * Register the Android adapter when on Android. Safe to call on iOS (no-op).
 * Expo Go without a native bridge still registers — reads return [] until a
 * module / injected bridge is available.
 */
export function ensureAndroidSmsInboxAdapterRegistered(): boolean {
  if (Platform.OS !== 'android') return false;
  setSmsInboxAdapter(createAndroidSmsInboxAdapter());
  return true;
}
