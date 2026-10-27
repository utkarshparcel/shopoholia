import { describe, expect, it } from 'vitest';
import {
  OCR_CONFIRM_CONFIDENCE_THRESHOLD,
  confidenceBadge,
  requiresConfirmOverride,
} from './confidenceBadge';

describe('confidenceBadge', () => {
  it('labels high confidence', () => {
    expect(confidenceBadge(0.92)).toEqual({
      tone: 'high',
      label: '92% confident',
      percent: 92,
    });
  });

  it('labels medium confidence at the confirm threshold', () => {
    expect(confidenceBadge(OCR_CONFIRM_CONFIDENCE_THRESHOLD)).toMatchObject({
      tone: 'medium',
    });
  });

  it('labels low confidence below the threshold', () => {
    expect(confidenceBadge(0.4)).toEqual({
      tone: 'low',
      label: '40% — review needed',
      percent: 40,
    });
  });

  it('treats missing confidence as low', () => {
    expect(confidenceBadge(undefined).tone).toBe('low');
    expect(confidenceBadge(null).tone).toBe('low');
  });
});

describe('requiresConfirmOverride', () => {
  it('blocks below the threshold', () => {
    expect(requiresConfirmOverride(0.69)).toBe(true);
    expect(requiresConfirmOverride(OCR_CONFIRM_CONFIDENCE_THRESHOLD)).toBe(false);
    expect(requiresConfirmOverride(0.95)).toBe(false);
  });

  it('blocks when confidence is missing', () => {
    expect(requiresConfirmOverride(undefined)).toBe(true);
  });
});
