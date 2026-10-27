import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/src/components/ui';
import { ClosetScreen } from '@/src/components/ClosetScreen';
import { usePrompt } from '@/src/components/PromptSheet';
import { QuietHoursEditor } from '@/src/components/QuietHoursEditor';
import { VaultPrivacyActions } from '@/src/components/VaultPrivacyActions';
import {
  createIngestionSource,
  fetchNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferences,
} from '@/src/api/client';
import {
  useConsentSources,
  useConsents,
  useDisconnectSource,
  useGrantConsent,
  useRevokeConsent,
} from '@/src/hooks/closet/useConsent';
import { CLOSET_OFF_SUBTITLE, closetAlertText } from '@/src/lib/closetScreenState';
import { FEATURE_CLOSET } from '@/src/lib/features';
import {
  CONSENT_PLAIN_CARDS,
  CONSENT_SCOPES,
  CONSENT_TRUST_SCOPES,
  formatLastSync,
  type ConsentScopeId,
} from '@/src/lib/consentCenter';
import { toAccountHealthRow } from '@/src/lib/accountHealth';
import { reconnectButtonLabel, startGmailReconnect } from '@/src/lib/healthReconnect';
import { getLimitedUseDisclosure } from '@/src/lib/limitedUse';
import { PRIVACY_IN_APP_HREF } from '@/src/lib/privacyLinks';
import { getRetentionHumanCopy } from '@/src/lib/retentionCopy';
import { METRICS_SYNC_FEED_HREF } from '@/src/lib/syncFeedAfter';
import { useSessionStore } from '@/src/stores/session';
import {
  border,
  fontSans,
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
const retention = getRetentionHumanCopy();

const POINTS = [
  'We read only order and shipping receipts — never your personal messages or sent mail.',
  'Everything stays in your private Vault. Nothing is shared publicly.',
  'This is read-only: WORN cannot send email or change your account on your behalf.',
  'You can disconnect any source, export your data, or delete your account at any time from this screen or the Vault.',
];

const SCOPES = CONSENT_SCOPES;
const NOTIF_CATEGORIES = ['returns', 'warranty', 'credits', 'outfits', 'digest'] as const;
const NOTIF_CATEGORY_LABEL: Record<(typeof NOTIF_CATEGORIES)[number], string> = {
  returns: 'Return deadlines',
  warranty: 'Warranties',
  credits: 'Gift cards and credits',
  outfits: 'Outfit ideas',
  digest: 'Digest',
};
const SOURCE_KIND_LABEL: Record<string, string> = { EMAIL: 'Email', SMS: 'SMS', RECEIPT: 'Receipts' };

/** "Gmail · Email" rather than the stored "gmail · EMAIL". */
function sourceLabel(provider: string, kind: string): string {
  const name = provider === 'gmail' ? 'Gmail' : provider.charAt(0).toUpperCase() + provider.slice(1);
  return `${name} · ${SOURCE_KIND_LABEL[kind] ?? kind}`;
}

export default function ConsentScreen() {
  const router = useRouter();
  const accessToken = useSessionStore((s) => s.accessToken);
  const consents = useConsents();
  const sources = useConsentSources();
  const grant = useGrantConsent();
  const revokeMut = useRevokeConsent();
  const disconnectMut = useDisconnectSource();
  const { ask, promptElement } = usePrompt();

  // Nothing is ticked for the user: every scope is an explicit choice.
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [busyScope, setBusyScope] = useState<string | null>(null);
  const [busySourceId, setBusySourceId] = useState<string | null>(null);
  const [reconnectBusy, setReconnectBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [prefsBusy, setPrefsBusy] = useState(false);

  // A load that finishes after the screen closed must not set state on it.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadPrefs = useCallback(async () => {
    if (!accessToken) return;
    try {
      const next = await fetchNotificationPreferences(accessToken);
      if (mountedRef.current) setPrefs(next);
    } catch (e) {
      if (mountedRef.current) setError(closetAlertText(e));
    }
  }, [accessToken]);

  useEffect(() => {
    void loadPrefs();
  }, [loadPrefs]);

  if (!FEATURE_CLOSET) {
    return (
      <ClosetScreen
        title="Your consent"
        subtitle={CLOSET_OFF_SUBTITLE}
      />
    );
  }

  const grants = consents.data?.grants ?? [];
  const active = new Set(grants.map((g) => g.scope));
  const connectedSources = sources.data?.sources ?? [];
  const healthById = new Map(
    connectedSources.map((s) => [s.id, toAccountHealthRow(s)] as const),
  );
  const loading = consents.isLoading || sources.isLoading;
  // WORN never reads SMS (MOB 7): the scope shows only so an old grant can still be revoked.
  const shownScope = (scope: string) => scope !== 'SMS' || active.has(scope);

  function toggleSelected(scope: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) next.delete(scope);
      else next.add(scope);
      return next;
    });
  }

  // Revoking stops syncing and disconnecting drops a source: both ask first, on every platform.
  async function revoke(scope: string) {
    if (!accessToken) return;
    const card = CONSENT_PLAIN_CARDS[scope as ConsentScopeId];
    const ok = await ask({
      title: `Revoke ${card?.title ?? 'this permission'}?`,
      message: 'WORN stops using this data straight away. You can grant it again here later.',
      fields: [],
      confirmLabel: 'Revoke',
    });
    if (!ok) return;
    setBusyScope(scope);
    setError(null);
    try {
      await revokeMut.mutateAsync(scope);
    } catch (e) {
      setError(closetAlertText(e));
    } finally {
      setBusyScope(null);
    }
  }

  async function disconnectSource(sourceId: string) {
    if (!accessToken) return;
    const ok = await ask({
      title: 'Disconnect this source?',
      message: 'WORN stops syncing from it. What is already in your Vault stays until you delete it.',
      fields: [],
      confirmLabel: 'Disconnect',
    });
    if (!ok) return;
    setBusySourceId(sourceId);
    setError(null);
    try {
      await disconnectMut.mutateAsync(sourceId);
    } catch (e) {
      setError(closetAlertText(e));
    } finally {
      setBusySourceId(null);
    }
  }

  async function reconnectSource() {
    if (!accessToken) {
      setError('Sign in to reconnect.');
      return;
    }
    setReconnectBusy(true);
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
      await sources.refetch();
      router.replace(METRICS_SYNC_FEED_HREF as never);
    } finally {
      setReconnectBusy(false);
    }
  }

  async function approve() {
    if (!accessToken) {
      setError('Sign in to approve consent.');
      return;
    }
    if (selected.size === 0) {
      setError('Select at least one scope to approve.');
      return;
    }
    setError(null);
    try {
      for (const scope of selected) {
        if (!active.has(scope)) {
          await grant.mutateAsync({ scope, source: 'consent-center' });
        }
      }
      // Email goes on to connecting an inbox; anything else returns to where the user came from.
      if (selected.has('EMAIL')) {
        router.replace('/(closet)/connect-email' as never);
      } else if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(closet)/vault' as never);
      }
    } catch (e) {
      setError(closetAlertText(e));
    }
  }

  async function saveQuietHours(start: string, end: string) {
    if (!accessToken || !prefs) return;
    setPrefsBusy(true);
    try {
      const next = await updateNotificationPreferences(accessToken, {
        quietHoursStart: start,
        quietHoursEnd: end,
      });
      setPrefs(next);
    } catch (e) {
      setError(closetAlertText(e));
    } finally {
      setPrefsBusy(false);
    }
  }

  async function toggleCategory(key: (typeof NOTIF_CATEGORIES)[number]) {
    if (!accessToken || !prefs) return;
    setPrefsBusy(true);
    try {
      const next = await updateNotificationPreferences(accessToken, {
        categories: { [key]: !prefs.categories[key] },
      });
      setPrefs(next);
    } catch (e) {
      setError(closetAlertText(e));
    } finally {
      setPrefsBusy(false);
    }
  }

  function cancel() {
    router.replace('/(closet)/vault' as never);
  }

  const loadError =
    error ??
    (consents.isError ? closetAlertText(consents.error) : null) ??
    (sources.isError ? closetAlertText(sources.error) : null);

  return (
    <ClosetScreen
      title="Your consent"
      subtitle="Transparency before we connect anything. This screen is the source of truth — it reads live grants and connected sources from the Vault."
      loading={loading}
      loadingLabel="Loading consent…"
      error={loadError && !grants.length && !connectedSources.length ? loadError : null}
      onRetry={() => {
        void consents.refetch();
        void sources.refetch();
        void loadPrefs();
      }}
      onRefresh={async () => {
        await Promise.all([consents.refetch(), sources.refetch(), loadPrefs()]);
      }}
    >
      <View style={styles.points}>
        {POINTS.map((point) => (
          <View key={point} style={styles.point}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.pointText}>{point}</Text>
          </View>
        ))}
      </View>

      <View style={styles.grantsCard}>
        <Text style={styles.grantsTitle}>{limitedUse.title}</Text>
        {limitedUse.bullets.map((bullet) => (
          <View key={bullet} style={styles.point}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.pointText}>{bullet}</Text>
          </View>
        ))}
        <Text style={styles.hint}>{limitedUse.ctaHint}</Text>
      </View>

      <View style={styles.grantsCard}>
        <Text style={styles.grantsTitle}>{retention.title}</Text>
        {retention.lines.filter((line) => shownScope(line.kind)).map((line) => (
          <View key={line.kind} style={styles.point}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.pointText}>{line.sentence}</Text>
          </View>
        ))}
        <Text style={styles.hint}>{retention.footnote}</Text>
        <Button
          label="Read privacy policy"
          size="sm"
          variant="ghost"
          onPress={() => router.push(PRIVACY_IN_APP_HREF as never)}
        />
      </View>

      <View style={styles.grantsCard}>
        <Text style={styles.grantsTitle}>Connected sources</Text>
        {connectedSources.length === 0 ? (
          <Text style={styles.hint}>No inbox connected yet.</Text>
        ) : (
          connectedSources.map((source) => {
            const busy = busySourceId === source.id;
            const health = healthById.get(source.id);
            return (
              <View key={source.id} style={styles.grantRow}>
                <View style={styles.grantMeta}>
                  <Text style={styles.grantScope}>
                    {sourceLabel(source.provider, source.kind)}
                  </Text>
                  <Text style={styles.grantStatus}>
                    {health?.label ?? source.status} · Last sync{' '}
                    {formatLastSync(source.lastSyncAt)}
                  </Text>
                  {health?.error ? (
                    <Text style={styles.error}>{health.error}</Text>
                  ) : null}
                </View>
                {health?.needsReconnect ? (
                  <Button
                    label={reconnectButtonLabel(reconnectBusy)}
                    size="sm"
                    variant="secondary"
                    disabled={reconnectBusy || !accessToken}
                    onPress={() => void reconnectSource()}
                  />
                ) : (
                  <Button
                    label={busy ? '…' : 'Disconnect'}
                    size="sm"
                    variant="secondary"
                    disabled={busy || !accessToken}
                    onPress={() => void disconnectSource(source.id)}
                  />
                )}
              </View>
            );
          })
        )}
        <Button
          label="Connect email"
          size="sm"
          variant="ghost"
          onPress={() => router.push('/(closet)/connect-email' as never)}
        />
      </View>

      <View style={styles.grantsCard}>
        <Text style={styles.grantsTitle}>What you allow</Text>
        <Text style={styles.hint}>Plain-language permissions — revoke any one in a single tap.</Text>
        {CONSENT_TRUST_SCOPES.filter(shownScope).map((scope) => {
          const card = CONSENT_PLAIN_CARDS[scope];
          const isActive = active.has(scope);
          const isSelected = selected.has(scope);
          const busy = busyScope === scope;
          return (
            <View key={scope} style={styles.plainCard}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isSelected }}
                onPress={() => toggleSelected(scope)}
                style={styles.grantMeta}
              >
                <Text style={styles.grantScope}>
                  {isSelected ? '☑' : '☐'} {card.title}
                </Text>
                <Text style={styles.grantStatus}>{card.summary}</Text>
                <Text style={styles.hint}>{card.detail}</Text>
                <Text style={styles.grantStatus}>{isActive ? 'Granted' : 'Not granted'}</Text>
              </Pressable>
              {isActive ? (
                <Button
                  label={busy ? '…' : 'Revoke'}
                  size="sm"
                  variant="secondary"
                  disabled={busy || !accessToken}
                  onPress={() => void revoke(scope)}
                />
              ) : null}
            </View>
          );
        })}
        {SCOPES.filter((s) => !(CONSENT_TRUST_SCOPES as readonly string[]).includes(s)).map(
          (scope) => {
            const card = CONSENT_PLAIN_CARDS[scope as ConsentScopeId];
            const isActive = active.has(scope);
            const isSelected = selected.has(scope);
            const busy = busyScope === scope;
            return (
              <View key={scope} style={styles.grantRow}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isSelected }}
                  onPress={() => toggleSelected(scope)}
                  style={styles.grantMeta}
                >
                  <Text style={styles.grantScope}>
                    {isSelected ? '☑' : '☐'} {card.title}
                  </Text>
                  <Text style={styles.grantStatus}>
                    {card.summary} · {isActive ? 'Granted' : 'Not granted'}
                  </Text>
                </Pressable>
                {isActive ? (
                  <Button
                    label={busy ? '…' : 'Revoke'}
                    size="sm"
                    variant="secondary"
                    disabled={busy || !accessToken}
                    onPress={() => void revoke(scope)}
                  />
                ) : null}
              </View>
            );
          },
        )}
        {loadError ? <Text style={styles.error}>{loadError}</Text> : null}
        {!accessToken ? <Text style={styles.hint}>Sign in to manage consent.</Text> : null}
      </View>

      {prefs ? (
        <View style={styles.grantsCard}>
          <Text style={styles.grantsTitle}>Notification preferences</Text>
          <QuietHoursEditor
            quietHoursStart={prefs.quietHoursStart}
            quietHoursEnd={prefs.quietHoursEnd}
            busy={prefsBusy}
            onChange={(start, end) => {
              setPrefs({ ...prefs, quietHoursStart: start, quietHoursEnd: end });
              void saveQuietHours(start, end);
            }}
          />
          {NOTIF_CATEGORIES.map((key) => (
            <View key={key} style={styles.grantRow}>
              <Text style={styles.grantScope}>{NOTIF_CATEGORY_LABEL[key]}</Text>
              <Button
                label={prefs.categories[key] ? 'On' : 'Off'}
                size="sm"
                variant={prefs.categories[key] ? 'primary' : 'secondary'}
                disabled={prefsBusy || !accessToken}
                onPress={() => void toggleCategory(key)}
              />
            </View>
          ))}
        </View>
      ) : null}

      <Button
        label={grant.isPending ? 'Approving…' : 'Approve & connect'}
        onPress={() => void approve()}
        variant="primary"
        block
        disabled={grant.isPending || !accessToken || selected.size === 0}
      />
      <Button label="Cancel" onPress={cancel} variant="ghost" block disabled={grant.isPending} />

      <VaultPrivacyActions />
      {promptElement}
    </ClosetScreen>
  );
}

const styles = StyleSheet.create({
  bullet: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsBody,
    width: 16,
  },
  point: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: space3,
    marginBottom: space4,
  },
  points: {
    backgroundColor: surface,
    borderColor: border,
    borderRadius: radiusCard,
    borderWidth: 1,
    padding: space4,
  },
  pointText: {
    color: text,
    fontFamily: fontSans,
    fontSize: fsBody,
    flex: 1,
    lineHeight: 22,
  },
  grantsCard: {
    backgroundColor: surface,
    borderColor: border,
    borderRadius: radiusCard,
    borderWidth: 1,
    padding: space4,
    marginTop: space4,
    marginBottom: space4,
    gap: space3,
  },
  grantsTitle: {
    color: text,
    fontFamily: fontSans,
    fontSize: fsBody,
    fontWeight: '600',
  },
  grantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  plainCard: {
    borderTopColor: border,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space3,
    paddingVertical: space3,
  },
  grantMeta: {
    gap: 2,
    flex: 1,
  },
  grantScope: {
    color: text,
    fontFamily: fontSans,
    fontSize: fsBody,
    fontWeight: '600',
  },
  grantStatus: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
  },
  error: {
    color: '#b3261e',
    fontFamily: fontSans,
    fontSize: fsCaption,
  },
  hint: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
  },
});
