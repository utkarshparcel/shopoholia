import { Fragment, type ReactElement } from 'react';
import { FlatList, View, type ListRenderItem, type StyleProp, type ViewStyle } from 'react-native';

import {
  LIST_ESTIMATED_ITEM_SIZE,
  nestedVirtualListHeight,
  shouldVirtualizeList,
} from '@/src/lib/listVirtualization';

export type ClosetVirtualListProps<T> = {
  data: T[];
  keyExtractor: (item: T, index: number) => string;
  renderItem: (info: { item: T; index: number }) => ReactElement | null;
  estimatedItemSize?: number;
  /** When true (default), bound height so nesting inside ClosetScreen ScrollView still windows. */
  nestedInScrollView?: boolean;
  style?: StyleProp<ViewStyle>;
  ListEmptyComponent?: ReactElement | null;
  testID?: string;
};

/**
 * Maps items when ≤50; FlatList windowing when >50 (UX-PERF-LISTS).
 */
export function ClosetVirtualList<T>({
  data,
  keyExtractor,
  renderItem,
  estimatedItemSize = LIST_ESTIMATED_ITEM_SIZE,
  nestedInScrollView = true,
  style,
  ListEmptyComponent = null,
  testID,
}: ClosetVirtualListProps<T>) {
  if (data.length === 0) {
    return ListEmptyComponent ?? null;
  }

  if (!shouldVirtualizeList(data.length)) {
    return (
      <View style={style} testID={testID ?? 'closet-list-static'}>
        {data.map((item, index) => (
          <Fragment key={keyExtractor(item, index)}>{renderItem({ item, index })}</Fragment>
        ))}
      </View>
    );
  }

  const listRender: ListRenderItem<T> = ({ item, index }) => renderItem({ item, index });
  const height = nestedInScrollView ? nestedVirtualListHeight(estimatedItemSize) : undefined;

  return (
    <FlatList
      testID={testID ?? 'closet-list-virtual'}
      data={data}
      keyExtractor={keyExtractor}
      renderItem={listRender}
      style={[height != null ? { height } : null, style]}
      nestedScrollEnabled={nestedInScrollView}
      removeClippedSubviews
      windowSize={7}
      maxToRenderPerBatch={8}
      initialNumToRender={6}
      updateCellsBatchingPeriod={50}
      getItemLayout={(_, index) => ({
        length: estimatedItemSize,
        offset: estimatedItemSize * index,
        index,
      })}
    />
  );
}
