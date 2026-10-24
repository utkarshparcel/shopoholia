import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { trackEvent } from '@/src/lib/analytics';
import { pushTargetFromData, syncPushRegistration } from '@/src/lib/push-notifications';
import { useSessionStore } from '@/src/stores/session';

/**
 * Push wiring for the root layout: registers the device while signed in, shows pushes that
 * arrive while the app is open, and opens the order or reveal a tapped push points at. That
 * includes the push that launched the app, which waits for sign-in if there's no session yet.
 */
export function usePushNotifications() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    void syncPushRegistration(accessToken);
  }, [accessToken]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    let lastOpened: string | undefined;
    const open = (response: Notifications.NotificationResponse | null) => {
      if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) {
        return;
      }
      // The launch response can also reach the listener; open it once.
      const id = response.notification.request.identifier;
      if (id === lastOpened) return;
      lastOpened = id;
      // Handled, so it isn't reopened if the root layout mounts again.
      Notifications.clearLastNotificationResponse();

      const target = pushTargetFromData(response.notification.request.content.data);
      if (!target) return;
      trackEvent('push_opened', { screen: target.screen, orderId: target.orderId });
      setPendingHref(target.href);
    };

    open(Notifications.getLastNotificationResponse());
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!pendingHref || !accessToken) return;
    setPendingHref(null);
    router.push(pendingHref as never);
  }, [pendingHref, accessToken]);
}
