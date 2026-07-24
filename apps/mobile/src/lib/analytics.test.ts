import { afterEach, describe, expect, it, vi } from 'vitest';

import { resetAnalyticsSink, setAnalyticsSink, trackEvent } from './analytics';

describe('trackEvent', () => {
  afterEach(() => {
    resetAnalyticsSink();
  });

  it('forwards events to the configured sink', () => {
    const sink = vi.fn();
    setAnalyticsSink(sink);

    trackEvent('checkout', { orderId: 'order-1', tier: 'EXPRESS' });

    expect(sink).toHaveBeenCalledWith('checkout', {
      orderId: 'order-1',
      tier: 'EXPRESS',
    });
  });

  it('supports all funnel event names', () => {
    const sink = vi.fn();
    setAnalyticsSink(sink);

    const events = [
      'install',
      'avatar_complete',
      'add_to_cart',
      'checkout',
      'wait_complete',
      'reveal_opened',
      'reveal_rated',
      'unlock',
      'share',
    ] as const;

    for (const name of events) {
      trackEvent(name);
    }

    expect(sink).toHaveBeenCalledTimes(events.length);
  });
});
