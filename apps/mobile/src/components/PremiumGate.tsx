import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ClosetEntitlement } from '@worn/shared';
import { userIdFromAccessToken } from '@/src/lib/access-token';
import { paywallCopyFor, startLocalTrial } from '@/src/lib/purchases/premiumAccess';
import { usePremiumAccess } from '@/src/lib/purchases/useEntitlements';
import { FEATURE_PREMIUM_GATES } from '@/src/lib/features';
import { useSessionStore } from '@/src/stores/session';
import {
  border,
  fontSans,
  fontSansSemiBold,
  fsBody,
  fsCaption,
  radiusMd,
  space4,
  space6,
  surface,
  text,
  textMuted,
  wornGold,
  wornInk,
} from '@/src/theme/tokens';

type Props = {
  surface: ClosetEntitlement;
  children: React.ReactNode;
};

/**
 * When FEATURE_PREMIUM_GATES=1, blocks children until the server's entitlements grant the
 * surface. The CTA opens the store paywall; __DEV__ builds start a local trial instead.
 */
export function PremiumGate({ surface, children }: Props) {
  const userId = useSessionStore((s) => userIdFromAccessToken(s.accessToken));
  const [, setTick] = useState(0);
  const { allowed, checking } = usePremiumAccess(surface);

  if (!FEATURE_PREMIUM_GATES || allowed) {
    return <>{children}</>;
  }
  if (checking) {
    return <View style={styles.wrap} testID={`paywall-${surface}-checking`} />;
  }

  const copy = paywallCopyFor(surface);

  return (
    <View style={styles.wrap} testID={`paywall-${surface}`}>
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.subtitle}>{copy.subtitle}</Text>
      <Pressable
        style={styles.cta}
        onPress={() => {
          if (!__DEV__ || !userId) {
            router.push('/paywall');
            return;
          }
          startLocalTrial(
            userId,
            surface === 'accountant' ? 'closet_accountant_monthly' : 'closet_outfits_monthly',
          );
          setTick((n) => n + 1);
        }}
        accessibilityRole="button"
        accessibilityLabel={copy.cta}
      >
        <Text style={styles.ctaText}>{copy.cta}</Text>
      </Pressable>
      <Text style={styles.hint}>{copy.trialDays}-day trial · cancel anytime</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    margin: space6,
    padding: space6,
    backgroundColor: surface,
    borderRadius: radiusMd,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: border,
    gap: space4,
  },
  title: {
    fontFamily: fontSansSemiBold,
    fontSize: fsBody,
    color: text,
  },
  subtitle: {
    fontFamily: fontSans,
    fontSize: fsCaption,
    color: textMuted,
  },
  cta: {
    backgroundColor: wornGold,
    paddingVertical: space4,
    paddingHorizontal: space6,
    borderRadius: radiusMd,
    alignItems: 'center',
  },
  ctaText: {
    fontFamily: fontSansSemiBold,
    fontSize: fsBody,
    color: wornInk,
  },
  hint: {
    fontFamily: fontSans,
    fontSize: fsCaption,
    color: textMuted,
  },
});
