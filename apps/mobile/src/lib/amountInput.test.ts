import { describe, expect, it } from 'vitest';
import { MAX_TYPED_MINOR, parseAmountInput } from './amountInput';

describe('parseAmountInput', () => {
  it('reads whole and decimal amounts, with grouping commas', () => {
    expect(parseAmountInput('500')).toBe(50_000);
    expect(parseAmountInput(' 1,250.5 ')).toBe(125_050);
    expect(parseAmountInput('0.01')).toBe(1);
    expect(parseAmountInput('12.', 'USD')).toBe(1_200);
  });

  it('rejects empty, zero, negative, exponent and text input', () => {
    for (const raw of ['', '0', '0.00', '-5', '1e3', 'abc', '12.345', '1.2.3', 'Infinity']) {
      expect(parseAmountInput(raw)).toBeNull();
    }
  });

  it('respects currencies without decimals and the upper bound', () => {
    expect(parseAmountInput('500', 'JPY')).toBe(500);
    expect(parseAmountInput('5.5', 'JPY')).toBeNull();
    expect(parseAmountInput(String(MAX_TYPED_MINOR / 100))).toBe(MAX_TYPED_MINOR);
    expect(parseAmountInput(String(MAX_TYPED_MINOR / 100 + 1))).toBeNull();
  });
});
