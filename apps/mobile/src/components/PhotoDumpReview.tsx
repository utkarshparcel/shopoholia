/**
 * W070 — photo-dump batch review UI (confirm/reject tags + progress).
 */

import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { Button } from '@/src/components/ui';
import { CachedClosetImage } from '@/src/components/CachedClosetImage';
import {
  useDeleteWardrobeItem,
  usePhotoDump,
  useUpdateWardrobeItem,
  useWardrobe,
} from '@/src/hooks/closet/useCloset';
import { trackEvent } from '@/src/lib/analytics';
import {
  confirmPhotoDumpTags,
  isPhotoDumpPending,
  photoDumpReviewProgress,
} from '@/src/lib/photoDumpReview';
import { closetAlertText } from '@/src/lib/closetScreenState';
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

export function PhotoDumpReview() {
  const wardrobe = useWardrobe();
  const dump = usePhotoDump();
  const update = useUpdateWardrobeItem();
  const del = useDeleteWardrobeItem();
  const [busyId, setBusyId] = useState<string | null>(null);

  const items = wardrobe.data?.items ?? [];
  const pending = useMemo(() => items.filter(isPhotoDumpPending), [items]);
  const progress = useMemo(() => photoDumpReviewProgress(items), [items]);

  async function startDump() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: 50,
    });
    if (result.canceled || !result.assets?.length) return;
    const uris = result.assets.map((a) => a.uri).filter(Boolean);
    dump.mutate(
      { imageUris: uris },
      {
        onSuccess: (res) => {
          Alert.alert(
            'Photo dump tagged',
            `${res.created} items ready to confirm or reject.`,
          );
          void wardrobe.refetch();
        },
        onError: (e) => Alert.alert('Photo dump failed', closetAlertText(e)),
      },
    );
  }

  function confirm(id: string, tags: string[] | undefined) {
    setBusyId(id);
    update.mutate(
      { id, patch: { tags: confirmPhotoDumpTags(tags) } },
      {
        onSuccess: () => {
          trackEvent('photo_dump_tag_confirmed', { itemId: id });
          setBusyId(null);
        },
        onError: (e) => {
          setBusyId(null);
          Alert.alert('Could not confirm', closetAlertText(e));
        },
      },
    );
  }

  function reject(id: string) {
    setBusyId(id);
    del.mutate(id, {
      onSuccess: () => {
        trackEvent('photo_dump_tag_rejected', { itemId: id });
        setBusyId(null);
      },
      onError: (e) => {
        setBusyId(null);
        Alert.alert('Could not reject', closetAlertText(e));
      },
    });
  }

  return (
    <View style={styles.wrap} testID="photo-dump-review">
      <Text style={styles.title}>Photo dump review</Text>
      <Text style={styles.muted}>{progress.label}</Text>
      {progress.total > 0 ? (
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${Math.round(progress.ratio * 100)}%` }]} />
        </View>
      ) : null}
      <Button
        label={dump.isPending ? 'Dumping…' : 'Dump photos (batch)'}
        size="sm"
        variant="secondary"
        disabled={dump.isPending}
        onPress={() => void startDump()}
      />
      {pending.slice(0, 8).map((item) => {
        const img = item.garmentImageUrl ?? item.imageUrls?.[0] ?? null;
        return (
          <View key={item.id} style={styles.card}>
            {img ? <CachedClosetImage uri={img} style={styles.thumb} /> : null}
            <Text style={styles.body}>
              {item.brand ? `${item.brand} · ` : ''}
              {item.category}
            </Text>
            <View style={styles.row}>
              <Button
                label="Confirm tags"
                size="sm"
                variant="secondary"
                disabled={busyId === item.id}
                onPress={() => confirm(item.id, item.tags)}
              />
              <Button
                label="Reject"
                size="sm"
                variant="ghost"
                disabled={busyId === item.id}
                onPress={() => reject(item.id)}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: closet.accentBg,
    borderColor: border,
    borderRadius: radiusMd,
    borderWidth: 1,
    gap: space3,
    marginBottom: space4,
    padding: space4,
  },
  title: {
    color: text,
    fontFamily: fontSansSemiBold,
    fontSize: fsBody,
  },
  muted: { color: textMuted, fontFamily: fontSans, fontSize: fsCaption },
  body: { color: text, fontFamily: fontSans, fontSize: fsCaption },
  barTrack: {
    backgroundColor: border,
    borderRadius: 4,
    height: 6,
    overflow: 'hidden',
  },
  barFill: {
    backgroundColor: closet.found,
    height: 6,
  },
  card: {
    borderColor: border,
    borderRadius: radiusMd,
    borderWidth: 1,
    gap: space3,
    padding: space3,
  },
  thumb: { borderRadius: radiusMd, height: 72, width: 72 },
  row: { flexDirection: 'row', gap: space3, flexWrap: 'wrap' },
});
