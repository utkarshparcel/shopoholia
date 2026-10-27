import { describe, expect, it } from 'vitest';

import {
  gstInvoiceHrefFromReturn,
  gstInvoiceSearchPrefill,
  isGstFocus,
} from './gstFromReturn';

describe('gstFromReturn (W041)', () => {
  it('prefills merchant and date window from createdAt', () => {
    const prefill = gstInvoiceSearchPrefill({
      merchant: 'Myntra',
      createdAt: '2026-08-01T12:00:00.000Z',
    });
    expect(prefill.merchant).toBe('Myntra');
    expect(prefill.from).toBe('2026-06-17');
    expect(prefill.to).toBe('2026-08-15');
  });

  it('prefers purchasedAt over createdAt', () => {
    const prefill = gstInvoiceSearchPrefill({
      merchant: 'Amazon',
      createdAt: '2026-08-20T00:00:00.000Z',
      purchasedAt: '2026-07-01T00:00:00.000Z',
    });
    expect(prefill.from).toBe('2026-05-17');
    expect(prefill.to).toBe('2026-07-15');
  });

  it('builds vault gst deep link', () => {
    const href = gstInvoiceHrefFromReturn({
      merchant: 'Flipkart',
      createdAt: '2026-08-10T00:00:00.000Z',
    });
    expect(href).toContain('focus=gst');
    expect(href).toContain('merchant=Flipkart');
    expect(href).toContain('from=');
    expect(href).toContain('to=');
  });

  it('recognizes gst / receipts focus', () => {
    expect(isGstFocus('gst')).toBe(true);
    expect(isGstFocus('receipts')).toBe(true);
    expect(isGstFocus('returns')).toBe(false);
  });
});
