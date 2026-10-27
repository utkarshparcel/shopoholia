import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BottomNav } from './BottomNav';

const items = [
  { key: 'feed', label: 'Feed', icon: '▦' },
  { key: 'profile', label: 'Profile', icon: '○', badge: 2 },
];

describe('BottomNav', () => {
  it('renders items and handles press', () => {
    const onPress = vi.fn();
    render(<BottomNav activeKey="feed" items={items} onPress={onPress} />);
    expect(screen.getByText('Feed')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    fireEvent.click(screen.getByText('Profile'));
    expect(onPress).toHaveBeenCalledWith('profile');
  });

  it('names each tab by its label, not its glyph, inside a tablist (MOB 31)', () => {
    render(<BottomNav activeKey="feed" items={items} onPress={vi.fn()} />);
    expect(screen.getByRole('tablist')).toBeTruthy();
    // The shared Pressable mock renders a plain <button>, so check the names it carries.
    expect(screen.getAllByRole('button').map((t) => t.getAttribute('aria-label'))).toEqual([
      'Feed',
      'Profile, 2 new',
    ]);
    expect(screen.getByLabelText('Profile, 2 new').textContent).toContain('Profile');
  });
});
