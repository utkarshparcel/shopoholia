import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { SurfaceEduSheet } from '@/src/components/SurfaceEduSheet';
import { FEATURE_CLOSET } from '@/src/lib/features';
import { closetEntryHref } from '@/src/lib/firstDelight';
import { useClosetPrefsStore } from '@/src/lib/closetPrefs';
import { useClosetStore } from '@/src/stores/closet';
import { useSessionStore, type Surface } from '@/src/stores/session';
import { fontSansSemiBold, surface, textMuted, wornInk, space1, space3, radiusPill } from '@/src/theme/tokens';

function closetLandingHref(): '/(closet)/onboarding' | '/(closet)/today' {
  const closet = useClosetStore.getState();
  return closetEntryHref({
    featureCloset: FEATURE_CLOSET,
    hasMoneyAccounts: Boolean(closet.demoAccount),
    hasAnyConsent: false,
    onboardingSkipped: closet.onboardingSkipped,
    onboardingCompleted: closet.onboardingCompleted,
  });
}

export function SurfaceToggle() {
  const router = useRouter();
  const activeSurface = useSessionStore((s) => s.activeSurface);
  const setActiveSurface = useSessionStore((s) => s.setActiveSurface);
  const surfaceEduSeen = useClosetPrefsStore((s) => s.surfaceEduSeen);
  const markSurfaceEduSeen = useClosetPrefsStore((s) => s.markSurfaceEduSeen);
  const [eduVisible, setEduVisible] = useState(false);
  const [pendingSurface, setPendingSurface] = useState<Surface | null>(null);

  const applySwitch = (surface: Surface) => {
    setActiveSurface(surface);
    if (surface === 'closet') {
      useClosetStore.getState().startDelightClock();
      router.replace(closetLandingHref() as never);
      return;
    }
    router.replace('/(tabs)/feed' as never);
  };

  const finishEdu = () => {
    markSurfaceEduSeen();
    setEduVisible(false);
    const next = pendingSurface;
    setPendingSurface(null);
    if (next) applySwitch(next);
  };

  const switchTo = (surface: Surface) => {
    if (surface === activeSurface) return;
    if (!surfaceEduSeen) {
      setPendingSurface(surface);
      setEduVisible(true);
      return;
    }
    applySwitch(surface);
  };

  const target: Surface = activeSurface === 'play' ? 'closet' : 'play';

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityLabel={`Switch to ${target} surface`}
        accessibilityRole="button"
        onPress={() => switchTo(target)}
        style={styles.pill}
      >
        <Text style={styles.dot} />
        <Text style={styles.label}>{activeSurface === 'play' ? 'Play' : 'Closet'}</Text>
      </Pressable>
      <SurfaceEduSheet
        visible={eduVisible}
        onContinue={finishEdu}
        onSkip={finishEdu}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  dot: {
    backgroundColor: wornInk,
    borderRadius: radiusPill,
    height: 6,
    width: 6,
  },
  label: {
    color: textMuted,
    fontFamily: fontSansSemiBold,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  pill: {
    alignItems: 'center',
    backgroundColor: surface,
    borderColor: '#e0dbd2',
    borderRadius: radiusPill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: space1,
    paddingHorizontal: space3,
    paddingVertical: space1,
  },
  wrap: {
    alignItems: 'flex-end',
    pointerEvents: 'box-none',
    backgroundColor: 'transparent',
    paddingHorizontal: space3,
    paddingTop: 8,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 1000,
  },
});
