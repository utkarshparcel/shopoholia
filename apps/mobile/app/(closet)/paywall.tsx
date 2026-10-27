import { useCallback, useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/src/components/ui';
import { ClosetScreen } from '@/src/components/ClosetScreen';
import {
  confirmUpiPayment,
  createUpiPaymentIntent,
  fetchEntitlementOfferings,
  syncEntitlementTrial,
  type PaywallOfferings,
} from '@/src/api/client';
import {
  EXPERIMENT_UPI_CHECKOUT,
  FEATURE_CLOSET,
  FEATURE_PAYWALL,
  WORN_REGION,
} from '@/src/lib/features';
import { preferredCheckoutMethod, trialCtaLabel } from '@/src/lib/paywall';
import { trackEvent } from '@/src/lib/analytics';
import { useSessionStore } from '@/src/stores/session';
import {
  border,
  fontSans,
  fsBody,
  fsCaption,
  radiusCard,
  space3,
  space4,
  surface,
  text,
  textMuted,
} from '@/src/theme/tokens';

/**
 * MON-REVENUECAT paywall scaffold.
 * Trial via /entitlements/sync; optional UPI stub deep-link when experiment on.
 * No RevenueCat / Razorpay SDK keys required.
 */
export default function ClosetPaywallScreen() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const [offerings, setOfferings] = useState<PaywallOfferings | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      setError(null);
      const region = WORN_REGION === 'US' || WORN_REGION === 'GLOBAL' ? WORN_REGION : 'IN';
      setOfferings(await fetchEntitlementOfferings(accessToken, region));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [accessToken]);

  useEffect(() => {
    trackEvent('paywall_viewed');
    void load();
  }, [load]);

  const startTrial = useCallback(async () => {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const method = preferredCheckoutMethod();
      if (method === 'upi' && EXPERIMENT_UPI_CHECKOUT) {
        const intent = await createUpiPaymentIntent(accessToken, {
          productId: 'closet_premium_monthly',
          region: 'IN',
          method: 'upi',
        });
        if (intent.upiIntentUrl) {
          await Linking.openURL(intent.upiIntentUrl).catch(() => undefined);
        }
        const confirmed = await confirmUpiPayment(accessToken, intent.id);
        setNote(
          `UPI staging paid · unlocked ${confirmed.entitlementsGranted.join(', ')}`,
        );
        trackEvent('paywall_upi_confirmed', {
          entitlements: confirmed.entitlementsGranted.length,
        });
      } else {
        const { snapshot } = await syncEntitlementTrial(
          accessToken,
          'closet_premium_monthly',
        );
        setNote(
          `Trial started · ${snapshot.grants.length} entitlement(s)`,
        );
        trackEvent('paywall_trial_started', { grants: snapshot.grants.length });
      }
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [accessToken, load]);

  if (!FEATURE_CLOSET || !FEATURE_PAYWALL) {
    return (
      <ClosetScreen
        title="Closet Premium"
        subtitle="Enable EXPO_PUBLIC_FEATURE_CLOSET=1 and EXPO_PUBLIC_FEATURE_PAYWALL=1."
      />
    );
  }

  const premium = offerings?.offerings.find(
    (o) => o.productId === 'closet_premium_monthly',
  );

  return (
    <ClosetScreen
      title="Closet Premium"
      subtitle="Accountant + Outfits — 7-day trial. No App Store secrets in this build."
      onRefresh={load}
      hasContent
    >
      <View style={styles.card}>
        <Text style={styles.heading}>{premium?.label ?? 'Closet Premium'}</Text>
        <Text style={styles.body}>
          {premium?.priceLabel
            ? `${premium.priceLabel}/mo after trial`
            : 'Regional price loads from the API'}
        </Text>
        <Text style={styles.caption}>
          Provider: {offerings?.provider ?? '…'} · checkout:{' '}
          {preferredCheckoutMethod()}
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {note ? <Text style={styles.note}>{note}</Text> : null}
        <Button
          label={busy ? 'Working…' : trialCtaLabel(offerings)}
          onPress={() => void startTrial()}
          disabled={busy || !accessToken}
        />
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
    fontFamily: fontSans,
    fontSize: fsBody,
    color: text,
    fontWeight: '600',
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
