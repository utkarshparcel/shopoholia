import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RevealSatisfactionSurvey } from './RevealSatisfactionSurvey';

const trackEvent = vi.fn();

vi.mock('@/src/lib/analytics', () => ({
  trackEvent: (...args: unknown[]) => trackEvent(...args),
}));

describe('RevealSatisfactionSurvey', () => {
  beforeEach(() => trackEvent.mockClear());

  it('tracks reveal_rated and calls onRate once', async () => {
    const onRate = vi.fn().mockResolvedValue(undefined);
    render(<RevealSatisfactionSurvey onRate={onRate} orderId="order-abc" />);

    fireEvent.click(screen.getByText('Loved it'));

    expect(await screen.findByText('Thanks — noted.')).toBeTruthy();
    expect(trackEvent).toHaveBeenCalledWith('reveal_rated', {
      orderId: 'order-abc',
      rating: 'loved',
    });
    expect(onRate).toHaveBeenCalledTimes(1);
    expect(onRate).toHaveBeenCalledWith('loved');
  });

  it('disables other options after a rating is chosen', async () => {
    render(<RevealSatisfactionSurvey orderId="order-abc" />);
    fireEvent.click(screen.getByText('OK'));
    await screen.findByText('Thanks — noted.');
    expect(screen.getByText('Meh').closest('button')).toHaveProperty('disabled', true);
  });

  it('says a failed send failed, without thanks, and lets the user rate again', async () => {
    const onRate = vi.fn().mockRejectedValueOnce(new Error('Failed to fetch')).mockResolvedValue(undefined);
    render(<RevealSatisfactionSurvey onRate={onRate} orderId="order-abc" />);

    fireEvent.click(screen.getByText('Meh'));

    expect(await screen.findByText(/Couldn’t send your rating/)).toBeTruthy();
    expect(screen.queryByText('Thanks — noted.')).toBeNull();
    expect(trackEvent).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByText('OK').closest('button')).toHaveProperty('disabled', false),
    );

    fireEvent.click(screen.getByText('Meh'));
    expect(await screen.findByText('Thanks — noted.')).toBeTruthy();
    expect(onRate).toHaveBeenCalledTimes(2);
  });
});
