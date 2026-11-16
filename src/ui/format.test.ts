import { describe, expect, it } from 'vitest';
import { WINDOW_OPTIONS } from '../state/store';
import { duration, windowAdjective, windowLabel } from './format';
import { decodeLink, encodeLink } from './share';

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

describe('window presets', () => {
  it.each([
    [7, '7 days', '7-day'],
    [29.5, '1 lunar day', 'lunar-day'],
    [365, '1 year', '1-year'],
  ])('%s days reads "%s" and "%s"', (days, label, adjective) => {
    expect(windowLabel(days)).toBe(label);
    expect(windowAdjective(days)).toBe(adjective);
  });

  it.each(WINDOW_OPTIONS.map((d) => [d]))('a %s-day window survives a shared link', (windowDays) => {
    const state = { windowStartMs: Date.UTC(2027, 0, 1), windowDays, targetMs: Date.UTC(2027, 0, 1, 12), siteId: 'nobile-rim-1', audience: 'planner' as const };
    expect(decodeLink(encodeLink(state))).toMatchObject({ windowDays, windowStartMs: state.windowStartMs, siteId: state.siteId });
  });

  it('ignores a window length that is not a preset', () => {
    expect(decodeLink('#date=2027-01-01&days=29&site=nobile-rim-1').windowDays).toBeUndefined();
  });
});
