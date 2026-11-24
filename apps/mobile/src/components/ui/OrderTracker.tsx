import { Platform, StyleSheet, Text, View, type ViewProps } from 'react-native';

import {
  accent,
  accentBg,
  accentSoft,
  border,
  fontDisplay,
  fontMono,
  fontSansMedium,
  fsBody,
  radiusLg,
  surface,
  text,
  textMuted,
  wornInk,
  wornPaper,
} from '@/src/theme/tokens';

export type TrackerStepState = 'done' | 'current' | 'todo';

export type TrackerStep = {
  id: string;
  label: string;
  detail?: string;
  state: TrackerStepState;
};

export type OrderTrackerProps = ViewProps & {
  orderId: string;
  eta: string;
  steps: TrackerStep[];
};

export function OrderTracker({ orderId, eta, steps, style, ...props }: OrderTrackerProps) {
  return (
    <View style={[styles.tracker, style]} {...props}>
      <View style={styles.head}>
        <Text style={styles.headLabel}>Order {orderId}</Text>
        <Text style={styles.eta}>{eta}</Text>
      </View>
      <View style={styles.timeline}>
        {steps.map((step, index) => (
          <TimelineStep key={step.id} step={step} isLast={index === steps.length - 1} />
        ))}
      </View>
    </View>
  );
}

type TimelineStepProps = {
  step: TrackerStep;
  isLast: boolean;
};

function TimelineStep({ step, isLast }: TimelineStepProps) {
  const isDone = step.state === 'done';
  const isCurrent = step.state === 'current';

  return (
    <View style={styles.step}>
      {!isLast ? (
        <View
          style={[
            styles.connector,
            (isDone || isCurrent) && styles.connectorActive,
          ]}
        />
      ) : null}
      <View
        style={[
          styles.dot,
          isDone && styles.dotDone,
          isCurrent && styles.dotCurrent,
        ]}
      >
        {isDone ? <Text style={styles.check}>✓</Text> : null}
        {isCurrent ? <View style={styles.dotPulse} /> : null}
      </View>
      <View style={styles.stepBody}>
        <Text style={[styles.stepLabel, step.state === 'todo' && styles.stepLabelTodo]}>
          {step.label}
        </Text>
        {step.detail ? <Text style={styles.stepDetail}>{step.detail}</Text> : null}
      </View>
    </View>
  );
}

// The dot sits after the step's left padding; the connector runs down through its centre.
const STEP_PADDING_LEFT = 6;
const DOT_SIZE = 20;
const CONNECTOR_WIDTH = 2;
export const CONNECTOR_LEFT = STEP_PADDING_LEFT + DOT_SIZE / 2 - CONNECTOR_WIDTH / 2;

const styles = StyleSheet.create({
  check: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  connector: {
    backgroundColor: border,
    bottom: -2,
    left: CONNECTOR_LEFT,
    position: 'absolute',
    top: 22,
    width: CONNECTOR_WIDTH,
  },
  connectorActive: {
    backgroundColor: accentSoft,
  },
  dot: {
    alignItems: 'center',
    backgroundColor: surface,
    borderColor: border,
    borderRadius: 10,
    borderWidth: 2,
    height: DOT_SIZE,
    justifyContent: 'center',
    width: DOT_SIZE,
    zIndex: 1,
  },
  dotCurrent: {
    borderColor: accent,
    ...Platform.select({
      web: { boxShadow: `0 0 8px ${accentBg}` },
      default: {
        shadowColor: accentBg,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 4,
      },
    }),
  },
  dotDone: {
    backgroundColor: accent,
    borderColor: accent,
  },
  dotPulse: {
    backgroundColor: accent,
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  eta: {
    color: wornPaper,
    fontFamily: fontDisplay,
    fontSize: 30,
    marginTop: 4,
  },
  head: {
    backgroundColor: wornInk,
    borderRadius: radiusLg,
    marginBottom: 22,
    padding: 20,
  },
  headLabel: {
    color: wornPaper,
    fontFamily: fontMono,
    fontSize: 10,
    letterSpacing: 1.5,
    opacity: 0.7,
    textTransform: 'uppercase',
  },
  step: {
    flexDirection: 'row',
    gap: 16,
    paddingBottom: 22,
    paddingLeft: STEP_PADDING_LEFT,
    position: 'relative',
  },
  stepBody: {
    flex: 1,
    paddingTop: 1,
  },
  stepDetail: {
    color: textMuted,
    fontFamily: fontMono,
    fontSize: 10,
    marginTop: 2,
  },
  stepLabel: {
    color: text,
    fontFamily: fontSansMedium,
    fontSize: fsBody,
  },
  stepLabelTodo: {
    color: textMuted,
  },
  timeline: {
    maxWidth: 380,
  },
  tracker: {
    maxWidth: 380,
  },
});
