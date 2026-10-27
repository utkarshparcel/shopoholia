/**
 * W068 — missing-piece shopping sheet with affiliate CTAs + cashback click.
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

import { recordClosetAffiliateClick } from '@/src/api/client';
import { Button } from '@/src/components/ui';
import { useMissingPieces } from '@/src/hooks/closet/useCloset';
import { trackEvent } from '@/src/lib/analytics';
import { missingPieceShopRows } from '@/src/lib/missingPieceShop';
import { useSessionStore } from '@/src/stores/session';
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

export function MissingPieceShopSheet() {
  const missing = useMissingPieces(8);
  const accessToken = useSessionStore((s) => s.accessToken);
  const [open, setOpen] = useState(false);
  const gaps = missing.data?.gaps ?? [];
  const rows = missingPieceShopRows(gaps, 8);

  if (!gaps.length) return null;

  async function shop(row: (typeof rows)[number]) {
    if (accessToken) {
      void recordClosetAffiliateClick(accessToken, {
        source: 'missing_piece',
        platform: row.platform,
        url: row.affiliateUrl,
      });
    }
    trackEvent('missing_piece_shop_click', {
      slot: row.missingSlot,
      platform: row.platform,
    });
    trackEvent('wardrobe_missing_pieces', { slot: row.missingSlot });
    try {
      await Linking.openURL(row.affiliateUrl);
    } catch {
      Alert.alert('Could not open', row.affiliateUrl);
    }
  }

  return (
    <View style={styles.banner} testID="missing-piece-shop-entry">
      <Text style={styles.bannerLabel}>Missing pieces</Text>
      <Text style={styles.muted}>{missing.data?.summary ?? 'Fill closet gaps'}</Text>
      <Button
        label="Open shop sheet"
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
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.title}>Shop missing pieces</Text>
            <Text style={styles.muted}>
              Affiliate CTAs record cashback clicks — Closet only, no Play blend.
            </Text>
            {rows.map((row) => (
              <View key={`${row.missingSlot}-${row.suggestion}`} style={styles.row}>
                <Text style={styles.body}>{row.message}</Text>
                <Button
                  label={row.ctaLabel}
                  size="sm"
                  variant="secondary"
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
  banner: {
    backgroundColor: closet.accentBg,
    borderColor: border,
    borderRadius: radiusMd,
    borderWidth: 1,
    gap: space3,
    marginBottom: space4,
    padding: space4,
  },
  bannerLabel: {
    color: text,
    fontFamily: fontSans,
    fontSize: fsCaption,
    fontWeight: '700',
  },
  muted: { color: textMuted, fontFamily: fontSans, fontSize: fsCaption },
  body: { color: text, fontFamily: fontSans, fontSize: fsCaption, flex: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(20, 16, 12, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#f7f3ec',
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
  row: {
    borderColor: border,
    borderRadius: radiusMd,
    borderWidth: 1,
    gap: space3,
    padding: space3,
  },
});
