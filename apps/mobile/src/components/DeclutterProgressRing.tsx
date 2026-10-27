/**
 * W071 — declutter challenge progress ring (N/goal) + share on complete.
 */

import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/src/components/ui';
import {
  declutterRingLabel,
  declutterRingRatio,
} from '@/src/lib/declutterRing';
import {
  border,
  closet,
  fontSans,
  fontSansSemiBold,
  fsBody,
  fsCaption,
  space3,
  text,
  textMuted,
} from '@/src/theme/tokens';

type Props = {
  progress: number;
  target: number;
  completed?: boolean;
  sharing?: boolean;
  onShare?: () => void;
};

const SIZE = 96;
const STROKE = 8;

/**
 * Circular progress ring (Closet waste). Quarter borders approximate fill
 * without SVG; center shows N/goal. Share CTA when challenge completes.
 */
export function DeclutterProgressRing({
  progress,
  target,
  completed,
  sharing,
  onShare,
}: Props) {
  const ratio = declutterRingRatio(progress, target);
  const label = declutterRingLabel(progress, target);
  const done = Boolean(completed) || ratio >= 1;
  const fill = closet.found;

  return (
    <View style={styles.wrap} testID="declutter-progress-ring">
      <View
        style={styles.ringBox}
        accessibilityRole="progressbar"
        accessibilityValue={{
          min: 0,
          max: Math.max(0, target),
          now: Math.min(Math.max(0, progress), Math.max(0, target)),
        }}
        accessibilityLabel={`Declutter ${label}`}
      >
        <View
          style={[
            styles.track,
            {
              borderTopColor: ratio > 0 ? fill : border,
              borderRightColor: ratio > 0.25 ? fill : border,
              borderBottomColor: ratio > 0.5 ? fill : border,
              borderLeftColor: ratio > 0.75 ? fill : border,
            },
          ]}
        />
        <View style={styles.hole}>
          <Text style={styles.fraction}>{label}</Text>
          <Text style={styles.caption}>{done ? 'Done' : 'cleared'}</Text>
        </View>
      </View>
      {done && onShare ? (
        <Button
          label={sharing ? 'Sharing…' : 'Share on complete'}
          size="sm"
          variant="primary"
          disabled={sharing}
          onPress={onShare}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: space3,
    marginTop: space3,
  },
  ringBox: {
    height: SIZE,
    width: SIZE,
  },
  track: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    borderRadius: SIZE / 2,
    borderWidth: STROKE,
  },
  hole: {
    alignItems: 'center',
    backgroundColor: closet.accentBg,
    borderRadius: (SIZE - STROKE * 2) / 2,
    bottom: STROKE,
    justifyContent: 'center',
    left: STROKE,
    position: 'absolute',
    right: STROKE,
    top: STROKE,
  },
  fraction: {
    color: text,
    fontFamily: fontSansSemiBold,
    fontSize: fsBody,
  },
  caption: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
  },
});
