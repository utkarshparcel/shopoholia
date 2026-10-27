/**
 * W066 — accessories / jewelry slot on today’s outfit.
 * Attach or swap; wear_log expands via outfit.itemIds for metrics.
 */

import { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/src/components/ui';
import {
  usePatchWeekOutfit,
  useWardrobe,
} from '@/src/hooks/closet/useCloset';
import {
  isAccessoryCategory,
  partitionOutfitItems,
  withAccessoryOnOutfit,
} from '@/src/lib/accessories';
import { trackEvent } from '@/src/lib/analytics';
import {
  border,
  closet,
  fontSans,
  fsBody,
  fsCaption,
  radiusMd,
  space3,
  space4,
  text,
  textMuted,
  surface,
} from '@/src/theme/tokens';

type OutfitItem = {
  id: string;
  category: string;
  brand?: string | null;
};

type Props = {
  itemIds: string[];
  items: OutfitItem[];
  plannedFor: string;
  disabled?: boolean;
  onUpdated?: () => void;
};

export function AccessorySlotToday({
  itemIds,
  items,
  plannedFor,
  disabled,
  onUpdated,
}: Props) {
  const wardrobe = useWardrobe();
  const patch = usePatchWeekOutfit();
  const [pickerOpen, setPickerOpen] = useState(false);

  const { accessories } = useMemo(() => partitionOutfitItems(items), [items]);
  const current = accessories[0] ?? null;

  const candidates = useMemo(() => {
    const all = wardrobe.data?.items ?? [];
    const onOutfit = new Set(itemIds);
    return all.filter(
      (it) => isAccessoryCategory(it.category) && !onOutfit.has(it.id),
    );
  }, [wardrobe.data?.items, itemIds]);

  function applyAccessory(nextId: string) {
    const nextIds = withAccessoryOnOutfit(itemIds, items, nextId);
    patch.mutate(
      { date: plannedFor, itemIds: nextIds },
      {
        onSuccess: () => {
          trackEvent('outfit_accessory_swapped', {
            mode: current ? 'swap' : 'attach',
            accessoryId: nextId,
          });
          setPickerOpen(false);
          onUpdated?.();
        },
        onError: (e) =>
          Alert.alert('Could not update accessory', (e as Error).message),
      },
    );
  }

  return (
    <View style={styles.wrap} testID="accessory-slot-today">
      <Text style={styles.label}>Accessories</Text>
      {current ? (
        <Text style={styles.body}>
          {current.brand ? `${current.brand} · ` : ''}
          {current.category}
        </Text>
      ) : (
        <Text style={styles.muted}>No jewelry / accessory on this look yet.</Text>
      )}
      <View style={styles.row}>
        <Button
          label={current ? 'Swap accessory' : 'Attach accessory'}
          size="sm"
          variant="secondary"
          disabled={disabled || patch.isPending || candidates.length === 0}
          onPress={() => setPickerOpen(true)}
        />
        {candidates.length === 0 ? (
          <Text style={styles.hint}>Add jewelry in Wardrobe first</Text>
        ) : null}
      </View>

      <Modal
        visible={pickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setPickerOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>
              {current ? 'Swap accessory' : 'Attach accessory'}
            </Text>
            <Text style={styles.muted}>
              Wear logs count accessories on this outfit toward metrics.
            </Text>
            {candidates.slice(0, 12).map((c) => (
              <Pressable
                key={c.id}
                style={styles.option}
                onPress={() => applyAccessory(c.id)}
                accessibilityRole="button"
              >
                <Text style={styles.body}>
                  {c.brand ? `${c.brand} · ` : ''}
                  {c.category}
                </Text>
              </Pressable>
            ))}
            <Button
              label="Cancel"
              size="sm"
              variant="ghost"
              onPress={() => setPickerOpen(false)}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderColor: border,
    borderRadius: radiusMd,
    borderWidth: 1,
    gap: space3,
    marginTop: space4,
    padding: space4,
    backgroundColor: closet.accentBg,
  },
  label: {
    color: text,
    fontFamily: fontSans,
    fontSize: fsCaption,
    fontWeight: '700',
  },
  body: { color: text, fontFamily: fontSans, fontSize: fsBody },
  muted: { color: textMuted, fontFamily: fontSans, fontSize: fsCaption },
  hint: { color: textMuted, fontFamily: fontSans, fontSize: fsCaption, flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space3, flexWrap: 'wrap' },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(20, 16, 12, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: surface,
    borderTopLeftRadius: radiusMd,
    borderTopRightRadius: radiusMd,
    gap: space3,
    padding: space4,
    paddingBottom: space4 * 2,
  },
  sheetTitle: {
    color: text,
    fontFamily: fontSans,
    fontSize: fsBody,
    fontWeight: '700',
  },
  option: {
    borderColor: border,
    borderRadius: radiusMd,
    borderWidth: 1,
    padding: space3,
  },
});
