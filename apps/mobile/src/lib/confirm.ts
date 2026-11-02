import { Alert, Platform } from 'react-native';

/**
 * Confirmations and notices that work on every platform. react-native-web's `Alert.alert` does
 * nothing, so on web a confirm silently never confirmed (Rush to Express, Upload avatar, …) and a
 * notice never showed. Native keeps `Alert.alert` exactly as before; the web uses the browser's
 * own dialogs.
 */

export type ConfirmOptions = {
  /** The confirming button (native). Default "OK". */
  confirmLabel?: string;
  /** The cancelling button (native). Default "Cancel". */
  cancelLabel?: string;
  /** Styles the confirming button as destructive (iOS). */
  destructive?: boolean;
};

function browserText(title: string, message?: string): string {
  return message ? `${title}\n\n${message}` : title;
}

/** Asks the user; resolves true when they confirm. */
export function confirmAsync(
  title: string,
  message: string,
  { confirmLabel = 'OK', cancelLabel = 'Cancel', destructive = false }: ConfirmOptions = {},
): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(browserText(title, message)));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      {
        text: confirmLabel,
        ...(destructive ? { style: 'destructive' as const } : {}),
        onPress: () => resolve(true),
      },
    ]);
  });
}

/** Tells the user something (an error, a result) with a single dismiss. */
export function notify(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    window.alert(browserText(title, message));
    return;
  }
  Alert.alert(title, message);
}
