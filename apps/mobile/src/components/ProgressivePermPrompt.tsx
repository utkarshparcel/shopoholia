import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/src/components/ui';
import { trackEvent } from '@/src/lib/analytics';
import { skipPathAnalyticsProps } from '@/src/lib/firstDelight';
import {
  emailPromptCopy,
  nextProgressivePrompt,
  notificationPromptCopy,
  type ProgressivePermSnapshot,
} from '@/src/lib/progressivePerms';
import {
  isPushPermissionGranted,
  requestPushPermission,
} from '@/src/lib/pushPermission';
import { useClosetStore } from '@/src/stores/closet';
import {
  closet,
  fontSans,
  fsBody,
  fsCaption,
  radiusMd,
  space3,
  space4,
  textMuted,
} from '@/src/theme/tokens';

function snapshotFromStore(): ProgressivePermSnapshot {
  const s = useClosetStore.getState();
  return {
    foundMoneyReached: s.onboardingCompleted || s.foundMoneyTracked || Boolean(s.demoAccount),
    emailConnected: s.connectedSources.length > 0,
    emailPromptSkipped: s.emailPromptSkipped,
    emailPromptCompleted: s.emailPromptCompleted,
    deadlineSetupPending: s.deadlineSetupPending,
    notificationsGranted: s.notificationsGranted,
    notifPromptSkipped: s.notifPromptSkipped,
    notifPromptCompleted: s.notifPromptCompleted,
  };
}

/**
 * Soft progressive prompts: email after found-money; notifications on first
 * deadline. Skip always available. Does not block Closet navigation.
 */
export function ProgressivePermPrompt() {
  const router = useRouter();
  const onboardingCompleted = useClosetStore((s) => s.onboardingCompleted);
  const foundMoneyTracked = useClosetStore((s) => s.foundMoneyTracked);
  const demoAccount = useClosetStore((s) => s.demoAccount);
  const connectedSources = useClosetStore((s) => s.connectedSources);
  const emailPromptSkipped = useClosetStore((s) => s.emailPromptSkipped);
  const emailPromptCompleted = useClosetStore((s) => s.emailPromptCompleted);
  const deadlineSetupPending = useClosetStore((s) => s.deadlineSetupPending);
  const notificationsGranted = useClosetStore((s) => s.notificationsGranted);
  const notifPromptSkipped = useClosetStore((s) => s.notifPromptSkipped);
  const notifPromptCompleted = useClosetStore((s) => s.notifPromptCompleted);
  const skipEmailPrompt = useClosetStore((s) => s.skipEmailPrompt);
  const skipNotifPrompt = useClosetStore((s) => s.skipNotifPrompt);
  const completeNotifPrompt = useClosetStore((s) => s.completeNotifPrompt);

  const kind = nextProgressivePrompt({
    foundMoneyReached: onboardingCompleted || foundMoneyTracked || Boolean(demoAccount),
    emailConnected: connectedSources.length > 0,
    emailPromptSkipped,
    emailPromptCompleted,
    deadlineSetupPending,
    notificationsGranted,
    notifPromptSkipped,
    notifPromptCompleted,
  });

  if (!kind) return null;

  if (kind === 'notifications') {
    const copy = notificationPromptCopy();
    return (
      <View style={styles.card} accessibilityRole="summary">
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.body}>{copy.body}</Text>
        <Button
          label={copy.cta}
          block
          onPress={() => {
            void (async () => {
              const status = await requestPushPermission();
              completeNotifPrompt(isPushPermissionGranted(status));
            })();
          }}
        />
        <Button label={copy.skip} block variant="ghost" onPress={skipNotifPrompt} />
      </View>
    );
  }

  const copy = emailPromptCopy();
  return (
    <View style={styles.card} accessibilityRole="summary">
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.body}>{copy.body}</Text>
      <Button
        label={copy.cta}
        block
        onPress={() => {
          router.push('/(closet)/connect-email' as never);
        }}
      />
      <Button
        label={copy.skip}
        block
        variant="ghost"
        onPress={() => {
          const props = skipPathAnalyticsProps(useClosetStore.getState().delightStartedAt);
          trackEvent('email_prompt_skipped', props);
          skipEmailPrompt();
        }}
      />
    </View>
  );
}

/** Pure helper for tests — builds snapshot from current store. */
export function progressivePermSnapshot(): ProgressivePermSnapshot {
  return snapshotFromStore();
}

const styles = StyleSheet.create({
  body: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
    lineHeight: 18,
    marginBottom: space4,
    marginTop: space3,
  },
  card: {
    backgroundColor: closet.accentBg,
    borderColor: closet.accentSoft,
    borderRadius: radiusMd,
    borderWidth: 1,
    gap: space3,
    marginBottom: space4,
    padding: space4,
  },
  title: {
    color: closet.ink,
    fontFamily: fontSans,
    fontSize: fsBody,
    fontWeight: '700',
  },
});
