import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ExpiryCountdownHero } from './ExpiryCountdownHero';

describe('ExpiryCountdownHero (W016)', () => {
  const now = new Date('2026-08-26T10:00:00.000Z');

  it('renders soonest days/hours countdown', () => {
    render(
      <ExpiryCountdownHero
        now={now}
        highlighted
        accounts={[
          {
            id: 'a1',
            merchant: 'Amazon',
            expiresAt: '2026-08-27T12:00:00.000Z',
            balanceCacheMinor: 20_000,
          },
          {
            id: 'a2',
            merchant: 'Myntra',
            expiresAt: '2026-08-29T10:00:00.000Z',
            balanceCacheMinor: 50_000,
          },
        ]}
      />,
    );
    expect(screen.getByTestId('expiry-countdown-hero')).toBeTruthy();
    expect(screen.getByText('2 days left')).toBeTruthy();
    expect(screen.getByText(/Amazon/)).toBeTruthy();
  });

  it('returns null when no expiries', () => {
    const { container } = render(
      <ExpiryCountdownHero
        now={now}
        accounts={[{ id: 'x', merchant: 'Nykaa', expiresAt: null, balanceCacheMinor: 1 }]}
      />,
    );
    expect(container.querySelector('[data-testid="expiry-countdown-hero"]')).toBeNull();
  });

  it('shows hours under 24h', () => {
    render(
      <ExpiryCountdownHero
        now={now}
        accounts={[
          {
            id: 'h',
            merchant: 'Ajio',
            expiresAt: '2026-08-26T15:00:00.000Z',
            balanceCacheMinor: 1000,
          },
        ]}
      />,
    );
    expect(screen.getByText('5 hours left')).toBeTruthy();
  });

  it('a11y label includes amount, currency, and expiry (W099)', () => {
    render(
      <ExpiryCountdownHero
        now={now}
        accounts={[
          {
            id: 'a1',
            merchant: 'Amazon',
            expiresAt: '2026-08-28T12:00:00.000Z',
            balanceCacheMinor: 20_000,
            currency: 'INR',
          },
        ]}
      />,
    );
    const label = screen.getByTestId('expiry-countdown-hero').getAttribute('aria-label') ?? '';
    expect(label).toMatch(/Amazon/);
    expect(label).toMatch(/INR/);
    expect(label).toMatch(/expires 2026-08-28/);
  });
});
