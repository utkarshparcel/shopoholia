/**
 * W010 — Android SMS permission microcopy.
 * Trust framing: order / shipping / gift-card texts only; deny stays usable.
 */

export const ANDROID_SMS_PERM_TITLE = 'Read order texts only';

export const ANDROID_SMS_PERM_MESSAGE =
  'WORN only reads order, shipping, and gift-card texts to find credit and return windows — not your full SMS inbox. Deny anytime and keep using email or manual vault.';

export const ANDROID_SMS_PERM_UI_BODY =
  'Optionally scan recent order, shipping, and gift-card texts only. Deny stays fine — connect email or add cards manually.';

export const ANDROID_SMS_PERM_POSITIVE = 'Allow';
export const ANDROID_SMS_PERM_NEGATIVE = 'Not now';

export const ANDROID_SMS_PERM_DENIED_HINT =
  'No order texts found (or permission denied). You can still connect email or add cards manually.';

export type AndroidSmsPermCopy = {
  title: string;
  message: string;
  uiBody: string;
  buttonPositive: string;
  buttonNegative: string;
  deniedHint: string;
};

export function getAndroidSmsPermCopy(): AndroidSmsPermCopy {
  return {
    title: ANDROID_SMS_PERM_TITLE,
    message: ANDROID_SMS_PERM_MESSAGE,
    uiBody: ANDROID_SMS_PERM_UI_BODY,
    buttonPositive: ANDROID_SMS_PERM_POSITIVE,
    buttonNegative: ANDROID_SMS_PERM_NEGATIVE,
    deniedHint: ANDROID_SMS_PERM_DENIED_HINT,
  };
}

/** True when copy asserts order/shipping/gift-card scope and deny usability. */
export function assertsOrderTextsOnlyMicrocopy(copy: string): boolean {
  const lower = copy.toLowerCase();
  const orderScoped =
    (lower.includes('order') && lower.includes('shipping')) ||
    (lower.includes('order') && lower.includes('gift'));
  const denyUsable =
    lower.includes('deny') ||
    lower.includes('skip') ||
    lower.includes('not now') ||
    lower.includes('still');
  return orderScoped && denyUsable;
}
