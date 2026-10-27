import { useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { usePrompt } from '@/src/components/PromptSheet';
import { Button } from '@/src/components/ui';
import { useDeleteVault, useExportVault } from '@/src/hooks/closet/useCloset';
import {
  exportCanRetry,
  exportProgressLabel,
  exportShowsIndeterminate,
  INITIAL_EXPORT_PROGRESS,
  reduceExportProgress,
  type ExportProgressState,
} from '@/src/lib/exportProgress';
import {
  getDataDashboardLinks,
  getPrivacyPolicyUrl,
} from '@/src/lib/privacyLinks';
import { closetAlertText } from '@/src/lib/closetScreenState';
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
 * Export / hard-delete controls + data-dashboard links for Vault + Consent.
 * Clears session and returns to login after a confirmed delete.
 */
export function VaultPrivacyActions() {
  const router = useRouter();
  const accessToken = useSessionStore((s) => s.accessToken);
  const exportVault = useExportVault();
  const deleteVaultMut = useDeleteVault();
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ExportProgressState>(INITIAL_EXPORT_PROGRESS);
  // Alert.alert does nothing on web, so the delete confirm is a sheet on every platform.
  const { ask, promptElement } = usePrompt();

  const busy = exportVault.isPending || deleteVaultMut.isPending;
  const privacyUrl = getPrivacyPolicyUrl();
  const dashboard = getDataDashboardLinks(privacyUrl);
  const showIndeterminate = exportShowsIndeterminate(progress.phase) || exportVault.isPending;

  function onExport() {
    if (!accessToken) {
      setError('Sign in to export your data.');
      return;
    }
    setError(null);
    setProgress(reduceExportProgress(progress, { type: 'start' }));
    exportVault.mutate(undefined, {
      onSuccess: (result) => {
        setProgress(
          reduceExportProgress(
            reduceExportProgress(INITIAL_EXPORT_PROGRESS, { type: 'start' }),
            {
              type: 'shared',
              shared: result.shared,
              uri: result.uri,
            },
          ),
        );
      },
      onError: (e) => {
        const message = closetAlertText(e);
        setError(message);
        setProgress(reduceExportProgress(INITIAL_EXPORT_PROGRESS, { type: 'fail', message }));
      },
    });
  }

  async function onDelete() {
    if (!accessToken) {
      setError('Sign in to delete your account.');
      return;
    }
    const ok = await ask({
      title: 'Delete your account?',
      message: 'This permanently erases your Vault and Closet data. This cannot be undone.',
      fields: [],
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    setError(null);
    // Deleting clears the session; the root layout's auth gate then goes to the login screen.
    deleteVaultMut.mutate(undefined, {
      onError: (e) => setError(closetAlertText(e)),
    });
  }

  function openPrivacy() {
    Linking.openURL(privacyUrl).catch(() => {
      setError('Could not open privacy policy.');
    });
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Your data</Text>
      <Text style={styles.hint}>
        Data dashboard: privacy policy, consent, export, or permanently delete
        everything we hold for you.
      </Text>
      <Pressable
        accessibilityRole="link"
        onPress={openPrivacy}
        style={styles.linkRow}
      >
        <Text style={styles.link}>
          {dashboard.find((l) => l.id === 'privacy')?.label ?? 'Privacy policy'}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/(closet)/consent' as never)}
        style={styles.linkRow}
      >
        <Text style={styles.link}>Consent & connected sources</Text>
      </Pressable>
      <Button
        label={
          exportVault.isPending
            ? exportProgressLabel(progress.phase === 'idle' ? 'preparing' : progress.phase)
            : progress.phase === 'ready'
              ? 'Export again'
              : 'Export my data'
        }
        block
        variant="secondary"
        disabled={busy || !accessToken}
        onPress={onExport}
      />
      {showIndeterminate ? (
        <View style={styles.progressRow} accessibilityLabel="Export in progress">
          <ActivityIndicator />
          <Text style={styles.hint}>
            {progress.message ?? 'Preparing your export…'}
          </Text>
        </View>
      ) : null}
      {progress.phase === 'ready' && progress.message ? (
        <Text style={styles.hint}>{progress.message}</Text>
      ) : null}
      {exportCanRetry(progress.phase) ? (
        <Button
          label="Retry export"
          block
          variant="secondary"
          disabled={busy || !accessToken}
          onPress={onExport}
        />
      ) : null}
      <Button
        label={deleteVaultMut.isPending ? 'Deleting…' : 'Delete my account'}
        block
        variant="ghost"
        disabled={busy || !accessToken}
        onPress={() => void onDelete()}
      />
      {error && progress.phase !== 'error' ? <Text style={styles.error}>{error}</Text> : null}
      {progress.phase === 'error' && progress.message ? (
        <Text style={styles.error}>{progress.message}</Text>
      ) : null}
      {!accessToken ? <Text style={styles.hint}>Sign in to manage your data.</Text> : null}
      {promptElement}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: surface,
    borderColor: border,
    borderRadius: radiusCard,
    borderWidth: 1,
    gap: space3,
    marginTop: space4,
    padding: space4,
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
    lineHeight: 18,
  },
  link: {
    color: text,
    fontFamily: fontSans,
    fontSize: fsCaption,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  linkRow: {
    paddingVertical: 2,
  },
  progressRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space3,
  },
  title: {
    color: text,
    fontFamily: fontSans,
    fontSize: fsBody,
    fontWeight: '600',
  },
});
