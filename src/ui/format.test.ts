import { describe, expect, it } from 'vitest';
import { duration } from './format';

describe('duration', () => {
  it.each([
    [0, 'none'],
    [10, '10 h'],
    [23.5, '23.5 h'],
    [84, '3.5 days'],
    [168, '7 days'],
    [322, '13 days'],
  ])('%s hours reads "%s"', (hours, text) => {
    expect(duration(hours)).toBe(text);
  });
});
