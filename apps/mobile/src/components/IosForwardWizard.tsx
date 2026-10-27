import { useMemo, useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/src/components/ui';
import {
  buildIosForwardAddress,
  getIosForwardWizardSteps,
  nextIosForwardStep,
  previousIosForwardStep,
  type IosForwardWizardStepId,
} from '@/src/lib/iosForwardWizard';
import { getSmsForwardingAddress } from '@/src/lib/sms';
import {
  border,
  fontMono,
  fontSans,
  fsBody,
  fsCaption,
  fsMicro,
  radiusCard,
  space3,
  space4,
  surface,
  text,
  textMuted,
} from '@/src/theme/tokens';

export type IosForwardWizardProps = {
  /** Optional seed (email/phone/user id) for plus-addressing. */
  userKey?: string | null;
  onComplete?: () => void;
};

/**
 * W011 — iOS-only stepper: create forward address → Mail rule → test ping.
 * Never markets READ_SMS.
 */
export function IosForwardWizard({ userKey, onComplete }: IosForwardWizardProps) {
  const address = useMemo(
    () =>
      buildIosForwardAddress({
        baseAddress: getSmsForwardingAddress(),
        userKey,
      }),
    [userKey],
  );
  const steps = useMemo(() => getIosForwardWizardSteps(address), [address]);
  const [stepId, setStepId] = useState<IosForwardWizardStepId>(1);
  const [hint, setHint] = useState<string | null>(null);

  const step = steps.find((s) => s.step === stepId) ?? steps[0]!;
  const prev = previousIosForwardStep(stepId);
  const next = nextIosForwardStep(stepId);

  async function shareAddress() {
    try {
      await Share.share({
        message: address,
        title: 'Worn SMS forwarding address',
      });
      setHint('Forwarding address ready to share or paste.');
    } catch {
      setHint(address);
    }
  }

  function onPrimary() {
    if (stepId === 1) {
      void shareAddress();
      if (next) setStepId(next);
      return;
    }
    if (stepId === 2 && next) {
      setStepId(next);
      return;
    }
    if (stepId === 3) {
      setHint('Thanks — keep forwarding order texts, or connect email below.');
      onComplete?.();
    }
  }

  return (
    <View style={styles.note} accessibilityRole="summary" testID="ios-forward-wizard">
      <Text style={styles.noteTitle}>On iPhone · Forward texts</Text>
      <Text style={styles.stepLabel}>
        Step {step.step} of {steps.length}
      </Text>
      <Text style={styles.stepTitle}>{step.title}</Text>
      <Text style={styles.noteBody}>{step.body}</Text>
      {stepId === 1 ? (
        <Text style={styles.address} selectable>
          {address}
        </Text>
      ) : null}
      <View style={styles.copyRow}>
        <Button label={step.cta} size="sm" variant="secondary" onPress={onPrimary} />
      </View>
      {prev ? (
        <View style={styles.copyRow}>
          <Button
            label="Back"
            size="sm"
            variant="ghost"
            onPress={() => setStepId(prev)}
          />
        </View>
      ) : null}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  address: {
    color: text,
    fontFamily: fontMono,
    fontSize: fsCaption,
    marginTop: space3,
  },
  copyRow: {
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
  stepLabel: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
    marginTop: space3,
  },
  stepTitle: {
    color: text,
    fontFamily: fontSans,
    fontSize: fsBody,
    fontWeight: '700',
    marginTop: space3,
  },
});
