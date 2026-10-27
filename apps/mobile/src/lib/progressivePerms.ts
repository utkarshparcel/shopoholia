/**
 * Progressive permission sequencing for Closet onboarding.
 *
 * Do not wall the user with email OAuth or notification OS prompts up front.
 * Ask in context after the found-money aha (email) and after the first
 * deadline is set (notifications). Skip is always available.
 */

export type ProgressivePermSnapshot = {
  /** User reached found-money (onboarding complete, tracked, or demo). */
  foundMoneyReached: boolean;
  /** At least one connected email source (local or ingestion). */
  emailConnected: boolean;
  emailPromptSkipped: boolean;
  emailPromptCompleted: boolean;
  /** First return/credit deadline just set — show notifications ask. */
  deadlineSetupPending: boolean;
  notificationsGranted: boolean;
  notifPromptSkipped: boolean;
  notifPromptCompleted: boolean;
};

export type ProgressivePrompt = 'email' | 'notifications' | null;

/** Ask to connect email only after aha, never if already connected/skipped. */
export function shouldAskEmail(s: ProgressivePermSnapshot): boolean {
  if (!s.foundMoneyReached) return false;
  if (s.emailConnected) return false;
  if (s.emailPromptSkipped || s.emailPromptCompleted) return false;
  return true;
}

/** Ask for notifications only after first deadline setup is pending. */
export function shouldAskNotifications(s: ProgressivePermSnapshot): boolean {
  if (!s.deadlineSetupPending) return false;
  if (s.notificationsGranted) return false;
  if (s.notifPromptSkipped || s.notifPromptCompleted) return false;
  return true;
}

/**
 * Prefer a single contextual prompt: notifications (deadline-critical) wins
 * over email when both would otherwise show.
 */
export function nextProgressivePrompt(s: ProgressivePermSnapshot): ProgressivePrompt {
  if (shouldAskNotifications(s)) return 'notifications';
  if (shouldAskEmail(s)) return 'email';
  return null;
}

/**
 * W015 — Progressive email CTA after found-money aha only.
 * Copy references “find more credits”; Limited Use adjacent; Skip always.
 */
export function emailPromptCopy() {
  return {
    title: 'Find more credits',
    body: 'Connect a read-only inbox to find more gift cards and store credit automatically. Skip anytime.',
    cta: 'Connect email',
    skip: 'Not now',
    /** Shown adjacent to CTA (Limited Use / CASA trust). */
    limitedUseHint:
      'Google Limited Use applies — purchase emails only, revoke anytime.',
  } as const;
}

export function notificationPromptCopy() {
  return {
    title: 'Get deadline nudges',
    body: 'Turn on notifications so WORN can remind you before return windows and credit expiry.',
    cta: 'Enable reminders',
    skip: 'Skip',
  } as const;
}

/** @deprecated Prefer emailPromptCopy / notificationPromptCopy. */
export const EMAIL_PROMPT_COPY = emailPromptCopy();
/** @deprecated Prefer emailPromptCopy / notificationPromptCopy. */
export const NOTIFICATIONS_PROMPT_COPY = {
  title: notificationPromptCopy().title,
  body: notificationPromptCopy().body,
  accept: notificationPromptCopy().cta,
  skip: notificationPromptCopy().skip,
} as const;
