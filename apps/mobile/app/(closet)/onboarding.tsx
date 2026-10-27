import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import type { AddCreditBody } from '@worn/shared';

import { Button } from '@/src/components/ui';
import { ClosetScreen } from '@/src/components/ClosetScreen';
import { addCredit, fetchConsents, fetchCredits, grantConsent } from '@/src/api/client';
import { trackEvent } from '@/src/lib/analytics';
import { FEATURE_CLOSET } from '@/src/lib/features';
import {
  SAMPLE_MYNTRA_CREDIT,
  VAULT_FOUND_MONEY_HREF,
  skipPathAnalyticsProps,
  timeToFoundMoneyProps,
} from '@/src/lib/firstDelight';
import {
  COPY_PACK_PICKER_OPTIONS,
  CURRENCY_PICKER_OPTIONS,
  REGION_PACK_PICKER_OPTIONS,
  type ClosetCurrency,
  type CopyPackId,
  type FitRegionPackId,
  useClosetPrefsStore,
} from '@/src/lib/closetPrefs';
import { useClosetStore } from '@/src/stores/closet';
import { useSessionStore } from '@/src/stores/session';
import {
  closet,
  fontSans,
  fontSansSemiBold,
  fsBody,
  fsCaption,
  radiusMd,
  space3,
  space4,
  space6,
  text,
  textMuted,
  wornInk,
} from '@/src/theme/tokens';

/**
 * Compact <60s Closet onboarding: Add card OR Connect email (skip-friendly).
 * Play surface never routes here.
 */
export default function ClosetOnboardingScreen() {
  const router = useRouter();
  const accessToken = useSessionStore((s) => s.accessToken);
  const startDelightClock = useClosetStore((s) => s.startDelightClock);
  const markJustConnected = useClosetStore((s) => s.markJustConnected);
  const markOnboardingSkipped = useClosetStore((s) => s.markOnboardingSkipped);
  const markOnboardingCompleted = useClosetStore((s) => s.markOnboardingCompleted);
  const seedDemoGiftCard = useClosetStore((s) => s.seedDemoGiftCard);
  const markFoundMoneyTracked = useClosetStore((s) => s.markFoundMoneyTracked);
  const preferredCurrency = useClosetPrefsStore((s) => s.preferredCurrency);
  const setPreferredCurrency = useClosetPrefsStore((s) => s.setPreferredCurrency);
  const seedCurrencyFromLocale = useClosetPrefsStore((s) => s.seedCurrencyFromLocale);
  const copyPackId = useClosetPrefsStore((s) => s.copyPackId);
  const setCopyPackId = useClosetPrefsStore((s) => s.setCopyPackId);
  const preferredFitRegion = useClosetPrefsStore((s) => s.preferredFitRegion);
  const setPreferredFitRegion = useClosetPrefsStore((s) => s.setPreferredFitRegion);

  const [checking, setChecking] = useState(true);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [merchant, setMerchant] = useState('');
  const [balance, setBalance] = useState('');
  const [error, setError] = useState<string | null>(null);

  const landVault = useCallback(
    (source: 'manual' | 'oauth' | 'demo') => {
      markJustConnected(source);
      markOnboardingCompleted();
      const state = useClosetStore.getState();
      if (!state.foundMoneyTracked) {
        const props = timeToFoundMoneyProps(state.delightStartedAt, source);
        if (props) {
          trackEvent('time_to_found_money', props);
          markFoundMoneyTracked();
        }
      }
      router.replace(VAULT_FOUND_MONEY_HREF as never);
    },
    [markFoundMoneyTracked, markJustConnected, markOnboardingCompleted, router],
  );

  useEffect(() => {
    startDelightClock();
  }, [startDelightClock]);

  useEffect(() => {
    const applySeed = () => {
      seedCurrencyFromLocale();
    };
    if (useClosetPrefsStore.persist.hasHydrated()) {
      applySeed();
      return;
    }
    return useClosetPrefsStore.persist.onFinishHydration(applySeed);
  }, [seedCurrencyFromLocale]);

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      if (!FEATURE_CLOSET) {
        setChecking(false);
        return;
      }
      if (!accessToken) {
        setChecking(false);
        return;
      }
      try {
        const [consents, credits] = await Promise.all([
          fetchConsents(accessToken).catch(() => ({ grants: [] as Array<{ scope: string }> })),
          fetchCredits(accessToken).catch(() => ({ accounts: [] as unknown[] })),
        ]);
        if (cancelled) return;
        const hasConsent = consents.grants.length > 0;
        const hasAccounts = credits.accounts.length > 0;
        if (hasAccounts || hasConsent) {
          markOnboardingCompleted();
          router.replace(
            (hasAccounts
              ? VAULT_FOUND_MONEY_HREF
              : { pathname: '/(closet)/today' }) as never,
          );
          return;
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    }
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [accessToken, markOnboardingCompleted, router]);

  if (!FEATURE_CLOSET) {
    return (
      <ClosetScreen
        title="Find forgotten credit"
        subtitle="Enable EXPO_PUBLIC_FEATURE_CLOSET=1 for Closet onboarding."
      />
    );
  }

  async function ensureFinancialConsent() {
    if (!accessToken) throw new Error('Sign in to add a card.');
    const consents = await fetchConsents(accessToken);
    const hasFinancial = consents.grants.some((g) => g.scope === 'FINANCIAL');
    if (!hasFinancial) {
      await grantConsent(accessToken, 'FINANCIAL', 'onboarding');
    }
  }

  async function submitCard() {
    const balanceMinor = Math.round(Number(balance) * 100);
    if (!merchant.trim() || !Number.isFinite(balanceMinor) || balanceMinor <= 0) {
      Alert.alert('Enter a merchant and a valid balance');
      return;
    }
    if (!accessToken) {
      setError('Sign in to save a card.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await ensureFinancialConsent();
      const payload: AddCreditBody = {
        kind: 'GIFT_CARD',
        merchant: merchant.trim(),
        currency: preferredCurrency,
        balanceMinor,
      };
      await addCredit(accessToken, payload);
      landVault('manual');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function trySample() {
    setBusy(true);
    setError(null);
    try {
      if (accessToken) {
        try {
          await ensureFinancialConsent();
          await addCredit(accessToken, {
            kind: SAMPLE_MYNTRA_CREDIT.kind,
            merchant: SAMPLE_MYNTRA_CREDIT.merchant,
            currency: SAMPLE_MYNTRA_CREDIT.currency,
            balanceMinor: SAMPLE_MYNTRA_CREDIT.balanceMinor,
            demo: true,
          });
          landVault('demo');
          return;
        } catch {
          // Fall through to local seed for offline / consent edge cases.
        }
      }
      seedDemoGiftCard();
      landVault('demo');
    } finally {
      setBusy(false);
    }
  }

  function skip() {
    const props = skipPathAnalyticsProps(useClosetStore.getState().delightStartedAt);
    trackEvent('onboarding_skipped', props);
    markOnboardingSkipped();
    router.replace('/(closet)/today' as never);
  }

  function pickCurrency(code: ClosetCurrency) {
    setPreferredCurrency(code);
  }

  function pickCopyPack(id: CopyPackId) {
    setCopyPackId(id);
  }

  function pickFitRegion(region: FitRegionPackId) {
    setPreferredFitRegion(region);
  }

  if (checking) {
    return (
      <ClosetScreen title="Find forgotten credit" subtitle="One minute to your first found money." loading />
    );
  }

  return (
    <ClosetScreen
      title="Find forgotten credit"
      subtitle="Add one card or connect email — under a minute to found money."
    >
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Surface money you already own</Text>
        <Text style={styles.muted}>
          Manual cards work without Gmail. Connect later when you are ready.
        </Text>
      </View>

      <View style={styles.currencyBlock} accessibilityRole="radiogroup">
        <Text style={styles.currencyLabel}>Currency</Text>
        <View style={styles.currencyRow}>
          {CURRENCY_PICKER_OPTIONS.map((opt) => {
            const selected = preferredCurrency === opt.code;
            return (
              <Pressable
                key={opt.code}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={opt.label}
                onPress={() => pickCurrency(opt.code)}
                style={[styles.currencyChip, selected && styles.currencyChipOn]}
              >
                <Text style={[styles.currencyChipText, selected && styles.currencyChipTextOn]}>
                  {opt.chipLabel}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.currencyBlock} accessibilityRole="radiogroup">
        <Text style={styles.currencyLabel}>Language</Text>
        <View style={styles.currencyRow}>
          {COPY_PACK_PICKER_OPTIONS.map((opt) => {
            const selected = copyPackId === opt.id;
            return (
              <Pressable
                key={opt.id}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={opt.label}
                onPress={() => pickCopyPack(opt.id)}
                style={[styles.currencyChip, selected && styles.currencyChipOn]}
              >
                <Text style={[styles.currencyChipText, selected && styles.currencyChipTextOn]}>
                  {opt.chipLabel}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.currencyBlock} accessibilityRole="radiogroup">
        <Text style={styles.currencyLabel}>Fit region</Text>
        <Text style={styles.muted}>Seeds tailor templates for your market — not India-only.</Text>
        <View style={styles.currencyRow}>
          {REGION_PACK_PICKER_OPTIONS.map((opt) => {
            const selected = preferredFitRegion === opt.region;
            return (
              <Pressable
                key={opt.region}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={opt.label}
                onPress={() => pickFitRegion(opt.region)}
                style={[styles.currencyChip, selected && styles.currencyChipOn]}
              >
                <Text style={[styles.currencyChipText, selected && styles.currencyChipTextOn]}>
                  {opt.chipLabel}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!adding ? (
        <View style={styles.actions}>
          <Button
            label="Add a gift card"
            block
            onPress={() => setAdding(true)}
            disabled={busy}
          />
          <Button
            label="Connect email"
            block
            variant="secondary"
            disabled={busy}
            onPress={() => router.push('/(closet)/connect-email' as never)}
          />
          <Button
            label={SAMPLE_MYNTRA_CREDIT.label}
            block
            variant="ghost"
            disabled={busy}
            onPress={() => void trySample()}
          />
          <Button label="Skip for now" variant="ghost" block disabled={busy} onPress={skip} />
        </View>
      ) : (
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Merchant (e.g. Amazon)"
            placeholderTextColor={textMuted}
            value={merchant}
            onChangeText={setMerchant}
            autoFocus
          />
          <TextInput
            style={styles.input}
            placeholder={`Balance (${preferredCurrency})`}
            placeholderTextColor={textMuted}
            keyboardType="decimal-pad"
            value={balance}
            onChangeText={setBalance}
          />
          <Button
            label={busy ? 'Saving…' : 'Save & see found money'}
            block
            disabled={busy}
            onPress={() => void submitCard()}
          />
          <Button
            label="Back"
            variant="ghost"
            block
            disabled={busy}
            onPress={() => setAdding(false)}
          />
        </View>
      )}
    </ClosetScreen>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: space4,
  },
  currencyBlock: {
    marginBottom: space6,
  },
  currencyChip: {
    borderColor: closet.rule,
    borderRadius: radiusMd,
    borderWidth: 1,
    paddingHorizontal: space3,
    paddingVertical: space3,
  },
  currencyChipOn: {
    backgroundColor: closet.accentBg,
    borderColor: closet.accentSoft,
  },
  currencyChipText: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
  },
  currencyChipTextOn: {
    color: wornInk,
    fontFamily: fontSansSemiBold,
  },
  currencyLabel: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
    marginBottom: space3,
  },
  currencyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space3,
  },
  error: {
    color: '#b3261e',
    fontFamily: fontSans,
    fontSize: fsCaption,
    marginBottom: space4,
  },
  form: {
    gap: space4,
  },
  hero: {
    backgroundColor: closet.accentBg,
    borderColor: closet.accentSoft,
    borderRadius: radiusMd,
    borderWidth: 1,
    marginBottom: space6,
    padding: space4,
  },
  heroTitle: {
    color: closet.ink,
    fontFamily: fontSans,
    fontSize: fsBody,
    fontWeight: '700',
    lineHeight: 24,
  },
  input: {
    backgroundColor: closet.bg,
    borderColor: closet.rule,
    borderRadius: radiusMd,
    borderWidth: 1,
    color: text,
    fontFamily: fontSans,
    fontSize: fsBody,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  muted: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
    lineHeight: 18,
    marginTop: space3,
  },
});
