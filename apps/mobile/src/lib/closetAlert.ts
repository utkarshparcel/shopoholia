import { Alert } from 'react-native';
import { router } from 'expo-router';

import { closetAlertText, missingConsentScope } from './closetScreenState';

/**
 * Error alert for Closet actions. When the API says a consent is missing, the alert offers the
 * consent screen, where only the user's own tap grants it.
 */
export function alertClosetError(title: string, error: unknown, fallback?: string): void {
  const message = closetAlertText(error, fallback);
  if (!missingConsentScope(error)) {
    Alert.alert(title, message);
    return;
  }
  Alert.alert(title, message, [
    { text: 'Not now', style: 'cancel' },
    { text: 'Open Privacy & consent', onPress: () => router.push('/(closet)/consent' as never) },
  ]);
}
