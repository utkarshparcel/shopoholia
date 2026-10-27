import { Fragment, useEffect, useState, type ReactElement } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { Button } from '@/src/components/ui';
import { LIST_PAGE_SIZE, nextVisibleCount } from '@/src/lib/listVirtualization';

export type ClosetVirtualListProps<T> = {
  data: T[];
  keyExtractor: (item: T, index: number) => string;
  renderItem: (info: { item: T; index: number }) => ReactElement | null;
  /** Rows drawn at first and per "Show more" tap. */
  pageSize?: number;
  style?: StyleProp<ViewStyle>;
  ListEmptyComponent?: ReactElement | null;
  testID?: string;
};

/**
 * A list inside a screen that already scrolls. It never nests a FlatList in the screen's
 * ScrollView (fixed-height windows clipped rows and guessed wrong offsets for rows of varying
 * height); it draws a page of rows and reveals more on request, so work stays bounded.
 * A screen whose main content is one long list passes it to ClosetScreen's `list` instead.
 */
export function ClosetVirtualList<T>({
  data,
  keyExtractor,
  renderItem,
  pageSize = LIST_PAGE_SIZE,
  style,
  ListEmptyComponent = null,
  testID,
}: ClosetVirtualListProps<T>) {
  const [visible, setVisible] = useState(pageSize);

  // A new, shorter data set (a filter or a tab change) starts from the first page again.
  useEffect(() => {
    if (data.length <= pageSize) setVisible(pageSize);
  }, [data.length, pageSize]);

  if (data.length === 0) {
    return ListEmptyComponent ?? null;
  }

  const shown = data.slice(0, visible);
  const remaining = data.length - shown.length;

  return (
    <View style={style} testID={testID ?? 'closet-list'}>
      {shown.map((item, index) => (
        <Fragment key={keyExtractor(item, index)}>{renderItem({ item, index })}</Fragment>
      ))}
      {remaining > 0 ? (
        <Button
          label={`Show ${Math.min(remaining, pageSize)} more (${remaining} left)`}
          size="sm"
          variant="secondary"
          onPress={() => setVisible((v) => nextVisibleCount(v, data.length, pageSize))}
          testID="closet-list-more"
        />
      ) : null}
    </View>
  );
}
