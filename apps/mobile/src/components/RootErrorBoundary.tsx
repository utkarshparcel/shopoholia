import type { ErrorBoundaryProps } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { captureException } from '@/src/lib/sentry';
import {
  bg,
  fsBody,
  fsDisplayM,
  radiusMd,
  space3,
  space4,
  space6,
  space8,
  tapTarget,
  text,
  textMuted,
  wornInk,
  wornPaper,
} from '@/src/theme/tokens';

/**
 * Exported as `ErrorBoundary` from app/_layout.tsx: expo-router renders it in place of the
 * app when a render throws. Reports the error and offers a retry. Uses system fonts, since
 * the crash may have happened before the app's fonts loaded.
 */
export function RootErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    captureException(error);
  }, [error]);

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.body}>
        {__DEV__ ? String(error?.message ?? error) : 'Sorry about that. Try again, or restart the app if it keeps happening.'}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => void retry()}
        style={({ pressed }) => (pressed ? [styles.button, styles.pressed] : styles.button)}
      >
        <Text style={styles.buttonLabel}>Try again</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: 'center',
    backgroundColor: bg,
    flex: 1,
    justifyContent: 'center',
    padding: space8,
  },
  title: {
    color: text,
    fontSize: fsDisplayM,
    fontWeight: '600',
    marginBottom: space3,
    textAlign: 'center',
  },
  body: {
    color: textMuted,
    fontSize: fsBody,
    marginBottom: space6,
    textAlign: 'center',
  },
  button: {
    alignItems: 'center',
    backgroundColor: wornInk,
    borderRadius: radiusMd,
    justifyContent: 'center',
    minHeight: tapTarget,
    paddingHorizontal: space4 + space3,
  },
  pressed: {
    opacity: 0.85,
  },
  buttonLabel: {
    color: wornPaper,
    fontSize: fsBody,
    fontWeight: '600',
  },
});
