import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CachedClosetImage } from '@/src/components/CachedClosetImage';
import { Button } from '@/src/components/ui';
import { useGoesWith } from '@/src/hooks/closet/useCloset';
import type { WardrobeItem } from '@/src/api/client';
import {
  closet,
  fontSans,
  fontSansSemiBold,
  fsBody,
  fsCaption,
  radiusMd,
  space3,
  space4,
  space6,
} from '@/src/theme/tokens';

type Props = {
  visible: boolean;
  anchor: Pick<WardrobeItem, 'id' | 'category' | 'brand'> | null;
  onClose: () => void;
  onTryOnToday: (match: WardrobeItem & { score: number; slot: string; reasons: string[] }) => void;
};

/**
 * W048 — “What goes with” bottom sheet from Today item tap.
 * Ranked owned matches; tap tries the piece on today’s look (Closet only).
 */
export function GoesWithSheet({ visible, anchor, onClose, onTryOnToday }: Props) {
  const goes = useGoesWith(visible && anchor ? anchor.id : null);
  const matches = goes.data?.matches ?? [];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable
          accessibilityLabel="Close"
          accessibilityRole="button"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.sheet}>
          <Text style={styles.title}>What goes with</Text>
          <Text style={styles.lead}>
            {anchor
              ? `${anchor.category}${anchor.brand ? ` · ${anchor.brand}` : ''} — ranked from your closet`
              : 'Pick a piece on today’s look'}
          </Text>

          {goes.isLoading ? (
            <Text style={styles.muted}>Finding matches…</Text>
          ) : matches.length === 0 ? (
            <Text style={styles.muted}>No strong matches yet — add more clean pieces.</Text>
          ) : (
            <ScrollView style={styles.list} contentContainerStyle={{ gap: space3 }}>
              {matches.map((m) => (
                <Pressable
                  key={m.id}
                  style={styles.row}
                  onPress={() => onTryOnToday(m)}
                  accessibilityRole="button"
                  accessibilityLabel={`Try ${m.category} on today`}
                >
                  {(m.garmentImageUrl ?? m.imageUrls?.[0]) ? (
                    <CachedClosetImage
                      uri={(m.garmentImageUrl ?? m.imageUrls?.[0]) as string}
                      recyclingKey={m.id}
                      style={styles.thumb}
                    />
                  ) : (
                    <View style={[styles.thumb, styles.thumbEmpty]} />
                  )}
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle}>
                      {m.category}
                      {m.brand ? ` · ${m.brand}` : ''}
                    </Text>
                    <Text style={styles.muted}>
                      {m.slot.charAt(0).toUpperCase() + m.slot.slice(1)}
                      {m.reasons?.[0] ? ` · ${m.reasons[0]}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.cta}>Try today</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          <Button label="Close" block variant="ghost" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(20, 16, 12, 0.45)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  cta: {
    color: closet.accent,
    fontFamily: fontSansSemiBold,
    fontSize: fsCaption,
  },
  lead: {
    color: closet.muted,
    fontFamily: fontSans,
    fontSize: fsCaption,
    lineHeight: 18,
    marginBottom: space4,
    marginTop: space3,
  },
  list: { maxHeight: 320, marginBottom: space4 },
  muted: { color: closet.muted, fontFamily: fontSans, fontSize: fsCaption },
  row: {
    alignItems: 'center',
    borderColor: closet.rule,
    borderRadius: radiusMd,
    borderWidth: 1,
    flexDirection: 'row',
    gap: space3,
    padding: space3,
  },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: {
    color: closet.ink,
    fontFamily: fontSansSemiBold,
    fontSize: fsCaption,
  },
  sheet: {
    backgroundColor: closet.bg,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: space6,
    paddingHorizontal: space4,
    paddingTop: space6,
    width: '100%',
  },
  thumb: {
    backgroundColor: closet.mist,
    borderRadius: radiusMd,
    height: 56,
    width: 44,
  },
  thumbEmpty: { borderColor: closet.rule, borderWidth: 1 },
  title: {
    color: closet.ink,
    fontFamily: fontSansSemiBold,
    fontSize: fsBody,
  },
});
