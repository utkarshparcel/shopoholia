import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { REFERRAL_REWARD_COINS, WEB_ORIGIN } from '@worn/shared';

import { applyReferral, getMyReferral } from '@/src/api/client';
import { Button } from '@/src/components/ui';
import { shareText } from '@/src/lib/share';
import { errorText } from '@/src/lib/errorText';
import { goBack } from '@/src/lib/goBack';
import { useSessionStore } from '@/src/stores/session';
import {
  accent,
  bg,
  fontDisplay,
  fontMono,
  fontSansMedium,
  fsBody,
  fsCaption,
  fsDisplayL,
  fsDisplayM,
  radiusLg,
  space2,
  space3,
  space4,
  space6,
  surface,
  text,
  textMuted,
  wornInk,
  wornPaper,
} from '@/src/theme/tokens';

export default function ReferralScreen() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [count, setCount] = useState(0);
  const [earned, setEarned] = useState(0);
  const [applyCode, setApplyCode] = useState('');
  const [applyMsg, setApplyMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  // Bumped by "Try again" to load once more.
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    if (!accessToken) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    getMyReferral(accessToken)
      .then((data) => {
        if (cancelled) return;
        setCode(data.referralCode);
        setCount(data.referredCount);
        setEarned(data.earnedCoins);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(errorText(e, 'Failed to load referral'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, loadAttempt]);

  if (loading) {
    return (
      <View style={[styles.center, styles.screen, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={wornInk} />
      </View>
    );
  }

  // Never throws: where sharing isn't supported (web without navigator.share) it copies instead.
  const shareCode = async () => {
    await shareText({
      message: `Join me on WORN! Use my code ${code} when you sign up — I earn coins when you place your first haul. ${WEB_ORIGIN}/r/${code}`,
    });
  };

  // Copy puts the code on the clipboard (Share is the separate button); "Copied!" only once it's there.
  const copyCode = async () => {
    setCopyError(null);
    let ok = false;
    try {
      ok = await Clipboard.setStringAsync(code);
    } catch {
      ok = false;
    }
    if (!ok) {
      setCopied(false);
      setCopyError('Could not copy the code. Use Share instead.');
      return;
    }
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 2000);
  };

  const handleApply = async () => {
    if (!accessToken || !applyCode.trim()) return;
    try {
      const res = await applyReferral(accessToken, applyCode.trim().toUpperCase());
      setApplyMsg(
        `Referral applied! ${res.referrerName ? `Welcome from ${res.referrerName}` : ''}`,
      );
    } catch (e: unknown) {
      setApplyMsg(errorText(e, 'Failed to apply code'));
    }
  };

  return (
    <ScrollView
      contentContainerStyle={{
        paddingBottom: insets.bottom + space6,
        paddingTop: insets.top + space4,
      }}
      style={styles.screen}
    >
      <Pressable accessibilityRole="button" onPress={() => goBack(router)} style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>

      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Refer & earn</Text>
        <Text style={styles.heroSubtitle}>
          You earn {REFERRAL_REWARD_COINS} coins when your friend places their first haul
        </Text>
      </View>

      {error ? (
        <View style={styles.errorState}>
          <Text style={styles.errorTitle}>Could not load referral</Text>
          <Text style={styles.errorBody}>{error}</Text>
          <Button label="Try again" onPress={() => setLoadAttempt((n) => n + 1)} variant="secondary" />
        </View>
      ) : (
        <>
          <View style={styles.codeCard}>
            <Text style={styles.codeLabel}>YOUR CODE</Text>
            <Text style={styles.codeValue}>
              {!code || code === 'PENDING' ? 'Generating…' : code}
            </Text>
            <View style={styles.codeActions}>
              <Button
                label={copied ? 'Copied!' : 'Copy'}
                onPress={copyCode}
                variant="secondary"
                size="md"
                disabled={!code || code === 'PENDING'}
              />
              <Button
                label="Share"
                onPress={shareCode}
                variant="primary"
                size="md"
                disabled={!code || code === 'PENDING'}
              />
            </View>
            {copyError ? (
              <Text accessibilityRole="alert" style={styles.copyError}>
                {copyError}
              </Text>
            ) : null}
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{count}</Text>
              <Text style={styles.statLabel}>Friends joined</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{earned}</Text>
              <Text style={styles.statLabel}>Coins earned</Text>
            </View>
          </View>
        </>
      )}

      <View style={styles.applyCard}>
        <Text style={styles.applyTitle}>Have a referral code?</Text>
        <View style={styles.applyRow}>
          <TextInput
            style={styles.input}
            placeholder="Enter code"
            placeholderTextColor={textMuted}
            value={applyCode}
            onChangeText={setApplyCode}
            autoCapitalize="characters"
          />
          <Button label="Apply" onPress={handleApply} variant="primary" size="md" />
        </View>
        {applyMsg ? <Text style={styles.applyMsg}>{applyMsg}</Text> : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  applyCard: {
    backgroundColor: surface,
    borderRadius: radiusLg,
    marginBottom: space4,
    marginHorizontal: space4,
    padding: space4,
  },
  applyMsg: {
    color: accent,
    fontFamily: fontSansMedium,
    fontSize: fsCaption,
    marginTop: space2,
  },
  applyRow: {
    flexDirection: 'row',
    gap: space2,
    marginTop: space3,
  },
  applyTitle: {
    color: text,
    fontFamily: fontDisplay,
    fontSize: fsDisplayM,
  },
  back: {
    marginBottom: space4,
    paddingHorizontal: space4,
  },
  backText: {
    color: textMuted,
    fontFamily: fontSansMedium,
    fontSize: fsBody,
  },
  center: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  codeActions: {
    flexDirection: 'row',
    gap: space3,
    justifyContent: 'center',
    marginTop: space4,
  },
  copyError: {
    color: wornPaper,
    fontFamily: fontSansMedium,
    fontSize: fsCaption,
    marginTop: space3,
    textAlign: 'center',
  },
  codeCard: {
    alignItems: 'center',
    backgroundColor: wornInk,
    borderRadius: radiusLg,
    marginBottom: space4,
    marginHorizontal: space4,
    padding: space6,
  },
  codeLabel: {
    color: wornPaper,
    fontFamily: fontMono,
    fontSize: fsCaption,
    letterSpacing: 2,
    opacity: 0.7,
  },
  codeValue: {
    color: wornPaper,
    fontFamily: fontDisplay,
    fontSize: fsDisplayL,
    letterSpacing: 4,
    marginVertical: space2,
  },
  errorBody: {
    color: textMuted,
    fontFamily: fontSansMedium,
    fontSize: fsBody,
    marginTop: space2,
    textAlign: 'center',
  },
  errorState: {
    gap: 12,
    alignItems: 'center',
    backgroundColor: surface,
    borderRadius: radiusLg,
    marginBottom: space4,
    marginHorizontal: space4,
    padding: space6,
  },
  errorTitle: {
    color: text,
    fontFamily: fontDisplay,
    fontSize: fsDisplayM,
  },
  hero: {
    alignItems: 'center',
    padding: space6,
  },
  heroSubtitle: {
    color: textMuted,
    fontFamily: fontSansMedium,
    fontSize: fsBody,
    marginTop: space2,
    textAlign: 'center',
  },
  heroTitle: {
    color: text,
    fontFamily: fontDisplay,
    fontSize: fsDisplayL,
  },
  input: {
    backgroundColor: surface,
    borderColor: textMuted,
    borderRadius: 8,
    borderWidth: 1,
    color: text,
    flex: 1,
    fontFamily: fontMono,
    fontSize: fsBody,
    paddingHorizontal: space3,
    paddingVertical: space2,
  },
  screen: {
    backgroundColor: bg,
    flex: 1,
  },
  statCard: {
    alignItems: 'center',
    backgroundColor: surface,
    borderRadius: radiusLg,
    flex: 1,
    padding: space4,
  },
  statLabel: {
    color: textMuted,
    fontFamily: fontSansMedium,
    fontSize: fsCaption,
    marginTop: space2,
  },
  statValue: {
    color: accent,
    fontFamily: fontDisplay,
    fontSize: fsDisplayM,
  },
  statsRow: {
    flexDirection: 'row',
    gap: space3,
    marginBottom: space4,
    marginHorizontal: space4,
  },
});
