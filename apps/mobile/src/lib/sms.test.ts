import { afterEach, describe, expect, it } from 'vitest';

import {
  getIosSmsForwardingCopy,
  getSmsForwardingAddress,
  supportsSmsInboxRead,
  syncSmsInbox,
} from './sms';
import { ensureAndroidSmsInboxAdapterRegistered } from './smsAndroidAdapter';

describe('sms (MOB 7: no inbox reading)', () => {
  const prev = process.env.EXPO_PUBLIC_FORWARDING_ADDRESS;

  afterEach(() => {
    if (prev === undefined) delete process.env.EXPO_PUBLIC_FORWARDING_ADDRESS;
    else process.env.EXPO_PUBLIC_FORWARDING_ADDRESS = prev;
  });

  it('never offers inbox reading, on any platform', () => {
    expect(supportsSmsInboxRead()).toBe(false);
    expect(ensureAndroidSmsInboxAdapterRegistered()).toBe(false);
  });

  it('the old sync entry point reads and sends nothing', async () => {
    await expect(syncSmsInbox('access-token')).resolves.toEqual([]);
  });

  it('forwarding copy names the address and promises no reading', () => {
    process.env.EXPO_PUBLIC_FORWARDING_ADDRESS = 'orders@example.test';
    expect(getSmsForwardingAddress()).toBe('orders@example.test');
    const copy = getIosSmsForwardingCopy();
    expect(copy).toContain('orders@example.test');
    expect(copy).toContain("doesn't read your texts");
    expect(copy).not.toMatch(/READ_SMS|permission/i);
  });
});
