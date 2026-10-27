import { describe, expect, it } from 'vitest';

import {
  nextProgressivePrompt,
  shouldAskEmail,
  shouldAskNotifications,
  type ProgressivePermSnapshot,
} from './progressivePerms';

const base: ProgressivePermSnapshot = {
  foundMoneyReached: false,
  emailConnected: false,
  emailPromptSkipped: false,
  emailPromptCompleted: false,
  deadlineSetupPending: false,
  notificationsGranted: false,
  notifPromptSkipped: false,
  notifPromptCompleted: false,
};

describe('shouldAskEmail', () => {
  it('waits for found-money aha', () => {
    expect(shouldAskEmail(base)).toBe(false);
    expect(shouldAskEmail({ ...base, foundMoneyReached: true })).toBe(true);
  });

  it('skips when connected, skipped, or completed', () => {
    expect(
      shouldAskEmail({ ...base, foundMoneyReached: true, emailConnected: true }),
    ).toBe(false);
    expect(
      shouldAskEmail({ ...base, foundMoneyReached: true, emailPromptSkipped: true }),
    ).toBe(false);
    expect(
      shouldAskEmail({ ...base, foundMoneyReached: true, emailPromptCompleted: true }),
    ).toBe(false);
  });
});

describe('shouldAskNotifications', () => {
  it('asks only after first deadline setup pending', () => {
    expect(shouldAskNotifications(base)).toBe(false);
    expect(shouldAskNotifications({ ...base, deadlineSetupPending: true })).toBe(true);
  });

  it('skips when granted, skipped, or completed', () => {
    expect(
      shouldAskNotifications({
        ...base,
        deadlineSetupPending: true,
        notificationsGranted: true,
      }),
    ).toBe(false);
    expect(
      shouldAskNotifications({
        ...base,
        deadlineSetupPending: true,
        notifPromptSkipped: true,
      }),
    ).toBe(false);
    expect(
      shouldAskNotifications({
        ...base,
        deadlineSetupPending: true,
        notifPromptCompleted: true,
      }),
    ).toBe(false);
  });
});

describe('nextProgressivePrompt', () => {
  it('prefers notifications over email when both eligible', () => {
    expect(
      nextProgressivePrompt({
        ...base,
        foundMoneyReached: true,
        deadlineSetupPending: true,
      }),
    ).toBe('notifications');
  });

  it('returns email after aha when no deadline pending', () => {
    expect(nextProgressivePrompt({ ...base, foundMoneyReached: true })).toBe('email');
  });

  it('returns null when nothing to ask', () => {
    expect(nextProgressivePrompt(base)).toBeNull();
    expect(
      nextProgressivePrompt({
        ...base,
        foundMoneyReached: true,
        emailConnected: true,
        deadlineSetupPending: true,
        notificationsGranted: true,
      }),
    ).toBeNull();
  });
});

describe('emailPromptCopy (W015)', () => {
  it('references find more credits with Limited Use adjacent and Skip', async () => {
    const { emailPromptCopy } = await import('./progressivePerms');
    const copy = emailPromptCopy();
    expect(copy.title.toLowerCase()).toMatch(/find more credits/);
    expect(copy.body.toLowerCase()).toMatch(/find more|gift card|store credit/);
    expect(copy.limitedUseHint.toLowerCase()).toMatch(/limited use/);
    expect(copy.skip.toLowerCase()).toMatch(/not now|skip/);
  });
});
