import { PermissionsAndroid, Platform } from 'react-native';

import { ingestSms } from '@/src/api/client';
import { getAndroidSmsPermCopy } from '@/src/lib/smsPermCopy';

export type SmsMessage = {
  from: string;
  body: string;
  receivedAt?: string;
};

export type SmsPermissionStatus = 'granted' | 'denied' | 'undetermined';

/**
 * Pluggable Android inbox reader. Production registers
 * {@link createAndroidSmsInboxAdapter} (see smsAndroidAdapter.ts) which talks to
 * a native ContentResolver bridge. Expo Go / CI without a bridge return [].
 */
export type SmsInboxAdapter = {
  requestPermission(): Promise<SmsPermissionStatus>;
  readInbox(): Promise<SmsMessage[]>;
};

let adapter: SmsInboxAdapter | null = null;

export function setSmsInboxAdapter(next: SmsInboxAdapter | null): void {
  adapter = next;
}

export function getSmsInboxAdapter(): SmsInboxAdapter | null {
  return adapter;
}

export function supportsSmsInboxRead(): boolean {
  return Platform.OS === 'android';
}

export function getSmsForwardingAddress(): string {
  return (
    process.env.EXPO_PUBLIC_FORWARDING_ADDRESS ?? 'forward@inbox.shopoholia.app'
  );
}

/** iOS (and any non-Android) copy — no programmatic SMS read. */
export function getIosSmsForwardingCopy(address?: string): string {
  const addr = address ?? getSmsForwardingAddress();
  return (
    `iOS doesn't allow apps to read SMS. Forward any order or shipping text to ${addr} — ` +
    `we'll parse it just like an email receipt. You can skip this and connect email only.`
  );
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
 * Prefer the registered adapter; on Android without one, lazily load the
 * real native-bridge adapter so callers don't depend on startup order.
 */
async function effectiveAdapter(): Promise<SmsInboxAdapter | null> {
  if (adapter) return adapter;
  if (!supportsSmsInboxRead()) return null;
  try {
    const { createAndroidSmsInboxAdapter } = await import('@/src/lib/smsAndroidAdapter');
    return createAndroidSmsInboxAdapter();
  } catch {
    return null;
  }
}

export async function requestSmsPermission(): Promise<SmsPermissionStatus> {
  if (!supportsSmsInboxRead()) return 'denied';
  const effective = await effectiveAdapter();
  if (effective) return effective.requestPermission();
  return androidRequestPermission();
}

export async function readSmsInbox(): Promise<SmsMessage[]> {
  if (!supportsSmsInboxRead()) return [];
  const effective = await effectiveAdapter();
  if (effective) return effective.readInbox();
  return [];
}

export async function ingestSmsMessages(
  accessToken: string,
  messages: SmsMessage[],
): Promise<Array<{ id: string; status: string }>> {
  const results: Array<{ id: string; status: string }> = [];
  for (const msg of messages) {
    const json = await ingestSms(accessToken, {
      from: msg.from,
      body: msg.body,
      receivedAt: msg.receivedAt,
    });
    results.push(json);
  }
  return results;
}

/**
 * Request permission, read inbox, POST each message via /ingestion/sms.
 * No-ops on iOS / when permission denied / when inbox is empty.
 */
export async function syncSmsInbox(accessToken: string): Promise<string[]> {
  const perm = await requestSmsPermission();
  if (perm !== 'granted') return [];
  const messages = await readSmsInbox();
  if (messages.length === 0) return [];
  const results = await ingestSmsMessages(accessToken, messages);
  return results.map((r) => r.id);
}
