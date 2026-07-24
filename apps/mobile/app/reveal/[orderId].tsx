import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { submitRevealRating } from '@/src/api/client';
import { Button, Chip, SectionHeader } from '@/src/components/ui';
import { RevealDeck } from '@/src/components/reveal/RevealDeck';
import { RevealSatisfactionSurvey } from '@/src/components/reveal/RevealSatisfactionSurvey';
import { useReveal, useUnlockRenders, useGenerateRenders } from '@/src/hooks/reveal';
import { useCoinBalance } from '@/src/hooks/orders';
import { trackEvent } from '@/src/lib/analytics';
import { useSessionStore } from '@/src/stores/session';
import {
  bg,
  border,
  fontMono,
  fontSans,
  fontSansMedium,
  fontSansSemiBold,
  fsBody,
  fsCaption,
  fsMicro,
  space4,
  space6,
  text,
  textMuted,
  wornGold,
  wornGoldTint,
  wornInk,
} from '@/src/theme/tokens';

const SCENARIOS = [
  { id: 'STUDIO', label: 'Studio', icon: '◈' },
  { id: 'GOLDEN_HOUR', label: 'Golden hour', icon: '✦' },
  { id: 'STREET', label: 'Street', icon: '⊞' },
  { id: 'EDITORIAL_DARK', label: 'Editorial dark', icon: '◧' },
  { id: 'NIGHT', label: 'Night', icon: '◉' },
  { id: 'CANDID', label: 'Candid', icon: '◎' },
];

export default function RevealScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const accessToken = useSessionStore((s) => s.accessToken);
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const revealQuery = useReveal(orderId ?? '');
  const unlockMutation = useUnlockRenders(orderId ?? '');
  const generateMutation = useGenerateRenders(orderId ?? '');
  const { data: balanceData } = useCoinBalance();
  const [unlockingId, setUnlockingId] = useState<string | null>(null);
  const [selectedScenario, setSelectedScenario] = useState('STUDIO');
  const [selectedCombineIds, setSelectedCombineIds] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const openedTracked = useRef(false);

  useEffect(() => {
    if (!orderId || !revealQuery.data || openedTracked.current) return;
    openedTracked.current = true;
    trackEvent('reveal_opened', { orderId });
  }, [orderId, revealQuery.data]);

  const renders = revealQuery.data?.renders ?? [];
  const orderItemIds = [...new Set(renders.map((r) => r.orderItemId))];

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

  const handleGenerate = async () => {
    if (!orderId) return;
    setGenerating(true);
    try {
      const result = await generateMutation.mutateAsync({
        orderItemIds: selectedCombineIds.length > 0 ? selectedCombineIds : [orderItemIds[0]!],
        scenario: selectedScenario,
      });
      trackEvent('generate_render', {
        orderId,
        scenario: selectedScenario,
        isCombine: result.isCombine ?? false,
      });
    } catch (error) {
      Alert.alert('Generate failed', error instanceof Error ? error.message : 'Try again');
    } finally {
      setGenerating(false);
    }
  };

  const handleShare = async () => {
    const ready = renders.find((r) => r.unlocked && r.imageUrl && r.status === 'DONE');
    trackEvent('share', { orderId: orderId ?? '', surface: 'reveal' });
    try {
      await Share.share({
        message: ready?.imageUrl
          ? `My WORN reveal — ${ready.imageUrl}`
          : 'Just opened my WORN haul reveal.',
      });
    } catch {
      // user dismissed share sheet
    }
  };

  const toggleCombineId = (id: string) => {
    setSelectedCombineIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const balance = balanceData?.balance ?? 0;
  const isCombine = selectedCombineIds.length > 1;
  const generateCost = isCombine ? 75 : 50;
  const canGenerate = balance >= generateCost && !generating;
  const pendingRenders = renders.some((r) => r.status === 'QUEUED' || r.status === 'RUNNING');

  return (
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        paddingBottom: insets.bottom + space6,
        paddingTop: insets.top + space4,
      }}
      style={styles.screen}
    >
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/coins/buy' as never)}
          style={styles.coinBalanceBtn}
        >
          <View style={styles.coinDot} />
          <Text style={styles.coinBalanceText}>{balance}</Text>
        </Pressable>
      </View>

      <SectionHeader kicker="Reveal" title="Your haul, on you" />
      {pendingRenders ? (
        <Text style={styles.pendingHint}>Still rendering looks — this updates automatically.</Text>
      ) : (
        <Text style={styles.pendingHint}>Swipe the deck to browse your scenes.</Text>
      )}

      {revealQuery.isLoading || !revealQuery.data ? (
        <ActivityIndicator color={wornInk} style={styles.loader} />
      ) : (
        <>
          <RevealDeck
            onUnlock={handleUnlock}
            renders={renders}
            unlockingId={unlockingId}
          />

          <View style={styles.generateSection}>
            <View style={styles.divider} />
            <Text style={styles.sectionLabel}>Generate new render</Text>
            <Text style={styles.generateSubtext}>
              Create a fresh look in any scene. {isCombine ? 'Combine items' : 'Single item'} —{' '}
              {generateCost} coins.
            </Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scenarioRow}>
              {SCENARIOS.map((sc) => {
                return (
                  <Chip
                    key={sc.id}
                    active={selectedScenario === sc.id}
                    label={`${sc.icon} ${sc.label}`}
                    onPress={() => setSelectedScenario(sc.id)}
                  />
                );
              })}
            </ScrollView>

            {orderItemIds.length > 1 && (
              <>
                <Text style={styles.combineLabel}>
                  {selectedCombineIds.length > 0
                    ? `${selectedCombineIds.length} item${selectedCombineIds.length > 1 ? 's' : ''} selected (combine)`
                    : 'Select items to combine'}
                </Text>
                <View style={styles.combineRow}>
                  {orderItemIds.map((id, i) => {
                    const selected = selectedCombineIds.includes(id);
                    return (
                      <Chip
                        key={id}
                        active={selected}
                        label={`Item ${i + 1}`}
                        onPress={() => toggleCombineId(id)}
                      />
                    );
                  })}
                </View>
              </>
            )}

            <View style={styles.generateActions}>
              <Button
                disabled={!canGenerate}
                label={
                  generating
                    ? 'Generating…'
                    : isCombine
                      ? `Combine & generate · ${generateCost} coins`
                      : `Generate · ${generateCost} coins`
                }
                onPress={() => void handleGenerate()}
                variant="secondary"
                block
              />
              <Button
                label="Buy more coins"
                onPress={() => router.push('/coins/buy' as never)}
                variant="ghost"
                block
              />
            </View>
          </View>

          <View style={styles.actions}>
            <Button label="Share look" onPress={() => void handleShare()} variant="secondary" />
            <Button
              label="Shop again"
              onPress={() => router.replace('/(tabs)/feed')}
              variant="primary"
            />
          </View>

          <RevealSatisfactionSurvey
            onContinue={() => router.replace('/(tabs)/feed')}
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
  coinBalanceBtn: {
    alignItems: 'center',
    backgroundColor: wornGoldTint,
    borderRadius: 999,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  coinBalanceText: {
    color: text,
    fontFamily: fontSansSemiBold,
    fontSize: fsCaption,
  },
  coinDot: {
    backgroundColor: wornGold,
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  combineLabel: {
    color: textMuted,
    fontFamily: fontMono,
    fontSize: fsMicro,
    letterSpacing: 1,
    marginTop: space4,
    textTransform: 'uppercase',
  },
  combineRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  divider: {
    backgroundColor: border,
    height: 1,
    marginBottom: space4,
    marginTop: space6,
  },
  generateActions: {
    gap: 8,
    marginTop: space4,
  },
  generateSection: {
    marginTop: space6,
  },
  generateSubtext: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
    lineHeight: 20,
    marginBottom: space4,
  },
  loader: {
    marginTop: space6,
  },
  pendingHint: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
    marginBottom: space4,
  },
  scenarioRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  screen: {
    backgroundColor: bg,
    flex: 1,
    paddingHorizontal: space4,
  },
  sectionLabel: {
    color: textMuted,
    fontFamily: fontMono,
    fontSize: fsMicro,
    letterSpacing: 1.5,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: space6,
  },
});
