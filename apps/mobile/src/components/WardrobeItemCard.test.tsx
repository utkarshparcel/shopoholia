import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { WardrobeItem, WasteMetricRow } from '@/src/api/client';
import { WardrobeItemActionsSheet, WardrobeItemCard, isBusy } from './WardrobeItemCard';

const imageRenders = vi.hoisted(() => ({ count: 0 }));

vi.mock('expo-image', () => ({
  Image: ({ accessibilityLabel, onError }: { accessibilityLabel?: string; onError?: () => void }) => {
    imageRenders.count += 1;
    return React.createElement('img', { alt: accessibilityLabel, onError });
  },
}));

const item: WardrobeItem = {
  id: 'w1',
  userId: 'u1',
  source: 'MANUAL',
  category: 'shirt',
  colors: [],
  brand: 'Fabindia',
  costMinor: 0,
  imageKeys: [],
  garmentImageKey: null,
  purchaseItemId: null,
  laundryStatus: 'CLEAN',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

const metric: WasteMetricRow = {
  wardrobeItemId: 'w1',
  wearCount: 4,
  lastWornAt: null,
  costPerWearMinor: 37500,
  status: 'DORMANT',
};

function nestedButtons(container: HTMLElement) {
  return container.querySelectorAll('button button').length;
}

function card(overrides: Partial<React.ComponentProps<typeof WardrobeItemCard>> = {}) {
  return (
    <WardrobeItemCard
      item={item}
      metric={metric}
      preview="https://cdn.example/w1.jpg"
      currency="INR"
      started={false}
      isDead={false}
      busy=""
      onAction={vi.fn()}
      {...overrides}
    />
  );
}

describe('isBusy', () => {
  it('matches whole action names only', () => {
    expect(isBusy('', 'tryon')).toBe(false);
    expect(isBusy('tryon,wear', 'wear')).toBe(true);
    expect(isBusy('dryClean', 'cpw')).toBe(false);
  });
});

describe('WardrobeItemCard', () => {
  it('shows readable details: no empty placeholders, a zero cost or raw status enum', () => {
    render(card());
    expect(screen.queryByText(/no colors/)).toBeNull();
    expect(screen.queryByText(/₹0/)).toBeNull();
    expect(screen.queryByText(/DORMANT/)).toBeNull();
    expect(screen.getByText(/Worn 4×/).textContent).toContain('Resting');
    expect(screen.getByText(/Worn 4×/).textContent).toContain('₹375');
  });

  it('formats money in the user currency', () => {
    render(card({ currency: 'USD', item: { ...item, costMinor: 1999 } }));
    expect(screen.getByText(/\$19\.99/)).toBeTruthy();
  });

  it('sends each tap to onAction with the item', () => {
    const onAction = vi.fn();
    render(card({ onAction }));
    fireEvent.click(screen.getByText('Try on'));
    fireEvent.click(screen.getByLabelText('More actions for Fabindia'));
    expect(onAction.mock.calls).toEqual([
      ['tryon', item],
      ['more', item],
    ]);
  });

  it('disables only the action that is in flight', () => {
    const onAction = vi.fn();
    render(card({ onAction, busy: 'wear' }));
    fireEvent.click(screen.getByText('Wore it'));
    expect(onAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Try on'));
    expect(onAction).toHaveBeenCalledWith('tryon', item);
  });

  it('does not re-render when the parent re-renders with the same props', () => {
    const onAction = vi.fn();
    const { rerender } = render(card({ onAction }));
    const before = imageRenders.count;
    rerender(card({ onAction }));
    expect(imageRenders.count).toBe(before);
    rerender(card({ onAction, busy: 'tryon' }));
    expect(imageRenders.count).toBe(before + 1);
  });

  it('shows a fallback when the photo fails to load', () => {
    render(card());
    fireEvent.error(screen.getByAltText('Fabindia'));
    expect(screen.getByText('Photo unavailable')).toBeTruthy();
  });
});

describe('WardrobeItemActionsSheet', () => {
  function sheet(overrides: Partial<React.ComponentProps<typeof WardrobeItemActionsSheet>> = {}) {
    return (
      <WardrobeItemActionsSheet
        item={item}
        metric={metric}
        inCapsule={false}
        isDead={false}
        busy=""
        onAction={vi.fn()}
        onClose={vi.fn()}
        {...overrides}
      />
    );
  }

  it('renders nothing without an item', () => {
    const { container } = render(sheet({ item: null }));
    expect(container.innerHTML).toBe('');
  });

  it('has no nested buttons and offers Sell only for dead stock', () => {
    const { container, rerender } = render(sheet());
    expect(nestedButtons(container)).toBe(0);
    expect(screen.queryByText('Sell it')).toBeNull();
    rerender(sheet({ isDead: true }));
    expect(screen.getByText('Sell it')).toBeTruthy();
  });

  it('closes, then runs the chosen action once', () => {
    const order: string[] = [];
    const onClose = vi.fn(() => order.push('close'));
    const onAction = vi.fn((a: string) => order.push(a));
    render(sheet({ onAction, onClose }));
    fireEvent.click(screen.getByText('Lend to someone'));
    expect(order).toEqual(['close', 'lend']);
    expect(onAction).toHaveBeenCalledWith('lend', item);
  });

  it('dismisses from the backdrop without running an action', () => {
    const onClose = vi.fn();
    const onAction = vi.fn();
    render(sheet({ onAction, onClose }));
    fireEvent.click(screen.getAllByLabelText('Close')[0]!);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onAction).not.toHaveBeenCalled();
  });

  it('switches to pickup and return once the item is out', () => {
    render(
      sheet({
        item: { ...item, dryCleanTicket: '4821', laundryStatus: 'IN_LAUNDRY', lentTo: 'Asha' },
      }),
    );
    expect(screen.getByText('Picked up from the cleaner')).toBeTruthy();
    expect(screen.getByText('Returned by Asha')).toBeTruthy();
    expect(screen.queryByText('Send to dry clean')).toBeNull();
  });

  it('keeps an in-flight action disabled', () => {
    const onAction = vi.fn();
    render(sheet({ onAction, busy: 'capsule' }));
    fireEvent.click(screen.getByText('Add to capsule'));
    expect(onAction).not.toHaveBeenCalled();
  });
});
