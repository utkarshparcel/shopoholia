/**
 * S1-25 — the gift-card "re-check balance" reminder, scheduled as a local notification.
 *
 * There is no server reminder for this, so the device schedules it. The reminder fires at
 * 10:00 local time a week from now.
 */

import { requestPushPermission } from './pushPermission';

export const BALANCE_REMINDER_DAYS = 7;
export const BALANCE_REMINDER_HOUR = 10;

/** 10:00 local time, `days` days after `now`. */
export function balanceReminderDate(now: Date, days = BALANCE_REMINDER_DAYS): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, BALANCE_REMINDER_HOUR, 0, 0, 0);
}

export type BalanceReminderResult =
  | { scheduled: true; at: Date }
  | { scheduled: false; reason: 'permission' | 'error' };

export async function scheduleBalanceRecheckReminder(
  account: { id: string; merchant: string },
  now: Date = new Date(),
): Promise<BalanceReminderResult> {
  const permission = await requestPushPermission();
  if (permission !== 'granted') return { scheduled: false, reason: 'permission' };
  const at = balanceReminderDate(now);
  try {
    const Notifications = await import('expo-notifications');
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Re-check your ${account.merchant} balance`,
        body: 'Open WORN to update what is left on this card.',
        data: { kind: 'balance-recheck', accountId: account.id },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
    });
    return { scheduled: true, at };
  } catch {
    return { scheduled: false, reason: 'error' };
  }
}
