import { describe, expect, it } from 'vitest';

import {
  confirmPhotoDumpTags,
  isPhotoDumpPending,
  photoDumpReviewProgress,
} from './photoDumpReview';

describe('photoDumpReview (W070)', () => {
  it('tracks pending vs reviewed and confirm tags', () => {
    const pending = { id: '1', category: 'shirt', tags: ['photo-dump'] };
    const done = {
      id: '2',
      category: 'jeans',
      // U040 triage: a reviewed item carries its decision tag.
      tags: ['photo-dump', 'triage-wardrobe', 'photo-dump-reviewed', 'sorted'],
    };
    expect(isPhotoDumpPending(pending)).toBe(true);
    expect(isPhotoDumpPending(done)).toBe(false);
    expect(confirmPhotoDumpTags(['photo-dump'])).toEqual(
      expect.arrayContaining(['photo-dump', 'photo-dump-reviewed', 'sorted']),
    );
    const progress = photoDumpReviewProgress([pending, done]);
    expect(progress.total).toBe(2);
    expect(progress.pending).toBe(1);
    expect(progress.decided).toBe(1);
    expect(progress.label).toMatch(/1 of 2/);
  });
});
