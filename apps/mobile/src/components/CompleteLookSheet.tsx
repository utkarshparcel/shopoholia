/**
 * W058 — Complete-look affiliate sheet (Closet-framed).
 */

import { useMemo } from 'react';
import { Alert, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  buildCompleteLookSheet,
  platformFromAffiliateUrl,
} from '@worn/shared';

import { recordClosetAffiliateClick } from '@/src/api/client';
import { Button } from '@/src/components/ui';
import { useCompleteLook } from '@/src/hooks/closet/useCloset';
import { useSessionStore } from '@/src/stores/session';
import {
  closet,
  fontSans,
  fontSansSemiBold,
  fsCaption,
  fsTitle,
  radiusMd,
  space3,
  space4,
  space6,
  text,
  textMuted,
  wornInk,
} from '@/src/theme/tokens';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Optional outfit item ids to seed the look. */
  itemIds?: string[];
};

export function CompleteLookSheet({ visible, onClose, itemIds }: Props) {
  const accessToken = useSessionStore((s) => s.accessToken);
  const look = useCompleteLook(itemIds);
  const model = useMemo(() => {
    if (!look.data) return null;
    return buildCompleteLookSheet({
      owned: look.data.owned.map((o) => ({
        slot: o.slot,
        item: {
          id: o.item.id,
          category: o.item.category,
          brand: (o.item as { brand?: string | null }).brand ?? null,
        },
      })),
      missing: look.data.missing.map((m) => ({
        slot: m.slot,
        listingId: m.listingId,
        title: m.title,
        affiliateUrl: m.affiliateUrl,
        platform: m.platform,
      })),
      summary: look.data.summary,
    });
  }, [look.data]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button">
        <Pressable
          style={styles.sheet}
          onPress={(e) => e.stopPropagation()}
          testID="complete-look-sheet"
        >
          <Text style={styles.title}>{model?.title ?? 'Complete your look'}</Text>
          <Text style={styles.lead}>
            {model?.subtitle ??
              'Pieces you own, plus Closet fills for gaps — cashback tracked on tap.'}
          </Text>

          {look.isLoading ? <Text style={styles.muted}>Loading your closet slots…</Text> : null}

          {model?.ownedLabels.length ? (
            <View style={styles.block}>
              <Text style={styles.blockLabel}>Owned</Text>
              {model.ownedLabels.map((label) => (
                <Text key={label} style={styles.muted}>
                  · {label}
                </Text>
              ))}
            </View>
          ) : null}

          {model?.fills.length ? (
            <View style={styles.block}>
              <Text style={styles.blockLabel}>Closet fills</Text>
              {model.fills.map((f) => (
                <View key={`${f.slot}-${f.listingId}`} style={styles.fillRow}>
                  <Text style={styles.fillTitle}>
                    {f.slot}: {f.title}
                  </Text>
                  <Button
                    label={f.ctaLabel}
                    size="sm"
                    variant="secondary"
                    onPress={() => {
                      const platform =
                        f.platform || platformFromAffiliateUrl(f.affiliateUrl);
                      if (accessToken) {
                        void recordClosetAffiliateClick(accessToken, {
                          source: 'complete_look',
                          platform,
                          listingId: f.listingId,
                          url: f.affiliateUrl,
                        });
                      }
                      Linking.openURL(f.affiliateUrl).catch(() =>
                        Alert.alert('Could not open', f.affiliateUrl),
                      );
                    }}
                  />
                </View>
              ))}
            </View>
          ) : model?.emptyFillsHint ? (
            <Text style={styles.muted}>{model.emptyFillsHint}</Text>
          ) : null}

          <View style={styles.actions}>
            <Button label="Done" block onPress={onClose} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  actions: { gap: space3, marginTop: space6 },
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(20, 16, 12, 0.45)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  block: {
    backgroundColor: closet.accentBg,
    borderColor: closet.accentSoft,
    borderRadius: radiusMd,
    borderWidth: 1,
    gap: 4,
    marginTop: space3,
    padding: space4,
  },
  blockLabel: {
    color: wornInk,
    fontFamily: fontSansSemiBold,
    fontSize: fsCaption,
    marginBottom: 4,
  },
  fillRow: { gap: 6, marginTop: 8 },
  fillTitle: { color: text, fontFamily: fontSans, fontSize: fsCaption },
  lead: {
    color: textMuted,
    fontFamily: fontSans,
    fontSize: fsCaption,
    lineHeight: 18,
    marginBottom: space4,
    marginTop: space3,
  },
  muted: { color: textMuted, fontFamily: fontSans, fontSize: fsCaption },
  sheet: {
    backgroundColor: closet.bg,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '85%',
    paddingBottom: space6,
    paddingHorizontal: space4,
    paddingTop: space6,
    width: '100%',
  },
  title: { color: wornInk, fontFamily: fontSansSemiBold, fontSize: fsTitle },
});
