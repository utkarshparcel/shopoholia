import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { RenderCard } from '@/src/api/client';

import { RevealDeck } from './RevealDeck';

function card(overrides: Partial<RenderCard> & Pick<RenderCard, 'id'>): RenderCard {
  return {
    orderItemId: 'item-1',
    scenario: 'STUDIO',
    imageUrl: null,
    isFree: true,
    unlocked: true,
    status: 'DONE',
    ...overrides,
  };
}

describe('RevealDeck', () => {
  it('shows a locked look as locked, not as rendering', () => {
    render(
      <RevealDeck
        onUnlock={vi.fn()}
        renders={[card({ id: 'locked', isFree: false, unlocked: false, status: 'QUEUED' })]}
      />,
    );
    expect(screen.getByText('Locked look')).toBeTruthy();
    expect(screen.queryByText('Rendering…')).toBeNull();
  });

  it('shows a free or unlocked look that is queued as rendering', () => {
    render(
      <RevealDeck onUnlock={vi.fn()} renders={[card({ id: 'free', status: 'QUEUED' })]} />,
    );
    expect(screen.getByText('Rendering…')).toBeTruthy();
    expect(screen.queryByText('Locked look')).toBeNull();
  });

  it('opens on a newly generated look appended at the end of the deck', () => {
    const renders = Array.from({ length: 20 }, (_, i) => card({ id: `r${i}`, scenario: `S${i}` }));
    const { rerender } = render(<RevealDeck onUnlock={vi.fn()} renders={renders} />);
    expect(screen.getByText('1 / 20')).toBeTruthy();

    const withNew = [...renders, card({ id: 'new', scenario: 'NEW_LOOK', status: 'QUEUED' })];
    rerender(<RevealDeck focusId="new" onUnlock={vi.fn()} renders={withNew} />);
    expect(screen.getByText('21 / 21')).toBeTruthy();
    expect(screen.getByText('NEW LOOK')).toBeTruthy();
  });
});
