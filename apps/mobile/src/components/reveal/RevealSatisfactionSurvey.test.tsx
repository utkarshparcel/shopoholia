import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RevealSatisfactionSurvey } from './RevealSatisfactionSurvey';

const trackEvent = vi.fn();

vi.mock('@/src/lib/analytics', () => ({
  trackEvent: (...args: unknown[]) => trackEvent(...args),
}));

describe('RevealSatisfactionSurvey', () => {
  it('tracks reveal_rated and calls onRate once', async () => {
    const onRate = vi.fn().mockResolvedValue(undefined);
    render(<RevealSatisfactionSurvey onRate={onRate} orderId="order-abc" />);

    fireEvent.click(screen.getByText('Loved it'));

    expect(trackEvent).toHaveBeenCalledWith('reveal_rated', {
      orderId: 'order-abc',
      rating: 'loved',
    });
    expect(onRate).toHaveBeenCalledWith('loved');
    expect(screen.getByText('Thanks — noted.')).toBeTruthy();
  });

  it('disables other options after a rating is chosen', () => {
    render(<RevealSatisfactionSurvey orderId="order-abc" />);
    fireEvent.click(screen.getByText('OK'));
    expect(screen.getByText('Meh').closest('button')).toHaveProperty('disabled', true);
  });
});
