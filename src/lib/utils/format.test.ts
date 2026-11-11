import { describe, expect, it } from 'vitest';
import { formatMoney } from './format';

describe('formatMoney', () => {
  it('formats DKK with Danish separators by default', () => {
    expect(formatMoney(1234.5, 'DKK')).toContain('1.234,50');
  });

  it('always shows two decimals', () => {
    expect(formatMoney(10, 'DKK')).toContain('10,00');
  });

  it('respects an explicit locale', () => {
    expect(formatMoney(1234.5, 'EUR', 'en-GB')).toContain('1,234.50');
  });
});
