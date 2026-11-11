import { describe, expect, it } from 'vitest';
import { formatRelativeTime } from './relative-time';

const now = Date.parse('2026-11-11T12:00:00Z');
const ago = (ms: number) => new Date(now - ms).toISOString();

describe('formatRelativeTime', () => {
  it('reports anything under a minute as just now', () => {
    expect(formatRelativeTime(ago(0), now)).toBe('just now');
    expect(formatRelativeTime(ago(59_000), now)).toBe('just now');
  });

  it('treats future timestamps as just now', () => {
    expect(formatRelativeTime(ago(-60_000), now)).toBe('just now');
  });

  it('uses minutes, hours and days', () => {
    expect(formatRelativeTime(ago(5 * 60_000), now)).toBe('5 min ago');
    expect(formatRelativeTime(ago(3 * 3_600_000 + 1), now)).toBe('3 h ago');
    expect(formatRelativeTime(ago(23 * 3_600_000), now)).toBe('23 h ago');
    expect(formatRelativeTime(ago(2 * 86_400_000), now)).toBe('2 d ago');
  });

  it('reports unparseable input as unknown', () => {
    expect(formatRelativeTime('not a date', now)).toBe('unknown');
  });
});
