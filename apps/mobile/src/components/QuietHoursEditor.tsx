import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/src/components/ui';
import {
  QUIET_HOURS_EDITOR_TITLE,
  QUIET_HOURS_STEP_MINUTES,
  formatNextSendPreview,
  nudgeQuietHours,
} from '@/src/lib/quietHoursEditor';
import {
  border,
  fontSans,
  fsBody,
  fsCaption,
  radiusCard,
  space3,
  text,
  textMuted,
} from '@/src/theme/tokens';

type Props = {
  quietHoursStart: string;
  quietHoursEnd: string;
  busy?: boolean;
  now?: Date;
  /** IANA TZ for W025 next-send preview (defaults to device). */
  timeZone?: string;
  onChange: (start: string, end: string) => void;
};

function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Visual quiet-hours editor with ±30m steppers + next-send preview (W082 / W025).
 */
export function QuietHoursEditor({
  quietHoursStart,
  quietHoursEnd,
  busy = false,
  now = new Date(),
  timeZone = deviceTimeZone(),
  onChange,
}: Props) {
  const preview = formatNextSendPreview(
    now,
    quietHoursStart,
    quietHoursEnd,
    timeZone,
  );

  return (
    <View style={styles.wrap} testID="quiet-hours-editor">
      <Text style={styles.title}>{QUIET_HOURS_EDITOR_TITLE}</Text>
      <Text style={styles.hint}>No pushes during this window (UTC HH:mm).</Text>

      <View style={styles.row}>
        <Text style={styles.label}>Start</Text>
        <Button
          label="−"
          size="sm"
          variant="secondary"
          disabled={busy}
          onPress={() =>
            onChange(
              nudgeQuietHours(quietHoursStart, -QUIET_HOURS_STEP_MINUTES),
              quietHoursEnd,
            )
          }
        />
        <Text style={styles.value} testID="quiet-hours-start">
          {quietHoursStart}
        </Text>
        <Button
          label="+"
          size="sm"
          variant="secondary"
          disabled={busy}
          onPress={() =>
            onChange(
              nudgeQuietHours(quietHoursStart, QUIET_HOURS_STEP_MINUTES),
              quietHoursEnd,
            )
          }
        />
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>End</Text>
        <Button
          label="−"
          size="sm"
          variant="secondary"
          disabled={busy}
          onPress={() =>
            onChange(
              quietHoursStart,
              nudgeQuietHours(quietHoursEnd, -QUIET_HOURS_STEP_MINUTES),
            )
          }
        />
        <Text style={styles.value} testID="quiet-hours-end">
          {quietHoursEnd}
        </Text>
        <Button
          label="+"
          size="sm"
          variant="secondary"
          disabled={busy}
          onPress={() =>
            onChange(
              quietHoursStart,
              nudgeQuietHours(quietHoursEnd, QUIET_HOURS_STEP_MINUTES),
            )
          }
        />
      </View>

      <Text style={styles.preview} testID="quiet-hours-preview">
        {preview}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
  },
  label: {
    color: text,
    flex: 1,
    fontFamily: fontSans,
    fontSize: fsBody,
    fontWeight: '600',
  },
  preview: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
    lineHeight: 18,
    marginTop: space3,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space3,
    marginTop: space3,
  },
  title: {
    color: text,
    fontFamily: fontSans,
    fontSize: fsBody,
    fontWeight: '600',
  },
  value: {
    borderColor: border,
    borderRadius: radiusCard,
    borderWidth: 1,
    color: text,
    fontFamily: fontSans,
    fontSize: fsBody,
    minWidth: 72,
    paddingHorizontal: 10,
    paddingVertical: 6,
    textAlign: 'center',
  },
  wrap: {
    gap: 2,
  },
});
