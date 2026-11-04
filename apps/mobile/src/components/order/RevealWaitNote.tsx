import { StyleSheet, Text } from 'react-native';

import { useReveal } from '@/src/hooks/reveal';
import { revealWaitCopy } from '@/src/lib/revealWait';
import { fontSans, fsCaption, space4, textMuted } from '@/src/theme/tokens';

/**
 * A delivered order whose reveal renders are waiting for the render agent (overnight, or while
 * it is down): when they should be ready, instead of a spinner. Nothing while they render.
 */
export function RevealWaitNote({ orderId }: { orderId: string }) {
  const reveal = useReveal(orderId);
  if (!reveal.data?.rendersWaiting) return null;
  return (
    <Text style={styles.note} testID="order-reveal-wait">
      {revealWaitCopy(reveal.data.expectedReadyAt)}
    </Text>
  );
}

const styles = StyleSheet.create({
  note: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
    marginTop: space4,
    textAlign: 'center',
  },
});
