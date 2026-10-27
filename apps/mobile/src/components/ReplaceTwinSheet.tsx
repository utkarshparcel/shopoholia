/**
 * W086 — Replace worn-out twin sheet from waste (affiliate → cashback_events).
 * Closet-framed only — no Play blend.
 */

import { useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Button } from '@/src/components/ui';
import { useReplaceTwinClick, useReplaceTwins } from '@/src/hooks/closet/useCloset';
import { replaceTwinSheetRows } from '@/src/lib/bridgeWow';
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
  space6,
  text,
  textMuted,
} from '@/src/theme/tokens';

type Props = {
  wardrobeItemId: string;
  label?: string | null;
};

export function ReplaceTwinSheet({ wardrobeItemId, label }: Props) {
  const [open, setOpen] = useState(false);
  const twins = useReplaceTwins(open ? wardrobeItemId : null);
  const click = useReplaceTwinClick();
  const rows = replaceTwinSheetRows(twins.data?.candidates ?? [], 8);

  async function shop(row: (typeof rows)[number]) {
    if (!row.affiliateUrl || !row.shoppable) return;
    try {
      await click.mutateAsync({
        itemId: wardrobeItemId,
        listingId: row.listingId,
        platform: row.platform,
      });
      trackEvent('waste_replace_twin_click', {
        listingId: row.listingId,
        platform: row.platform,
      });
      await Linking.openURL(row.affiliateUrl);
    } catch (e) {
      Alert.alert('Could not open twin', (e as Error).message);
    }
  }

  return (
    <View testID={`replace-twin-entry-${wardrobeItemId}`}>
      <Button
        label="Find a twin"
        size="sm"
        variant="secondary"
        onPress={() => setOpen(true)}
      />

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()} testID="replace-twin-sheet">
            <Text style={styles.title}>Replace with a twin</Text>
            <Text style={styles.muted}>
              {label ? `${label} · ` : ''}
              Affiliate picks only — tap records cashback; Closet stays separate from Play.
            </Text>
            {twins.isLoading ? <Text style={styles.muted}>Loading twins…</Text> : null}
            {!twins.isLoading && rows.length === 0 ? (
              <Text style={styles.muted}>No close twins yet.</Text>
            ) : null}
            {rows.map((row) => (
              <View key={row.listingId} style={styles.row}>
                <Text style={styles.body}>
                  {row.title} · score {row.score}
                </Text>
                <Button
                  label={row.ctaLabel}
                  size="sm"
                  variant="secondary"
                  disabled={!row.shoppable || click.isPending}
                  onPress={() => void shop(row)}
                />
              </View>
            ))}
            <Button label="Close" size="sm" variant="ghost" onPress={() => setOpen(false)} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(20, 16, 12, 0.45)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: closet.accentBg,
    borderTopLeftRadius: radiusMd,
    borderTopRightRadius: radiusMd,
    gap: space3,
    maxHeight: '80%',
    padding: space4,
    paddingBottom: space6,
  },
  title: {
    color: text,
    fontFamily: fontSans,
    fontSize: fsBody,
    fontWeight: '700',
  },
  muted: { color: textMuted, fontFamily: fontSans, fontSize: fsCaption, lineHeight: 18 },
  body: { color: text, fontFamily: fontSans, fontSize: fsCaption, flex: 1 },
  row: {
    borderColor: border,
    borderRadius: radiusMd,
    borderWidth: 1,
    gap: space3,
    padding: space3,
  },
});
