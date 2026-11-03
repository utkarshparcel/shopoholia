import { REVEAL_UNLOCK_COST_COINS } from '@worn/shared';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { isRenderInProgress } from '@/src/lib/reveal';
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
  /** A card to show — a look just generated, which the deck appends at the end. */
  focusId?: string | null;
  /** Renders an included look that failed again; without it the card offers no retry. */
  onRetry?: (renderId: string) => void;
  retryingId?: string | null;
};

function RenderCardView({
  card,
  onUnlock,
  unlocking,
  onRetry,
  retrying,
}: {
  card: RenderCard;
  onUnlock: (id: string) => void;
  unlocking: boolean;
  onRetry?: (id: string) => void;
  retrying: boolean;
}) {
  const failed = card.status === 'FAILED' && (card.isFree || card.unlocked);
  const locked = !card.isFree && !card.unlocked;
  // A locked look sits QUEUED until it's unlocked: it shows the lock, not "Rendering…".
  const processing = isRenderInProgress(card);

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
                : `Unlock · ${card.unlockCostCoins ?? REVEAL_UNLOCK_COST_COINS} coins`
            }
            onPress={() => onUnlock(card.id)}
            size="md"
            style={styles.unlockBtn}
            variant="secondary"
          />
        </View>
      ) : null}

      {failed ? (
        <View style={styles.lockOverlay}>
          <Text style={styles.lockTitle}>Couldn’t render this look</Text>
          {card.isFree ? (
            onRetry ? (
              <Button
                disabled={retrying}
                label={retrying ? 'Retrying…' : 'Try again'}
                onPress={() => onRetry(card.id)}
                size="md"
                style={styles.unlockBtn}
                variant="secondary"
              />
            ) : null
          ) : (
            <Text style={styles.lockBody}>Your coins were refunded. Generate it again below.</Text>
          )}
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

export function RevealDeck({ renders, onUnlock, unlockingId, focusId, onRetry, retryingId }: RevealDeckProps) {
  const [index, setIndex] = useState(0);

  // Jump to a newly generated look once it is in the deck (once per focus, so later polls that
  // reorder or grow the deck don't pull the user back to it).
  const focusedRef = useRef<string | null>(null);
  const focusIndex = focusId ? renders.findIndex((r) => r.id === focusId) : -1;
  useEffect(() => {
    if (!focusId || focusIndex < 0 || focusedRef.current === focusId) return;
    focusedRef.current = focusId;
    setIndex(focusIndex);
  }, [focusId, focusIndex]);
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
  // The responder is built once, so swipes call the latest onSwipeEnd through this ref.
  const onSwipeEndRef = useRef(onSwipeEnd);
  useEffect(() => {
    onSwipeEndRef.current = onSwipeEnd;
  });
  const swipeEnd = (direction: 'left' | 'right') => onSwipeEndRef.current(direction);

  // Only the current card is mounted, so load its neighbors' images before a swipe lands there.
  const prevImageUrl = renders[index - 1]?.imageUrl;
  const nextImageUrl = renders[index + 1]?.imageUrl;
  useEffect(() => {
    for (const uri of [prevImageUrl, nextImageUrl]) {
      if (uri) void Image.prefetch(uri).catch(() => undefined);
    }
  }, [prevImageUrl, nextImageUrl]);

  const panResponder = useRef(
    PanResponder.create({
      // Horizontal swipes only, so vertical drags still scroll the screen.
      onMoveShouldSetPanResponder: (_e, gestureState) =>
        Math.abs(gestureState.dx) > 8 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
      onPanResponderGrant: () => {
        startXRef.current = translateX.value;
      },
      onPanResponderMove: (_e, gestureState) => {
        translateX.value = startXRef.current + gestureState.dx;
      },
      onPanResponderRelease: (_e, gestureState) => {
        // The card changes only when its fly-out finished; an interrupted spring (a new touch
        // grabbed the card) leaves it where it is.
        if (gestureState.dx < -SWIPE_THRESHOLD) {
          translateX.value = withSpring(-240, {}, (finished) => {
            if (finished) runOnJS(swipeEnd)('left');
          });
          return;
        }
        if (gestureState.dx > SWIPE_THRESHOLD) {
          translateX.value = withSpring(240, {}, (finished) => {
            if (finished) runOnJS(swipeEnd)('right');
          });
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
          onRetry={onRetry}
          onUnlock={onUnlock}
          retrying={retryingId === card.id}
          unlocking={unlockingId === card.id}
        />
      </Animated.View>

      <View style={styles.controls}>
        <Pressable
          accessibilityLabel="Previous look"
          accessibilityRole="button"
          accessibilityState={{ disabled: index === 0 }}
          disabled={index === 0}
          onPress={goPrev}
          style={styles.navBtn}
        >
          <Text style={styles.navText}>←</Text>
        </Pressable>
        <Text style={styles.counter}>
          {index + 1} / {renders.length}
        </Text>
        <Pressable
          accessibilityLabel="Next look"
          accessibilityRole="button"
          accessibilityState={{ disabled: index >= renders.length - 1 }}
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
