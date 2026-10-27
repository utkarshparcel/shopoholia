import { NativeModules, Platform } from 'react-native';

/**
 * Thin native bridge for Android SMS inbox reads.
 *
 * Prod / EAS dev-client builds should expose one of:
 * - `NativeModules.WornSmsInbox.listInbox({ maxCount?, bodyRegex? })`
 * - `NativeModules.SmsAndroid.list(JSON filter, fail, success)` (react-native-get-sms-android)
 *
 * Expo Go has neither — the adapter then returns [] until a bridge is injected
 * via {@link setSmsNativeBridge} (tests / custom modules).
 */
export type SmsInboxNativeRow = {
  address: string;
  body: string;
  /** Epoch ms or ISO string */
  date?: number | string;
};

export type SmsInboxNativeBridge = {
  listInbox(opts?: {
    maxCount?: number;
    bodyRegex?: string;
  }): Promise<SmsInboxNativeRow[]>;
};

let injected: SmsInboxNativeBridge | null = null;

export function setSmsNativeBridge(bridge: SmsInboxNativeBridge | null): void {
  injected = bridge;
}

export function getSmsNativeBridge(): SmsInboxNativeBridge | null {
  return injected;
}

type WornSmsInboxModule = {
  listInbox?: (opts?: {
    maxCount?: number;
    bodyRegex?: string;
  }) => Promise<SmsInboxNativeRow[]>;
};

type SmsAndroidModule = {
  list: (
    filter: string,
    fail: (err: unknown) => void,
    success: (count: number, smsList: string) => void,
  ) => void;
};

function wrapSmsAndroid(mod: SmsAndroidModule): SmsInboxNativeBridge {
  return {
    listInbox(opts) {
      const filter = JSON.stringify({
        box: 'inbox',
        maxCount: opts?.maxCount ?? 100,
        ...(opts?.bodyRegex ? { bodyRegex: opts.bodyRegex } : {}),
      });
      return new Promise((resolve, reject) => {
        try {
          mod.list(
            filter,
            (err) => reject(err instanceof Error ? err : new Error(String(err))),
            (_count, smsList) => {
              try {
                const parsed = JSON.parse(smsList) as Array<{
                  address?: string;
                  body?: string;
                  date?: number | string;
                }>;
                resolve(
                  parsed.map((row) => ({
                    address: String(row.address ?? ''),
                    body: String(row.body ?? ''),
                    date: row.date,
                  })),
                );
              } catch (e) {
                reject(e instanceof Error ? e : new Error(String(e)));
              }
            },
          );
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      });
    },
  };
}

/**
 * Resolve a usable inbox bridge: injected mock → WornSmsInbox → SmsAndroid.
 * Returns null on iOS / Expo Go / missing native module.
 */
export function resolveSmsNativeBridge(): SmsInboxNativeBridge | null {
  if (injected) return injected;
  if (Platform.OS !== 'android') return null;

  const modules = NativeModules as {
    WornSmsInbox?: WornSmsInboxModule;
    SmsAndroid?: SmsAndroidModule;
  };

  const worn = modules.WornSmsInbox;
  if (worn && typeof worn.listInbox === 'function') {
    return {
      listInbox: (opts) => worn.listInbox!(opts),
    };
  }

  const smsAndroid = modules.SmsAndroid;
  if (smsAndroid && typeof smsAndroid.list === 'function') {
    return wrapSmsAndroid(smsAndroid);
  }

  return null;
}
