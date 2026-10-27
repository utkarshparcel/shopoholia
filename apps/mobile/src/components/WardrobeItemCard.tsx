import { memo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { WardrobeItem, WasteMetricRow } from '@/src/api/client';
import { Button } from '@/src/components/ui';
import { CachedClosetImage } from '@/src/components/CachedClosetImage';
import { CareLabelBadge } from '@/src/components/CareLabelBadge';
import { cpwGoalCelebrateCopy, cpwGoalNudgeCopy, cpwGoalProgress } from '@/src/lib/cpwGoals';
import { formatMinor } from '@/src/lib/format';
import { formatDayKey } from '@/src/lib/localDay';
import {
  wearChallengeCelebrateCopy,
  wearChallengeNudgeCopy,
  wearChallengeProgress,
} from '@/src/lib/wearChallenge';
import {
  closet,
  fontSans,
  fontSansSemiBold,
  fsBody,
  fsCaption,
  fsTitle,
  radiusMd,
  space3,
  space4,
  space6,
} from '@/src/theme/tokens';

export type WardrobeCardAction =
  | 'tryon'
  | 'wear'
  | 'challenge'
  | 'more'
  | 'capsule'
  | 'cpw'
  | 'laundry'
  | 'care'
  | 'dryClean'
  | 'pickedUp'
  | 'lend'
  | 'returned'
  | 'store'
  | 'dispose';

export function laundryLabel(status: WardrobeItem['laundryStatus'] | undefined) {
  switch (status) {
    case 'DIRTY':
      return 'Dirty';
    case 'IN_LAUNDRY':
      return 'In laundry';
    default:
      return 'Clean';
  }
}

function closetLabel(status: WardrobeItem['closetStatus'] | undefined) {
  return status === 'STORED' ? 'Stored' : 'Active';
}

const METRIC_STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'In rotation',
  DORMANT: 'Resting',
  DEAD: 'Not worn in a while',
};

/** `busy` holds the actions in flight for this item, e.g. "tryon,wear"; '' when idle. */
export function isBusy(busy: string, action: WardrobeCardAction): boolean {
  return busy !== '' && busy.split(',').includes(action);
}

function hasCpwGoal(metric: WasteMetricRow | undefined): boolean {
  return Boolean(metric?.cpwGoal?.active || (metric?.targetCpwMinor != null && metric.targetCpwMinor > 0));
}

type CardProps = {
  item: WardrobeItem;
  metric: WasteMetricRow | undefined;
  preview: string | undefined;
  currency: string;
  started: boolean;
  isDead: boolean;
  busy: string;
  onAction: (action: WardrobeCardAction, item: WardrobeItem) => void;
};

/**
 * One wardrobe row. Memoized on primitive props and a stable `onAction`, so a
 * mutation on one item re-renders that card only. Secondary actions live in
 * WardrobeItemActionsSheet to keep each card to three or four buttons.
 */
export const WardrobeItemCard = memo(function WardrobeItemCard({
  item,
  metric,
  preview,
  currency,
  started,
  isDead,
  busy,
  onAction,
}: CardProps) {
  const isDirty = (item.laundryStatus ?? 'CLEAN') !== 'CLEAN';
  const progress = wearChallengeProgress(metric?.wearCount ?? 0, metric?.status, { started });
  const label = item.brand || item.category;
  const showChallenge =
    started ||
    metric?.status === 'DEAD' ||
    metric?.status === 'DORMANT' ||
    (metric != null && metric.wearCount === 0);
  const goal =
    metric?.cpwGoal ?? cpwGoalProgress(item.costMinor, metric?.wearCount ?? 0, metric?.targetCpwMinor ?? null);
  const details = [
    item.colors?.length ? item.colors.join(', ') : null,
    item.costMinor > 0 ? formatMinor(item.costMinor, currency) : null,
    laundryLabel(item.laundryStatus),
    closetLabel(item.closetStatus),
    item.dryCleanTicket ? `Dry-clean ticket ${item.dryCleanTicket}` : null,
    item.dryCleanPickupOn ? `pickup ${formatDayKey(item.dryCleanPickupOn)}` : null,
    item.lentTo ? `lent to ${item.lentTo}` : null,
    item.lentDueOn ? `due ${formatDayKey(item.lentDueOn)}` : null,
  ].filter(Boolean);

  return (
    <View
      style={[styles.card, isDead ? styles.cardDead : null, isDirty ? styles.cardDirty : null]}
      testID={`wardrobe-card-${item.id}`}
    >
      {preview ? (
        <CachedClosetImage uri={preview} recyclingKey={item.id} style={styles.thumb} accessibilityLabel={label} />
      ) : null}
      <Text style={styles.merchant}>
        {item.category}
        {item.brand ? ` · ${item.brand}` : ''}
      </Text>
      <Text style={styles.muted}>{details.join(' · ')}</Text>
      <CareLabelBadge careRules={item.careRules} />
      {metric ? (
        <Text style={styles.muted}>
          Worn {metric.wearCount}×
          {metric.costPerWearMinor != null ? ` · ${formatMinor(metric.costPerWearMinor, currency)}/wear` : ''}
          {METRIC_STATUS_LABEL[metric.status] ? ` · ${METRIC_STATUS_LABEL[metric.status]}` : ''}
        </Text>
      ) : null}
      {showChallenge && !progress.completed ? (
        <Text style={styles.challenge}>{wearChallengeNudgeCopy(progress, label)}</Text>
      ) : null}
      {progress.completed && started ? (
        <Text style={styles.challenge}>{wearChallengeCelebrateCopy(label)}</Text>
      ) : null}
      {goal.active ? (
        <Text style={styles.challenge}>
          {goal.completed ? cpwGoalCelebrateCopy(label) : cpwGoalNudgeCopy(goal, label)}
        </Text>
      ) : null}
      <View style={styles.row}>
        <Button
          label="Try on"
          size="sm"
          variant="secondary"
          loading={isBusy(busy, 'tryon')}
          disabled={isBusy(busy, 'tryon')}
          onPress={() => onAction('tryon', item)}
        />
        <Button
          label="Wore it"
          size="sm"
          variant="ghost"
          disabled={isBusy(busy, 'wear')}
          onPress={() => onAction('wear', item)}
        />
        {showChallenge && !started && !progress.completed ? (
          <Button
            label="Wear it 3×"
            size="sm"
            variant="secondary"
            disabled={isBusy(busy, 'challenge')}
            onPress={() => onAction('challenge', item)}
          />
        ) : null}
        <Button
          label="More"
          size="sm"
          variant="ghost"
          accessibilityLabel={`More actions for ${label}`}
          onPress={() => onAction('more', item)}
        />
      </View>
    </View>
  );
});

/** The secondary actions for one item, opened from its card's "More" button. */
export function WardrobeItemActionsSheet({
  item,
  metric,
  inCapsule,
  isDead,
  busy,
  onAction,
  onClose,
}: {
  item: WardrobeItem | null;
  metric: WasteMetricRow | undefined;
  inCapsule: boolean;
  isDead: boolean;
  busy: string;
  onAction: (action: WardrobeCardAction, item: WardrobeItem) => void;
  onClose: () => void;
}) {
  if (!item) return null;
  const isDirty = (item.laundryStatus ?? 'CLEAN') !== 'CLEAN';
  const run = (action: WardrobeCardAction) => {
    onClose();
    onAction(action, item);
  };
  const actions: { action: WardrobeCardAction; label: string }[] = [
    { action: 'capsule', label: inCapsule ? 'Remove from capsule' : 'Add to capsule' },
    ...(hasCpwGoal(metric) ? [] : [{ action: 'cpw' as const, label: 'Set a cost-per-wear goal' }]),
    { action: 'laundry', label: isDirty ? 'Mark clean' : 'Mark dirty' },
    { action: 'care', label: item.careRules ? 'Re-scan care tag' : 'Snap care tag' },
    item.dryCleanTicket && item.laundryStatus === 'IN_LAUNDRY'
      ? { action: 'pickedUp' as const, label: 'Picked up from the cleaner' }
      : { action: 'dryClean' as const, label: 'Send to dry clean' },
    item.lentTo
      ? { action: 'returned' as const, label: `Returned by ${item.lentTo}` }
      : { action: 'lend' as const, label: 'Lend to someone' },
    { action: 'store', label: item.closetStatus === 'STORED' ? 'Move back to active' : 'Put in storage' },
    ...(isDead ? [{ action: 'dispose' as const, label: 'Sell it' }] : []),
  ];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {/* A sibling behind the sheet, not a wrapper: on web a role="button" wrapper nests the sheet's buttons. */}
        <Pressable
          accessibilityLabel="Close"
          accessibilityRole="button"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.sheet} testID="wardrobe-actions-sheet">
          <Text style={styles.sheetTitle} accessibilityRole="header">
            {item.brand || item.category}
          </Text>
          <View style={styles.sheetActions}>
            {actions.map((a) => (
              <Button
                key={a.action}
                label={a.label}
                block
                variant={a.action === 'dispose' ? 'primary' : 'secondary'}
                disabled={isBusy(busy, a.action)}
                onPress={() => run(a.action)}
              />
            ))}
            <Button label="Close" block variant="ghost" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(20, 16, 12, 0.45)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: closet.surface,
    borderColor: closet.rule,
    borderRadius: radiusMd,
    borderWidth: 1,
    marginBottom: space4,
    padding: space4,
  },
  cardDead: { borderColor: '#f0a0a0', backgroundColor: '#fff6f6' },
  cardDirty: { borderColor: '#c4a574', backgroundColor: '#faf6f0' },
  challenge: {
    color: closet.ink,
    fontFamily: fontSans,
    fontSize: fsCaption,
    fontWeight: '600',
    marginTop: 6,
  },
  merchant: { color: closet.ink, fontFamily: fontSans, fontSize: fsBody, fontWeight: '600' },
  muted: { color: closet.muted, fontFamily: fontSans, fontSize: fsCaption, marginTop: 2 },
  row: { flexDirection: 'row', gap: space4, marginTop: space4, flexWrap: 'wrap' },
  sheet: {
    backgroundColor: closet.bg,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: space6,
    paddingHorizontal: space4,
    paddingTop: space6,
    width: '100%',
  },
  sheetActions: { gap: space3, marginTop: space4 },
  sheetTitle: { color: closet.ink, fontFamily: fontSansSemiBold, fontSize: fsTitle },
  thumb: {
    width: '100%',
    height: 180,
    borderRadius: radiusMd,
    marginBottom: space4,
    backgroundColor: closet.mist,
  },
});
