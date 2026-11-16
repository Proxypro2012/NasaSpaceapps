import { afterEach, describe, expect, it, vi } from 'vitest';
import { testData as data } from '../test/data';
import { windowCsv } from '../ui/share';
import { DAY_MS, STEP_MS, windowMetrics } from './metrics';
import * as sky from './sky';

afterEach(() => vi.restoreAllMocks());
const site = { ...data.sites[0], comparison: undefined };

function withEarthFractions(fraction: (i: number) => number) {
  vi.spyOn(sky, 'skyAt').mockImplementation((_eph, _site, ms, out = sky.emptySky()) => {
    out.sun.frac = 1;
    out.earth.frac = fraction(Math.round(ms / STEP_MS));
    return out;
  });
}

describe('longest Earth visibility gap', () => {
  it('uses the same half-disc threshold as Earth visibility, including equality', () => {
    withEarthFractions(i => i === 1 ? 0.499 : 0.5);
    const m = windowMetrics(data.eph, site, 0, 1);
    expect(m.longestEarthGapHours).toBe(0.5);
    expect(m.earthLinkPct).toBe(100 * 47 / 48);
  });

  it('clips at each window boundary rather than joining the first and last gaps', () => {
    withEarthFractions(i => i < 2 || i >= 45 ? 0 : 1);
    expect(windowMetrics(data.eph, site, 0, 1).longestEarthGapHours).toBe(1.5);
  });

  it('keeps an interruption continuous across midnight and resets when visibility returns', () => {
    withEarthFractions(i => i >= 46 && i <= 50 || i === 70 ? 0 : 1);
    expect(windowMetrics(data.eph, site, 0, 2).longestEarthGapHours).toBe(2.5);
  });

  it.each([['visible', 1, 0], ['hidden', 0, 48]] as const)('handles a fully %s window', (_label, fraction, hours) => {
    withEarthFractions(() => fraction);
    expect(windowMetrics(data.eph, site, 0, 2).longestEarthGapHours).toBe(hours);
  });

  it('reports the mission full-window gap, continuous visibility and a partial gap on real dates', () => {
    const start = Date.UTC(2027, 0, 1);
    expect(windowMetrics(data.eph, data.sites[0], start, 7).longestEarthGapHours).toBe(168);
    expect(windowMetrics(data.eph, data.sites[0], start + 9 * DAY_MS, 7).longestEarthGapHours).toBe(0);
    const nobile = data.sites.find(s => s.id === 'nobile-rim-1')!;
    expect(windowMetrics(data.eph, nobile, start + 9 * DAY_MS, 7).longestEarthGapHours).toBe(10);
    const m = windowMetrics(data.eph, nobile, start, 7);
    expect(m.resolution?.longestEarthGapHours).toBeGreaterThanOrEqual(0);
    expect(m.resolution?.longestEarthGapHours).toBeLessThanOrEqual(168);
    expect(windowCsv(data, nobile, start, 7, m)).toContain('# Longest Earth visibility gap (hours below half-disc visibility within this window),168');
  });
});
