import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import { Button } from '@/src/components/ui';
import { ClosetScreen } from '@/src/components/ClosetScreen';
import { createIngestionSource } from '@/src/api/client';
import { CLOSET_OFF_SUBTITLE, closetAlertText } from '@/src/lib/closetScreenState';
import { FEATURE_CLOSET } from '@/src/lib/features';
import { toAccountHealthRow } from '@/src/lib/accountHealth';
import {
  VAULT_FOUND_MONEY_HREF,
  skipPathSecondsProps,
  timeToFoundMoneyProps,
} from '@/src/lib/firstDelight';
import { trackEvent } from '@/src/lib/analytics';
import { getLimitedUseDisclosure } from '@/src/lib/limitedUse';
import { reconnectButtonLabel, startGmailReconnect } from '@/src/lib/healthReconnect';
import { METRICS_SYNC_FEED_HREF } from '@/src/lib/syncFeedAfter';
import { useIngestionSources } from '@/src/hooks/closet/useCloset';
import { useClosetStore } from '@/src/stores/closet';
import { useSessionStore } from '@/src/stores/session';
import {
  border,
  fontMono,
  fontSans,
  fsMicro,
  fsBody,
  fsCaption,
  space4,
  surface,
  textMuted,
  text,
  radiusCard,
  space3,
} from '@/src/theme/tokens';

WebBrowser.maybeCompleteAuthSession();

const limitedUse = getLimitedUseDisclosure();

export default function ConnectEmailScreen() {
  const router = useRouter();
  const accessToken = useSessionStore((s) => s.accessToken);
  const sourcesQuery = useIngestionSources();
  const markJustConnected = useClosetStore((s) => s.markJustConnected);
  const startDelightClock = useClosetStore((s) => s.startDelightClock);
  const markFoundMoneyTracked = useClosetStore((s) => s.markFoundMoneyTracked);
  const markOnboardingCompleted = useClosetStore((s) => s.markOnboardingCompleted);
  const skipEmailPrompt = useClosetStore((s) => s.skipEmailPrompt);
  const completeEmailPrompt = useClosetStore((s) => s.completeEmailPrompt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const healthRows = (sourcesQuery.data?.sources ?? []).map((s) => toAccountHealthRow(s));
  const needsAttention = healthRows.filter((r) => r.needsReconnect || r.error);

  if (!FEATURE_CLOSET) {
    return (
      <ClosetScreen
        title="Connect email"
        subtitle={CLOSET_OFF_SUBTITLE}
      />
    );
  }

  async function connectGmail(opts?: { reconnect?: boolean }) {
    if (!accessToken) {
      setError('Sign in to connect your email.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await startGmailReconnect({
        accessToken,
        createSource: createIngestionSource,
        openBrowser: (url) => WebBrowser.openBrowserAsync(url),
      });
      if (result.status === 'cancelled') {
        setError('OAuth was cancelled. Try again when you are ready.');
        return;
      }
      if (result.status === 'error') {
        setError(result.message);
        return;
      }
      startDelightClock();
      markJustConnected('oauth');
      markOnboardingCompleted();
      completeEmailPrompt();
      const state = useClosetStore.getState();
      if (!state.foundMoneyTracked) {
        const props = timeToFoundMoneyProps(state.delightStartedAt, 'oauth');
        if (props) {
          trackEvent('time_to_found_money', props);
          markFoundMoneyTracked();
        }
      }
      await sourcesQuery.refetch();
      if (opts?.reconnect) {
        router.replace(METRICS_SYNC_FEED_HREF as never);
      } else {
        router.replace(VAULT_FOUND_MONEY_HREF as never);
      }
    } catch (e) {
      setError(closetAlertText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ClosetScreen
      title="Connect email"
      subtitle="Link your inbox so WORN can privately read receipts and build your closet."
    >
      {needsAttention.length > 0 ? (
        <View style={styles.note}>
          <Text style={styles.noteTitle}>Account health</Text>
          {needsAttention.map((row) => (
            <View key={row.id} style={styles.healthBlock}>
              <Text style={styles.noteBody}>
                {row.provider} · {row.status} · Last sync {row.lastSyncLabel}
              </Text>
              {row.error ? <Text style={styles.errorInline}>{row.error}</Text> : null}
              {row.needsReconnect ? (
                <View style={styles.copyRow}>
                  <Button
                    label={reconnectButtonLabel(busy)}
                    size="sm"
                    variant="secondary"
                    disabled={busy || !accessToken}
                    onPress={() => void connectGmail({ reconnect: true })}
                  />
                </View>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.note}>
        <Text style={styles.noteTitle}>How this works</Text>
        <Text style={styles.noteBody}>
          We open a secure, read-only OAuth session with your email provider. You
          grant access to purchase and shipping receipts only — never your full
          inbox, contacts, or sent mail.
        </Text>
      </View>

      <View style={styles.note}>
        <Text style={styles.noteTitle}>What we read &amp; why</Text>
        <Text style={styles.noteBody}>
          Order and shipping receipts are scanned to find the things you already
          paid for: gift cards and store credit (your &quot;found money&quot;), warranty
          coverage windows, and where your money actually went. That&apos;s it.
        </Text>
      </View>

      <View style={styles.note}>
        <Text style={styles.noteTitle}>You&apos;re in control</Text>
        <Text style={styles.noteBody}>
          This is read-only — WORN can never send mail or change settings on your
          behalf. You can revoke access at any time from the Vault screen, and
          export or delete everything we&apos;ve stored about you there too.
        </Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {/* W080: Limited Use always adjacent to Connect Gmail — visible before connect. */}
      <View style={styles.note} testID="limited-use-near-gmail">
        <Text style={styles.noteTitle}>{limitedUse.title}</Text>
        {limitedUse.bullets.map((bullet) => (
          <Text key={bullet} style={styles.noteBody}>
            • {bullet}
          </Text>
        ))}
        <Text style={styles.hint}>{limitedUse.nearCtaSummary}</Text>
      </View>

      <Button
        label={busy ? 'Connecting…' : 'Connect Gmail'}
        onPress={() => void connectGmail()}
        variant="primary"
        block
        disabled={busy || !accessToken}
      />
      <Text style={styles.hint}>{limitedUse.ctaHint}</Text>
      <Button
        label="Review consent first"
        onPress={() => router.push('/(closet)/consent' as never)}
        variant="ghost"
        block
        disabled={busy}
      />
      <Button
        label="Skip for now"
        onPress={() => {
          trackEvent(
            'email_prompt_skipped',
            skipPathSecondsProps(useClosetStore.getState().delightStartedAt),
          );
          skipEmailPrompt();
          router.replace('/(closet)/vault' as never);
        }}
        variant="ghost"
        block
        disabled={busy}
      />
      {!accessToken ? (
        <Text style={styles.hint}>Sign in to connect your email.</Text>
      ) : null}
    </ClosetScreen>
  );
}

const styles = StyleSheet.create({
  copyRow: {
    marginTop: space3,
  },
  error: {
    color: '#b3261e',
    fontFamily: fontSans,
    fontSize: fsCaption,
    marginBottom: space4,
  },
  errorInline: {
    color: '#b3261e',
    fontFamily: fontSans,
    fontSize: fsCaption,
    marginTop: space3,
  },
  healthBlock: {
    marginTop: space3,
  },
  hint: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
    marginTop: space3,
  },
  note: {
    backgroundColor: surface,
    borderColor: border,
    borderRadius: radiusCard,
    borderWidth: 1,
    padding: space4,
    marginBottom: space4,
  },
  noteBody: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsBody,
    lineHeight: 22,
    marginTop: space3,
  },
  noteTitle: {
    color: text,
    fontFamily: fontMono,
    fontSize: fsMicro,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
});
