import { router } from 'expo-router';

import { closetAlertText, missingConsentScope } from './closetScreenState';
import { confirmAsync, notify } from './confirm';
import { CONSENT_FALLBACK_RETURN, consentHref } from './consentReturn';

/**
 * Error alert for Closet actions. When the API says a consent is missing, the alert offers the
 * consent screen, where only the user's own tap grants it; consent then comes back to `returnTo`.
 */
export function alertClosetError(
  title: string,
  error: unknown,
  fallback?: string,
  returnTo: string = CONSENT_FALLBACK_RETURN,
): void {
  const message = closetAlertText(error, fallback);
  if (!missingConsentScope(error)) {
    notify(title, message);
    return;
  }
  void confirmAsync(title, message, {
    confirmLabel: 'Open Privacy & consent',
    cancelLabel: 'Not now',
  }).then((open) => {
    if (open) router.push(consentHref(returnTo) as never);
  });
}
