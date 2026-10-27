import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ClosetScreen } from './ClosetScreen';

vi.mock('@/src/hooks/closet/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isOffline: false }),
}));

describe('ClosetScreen', () => {
  it('renders skeleton while loading', () => {
    render(<ClosetScreen title="Today" loading loadingLabel="Building…" />);
    expect(screen.getByText('Building…')).toBeTruthy();
    expect(screen.getByTestId('closet-skeleton')).toBeTruthy();
  });

  it('renders empty state', () => {
    render(
      <ClosetScreen
        title="Wardrobe"
        empty
        emptyTitle="No pieces yet"
        emptyMessage="Add your first item."
      />,
    );
    expect(screen.getByText('No pieces yet')).toBeTruthy();
    expect(screen.getByText('Add your first item.')).toBeTruthy();
  });

  it('renders error with retry', () => {
    const onRetry = vi.fn();
    render(
      <ClosetScreen title="Vault" error="Network failed" onRetry={onRetry} />,
    );
    expect(screen.getByText('Couldn’t load')).toBeTruthy();
    expect(screen.getByText('Network failed')).toBeTruthy();
    screen.getByRole('button', { name: 'Tap to retry' }).click();
    expect(onRetry).toHaveBeenCalled();
  });

  it('shows empty action when provided', () => {
    render(
      <ClosetScreen
        title="Vault"
        empty
        emptyTitle="Nothing yet"
        emptyAction={<span>Connect email</span>}
      />,
    );
    expect(screen.getByText('Connect email')).toBeTruthy();
  });

  it('keeps body when hasContent during loading', () => {
    render(
      <ClosetScreen title="Today" loading hasContent>
        <span>cached outfit</span>
      </ClosetScreen>,
    );
    expect(screen.getByText('cached outfit')).toBeTruthy();
    expect(screen.queryByTestId('closet-skeleton')).toBeNull();
  });

  it('shows offline banner when forced offline', () => {
    render(
      <ClosetScreen title="Accountant" forceOffline>
        <span>body</span>
      </ClosetScreen>,
    );
    expect(screen.getByText(/You’re offline/)).toBeTruthy();
    expect(screen.getByText('body')).toBeTruthy();
  });

  it('shows offline retry and queued count (W097)', () => {
    const onOfflineRetry = vi.fn();
    render(
      <ClosetScreen
        title="Vault"
        forceOffline
        offlineQueuedCount={2}
        onOfflineRetry={onOfflineRetry}
      >
        <span>body</span>
      </ClosetScreen>,
    );
    expect(screen.getByTestId('closet-offline-queued').textContent).toMatch(
      /2 actions queued/,
    );
    screen.getByRole('button', { name: 'Retry' }).click();
    expect(onOfflineRetry).toHaveBeenCalled();
  });
});
