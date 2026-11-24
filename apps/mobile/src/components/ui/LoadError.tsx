import { Pressable, StyleSheet, Text, View } from 'react-native';

import { errorText } from '@/src/lib/errorText';
import {
  fontDisplay,
  fontSans,
  fontSansSemiBold,
  fsBody,
  fsCaption,
  fsDisplayM,
  space4,
  space6,
  text,
  textMuted,
  trackingTight,
  wornInk,
} from '@/src/theme/tokens';

/** True when the API said the thing asked for doesn't exist (or isn't this user's). */
export function isNotFoundError(error: unknown): boolean {
  return (error as { status?: unknown } | null)?.status === 404;
}

export type LoadErrorProps = {
  /** What couldn't load, as a heading ("Couldn’t load your order"). */
  title: string;
  error?: unknown;
  /** Shown instead of the error's own text. */
  body?: string;
  onRetry?: () => void;
  /** A second way out, for a screen that would otherwise be a dead end. */
  secondaryLabel?: string;
  onSecondary?: () => void;
};

/** The failed-load state of a screen: what failed, why in plain words, and a way to try again. */
export function LoadError({ title, error, body, onRetry, secondaryLabel, onSecondary }: LoadErrorProps) {
  return (
    <View accessibilityRole="alert" style={styles.block} testID="load-error">
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body ?? errorText(error, 'Check your connection and try again.')}</Text>
      {onRetry ? (
        <Pressable accessibilityRole="button" onPress={onRetry} style={styles.action}>
          <Text style={styles.actionText}>Try again</Text>
        </Pressable>
      ) : null}
      {secondaryLabel && onSecondary ? (
        <Pressable accessibilityRole="button" onPress={onSecondary} style={styles.action}>
          <Text style={styles.actionText}>{secondaryLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    marginTop: space4,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: space4,
  },
  actionText: {
    color: wornInk,
    fontFamily: fontSansSemiBold,
    fontSize: fsBody,
  },
  block: {
    alignItems: 'center',
    paddingHorizontal: space6,
    paddingVertical: space6,
  },
  body: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
    lineHeight: 20,
    marginTop: 8,
    textAlign: 'center',
  },
  title: {
    color: text,
    fontFamily: fontDisplay,
    fontSize: fsDisplayM,
    letterSpacing: fsDisplayM * trackingTight,
    textAlign: 'center',
  },
});
