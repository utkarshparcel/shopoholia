import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ClosetScreen } from './ClosetScreen';

vi.mock('@/src/hooks/closet/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isOffline: false }),
}));

// The shared react-native mock has no SectionList; this one renders it the way RN lays it out:
// the list header, then each section's header, rows and footer.
vi.mock('react-native', () => {
  const host =
    (tag: string) =>
    ({ children, testID }: React.PropsWithChildren<{ testID?: string }>) =>
      React.createElement(tag, { 'data-testid': testID }, children);
  type Section = { key: string; data: readonly unknown[] };
  return {
    View: host('div'),
    Text: host('span'),
    ScrollView: host('div'),
    RefreshControl: () => null,
    Pressable: ({ children, onPress }: React.PropsWithChildren<{ onPress?: () => void }>) =>
      React.createElement('button', { type: 'button', onClick: onPress }, children),
    StyleSheet: { create: <T,>(s: T) => s, absoluteFill: {} },
    Platform: { OS: 'ios', select: <T,>(o: { ios?: T; default?: T }) => o.ios ?? o.default },
    SectionList: ({
      ListHeaderComponent,
      sections,
      keyExtractor,
      renderItem,
      renderSectionHeader,
      renderSectionFooter,
      testID,
    }: {
      ListHeaderComponent?: React.ReactNode;
      sections: readonly Section[];
      keyExtractor: (item: unknown) => string;
      renderItem: (info: { item: unknown }) => React.ReactNode;
      renderSectionHeader: (info: { section: Section }) => React.ReactNode;
      renderSectionFooter: (info: { section: Section }) => React.ReactNode;
      testID?: string;
    }) =>
      React.createElement(
        'div',
        { 'data-testid': testID },
        ListHeaderComponent,
        sections.map((section) =>
          React.createElement(
            'section',
            { key: section.key, 'data-testid': `section-${section.key}` },
            renderSectionHeader({ section }),
            section.data.map((item) =>
              React.createElement('div', { key: keyExtractor(item) }, renderItem({ item })),
            ),
            renderSectionFooter({ section }),
          ),
        ),
      ),
  };
});

type Row = { id: string; name: string };

const list = {
  sections: [
    { key: 'laundry', header: <span>Laundry basket</span>, data: [{ id: 'a', name: 'Kurta' }] },
    { key: 'clean', header: <span>Clean</span>, data: [] as Row[], empty: <span>Nothing clean</span> },
  ],
  keyExtractor: (r: Row) => r.id,
  renderItem: (r: Row) => <span>row {r.name}</span>,
};

describe('ClosetScreen list mode', () => {
  it('scrolls as one list: header and children first, then sections, rows and empty footers', () => {
    render(
      <ClosetScreen<Row> title="Wardrobe" hasContent list={list}>
        <span>add form</span>
      </ClosetScreen>,
    );
    const root = screen.getByTestId('closet-screen-list');
    expect(screen.queryByTestId('closet-screen-scroll')).toBeNull();
    const text = root.textContent ?? '';
    expect(text.indexOf('Wardrobe')).toBeLessThan(text.indexOf('add form'));
    expect(text.indexOf('add form')).toBeLessThan(text.indexOf('Laundry basket'));
    expect(screen.getByTestId('section-laundry').textContent).toContain('row Kurta');
    expect(screen.getByTestId('section-clean').textContent).toContain('Nothing clean');
  });

  it('shows the state box, not the rows, while loading or empty', () => {
    const { rerender } = render(
      <ClosetScreen<Row> title="Wardrobe" loading loadingLabel="Loading your closet…" list={list} />,
    );
    expect(screen.getByText('Loading your closet…')).toBeTruthy();
    expect(screen.queryByTestId('section-laundry')).toBeNull();

    rerender(<ClosetScreen<Row> title="Wardrobe" empty emptyTitle="No pieces yet" list={list} />);
    expect(screen.getByText('No pieces yet')).toBeTruthy();
    expect(screen.queryByText('row Kurta')).toBeNull();
  });
});
