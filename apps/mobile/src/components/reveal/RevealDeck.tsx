import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useRef, useState } from 'react';
import {
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { Button } from '@/src/components/ui';
import type { RenderCard } from '@/src/api/client';
import {
  accent,
  accentBg,
  fontDisplay,
  fontMono,
  fontSansMedium,
  fontSansSemiBold,
  fsBody,
  fsCaption,
  fsDisplayM,
  fsMicro,
  radiusCard,
  radiusLg,
  shadowPop,
  space2,
  space3,
  space4,
  space6,
  surface,
  text,
  textMuted,
  trackingLabel,
  wornGoldTint,
  wornPaper,
  wornWarm,
} from '@/src/theme/tokens';

const SWIPE_THRESHOLD = 80;

function scenarioLabel(scenario: string) {
  return scenario.replaceAll('_', ' ');
}

type RevealDeckProps = {
  renders: RenderCard[];
  onUnlock: (renderId: string) => void;
  unlockingId?: string | null;
};

function RenderCardView({
  card,
  onUnlock,
  unlocking,
}: {
  card: RenderCard;
  onUnlock: (id: string) => void;
  unlocking: boolean;
}) {
  const locked = !card.isFree && !card.unlocked;
  const processing = card.status === 'QUEUED' || card.status === 'RUNNING';

  return (
    <View style={styles.card}>
      {card.imageUrl ? (
        <Image accessibilityIgnoresInvertColors source={{ uri: card.imageUrl }} style={styles.image} />
      ) : (
        <View style={[styles.image, styles.placeholder]}>
          <LinearGradient
            colors={[wornWarm, wornGoldTint, wornWarm]}
            style={StyleSheet.absoluteFill}
          />
        </View>
      )}

      {locked ? (
        <View style={styles.lockOverlay}>
          <Text style={styles.lockTitle}>Locked look</Text>
          <Text style={styles.lockBody}>Unlock this cinematic scene with coins</Text>
          <Button
            disabled={unlocking}
            label={
              unlocking
                ? 'Unlocking…'
                : `Unlock · ${card.unlockCostCoins ?? 50} coins`
            }
            onPress={() => onUnlock(card.id)}
            size="md"
            style={styles.unlockBtn}
            variant="secondary"
          />
        </View>
      ) : null}

      {processing ? (
        <View style={styles.processingBadge}>
          <Text style={styles.processingText}>Rendering…</Text>
        </View>
      ) : null}

      <View style={styles.meta}>
        <Text style={styles.scenario}>{scenarioLabel(card.scenario)}</Text>
        <Text style={styles.badge}>{card.isFree ? 'Included' : card.unlocked ? 'Unlocked' : 'Premium'}</Text>
      </View>
    </View>
  );
}

export function RevealDeck({ renders, onUnlock, unlockingId }: RevealDeckProps) {
  const [index, setIndex] = useState(0);
  const translateX = useSharedValue(0);
  const startXRef = useRef(0);

  const goNext = useCallback(() => {
    setIndex((current) => Math.min(current + 1, renders.length - 1));
  }, [renders.length]);

  const goPrev = useCallback(() => {
    setIndex((current) => Math.max(current - 1, 0));
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const onSwipeEnd = (direction: 'left' | 'right') => {
    if (direction === 'left') goNext();
    else goPrev();
    translateX.value = 0;
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, gestureState) =>
        Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5,
      onPanResponderGrant: () => {
        startXRef.current = translateX.value;
      },
      onPanResponderMove: (_e, gestureState) => {
        translateX.value = startXRef.current + gestureState.dx;
      },
      onPanResponderRelease: (_e, gestureState) => {
        if (gestureState.dx < -SWIPE_THRESHOLD) {
          translateX.value = withSpring(-240, {}, () => runOnJS(onSwipeEnd)('left'));
          return;
        }
        if (gestureState.dx > SWIPE_THRESHOLD) {
          translateX.value = withSpring(240, {}, () => runOnJS(onSwipeEnd)('right'));
          return;
        }
        translateX.value = withSpring(0);
      },
      onPanResponderTerminate: () => {
        translateX.value = withSpring(0);
      },
    }),
  ).current;

  const card = renders[index];
  if (!card) return null;

  return (
    <View style={styles.deck}>
      <Animated.View style={animatedStyle} {...panResponder.panHandlers}>
        <RenderCardView
          card={card}
          onUnlock={onUnlock}
          unlocking={unlockingId === card.id}
        />
      </Animated.View>

      <View style={styles.controls}>
        <Pressable accessibilityRole="button" disabled={index === 0} onPress={goPrev} style={styles.navBtn}>
          <Text style={styles.navText}>←</Text>
        </Pressable>
        <Text style={styles.counter}>
          {index + 1} / {renders.length}
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={index >= renders.length - 1}
          onPress={goNext}
          style={styles.navBtn}
        >
          <Text style={styles.navText}>→</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    color: accent,
    fontFamily: fontMono,
    fontSize: fsMicro,
    letterSpacing: trackingLabel,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: surface,
    borderRadius: radiusLg,
    overflow: 'hidden',
    ...shadowPop,
  },
  controls: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: space4,
  },
  counter: {
    color: textMuted,
    fontFamily: fontSansMedium,
    fontSize: fsCaption,
  },
  deck: {
    flex: 1,
  },
  image: {
    height: 420,
    width: '100%',
  },
  lockBody: {
    color: wornPaper,
    fontFamily: fontSansMedium,
    fontSize: fsBody,
    marginBottom: space4,
    textAlign: 'center',
  },
  lockOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    backgroundColor: 'rgba(15,14,12,0.55)',
    justifyContent: 'center',
    padding: space6,
  },
  lockTitle: {
    color: wornPaper,
    fontFamily: fontDisplay,
    fontSize: fsDisplayM,
    marginBottom: space2,
  },
  meta: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: space4,
  },
  navBtn: {
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navText: {
    color: text,
    fontFamily: fontSansSemiBold,
    fontSize: fsDisplayM,
  },
  placeholder: {
    backgroundColor: wornWarm,
  },
  processingBadge: {
    backgroundColor: accentBg,
    borderRadius: radiusCard,
    left: space4,
    paddingHorizontal: space3,
    paddingVertical: space2,
    position: 'absolute',
    top: space4,
  },
  processingText: {
    color: accent,
    fontFamily: fontMono,
    fontSize: fsMicro,
    letterSpacing: trackingLabel,
    textTransform: 'uppercase',
  },
  scenario: {
    color: text,
    fontFamily: fontDisplay,
    fontSize: fsDisplayM,
  },
  unlockBtn: {
    minWidth: 220,
  },
});
