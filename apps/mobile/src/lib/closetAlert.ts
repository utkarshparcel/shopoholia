import { Alert } from 'react-native';
import { router } from 'expo-router';

import { closetAlertText, missingConsentScope } from './closetScreenState';
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
    Alert.alert(title, message);
    return;
  }
  Alert.alert(title, message, [
    { text: 'Not now', style: 'cancel' },
    { text: 'Open Privacy & consent', onPress: () => router.push(consentHref(returnTo) as never) },
  ]);
}
