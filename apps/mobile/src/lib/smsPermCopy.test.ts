import { describe, expect, it } from 'vitest';

import {
  ANDROID_SMS_PERM_DENIED_HINT,
  ANDROID_SMS_PERM_MESSAGE,
  ANDROID_SMS_PERM_TITLE,
  ANDROID_SMS_PERM_UI_BODY,
  assertsOrderTextsOnlyMicrocopy,
  getAndroidSmsPermCopy,
} from './smsPermCopy';

describe('smsPermCopy (W010)', () => {
  it('states order / shipping / gift-card texts only', () => {
    const copy = getAndroidSmsPermCopy();
    expect(copy.title).toBe(ANDROID_SMS_PERM_TITLE);
    expect(copy.message).toMatch(/order/i);
    expect(copy.message).toMatch(/shipping/i);
    expect(copy.message).toMatch(/gift-?card/i);
    expect(copy.message).toMatch(/not your full SMS inbox/i);
    expect(assertsOrderTextsOnlyMicrocopy(copy.message)).toBe(true);
    expect(assertsOrderTextsOnlyMicrocopy(copy.uiBody)).toBe(true);
  });

  it('keeps deny path usable', () => {
    expect(ANDROID_SMS_PERM_MESSAGE).toMatch(/deny|not now|skip|still/i);
    expect(ANDROID_SMS_PERM_UI_BODY).toMatch(/deny|email|manual/i);
    expect(ANDROID_SMS_PERM_DENIED_HINT).toMatch(/still connect email|manually/i);
  });

  it('never claims full-inbox read', () => {
    const joined = `${ANDROID_SMS_PERM_TITLE} ${ANDROID_SMS_PERM_MESSAGE} ${ANDROID_SMS_PERM_UI_BODY}`;
    expect(joined.toLowerCase()).not.toMatch(/read (your )?entire|all messages|full sms inbox without/);
    expect(joined).toMatch(/order/i);
  });
});
