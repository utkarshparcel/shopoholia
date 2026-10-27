import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/src/components/ui';
import { ClosetScreen } from '@/src/components/ClosetScreen';
import { FEATURE_CLOSET, FEATURE_PAYWALL } from '@/src/lib/features';
import { trialCtaLabel } from '@/src/lib/paywall';
import { usePremiumPurchase, type PremiumNotice } from '@/src/lib/purchases/useEntitlements';
import { trackEvent } from '@/src/lib/analytics';
import {
  border,
  fontSans,
  fontSansSemiBold,
  fsBody,
  fsCaption,
  radiusCard,
  space3,
  space4,
  surface,
  text,
  textMuted,
} from '@/src/theme/tokens';

const NOTICE_COPY: Record<PremiumNotice['kind'], string> = {
  active: 'Closet Premium is active.',
  pending: 'Waiting for approval. Premium unlocks as soon as the purchase is approved.',
  confirming: "We couldn't confirm your purchase yet. Premium unlocks as soon as we can.",
  conflict: 'This purchase was already added to another Worn account.',
  refunded: 'This purchase was refunded, so Premium is not active.',
  inactive: "This subscription isn't active any more.",
  rejected: "We couldn't confirm this purchase. If you were charged, contact Worn support.",
  failed: "The purchase didn't go through. Please try again.",
  nothing_to_restore: 'No Closet Premium purchase to restore on this store account.',
};

/**
 * Closet Premium: subscribe through App Store / Google Play billing, or restore a purchase.
 * Unlocks only from the server's verified entitlements.
 */
export default function ClosetPaywallScreen() {
  const premium = usePremiumPurchase();

  useEffect(() => {
    trackEvent('paywall_viewed');
  }, []);

  if (!FEATURE_CLOSET || !FEATURE_PAYWALL) {
    return (
      <ClosetScreen
        title="Closet Premium"
        subtitle="Enable EXPO_PUBLIC_FEATURE_CLOSET=1 and EXPO_PUBLIC_FEATURE_PAYWALL=1."
      />
    );
  }

  const offering = premium.offerings?.offerings.find(
    (o) => o.productId === 'closet_premium_monthly',
  );
  const notice = premium.notice ? NOTICE_COPY[premium.notice.kind] : null;
  const bad =
    premium.notice?.kind === 'conflict' ||
    premium.notice?.kind === 'refunded' ||
    premium.notice?.kind === 'inactive' ||
    premium.notice?.kind === 'rejected' ||
    premium.notice?.kind === 'failed';

  return (
    <ClosetScreen
      title="Closet Premium"
      subtitle="Accountant + Outfits — 7-day trial."
      onRefresh={premium.reload}
      hasContent
    >
      <View style={styles.card}>
        <Text style={styles.heading}>{offering?.label ?? 'Closet Premium'}</Text>
        {premium.active ? (
          <Text style={styles.body}>Closet Premium is active.</Text>
        ) : premium.available && !premium.purchasable && !premium.loading ? (
          <Text style={styles.body}>Subscriptions aren&apos;t available right now. Please try again later.</Text>
        ) : premium.available ? (
          <Text style={styles.body}>
            {premium.product?.sample
              ? `Sample ${premium.product.priceString}/mo after trial`
              : `${premium.product?.priceString}/mo after trial`}
          </Text>
        ) : (
          <Text style={styles.body}>
            {premium.loading
              ? 'Loading…'
              : "Closet Premium isn't available on this device yet."}
          </Text>
        )}
        {notice ? <Text style={bad ? styles.error : styles.note}>{notice}</Text> : null}
        {premium.available && premium.purchasable && !premium.active ? (
          <Button
            label={premium.busy === 'subscribe' ? 'Working…' : trialCtaLabel(premium.offerings, premium.product)}
            onPress={() => void premium.subscribe()}
            disabled={premium.busy !== null}
          />
        ) : null}
        {premium.available && premium.purchasable ? (
          <Button
            label={premium.busy === 'restore' ? 'Restoring…' : 'Restore Purchases'}
            onPress={() => void premium.restore()}
            disabled={premium.busy !== null}
            variant="secondary"
          />
        ) : null}
      </View>
    </ClosetScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: space4,
    padding: space4,
    backgroundColor: surface,
    borderRadius: radiusCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: border,
    gap: space3,
  },
  heading: {
    fontFamily: fontSansSemiBold,
    fontSize: fsBody,
    color: text,
  },
  body: {
    fontFamily: fontSans,
    fontSize: fsBody,
    color: textMuted,
  },
  caption: {
    fontFamily: fontSans,
    fontSize: fsCaption,
    color: textMuted,
  },
  error: {
    fontFamily: fontSans,
    fontSize: fsCaption,
    color: '#B42318',
  },
  note: {
    fontFamily: fontSans,
    fontSize: fsCaption,
    color: text,
  },
});
