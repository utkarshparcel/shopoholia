/**
 * W030 / U007 — EMI due board (schedule rows + mark paid → ledger note on API).
 * U007 — paste EMI due SMS → create plan.
 */

import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/src/components/ui';
import {
  useCreateEmiFromSms,
  useEmiPlans,
  usePayEmi,
} from '@/src/hooks/closet/useCloset';
import { emiDontMissCardsFromPlans } from '@/src/lib/emiDontMiss';
import { trackEvent } from '@/src/lib/analytics';
import { alertClosetError } from '@/src/lib/closetAlert';
import { formatMinor, nextDueSchedule } from '@worn/shared';
import {
  border,
  closet,
  fontSans,
  fontSansSemiBold,
  fsBody,
  fsCaption,
  radiusMd,
  space3,
  space4,
  text,
  textMuted,
} from '@/src/theme/tokens';

type Props = {
  now?: Date;
  /** W030 — deep-link `?plan=` highlights a specific EMI card. */
  highlightPlanId?: string;
};

export function EmiDontMissCards({ now = new Date(), highlightPlanId }: Props) {
  const plans = useEmiPlans('ACTIVE');
  const pay = usePayEmi();
  const createFromSms = useCreateEmiFromSms();
  const [smsBody, setSmsBody] = useState('');
  const [smsFrom, setSmsFrom] = useState('');

  const cards = useMemo(
    () => emiDontMissCardsFromPlans(plans.data?.plans ?? [], now),
    [plans.data?.plans, now],
  );

  const dueBoard = useMemo(() => {
    const list = (plans.data?.plans ?? []).filter((p) => p.status === 'ACTIVE');
    return list
      .slice()
      .sort((a, b) => a.nextDueOn.localeCompare(b.nextDueOn))
      .map((p) => {
        const schedule = nextDueSchedule({
          remainingMinor: p.remainingMinor,
          installmentMinor: p.installmentMinor,
          nextDueOn: p.nextDueOn,
          maxInstallments: 3,
        });
        return { plan: p, schedule };
      });
  }, [plans.data?.plans]);

  function submitSms() {
    const body = smsBody.trim();
    if (!body) {
      Alert.alert('Paste an EMI SMS', 'Include the due amount and date.');
      return;
    }
    createFromSms.mutate(
      { body, from: smsFrom.trim() || undefined },
      {
        onSuccess: (plan) => {
          setSmsBody('');
          setSmsFrom('');
          trackEvent('emi_from_sms_ui', { planId: plan.id });
          Alert.alert(
            'EMI scheduled',
            `${plan.provider}${plan.merchant ? ` · ${plan.merchant}` : ''} — next due ${plan.nextDueOn}.`,
          );
        },
        onError: (e) =>
          alertClosetError('Could not add EMI', e),
      },
    );
  }

  return (
    <View style={styles.wrap} testID="emi-dont-miss-cards">
      <View style={styles.smsBox} testID="emi-from-sms">
        <Text style={styles.boardTitle}>Add EMI from SMS</Text>
        <Text style={styles.body}>
          Paste a lender SMS (Simpl, LazyPay, bank EMI). WORN tracks dues — it never pays for you.
        </Text>
        <TextInput
          style={styles.input}
          placeholder="SMS from (optional, e.g. SIMPL)"
          placeholderTextColor={textMuted}
          value={smsFrom}
          onChangeText={setSmsFrom}
          accessibilityLabel="EMI SMS sender"
          autoCapitalize="characters"
        />
        <TextInput
          style={[styles.input, styles.smsInput]}
          placeholder="Paste EMI due SMS here…"
          placeholderTextColor={textMuted}
          value={smsBody}
          onChangeText={setSmsBody}
          accessibilityLabel="Paste EMI due SMS"
          multiline
          textAlignVertical="top"
        />
        <Button
          label={createFromSms.isPending ? 'Parsing…' : 'Create schedule'}
          size="sm"
          variant="secondary"
          disabled={createFromSms.isPending}
          onPress={submitSms}
        />
      </View>

      {dueBoard.length > 0 ? (
        <View style={styles.board} testID="emi-due-board">
          <Text style={styles.boardTitle}>EMI due board</Text>
          {dueBoard.map(({ plan, schedule }) => (
            <View
              key={plan.id}
              style={[
                styles.boardRow,
                highlightPlanId === plan.id ? styles.cardHighlight : null,
              ]}
            >
              <Text style={styles.headline}>
                {plan.provider}
                {plan.merchant ? ` · ${plan.merchant}` : ''}
              </Text>
              <Text style={styles.body}>
                Next {formatMinor(plan.installmentMinor, plan.currency)} due{' '}
                {plan.nextDueOn}
              </Text>
              {schedule.slice(0, 3).map((row) => (
                <Text key={`${plan.id}-${row.index}`} style={styles.sched}>
                  #{row.index} · {row.dueOn} ·{' '}
                  {formatMinor(row.amountMinor, plan.currency)}
                </Text>
              ))}
              <Button
                label={pay.isPending ? 'Saving…' : 'Mark paid'}
                size="sm"
                variant="secondary"
                disabled={pay.isPending}
                onPress={() =>
                  pay.mutate(
                    { id: plan.id, amountMinor: plan.installmentMinor },
                    {
                      onSuccess: () => {
                        trackEvent('emi_dont_miss_paid', { planId: plan.id });
                        Alert.alert(
                          'Marked paid',
                          'EMI installment recorded with a ledger note.',
                        );
                      },
                      onError: (e) =>
                        alertClosetError('Could not mark paid', e),
                    },
                  )
                }
              />
            </View>
          ))}
        </View>
      ) : cards.length > 0 ? (
        cards.map((card) => (
          <View
            key={card.planId}
            style={[
              styles.card,
              highlightPlanId && highlightPlanId === card.planId
                ? styles.cardHighlight
                : null,
            ]}
          >
            <Text style={styles.headline}>{card.headline}</Text>
            <Text style={styles.body}>{card.body}</Text>
            <Text style={styles.amount}>
              {card.installmentLabel} · due {card.dueOn}
            </Text>
            <Button
              label={pay.isPending ? 'Saving…' : 'Mark paid'}
              size="sm"
              variant="secondary"
              disabled={pay.isPending}
              onPress={() =>
                pay.mutate(
                  { id: card.planId, amountMinor: card.installmentMinor },
                  {
                    onSuccess: () => {
                      trackEvent('emi_dont_miss_paid', { planId: card.planId });
                      Alert.alert('Marked paid', 'EMI installment recorded.');
                    },
                    onError: (e) =>
                      alertClosetError('Could not mark paid', e),
                  },
                )
              }
            />
          </View>
        ))
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space3, marginBottom: space4 },
  smsBox: {
    borderColor: border,
    borderRadius: radiusMd,
    borderWidth: 1,
    gap: space3,
    padding: space4,
    backgroundColor: closet.accentBg,
  },
  board: { gap: space3 },
  boardTitle: {
    color: text,
    fontFamily: fontSansSemiBold,
    fontSize: fsBody,
  },
  boardRow: {
    borderColor: border,
    borderRadius: radiusMd,
    borderWidth: 1,
    gap: space3,
    padding: space4,
    backgroundColor: closet.accentBg,
  },
  card: {
    borderColor: border,
    borderRadius: radiusMd,
    borderWidth: 1,
    gap: space3,
    padding: space4,
    backgroundColor: closet.accentBg,
  },
  cardHighlight: {
    borderColor: closet.found,
    borderWidth: 2,
  },
  headline: { color: text, fontFamily: fontSansSemiBold, fontSize: fsBody },
  body: { color: textMuted, fontFamily: fontSans, fontSize: fsCaption },
  amount: { color: closet.found, fontFamily: fontSans, fontSize: fsCaption },
  sched: { color: textMuted, fontFamily: fontSans, fontSize: fsCaption },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: border,
    borderRadius: radiusMd,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fontSans,
    fontSize: fsBody,
    color: text,
  },
  smsInput: { minHeight: 72 },
});
