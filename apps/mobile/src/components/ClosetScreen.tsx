import { useCallback, useEffect, useState, type ReactElement, type ReactNode, type Ref } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useNetworkStatus } from '@/src/hooks/closet/useNetworkStatus';
import {
  closetErrorText,
  resolveClosetContentMode,
} from '@/src/lib/closetScreenState';
import {
  offlineBannerCopy,
  type OfflineBannerCopy,
} from '@/src/lib/offlineBanner';
import { readVaultAddQueue } from '@/src/lib/vaultAddQueue';
import {
  closet,
  fontDisplay,
  fontSans,
  fsBody,
  fsCaption,
  fsDisplayM,
  space6,
  space4,
  space3,
  trackingTight,
} from '@/src/theme/tokens';

export type ClosetScreenState = {
  /** Loading — shows skeleton when no content yet. */
  loading?: boolean;
  loadingLabel?: string;
  /** True when cached/meaningful content exists (keeps body visible during refetch). */
  hasContent?: boolean;
  /** Empty state when there is nothing to show. */
  empty?: boolean;
  emptyTitle?: string;
  emptyMessage?: string;
  /** Optional CTA under the empty message (e.g. connect email). */
  emptyAction?: ReactNode;
  /** Error state. */
  error?: boolean | string | null;
  errorMessage?: string;
  onRetry?: () => void;
  /** Pull-to-refresh handler. When set, content is wrapped in a ScrollView. */
  onRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
  /** Force offline banner (tests). Otherwise uses NetInfo / navigator. */
  forceOffline?: boolean;
  /** W097 — queued offline actions (vault adds). Overrides AsyncStorage peek when set. */
  offlineQueuedCount?: number;
  /** W097 — retry / flush CTA while offline (or after reconnect). */
  onOfflineRetry?: () => void | Promise<void>;
  /** Skeleton row count while loading. */
  skeletonRows?: number;
};

/** One section of the screen's main list, drawn below the screen's other content. */
export type ClosetListSection<T> = {
  key: string;
  header?: ReactElement | null;
  data: readonly T[];
  /** Shown in place of the rows when `data` is empty. */
  empty?: ReactElement | null;
};

/**
 * The screen's main list. The whole screen then scrolls as one virtualized SectionList with the
 * header, states and children above the rows, so long lists are never nested in a ScrollView.
 */
export type ClosetScreenList<T> = {
  sections: readonly ClosetListSection<T>[];
  keyExtractor: (item: T) => string;
  renderItem: (item: T) => ReactElement | null;
  /** Called as the rows near their end, e.g. to load the next page. */
  onEndReached?: () => void;
};

function ClosetSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <View
      style={styles.skeletonWrap}
      accessibilityLabel="Loading"
      accessibilityRole="progressbar"
      testID="closet-skeleton"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={styles.skeletonRow}>
          <View style={[styles.skeletonBlock, styles.skeletonTitle]} />
          <View style={[styles.skeletonBlock, styles.skeletonLine]} />
          <View style={[styles.skeletonBlock, styles.skeletonLineShort]} />
        </View>
      ))}
    </View>
  );
}

function RetryLink({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityLabel="Tap to retry" onPress={onPress}>
      <Text style={styles.retry}>Tap to retry</Text>
    </Pressable>
  );
}

export function ClosetScreen<T = never>({
  title,
  subtitle,
  children,
  loading = false,
  loadingLabel = 'Loading…',
  hasContent = false,
  empty = false,
  emptyTitle = 'Nothing here yet',
  emptyMessage,
  emptyAction,
  error,
  errorMessage,
  onRetry,
  onRefresh,
  refreshing: refreshingProp,
  forceOffline,
  offlineQueuedCount: offlineQueuedCountProp,
  onOfflineRetry,
  skeletonRows = 3,
  list,
  scrollRef,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
  list?: ClosetScreenList<T>;
  /** The screen's ScrollView, for screens that scroll to a section (not used with `list`). */
  scrollRef?: Ref<ScrollView>;
} & ClosetScreenState) {
  const insets = useSafeAreaInsets();
  const { isOffline: netOffline } = useNetworkStatus();
  const isOffline = forceOffline ?? netOffline;
  const [localRefreshing, setLocalRefreshing] = useState(false);
  const [peekQueued, setPeekQueued] = useState(0);
  const refreshing = refreshingProp ?? localRefreshing;
  const queuedCount = offlineQueuedCountProp ?? peekQueued;

  const errorText = closetErrorText(error, errorMessage);
  const mode = resolveClosetContentMode({
    isLoading: Boolean(loading),
    isError: Boolean(errorText),
    isEmpty: Boolean(empty),
    hasContent,
  });

  const showSkeleton = mode === 'skeleton';
  const showError = mode === 'error';
  const showEmpty = mode === 'empty';
  const showBody = mode === 'content' && Boolean(children);

  useEffect(() => {
    if (!isOffline || offlineQueuedCountProp != null) return;
    let alive = true;
    void readVaultAddQueue().then((snap) => {
      if (alive) setPeekQueued(snap.items.length);
    });
    return () => {
      alive = false;
    };
  }, [isOffline, offlineQueuedCountProp]);

  const handleRefresh = useCallback(async () => {
    if (!onRefresh) return;
    setLocalRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setLocalRefreshing(false);
    }
  }, [onRefresh]);

  const handleOfflineRetry = useCallback(() => {
    if (onOfflineRetry) {
      void onOfflineRetry();
      return;
    }
    if (onRefresh) void handleRefresh();
    if (onRetry) onRetry();
  }, [onOfflineRetry, onRefresh, onRetry, handleRefresh]);

  const offlineCopy: OfflineBannerCopy = offlineBannerCopy(queuedCount);
  const canOfflineRetry = Boolean(onOfflineRetry || onRefresh || onRetry);

  const header = (
    <>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {isOffline ? (
        <View
          style={styles.offlineBanner}
          accessibilityRole="alert"
          accessibilityLabel={offlineCopy.a11yLabel}
          testID="closet-offline-banner"
        >
          <Text style={styles.offlineText}>{offlineCopy.message}</Text>
          {offlineCopy.queuedLine ? (
            <Text style={styles.offlineQueued} testID="closet-offline-queued">
              {offlineCopy.queuedLine}
            </Text>
          ) : null}
          {canOfflineRetry ? (
            <Pressable
              accessibilityLabel="Retry"
              accessibilityRole="button"
              onPress={handleOfflineRetry}
              testID="closet-offline-retry"
            >
              <Text style={styles.retry}>{offlineCopy.retryLabel}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </>
  );

  const body = (
    <>
      {showSkeleton ? (
        <View style={styles.stateBox}>
          <Text style={styles.stateLabel}>{loadingLabel}</Text>
          <ClosetSkeleton rows={skeletonRows} />
        </View>
      ) : null}

      {showError ? (
        <View style={styles.stateBox}>
          <Text style={styles.errorTitle}>Couldn’t load</Text>
          <Text style={styles.stateLabel}>{errorText}</Text>
          {onRetry ? <RetryLink onPress={onRetry} /> : null}
        </View>
      ) : null}

      {showEmpty ? (
        <View style={styles.stateBox}>
          <Text style={styles.emptyTitle}>{emptyTitle}</Text>
          {emptyMessage ? <Text style={styles.stateLabel}>{emptyMessage}</Text> : null}
          {emptyAction ? <View style={styles.emptyAction}>{emptyAction}</View> : null}
        </View>
      ) : null}

      {showBody ? <View style={styles.body}>{children}</View> : null}

      {!showSkeleton && !showError && errorText && hasContent ? (
        <View style={styles.softError}>
          <Text style={styles.stateLabel}>{errorText}</Text>
          {onRetry ? <RetryLink onPress={onRetry} /> : null}
        </View>
      ) : null}
    </>
  );

  // One scroller per screen, always: a plain View clipped everything below the fold.
  const refreshControl = onRefresh ? (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={() => void handleRefresh()}
      tintColor={closet.accent}
      colors={[closet.accent]}
    />
  ) : undefined;
  const scrollStyle = [styles.scroll, { paddingTop: insets.top + space6 }];
  const contentStyle = { paddingBottom: insets.bottom + 100, paddingHorizontal: space4 };

  if (list) {
    return (
      <SectionList<T, ClosetListSection<T>>
        style={scrollStyle}
        contentContainerStyle={contentStyle}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        refreshControl={refreshControl}
        ListHeaderComponent={
          <>
            {header}
            {body}
          </>
        }
        sections={mode === 'content' ? list.sections : []}
        keyExtractor={list.keyExtractor}
        renderItem={({ item }) => list.renderItem(item)}
        renderSectionHeader={({ section }) => section.header ?? null}
        renderSectionFooter={({ section }) =>
          section.data.length === 0 ? (section.empty ?? null) : null
        }
        stickySectionHeadersEnabled={false}
        onEndReached={list.onEndReached}
        onEndReachedThreshold={0.5}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={9}
        testID="closet-screen-list"
      />
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={scrollStyle}
      contentContainerStyle={contentStyle}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      refreshControl={refreshControl}
      testID="closet-screen-scroll"
    >
      {header}
      {body}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: {
    marginTop: space4,
  },
  emptyAction: {
    marginTop: space4,
  },
  emptyTitle: {
    color: closet.ink,
    fontFamily: fontSans,
    fontSize: fsBody,
    fontWeight: '600',
    marginBottom: 4,
  },
  errorTitle: {
    color: closet.ink,
    fontFamily: fontSans,
    fontSize: fsBody,
    fontWeight: '600',
    marginBottom: 4,
  },
  offlineBanner: {
    backgroundColor: closet.mist,
    borderColor: closet.rule,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: space3,
    paddingHorizontal: space3,
    paddingVertical: space3,
  },
  offlineText: {
    color: closet.inkSoft,
    fontFamily: fontSans,
    fontSize: fsCaption,
    lineHeight: 18,
  },
  offlineQueued: {
    color: closet.ink,
    fontFamily: fontSans,
    fontSize: fsCaption,
    fontWeight: '600',
    lineHeight: 18,
    marginTop: 4,
  },
  retry: {
    color: closet.accent,
    fontFamily: fontSans,
    fontSize: fsCaption,
    fontWeight: '600',
    marginTop: space4,
  },
  scroll: {
    backgroundColor: closet.bg,
    flex: 1,
  },
  skeletonBlock: {
    backgroundColor: closet.mist,
    borderRadius: 6,
  },
  skeletonLine: {
    height: 10,
    marginTop: 8,
    width: '88%',
  },
  skeletonLineShort: {
    height: 10,
    marginTop: 8,
    width: '55%',
  },
  skeletonRow: {
    marginBottom: space4,
  },
  skeletonTitle: {
    height: 14,
    width: '42%',
  },
  skeletonWrap: {
    marginTop: space3,
  },
  softError: {
    backgroundColor: closet.surface,
    borderColor: closet.rule,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: space4,
    padding: space4,
  },
  stateBox: {
    backgroundColor: closet.surface,
    borderColor: closet.rule,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: space4,
    padding: space4,
  },
  stateLabel: {
    color: closet.muted,
    fontFamily: fontSans,
    fontSize: fsCaption,
    lineHeight: 20,
  },
  subtitle: {
    color: closet.muted,
    fontFamily: fontSans,
    fontSize: fsBody,
    lineHeight: 22,
    marginTop: 8,
  },
  title: {
    color: closet.ink,
    fontFamily: fontDisplay,
    fontSize: fsDisplayM,
    letterSpacing: fsDisplayM * trackingTight,
  },
});
