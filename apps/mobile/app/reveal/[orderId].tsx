import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { submitRevealRating } from '@/src/api/client';
import { Button, SectionHeader } from '@/src/components/ui';
import { RevealDeck } from '@/src/components/reveal/RevealDeck';
import { RevealSatisfactionSurvey } from '@/src/components/reveal/RevealSatisfactionSurvey';
import { useReveal, useUnlockRenders } from '@/src/hooks/reveal';
import { trackEvent } from '@/src/lib/analytics';
import { useSessionStore } from '@/src/stores/session';
import {
  bg,
  fontSansMedium,
  fsBody,
  space4,
  space6,
  textMuted,
  wornInk,
} from '@/src/theme/tokens';

export default function RevealScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const accessToken = useSessionStore((s) => s.accessToken);
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const revealQuery = useReveal(orderId ?? '');
  const unlockMutation = useUnlockRenders(orderId ?? '');
  const [unlockingId, setUnlockingId] = useState<string | null>(null);
  const openedTracked = useRef(false);

  useEffect(() => {
    if (!orderId || !revealQuery.data || openedTracked.current) return;
    openedTracked.current = true;
    trackEvent('reveal_opened', { orderId });
  }, [orderId, revealQuery.data]);

  const handleUnlock = async (renderId: string) => {
    try {
      setUnlockingId(renderId);
      await unlockMutation.mutateAsync([renderId]);
      trackEvent('unlock', { orderId: orderId ?? '', renderId });
    } catch (error) {
      Alert.alert('Unlock failed', error instanceof Error ? error.message : 'Try again');
    } finally {
      setUnlockingId(null);
    }
  };

  const handleShare = () => {
    trackEvent('share', { orderId: orderId ?? '', surface: 'reveal' });
    Alert.alert('Share', 'Coming soon in beta hardening.');
  };

  return (
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        paddingBottom: insets.bottom + space6,
        paddingTop: insets.top + space4,
        paddingHorizontal: space4,
      }}
      style={styles.screen}
    >
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>

      <SectionHeader kicker="Reveal" title="Your haul, on you" />

      {revealQuery.isLoading || !revealQuery.data ? (
        <ActivityIndicator color={wornInk} style={styles.loader} />
      ) : (
        <>
          <RevealDeck
            onUnlock={handleUnlock}
            renders={revealQuery.data.renders}
            unlockingId={unlockingId}
          />

          <View style={styles.actions}>
            <Button
              label="Download"
              onPress={() => Alert.alert('Download', 'Coming soon in beta hardening.')}
              variant="secondary"
            />
            <Button label="Share" onPress={handleShare} variant="ghost" />
          </View>

          <RevealSatisfactionSurvey
            onRate={(rating) => {
              if (!accessToken || !orderId) return Promise.resolve();
              return submitRevealRating(accessToken, orderId, rating).then(() => undefined);
            }}
            orderId={orderId ?? ''}
          />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    gap: space4,
    justifyContent: 'center',
    marginTop: space6,
  },
  back: {
    marginBottom: space4,
  },
  backText: {
    color: textMuted,
    fontFamily: fontSansMedium,
    fontSize: fsBody,
  },
  loader: {
    marginTop: space6,
  },
  screen: {
    backgroundColor: bg,
    flex: 1,
  },
});
