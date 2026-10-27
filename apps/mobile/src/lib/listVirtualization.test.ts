import { describe, expect, it } from 'vitest';

import { LIST_PAGE_SIZE, nextVisibleCount } from './listVirtualization';

describe('listVirtualization (UX-PERF-LISTS)', () => {
  it('reveals one page at a time, capped at the total', () => {
    expect(nextVisibleCount(30, 500)).toBe(30 + LIST_PAGE_SIZE);
    expect(nextVisibleCount(480, 500)).toBe(500);
    expect(nextVisibleCount(500, 500)).toBe(500);
    expect(nextVisibleCount(10, 100, 25)).toBe(35);
  });

  it('never goes negative and ignores a bad page size', () => {
    expect(nextVisibleCount(-5, 10, 3)).toBe(3);
    expect(nextVisibleCount(0, -1)).toBe(0);
    expect(nextVisibleCount(0, 100, 0)).toBe(LIST_PAGE_SIZE);
    expect(nextVisibleCount(0, 100, Number.NaN)).toBe(LIST_PAGE_SIZE);
  });
});
