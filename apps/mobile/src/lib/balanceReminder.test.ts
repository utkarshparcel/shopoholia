import { beforeEach, describe, expect, it, vi } from 'vitest';

const n = vi.hoisted(() => ({ scheduleNotificationAsync: vi.fn(async () => 'notif-1') }));
vi.mock('expo-notifications', () => ({
  ...n,
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

import { balanceReminderDate, scheduleBalanceRecheckReminder } from './balanceReminder';
import { resetPushPermissionStub } from './pushPermission';

beforeEach(() => {
  n.scheduleNotificationAsync.mockClear();
});

describe('balance re-check reminder (S1-25)', () => {
  it('schedules a local notification at 10:00 local time a week out', async () => {
    resetPushPermissionStub('granted');
    const now = new Date(2026, 10, 3, 22, 15);
    const result = await scheduleBalanceRecheckReminder({ id: 'c1', merchant: 'Myntra' }, now);
    expect(result).toEqual({ scheduled: true, at: new Date(2026, 10, 10, 10, 0) });
    expect(n.scheduleNotificationAsync).toHaveBeenCalledWith({
      content: expect.objectContaining({
        title: 'Re-check your Myntra balance',
        data: { kind: 'balance-recheck', accountId: 'c1' },
      }),
      trigger: { type: 'date', date: new Date(2026, 10, 10, 10, 0) },
    });
  });

  it('schedules nothing and says so when notifications are off', async () => {
    resetPushPermissionStub('denied');
    const result = await scheduleBalanceRecheckReminder({ id: 'c1', merchant: 'Myntra' });
    expect(result).toEqual({ scheduled: false, reason: 'permission' });
    expect(n.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('reports a scheduling failure', async () => {
    resetPushPermissionStub('granted');
    n.scheduleNotificationAsync.mockRejectedValueOnce(new Error('native'));
    expect(await scheduleBalanceRecheckReminder({ id: 'c1', merchant: 'Myntra' })).toEqual({
      scheduled: false,
      reason: 'error',
    });
  });

  it('crosses month ends in local time', () => {
    expect(balanceReminderDate(new Date(2026, 0, 28, 9))).toEqual(new Date(2026, 1, 4, 10));
  });
});
